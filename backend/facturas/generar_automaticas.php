<?php

if (PHP_SAPI !== "cli") {
    http_response_code(404);
    exit;
}

require_once __DIR__ . "/../config/database.php";

date_default_timezone_set("America/Bogota");

function fechaCicloMensual(DateTimeImmutable $fecha, int $dia): DateTimeImmutable
{
    $ultimoDia = (int) $fecha->format("t");
    return $fecha->setDate(
        (int) $fecha->format("Y"),
        (int) $fecha->format("m"),
        min($dia, $ultimoDia)
    )->setTime(0, 0);
}

function calcularPeriodoCiclo(string $fechaInicioContrato, DateTimeImmutable $hoy): ?array
{
    $inicioContrato = new DateTimeImmutable($fechaInicioContrato, new DateTimeZone("America/Bogota"));
    if ($inicioContrato > $hoy) {
        return null;
    }

    $diaCorte = (int) $inicioContrato->format("d");
    $inicioPeriodo = fechaCicloMensual($hoy, $diaCorte);
    if ($inicioPeriodo > $hoy) {
        return null;
    }

    $primerDiaMesSiguiente = $hoy->modify("first day of next month");
    $finPeriodo = fechaCicloMensual($primerDiaMesSiguiente, $diaCorte)->modify("-1 day");

    return [
        "inicio" => $inicioPeriodo->format("Y-m-d"),
        "fin" => $finPeriodo->format("Y-m-d"),
    ];
}

function diasVencimientoConfigurados(PDO $pdo): int
{
    $configurado = getenv("GLOBAL_CONEXIT_BILLING_DUE_DAYS");
    if ($configurado !== false && $configurado !== "") {
        if (!ctype_digit($configurado)) {
            throw new RuntimeException("GLOBAL_CONEXIT_BILLING_DUE_DAYS debe ser un entero no negativo");
        }
        return (int) $configurado;
    }

    $stmt = $pdo->query(
        "SELECT DATEDIFF(fecha_vencimiento, fecha_fin) AS dias, COUNT(*) AS usos
         FROM periodo_facturacion
         WHERE fecha_fin >= fecha_inicio
           AND fecha_vencimiento >= fecha_fin
         GROUP BY dias
         ORDER BY COUNT(*) DESC, dias DESC
         LIMIT 2"
    );
    $plazos = $stmt->fetchAll();
    if (!$plazos) {
        throw new RuntimeException(
            "No hay períodos válidos para inferir el plazo de vencimiento; configure GLOBAL_CONEXIT_BILLING_DUE_DAYS"
        );
    }
    if (isset($plazos[1]) && (int) $plazos[0]["usos"] === (int) $plazos[1]["usos"]) {
        throw new RuntimeException(
            "Hay varios plazos de vencimiento frecuentes; configure GLOBAL_CONEXIT_BILLING_DUE_DAYS"
        );
    }
    return (int) $plazos[0]["dias"];
}

