<?php

if (PHP_SAPI !== "cli") {
    http_response_code(404);
    exit;
}

require_once __DIR__ . "/../config/database.php";
require_once __DIR__ . "/../periodos/ciclo_service.php";
require_once __DIR__ . "/factura_service.php";

date_default_timezone_set("America/Bogota");

function cicloFacturacionActivo(PDO $pdo): array
{
    $stmt = $pdo->query(
        "SELECT id_ciclo, nombre, dia_inicio, dias_vencimiento, prorratear_primer_mes
         FROM ciclo_facturacion
         WHERE estado = 'ACTIVO'
         ORDER BY id_ciclo"
    );
    $ciclos = $stmt->fetchAll();
    $seleccionado = getenv("GLOBAL_CONEXIT_BILLING_CYCLE_ID");
    if ($seleccionado !== false && $seleccionado !== "") {
        if (!ctype_digit($seleccionado)) {
            throw new RuntimeException("GLOBAL_CONEXIT_BILLING_CYCLE_ID debe ser un identificador entero");
        }
        foreach ($ciclos as $ciclo) {
            if ((int) $ciclo["id_ciclo"] === (int) $seleccionado) {
                return $ciclo;
            }
        }
        throw new RuntimeException("El ciclo indicado no existe o está inactivo");
    }
    if (count($ciclos) !== 1) {
        throw new RuntimeException(
            "Configure GLOBAL_CONEXIT_BILLING_CYCLE_ID cuando haya más de un ciclo activo"
        );
    }
    return $ciclos[0];
}

function periodoActualCiclo(int $diaInicio, DateTimeImmutable $hoy): array
{
    $mesInicio = $hoy;
    if ((int) $hoy->format("j") < $diaInicio) {
        $mesInicio = $hoy->modify("first day of previous month");
    }
    $fechas = calcularFechasPeriodoCiclo(
        $diaInicio,
        (int) $mesInicio->format("Y"),
        (int) $mesInicio->format("n")
    );
    return [
        "inicio" => $fechas["periodo_inicio"],
        "fin" => $fechas["periodo_fin"],
        "anio" => (int) $mesInicio->format("Y"),
        "mes" => (int) $mesInicio->format("n"),
    ];
}

function servicioContratoPeriodo(array $contrato, array $periodo, int $prorratear): ?array
{
    return calcularServicioFactura(
        (string) $contrato["fecha_activacion"],
        (string) $periodo["inicio"],
        (string) $periodo["fin"],
        $prorratear,
        (float) $contrato["precio"]
    );
}

function existeFacturaDelCiclo(PDO $pdo, string $idContrato, string $inicio, string $fin): bool
{
    $stmt = $pdo->prepare(
        "SELECT 1
         FROM factura f
         INNER JOIN periodo_facturacion pf ON pf.id_periodo = f.id_periodo
         WHERE f.id_contrato = :id_contrato
           AND pf.fecha_inicio <= :fecha_fin
           AND pf.fecha_fin >= :fecha_inicio
         LIMIT 1"
    );
    $stmt->execute([
        ":id_contrato" => $idContrato,
        ":fecha_inicio" => $inicio,
        ":fecha_fin" => $fin,
    ]);
    return (bool) $stmt->fetchColumn();
}

function obtenerPeriodoAbierto(
    PDO $pdo,
    int $idCiclo,
    array $periodo,
    string $fechaEmision
): ?array {
    $periodoDb = obtenerOCrearPeriodo(
        $pdo,
        $idCiclo,
        (int) $periodo["anio"],
        (int) $periodo["mes"],
        $fechaEmision
    );
    return $periodoDb["estado"] === "ABIERTO" ? $periodoDb : null;
}

function procesarContrato(
    PDO $pdo,
    array $contrato,
    array $periodo,
    array $ciclo,
    string $fechaEmision,
): string {
    $idContrato = (string) $contrato["id_contrato"];
    $pdo->beginTransaction();
    try {
        $bloqueo = $pdo->prepare(
            "SELECT co.id_contrato, co.fecha_inicio AS fecha_activacion, co.estado,
                    pl.precio, pl.nombre AS nombre_plan
             FROM contrato co
             INNER JOIN plan pl ON pl.id_plan = co.id_plan
             WHERE co.id_contrato = :id_contrato
               AND co.estado = 'ACTIVO'
               AND NOT EXISTS (
                   SELECT 1 FROM admin_bajas b
                   WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
                     AND b.id_registro COLLATE utf8mb4_unicode_ci =
                         CAST(co.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
               )
             FOR UPDATE"
        );
        $bloqueo->execute([":id_contrato" => $idContrato]);
        $actual = $bloqueo->fetch();
        if (!$actual) {
            $pdo->commit();
            return "omitida";
        }

        $servicioFactura = servicioContratoPeriodo(
            $actual,
            $periodo,
            (int) $ciclo["prorratear_primer_mes"]
        );
        if ($servicioFactura === null) {
            $pdo->commit();
            return "omitida";
        }

        if (existeFacturaDelCiclo($pdo, $idContrato, $periodo["inicio"], $periodo["fin"])) {
            $pdo->commit();
            return "existente";
        }

        $periodoDb = obtenerPeriodoAbierto(
            $pdo,
            (int) $ciclo["id_ciclo"],
            $periodo,
            $fechaEmision
        );
        if (!$periodoDb) {
            $pdo->commit();
            return "omitida";
        }

        $numero = generarNumeroFactura($pdo, $idContrato, (string) $periodo["inicio"]);
        $descripcion = descripcionFactura($actual["nombre_plan"], $servicioFactura);

        $insertarFactura = $pdo->prepare(
            "INSERT INTO factura
                (id_contrato, id_periodo, fecha_servicio_inicio, fecha_servicio_fin,
                 es_prorrateada, dias_facturados, descripcion, numero,
                 fecha_emision, fecha_vencimiento, total, saldo, estado)
             VALUES
                (:id_contrato, :id_periodo, :fecha_servicio_inicio, :fecha_servicio_fin,
                 :es_prorrateada, :dias_facturados, :descripcion, :numero,
                 :fecha_emision, :fecha_vencimiento, :total, :saldo, 'PENDIENTE')"
        );
        $insertarFactura->execute([
            ":id_contrato" => $idContrato,
            ":id_periodo" => $periodoDb["id_periodo"],
            ":fecha_servicio_inicio" => $servicioFactura["fecha_servicio_inicio"],
            ":fecha_servicio_fin" => $servicioFactura["fecha_servicio_fin"],
            ":es_prorrateada" => $servicioFactura["es_prorrateada"],
            ":dias_facturados" => $servicioFactura["dias_facturados"],
            ":descripcion" => $descripcion,
            ":numero" => $numero,
            ":fecha_emision" => $fechaEmision,
            ":fecha_vencimiento" => fechaVencimientoCiclo(
                $fechaEmision,
                (int) $ciclo["dias_vencimiento"]
            ),
            ":total" => $servicioFactura["total"],
            ":saldo" => $servicioFactura["total"],
        ]);
        $idFactura = (string) $pdo->lastInsertId();
        $auditoria = $pdo->prepare(
            "INSERT INTO auditoria (id_usuario, entidad, id_entidad, accion, motivo, detalle)
             VALUES (NULL, 'factura', :id_factura, 'GENERAR_AUTOMATICA', 'Facturación mensual', :detalle)"
        );
        $auditoria->execute([
            ":id_factura" => $idFactura,
            ":detalle" => json_encode([
                "id_contrato" => $idContrato,
                "periodo_inicio" => $servicioFactura["fecha_servicio_inicio"],
                "periodo_fin" => $servicioFactura["fecha_servicio_fin"],
                "fecha_activacion" => $actual["fecha_activacion"],
                "es_prorrateada" => $servicioFactura["es_prorrateada"],
                "dias_facturados" => $servicioFactura["dias_facturados"],
                "total" => $servicioFactura["total"],
            ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
        ]);
        $pdo->commit();
        return "generada";
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}

$modo = $argv[1] ?? "--dry-run";
if (!in_array($modo, ["--dry-run", "--execute"], true)) {
    fwrite(STDERR, "Uso: php generar_automaticas.php [--dry-run|--execute]\n");
    exit(2);
}

try {
    $hoy = new DateTimeImmutable("today", new DateTimeZone("America/Bogota"));
    $fechaEmision = $hoy->format("Y-m-d");
    $ciclo = cicloFacturacionActivo($pdo);
    $diasVencimiento = (int) $ciclo["dias_vencimiento"];
    $periodo = periodoActualCiclo((int) $ciclo["dia_inicio"], $hoy);
    $contratosStmt = $pdo->prepare(
        "SELECT co.id_contrato, co.fecha_inicio AS fecha_activacion, co.estado,
                pl.precio, pl.nombre AS nombre_plan
         FROM contrato co
         INNER JOIN plan pl ON pl.id_plan = co.id_plan
         WHERE co.estado = 'ACTIVO'
           AND co.fecha_inicio <= :periodo_fin
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(co.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         ORDER BY co.id_contrato"
    );
    $contratosStmt->execute([":periodo_fin" => $periodo["fin"]]);

    $conteos = ["generada" => 0, "simulada" => 0, "existente" => 0, "omitida" => 0, "errores" => 0];
    foreach ($contratosStmt->fetchAll() as $contrato) {
        $servicioFactura = servicioContratoPeriodo(
            $contrato,
            $periodo,
            (int) $ciclo["prorratear_primer_mes"]
        );
        if ($servicioFactura === null) {
            $conteos["omitida"]++;
            continue;
        }

        try {
            $existeFactura = existeFacturaDelCiclo(
                $pdo,
                (string) $contrato["id_contrato"],
                $periodo["inicio"],
                $periodo["fin"]
            );
            if ($existeFactura) {
                $resultado = "existente";
            } elseif ($modo === "--dry-run") {
                $periodoStmt = $pdo->prepare(
                    "SELECT fecha_vencimiento, estado
                     FROM periodo_facturacion
                     WHERE id_ciclo = :id_ciclo AND anio = :anio AND mes = :mes
                     LIMIT 1"
                );
                $periodoStmt->execute([
                    ":id_ciclo" => $ciclo["id_ciclo"],
                    ":anio" => $periodo["anio"],
                    ":mes" => $periodo["mes"],
                ]);
                $periodoConfigurado = $periodoStmt->fetch();
                if ($periodoConfigurado && $periodoConfigurado["estado"] !== "ABIERTO") {
                    $resultado = "omitida";
                } else {
                    generarNumeroFactura(
                        $pdo,
                        (string) $contrato["id_contrato"],
                        (string) $periodo["inicio"]
                    );
                    $resultado = "simulada";
                }
            } else {
                $resultado = procesarContrato(
                    $pdo,
                    $contrato,
                    $periodo,
                    $ciclo,
                    $fechaEmision
                );
            }
            $conteos[$resultado]++;
            if ($resultado === "generada" || $resultado === "simulada") {
                echo "{$resultado}: contrato {$contrato["id_contrato"]}, "
                    . "{$servicioFactura["fecha_servicio_inicio"]} a "
                    . "{$servicioFactura["fecha_servicio_fin"]}\n";
            }
        } catch (Throwable $exception) {
            $conteos["errores"]++;
            error_log(
                "Error en facturación automática del contrato {$contrato["id_contrato"]}: "
                . $exception->getMessage()
            );
            fwrite(STDERR, "Error procesando contrato {$contrato["id_contrato"]}\n");
        }
    }

    echo json_encode([
        "modo" => $modo === "--execute" ? "ejecución" : "simulación",
        "ciclo" => $ciclo["nombre"],
        "dias_para_vencer" => $diasVencimiento,
        "resultado" => $conteos,
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . PHP_EOL;
    exit($conteos["errores"] > 0 ? 1 : 0);
} catch (Throwable $exception) {
    error_log("Error en el proceso de facturación automática: " . $exception->getMessage());
    fwrite(STDERR, "No se pudo completar la facturación automática: {$exception->getMessage()}\n");
    exit(1);
}