function existeFacturaDelCiclo(PDO $pdo, string $idContrato, string $inicio, string $fin): bool
{
    $stmt = $pdo->prepare(
        "SELECT 1
         FROM factura f
         INNER JOIN periodo_facturacion pf ON pf.id_periodo = f.id_periodo
         WHERE f.id_contrato = :id_contrato
           AND pf.fecha_inicio = :fecha_inicio
           AND pf.fecha_fin = :fecha_fin
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
    string $inicio,
    string $fin,
    int $diasVencimiento
): ?array {
    $stmt = $pdo->prepare(
        "SELECT id_periodo, fecha_vencimiento, estado
         FROM periodo_facturacion
         WHERE fecha_inicio = :fecha_inicio AND fecha_fin = :fecha_fin
         ORDER BY (estado = 'ABIERTO') DESC, id_periodo
         LIMIT 1 FOR UPDATE"
    );
    $stmt->execute([":fecha_inicio" => $inicio, ":fecha_fin" => $fin]);
    $periodo = $stmt->fetch();
    if ($periodo) {
        if ($periodo["fecha_vencimiento"] < $fin) {
            throw new RuntimeException("El período configurado tiene un vencimiento anterior a su fecha fin");
        }
        return $periodo;
    }

    $finPeriodo = new DateTimeImmutable($fin, new DateTimeZone("America/Bogota"));
    $vencimiento = $finPeriodo->modify("+{$diasVencimiento} days")->format("Y-m-d");
    $insertar = $pdo->prepare(
        "INSERT INTO periodo_facturacion (fecha_inicio, fecha_fin, fecha_vencimiento, estado)
         VALUES (:fecha_inicio, :fecha_fin, :fecha_vencimiento, 'ABIERTO')"
    );
    $insertar->execute([
        ":fecha_inicio" => $inicio,
        ":fecha_fin" => $fin,
        ":fecha_vencimiento" => $vencimiento,
    ]);
    return [
        "id_periodo" => (string) $pdo->lastInsertId(),
        "fecha_vencimiento" => $vencimiento,
        "estado" => "ABIERTO",
    ];
}

function bloquearCreacionPeriodo(PDO $pdo, string $inicio, string $fin): string
{
    $nombre = substr("billing-" . hash("sha256", "{$inicio}/{$fin}"), 0, 64);
    $stmt = $pdo->prepare("SELECT GET_LOCK(:nombre, 10)");
    $stmt->execute([":nombre" => $nombre]);
    if ((int) $stmt->fetchColumn() !== 1) {
        throw new RuntimeException("No se pudo reservar el período de facturación");
    }
    return $nombre;
}

function liberarCreacionPeriodo(PDO $pdo, string $nombre): void
{
    $stmt = $pdo->prepare("SELECT RELEASE_LOCK(:nombre)");
    $stmt->execute([":nombre" => $nombre]);
}

function procesarContrato(
    PDO $pdo,
    array $contrato,
    array $periodo,
    string $fechaEmision,
    int $diasVencimiento
): string {
    $idContrato = (string) $contrato["id_contrato"];
    $pdo->beginTransaction();
    $bloqueoPeriodo = null;
    try {
        $bloqueo = $pdo->prepare(
            "SELECT co.id_contrato, co.fecha_inicio, co.fecha_fin, co.estado, pl.precio
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

        $periodoActual = calcularPeriodoCiclo(
            (string) $actual["fecha_inicio"],
            new DateTimeImmutable($fechaEmision, new DateTimeZone("America/Bogota"))
        );
        if (!$periodoActual
            || $periodoActual["inicio"] !== $periodo["inicio"]
            || $periodoActual["fin"] !== $periodo["fin"]
            || ($actual["fecha_fin"] !== null && $actual["fecha_fin"] < $periodo["fin"])) {
            $pdo->commit();
            return "omitida";
        }

        if (existeFacturaDelCiclo($pdo, $idContrato, $periodo["inicio"], $periodo["fin"])) {
            $pdo->commit();
            return "existente";
        }

        $bloqueoPeriodo = bloquearCreacionPeriodo(
            $pdo,
            $periodo["inicio"],
            $periodo["fin"]
        );
        $periodoDb = obtenerPeriodoAbierto(
            $pdo,
            $periodo["inicio"],
            $periodo["fin"],
            $diasVencimiento
        );
        if (!$periodoDb || $periodoDb["estado"] !== "ABIERTO") {
            $pdo->commit();
            return "omitida";
        }

        $numero = "AUTO-{$idContrato}-" . str_replace("-", "", $periodo["inicio"]);
        $numeroExistente = $pdo->prepare("SELECT 1 FROM factura WHERE numero = :numero LIMIT 1");
        $numeroExistente->execute([":numero" => $numero]);
        if ($numeroExistente->fetchColumn()) {
            throw new RuntimeException("El número automático de factura ya está ocupado");
        }

        $insertarFactura = $pdo->prepare(
            "INSERT INTO factura
                (id_contrato, id_periodo, numero, fecha_emision, fecha_vencimiento, total, saldo, estado)
             VALUES
                (:id_contrato, :id_periodo, :numero, :fecha_emision, :fecha_vencimiento, :total, :saldo, 'PENDIENTE')"
        );
        $insertarFactura->execute([
            ":id_contrato" => $idContrato,
            ":id_periodo" => $periodoDb["id_periodo"],
            ":numero" => $numero,
            ":fecha_emision" => $fechaEmision,
            ":fecha_vencimiento" => $periodoDb["fecha_vencimiento"],
            ":total" => $actual["precio"],
            ":saldo" => $actual["precio"],
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
                "periodo_inicio" => $periodo["inicio"],
                "periodo_fin" => $periodo["fin"],
            ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
        ]);
        $pdo->commit();
        return "generada";
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    } finally {
        if ($bloqueoPeriodo !== null) {
            liberarCreacionPeriodo($pdo, $bloqueoPeriodo);
        }
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
    $diasVencimiento = diasVencimientoConfigurados($pdo);
    $contratosStmt = $pdo->prepare(
        "SELECT co.id_contrato, co.fecha_inicio, co.fecha_fin, co.estado, pl.precio
         FROM contrato co
         INNER JOIN plan pl ON pl.id_plan = co.id_plan
         WHERE co.estado = 'ACTIVO'
           AND co.fecha_inicio <= :hoy
           AND (co.fecha_fin IS NULL OR co.fecha_fin >= :hoy_fin)
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(co.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         ORDER BY co.id_contrato"
    );
    $contratosStmt->execute([":hoy" => $fechaEmision, ":hoy_fin" => $fechaEmision]);

    $conteos = ["generada" => 0, "simulada" => 0, "existente" => 0, "omitida" => 0, "errores" => 0];
    foreach ($contratosStmt->fetchAll() as $contrato) {
        $periodo = calcularPeriodoCiclo((string) $contrato["fecha_inicio"], $hoy);
        if (!$periodo || ($contrato["fecha_fin"] !== null && $contrato["fecha_fin"] < $periodo["fin"])) {
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
                     WHERE fecha_inicio = :fecha_inicio AND fecha_fin = :fecha_fin
                     ORDER BY (estado = 'ABIERTO') DESC, id_periodo
                     LIMIT 1"
                );
                $periodoStmt->execute([
                    ":fecha_inicio" => $periodo["inicio"],
                    ":fecha_fin" => $periodo["fin"],
                ]);
                $periodoConfigurado = $periodoStmt->fetch();
                if ($periodoConfigurado && $periodoConfigurado["estado"] !== "ABIERTO") {
                    $resultado = "omitida";
                } elseif ($periodoConfigurado
                    && $periodoConfigurado["fecha_vencimiento"] < $periodo["fin"]) {
                    throw new RuntimeException("El período configurado tiene un vencimiento anterior a su fecha fin");
                } else {
                    $numero = "AUTO-{$contrato["id_contrato"]}-"
                        . str_replace("-", "", $periodo["inicio"]);
                    $numeroStmt = $pdo->prepare(
                        "SELECT 1 FROM factura WHERE numero = :numero LIMIT 1"
                    );
                    $numeroStmt->execute([":numero" => $numero]);
                    if ($numeroStmt->fetchColumn()) {
                        throw new RuntimeException("El número automático de factura ya está ocupado");
                    }
                    $resultado = "simulada";
                }
            } else {
                $resultado = procesarContrato(
                    $pdo,
                    $contrato,
                    $periodo,
                    $fechaEmision,
                    $diasVencimiento
                );
            }
            $conteos[$resultado]++;
            if ($resultado === "generada" || $resultado === "simulada") {
                echo "{$resultado}: contrato {$contrato["id_contrato"]}, "
                    . "{$periodo["inicio"]} a {$periodo["fin"]}\n";
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
        "dias_para_vencer" => $diasVencimiento,
        "resultado" => $conteos,
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE) . PHP_EOL;
    exit($conteos["errores"] > 0 ? 1 : 0);
} catch (Throwable $exception) {
    error_log("Error en el proceso de facturación automática: " . $exception->getMessage());
    fwrite(STDERR, "No se pudo completar la facturación automática: {$exception->getMessage()}\n");
    exit(1);
}
