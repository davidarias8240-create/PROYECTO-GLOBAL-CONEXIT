<?php
require_once __DIR__ . "/../config/admin_auth.php";
require_once __DIR__ . "/../periodos/ciclo_service.php";
require_once __DIR__ . "/factura_service.php";

header("Content-Type: application/json; charset=UTF-8");

function responderGeneracionFacturas(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function entradaGeneracionFacturas(array $entrada): array
{
    $idCiclo = filter_var($entrada["id_ciclo"] ?? null, FILTER_VALIDATE_INT);
    $anio = filter_var($entrada["anio"] ?? null, FILTER_VALIDATE_INT);
    $mes = filter_var($entrada["mes"] ?? null, FILTER_VALIDATE_INT);
    $idCliente = null;
    if (isset($entrada["id_cliente"]) && $entrada["id_cliente"] !== "") {
        $idCliente = filter_var($entrada["id_cliente"], FILTER_VALIDATE_INT);
    }
    $fechaEmision = $entrada["fecha_emision"] ?? null;
    $fechaVencimiento = $entrada["fecha_vencimiento"] ?? null;

    if ($idCiclo === false || $idCiclo < 1
        || $anio === false || $anio < 1000 || $anio > 9999
        || $mes === false || $mes < 1 || $mes > 12
        || ($idCliente !== null && ($idCliente === false || $idCliente < 1))
        || !is_string($fechaEmision) || !is_string($fechaVencimiento)) {
        throw new InvalidArgumentException("Selecciona un ciclo, mes, año y fechas válidas");
    }

    fechaVencimientoCiclo($fechaEmision, 1);
    fechaVencimientoCiclo($fechaVencimiento, 1);
    if ($fechaVencimiento < $fechaEmision) {
        throw new InvalidArgumentException("El vencimiento no puede ser anterior a la fecha de emisión");
    }

    return [
        "id_ciclo" => $idCiclo,
        "id_cliente" => $idCliente,
        "anio" => $anio,
        "mes" => $mes,
        "fecha_emision" => $fechaEmision,
        "fecha_vencimiento" => $fechaVencimiento,
    ];
}

function cicloActivoFacturacion(PDO $pdo, int $idCiclo): array
{
    $stmt = $pdo->prepare(
        "SELECT id_ciclo, nombre, dia_inicio, dias_vencimiento, prorratear_primer_mes
         FROM ciclo_facturacion
         WHERE id_ciclo = :id_ciclo AND estado = 'ACTIVO'"
    );
    $stmt->execute([":id_ciclo" => $idCiclo]);
    $ciclo = $stmt->fetch();
    if (!$ciclo) {
        throw new DomainException("El ciclo seleccionado no existe o está inactivo");
    }
    return $ciclo;
}

function facturaExistentePeriodo(
    PDO $pdo,
    string $idContrato,
    ?string $idPeriodo,
    array $periodo,
    bool $bloquear = false
): ?array {
    $sql = "SELECT f.id_factura, f.numero, f.estado
            FROM factura f
            INNER JOIN periodo_facturacion pf ON pf.id_periodo = f.id_periodo
            WHERE f.id_contrato = :id_contrato
              AND (
                  f.id_periodo = :id_periodo
                  OR (pf.fecha_inicio <= :periodo_fin AND pf.fecha_fin >= :periodo_inicio)
              )
            ORDER BY (f.id_periodo = :id_periodo_preferido) DESC, f.id_factura
            LIMIT 1";
    if ($bloquear) {
        $sql .= " FOR UPDATE";
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ":id_contrato" => $idContrato,
        ":id_periodo" => $idPeriodo,
        ":id_periodo_preferido" => $idPeriodo,
        ":periodo_inicio" => $periodo["fecha_inicio"],
        ":periodo_fin" => $periodo["fecha_fin"],
    ]);
    $factura = $stmt->fetch();
    return $factura ?: null;
}

function previsualizarGeneracionFacturas(PDO $pdo, array $entrada, array $ciclo): array
{
    $fechas = calcularFechasPeriodoCiclo(
        (int) $ciclo["dia_inicio"],
        (int) $entrada["anio"],
        (int) $entrada["mes"]
    );
    $periodo = [
        "fecha_inicio" => $fechas["periodo_inicio"],
        "fecha_fin" => $fechas["periodo_fin"],
    ];
    $periodoStmt = $pdo->prepare(
        "SELECT id_periodo, fecha_inicio, fecha_fin, estado
         FROM periodo_facturacion
         WHERE id_ciclo = :id_ciclo AND anio = :anio AND mes = :mes
         LIMIT 1"
    );
    $periodoStmt->execute([
        ":id_ciclo" => $entrada["id_ciclo"],
        ":anio" => $entrada["anio"],
        ":mes" => $entrada["mes"],
    ]);
    $periodoExistente = $periodoStmt->fetch();
    if ($periodoExistente
        && ($periodoExistente["fecha_inicio"] !== $periodo["fecha_inicio"]
            || $periodoExistente["fecha_fin"] !== $periodo["fecha_fin"])) {
        throw new RuntimeException(
            "La regla cambió después de generar este período; no se puede alterar un período existente"
        );
    }
    if ($periodoExistente && $periodoExistente["estado"] !== "ABIERTO") {
        throw new DomainException("El período seleccionado está cerrado y no admite nuevas facturas");
    }

    $filtroCliente = $entrada["id_cliente"] === null ? "" : " AND co.id_cliente = :id_cliente";
    $contratosStmt = $pdo->prepare(
        "SELECT co.id_contrato, co.id_cliente, co.fecha_inicio AS fecha_activacion,
                cl.nombres AS nombre_cliente, pl.nombre AS nombre_plan, pl.velocidad, pl.precio
         FROM contrato co
         INNER JOIN cliente cl ON cl.id_cliente = co.id_cliente
         INNER JOIN plan pl ON pl.id_plan = co.id_plan
         WHERE co.estado = 'ACTIVO'
           AND co.fecha_inicio IS NOT NULL
           AND co.fecha_inicio <= :periodo_fin
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(co.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
           )
           {$filtroCliente}
         ORDER BY co.id_contrato"
    );
    $parametrosContrato = [":periodo_fin" => $periodo["fecha_fin"]];
    if ($entrada["id_cliente"] !== null) {
        $parametrosContrato[":id_cliente"] = $entrada["id_cliente"];
    }
    $contratosStmt->execute($parametrosContrato);
    $elegibles = [];
    $omitidas = [];
    $montoEstimado = 0.0;
    foreach ($contratosStmt->fetchAll() as $contrato) {
        $servicio = calcularServicioFactura(
            (string) $contrato["fecha_activacion"],
            $periodo["fecha_inicio"],
            $periodo["fecha_fin"],
            (int) $ciclo["prorratear_primer_mes"],
            (float) $contrato["precio"]
        );
        if ($servicio === null) {
            continue;
        }

        $fila = [
            "id_contrato" => (string) $contrato["id_contrato"],
            "id_cliente" => (string) $contrato["id_cliente"],
            "nombre_cliente" => $contrato["nombre_cliente"],
            "nombre_plan" => $contrato["nombre_plan"],
            "velocidad" => $contrato["velocidad"],
            "fecha_activacion" => $contrato["fecha_activacion"],
            "fecha_servicio_inicio" => $servicio["fecha_servicio_inicio"],
            "fecha_servicio_fin" => $servicio["fecha_servicio_fin"],
            "es_prorrateada" => $servicio["es_prorrateada"],
            "dias_totales" => $servicio["dias_totales"],
            "dias_facturados" => $servicio["dias_facturados"],
            "total" => $servicio["total"],
            "descripcion" => descripcionFactura($contrato["nombre_plan"], $servicio),
        ];

        $factura = facturaExistentePeriodo(
            $pdo,
            (string) $contrato["id_contrato"],
            $periodoExistente ? (string) $periodoExistente["id_periodo"] : null,
            $periodo
        );
        if ($factura) {
            $omitidas[] = array_merge($fila, [
                "id_factura" => (string) $factura["id_factura"],
                "numero" => $factura["numero"],
                "estado_factura" => $factura["estado"],
                "motivo" => "Ya existe una factura que cubre este período",
            ]);
            continue;
        }

        $elegibles[] = $fila;
        $montoEstimado += (float) $servicio["total"];
    }

    return [
        "ciclo" => [
            "id_ciclo" => (string) $ciclo["id_ciclo"],
            "nombre" => $ciclo["nombre"],
            "dia_inicio" => (int) $ciclo["dia_inicio"],
            "dias_vencimiento" => (int) $ciclo["dias_vencimiento"],
            "prorratear_primer_mes" => (int) $ciclo["prorratear_primer_mes"],
        ],
        "periodo" => [
            "id_periodo" => $periodoExistente ? (string) $periodoExistente["id_periodo"] : null,
            "anio" => $entrada["anio"],
            "mes" => $entrada["mes"],
            "fecha_inicio" => $periodo["fecha_inicio"],
            "fecha_fin" => $periodo["fecha_fin"],
        ],
        "fecha_emision" => $entrada["fecha_emision"],
        "fecha_vencimiento" => $entrada["fecha_vencimiento"],
        "fecha_vencimiento_sugerida" => fechaVencimientoCiclo(
            $entrada["fecha_emision"],
            (int) $ciclo["dias_vencimiento"]
        ),
        "elegibles" => $elegibles,
        "omitidas" => $omitidas,
        "resumen" => [
            "cantidad_elegibles" => count($elegibles),
            "cantidad_omitidas" => count($omitidas),
            "monto_estimado" => round($montoEstimado, 2),
        ],
    ];
}

try {
    $usuario = usuarioPanelAdministrativoAutenticado($pdo);
} catch (Throwable $exception) {
    error_log("Error al autenticar Generar Facturas: " . $exception->getMessage());
    responderGeneracionFacturas(["error" => "No se pudo validar la sesión administrativa"], 500);
}
if ($usuario === null) {
    responderGeneracionFacturas(["error" => "Inicia sesión en el panel administrativo"], 401);
}

$permisos = permisoEntidadAdministrativa($usuario["rol"], "facturas");
$metodo = $_SERVER["REQUEST_METHOD"] ?? "GET";
if ($metodo !== "POST") {
    header("Allow: POST");
    responderGeneracionFacturas(["error" => "Método no permitido"], 405);
}

$entradaJson = json_decode(file_get_contents("php://input"), true);
if (!is_array($entradaJson)) {
    responderGeneracionFacturas(["error" => "La solicitud debe contener un objeto JSON válido"], 400);
}
$operacion = $entradaJson["operacion"] ?? "";
if (!in_array($operacion, ["previsualizar", "generar"], true)) {
    responderGeneracionFacturas(["error" => "La operación solicitada no es válida"], 400);
}
if (!$permisos["crear"]) {
    responderGeneracionFacturas(["error" => "No tienes permiso para generar facturas"], 403);
}

try {
    $entrada = entradaGeneracionFacturas($entradaJson);
    if ($entrada["id_cliente"] !== null) {
        $clienteStmt = $pdo->prepare(
            "SELECT 1
             FROM cliente c
             WHERE c.id_cliente = :id_cliente
               AND NOT EXISTS (
                   SELECT 1 FROM admin_bajas b
                   WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'clientes' COLLATE utf8mb4_unicode_ci
                     AND b.id_registro COLLATE utf8mb4_unicode_ci =
                         CAST(c.id_cliente AS CHAR) COLLATE utf8mb4_unicode_ci
               )
             LIMIT 1"
        );
        $clienteStmt->execute([":id_cliente" => $entrada["id_cliente"]]);
        if (!$clienteStmt->fetchColumn()) {
            responderGeneracionFacturas(["error" => "No se encontró el cliente solicitado"], 404);
        }
    }
    $ciclo = cicloActivoFacturacion($pdo, $entrada["id_ciclo"]);
    $preview = previsualizarGeneracionFacturas($pdo, $entrada, $ciclo);
    if ($operacion === "previsualizar") {
        responderGeneracionFacturas($preview);
    }

    $idsSolicitados = $entradaJson["id_contratos"] ?? null;
    if (!is_array($idsSolicitados) || !$idsSolicitados) {
        responderGeneracionFacturas(["error" => "Selecciona al menos un contrato de la vista previa"], 400);
    }
    $idsSolicitados = array_values(array_unique(array_map(
        static function (mixed $id): string {
            $idValidado = filter_var($id, FILTER_VALIDATE_INT);
            if ($idValidado === false || $idValidado < 1) {
                throw new InvalidArgumentException("La selección contiene un contrato no válido");
            }
            return (string) $idValidado;
        },
        $idsSolicitados
    )));

    $elegibles = [];
    foreach ($preview["elegibles"] as $fila) {
        $elegibles[$fila["id_contrato"]] = $fila;
    }
    $yaFacturadas = [];
    foreach ($preview["omitidas"] as $fila) {
        $yaFacturadas[$fila["id_contrato"]] = $fila;
    }

    $resultado = [
        "creadas" => [],
        "omitidas" => [],
        "errores" => [],
        "monto_total" => 0.0,
    ];
    $seleccionadas = [];
    foreach ($idsSolicitados as $idContrato) {
        if (isset($yaFacturadas[$idContrato])) {
            $resultado["omitidas"][] = $yaFacturadas[$idContrato];
        } elseif (isset($elegibles[$idContrato])) {
            $seleccionadas[] = $idContrato;
        } else {
            $resultado["errores"][] = [
                "id_contrato" => $idContrato,
                "error" => "El contrato ya no es elegible para el período seleccionado",
            ];
        }
    }

    $periodo = null;
    if ($seleccionadas) {
        $pdo->beginTransaction();
        try {
            $pdo->query("SELECT id FROM periodo_solapamiento_guard WHERE id = 1 FOR UPDATE")->fetchColumn();
            $existia = $pdo->prepare(
                "SELECT id_periodo
                 FROM periodo_facturacion
                 WHERE id_ciclo = :id_ciclo AND anio = :anio AND mes = :mes
                 FOR UPDATE"
            );
            $existia->execute([
                ":id_ciclo" => $entrada["id_ciclo"],
                ":anio" => $entrada["anio"],
                ":mes" => $entrada["mes"],
            ]);
            $periodoExistente = $existia->fetchColumn();
            $periodo = obtenerOCrearPeriodo(
                $pdo,
                $entrada["id_ciclo"],
                $entrada["anio"],
                $entrada["mes"],
                $entrada["fecha_emision"]
            );
            if ($periodo["estado"] !== "ABIERTO") {
                throw new DomainException("El período seleccionado está cerrado y no admite nuevas facturas");
            }
            if (!$periodoExistente) {
                $auditoriaPeriodo = $pdo->prepare(
                    "INSERT INTO auditoria (id_usuario, entidad, id_entidad, accion, detalle)
                     VALUES (:id_usuario, 'periodo_facturacion', :id_periodo, 'GENERAR_AUTOMATICO', :detalle)"
                );
                $auditoriaPeriodo->execute([
                    ":id_usuario" => $usuario["id_usuario"],
                    ":id_periodo" => $periodo["id_periodo"],
                    ":detalle" => json_encode([
                        "id_ciclo" => $entrada["id_ciclo"],
                        "anio" => $entrada["anio"],
                        "mes" => $entrada["mes"],
                        "fecha_inicio" => $periodo["fecha_inicio"],
                        "fecha_fin" => $periodo["fecha_fin"],
                    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
                ]);
            }
            $pdo->commit();
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    foreach ($seleccionadas as $idContrato) {
        $pdo->beginTransaction();
        try {
            $guard = $pdo->query("SELECT id FROM periodo_solapamiento_guard WHERE id = 1 FOR UPDATE");
            if (!$guard->fetchColumn()) {
                throw new RuntimeException("No está instalada la protección de períodos de facturación");
            }
            $cicloBloqueado = $pdo->prepare(
                "SELECT prorratear_primer_mes
                 FROM ciclo_facturacion
                 WHERE id_ciclo = :id_ciclo AND estado = 'ACTIVO'
                 FOR UPDATE"
            );
            $cicloBloqueado->execute([":id_ciclo" => $entrada["id_ciclo"]]);
            $prorratear = $cicloBloqueado->fetchColumn();
            if ($prorratear === false) {
                throw new DomainException("El ciclo seleccionado fue desactivado");
            }
            $contratoStmt = $pdo->prepare(
                "SELECT co.id_contrato, co.fecha_inicio AS fecha_activacion,
                        cl.nombres AS nombre_cliente, pl.nombre AS nombre_plan,
                        pl.velocidad, pl.precio
                 FROM contrato co
                 INNER JOIN cliente cl ON cl.id_cliente = co.id_cliente
                 INNER JOIN plan pl ON pl.id_plan = co.id_plan
                 WHERE co.id_contrato = :id_contrato
                   AND co.estado = 'ACTIVO'
                   AND co.fecha_inicio <= :periodo_fin
                   AND (:id_cliente_filtro IS NULL OR co.id_cliente = :id_cliente)
                   AND NOT EXISTS (
                       SELECT 1 FROM admin_bajas b
                       WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
                         AND b.id_registro COLLATE utf8mb4_unicode_ci =
                             CAST(co.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
                   )
                 FOR UPDATE"
            );
            $contratoStmt->execute([
                ":id_contrato" => $idContrato,
                ":periodo_fin" => $periodo["fecha_fin"],
                ":id_cliente_filtro" => $entrada["id_cliente"],
                ":id_cliente" => $entrada["id_cliente"],
            ]);
            $contrato = $contratoStmt->fetch();
            if (!$contrato) {
                throw new DomainException("El contrato ya no está activo o no cumple la fecha de activación");
            }

            $existente = facturaExistentePeriodo(
                $pdo,
                $idContrato,
                (string) $periodo["id_periodo"],
                $periodo,
                true
            );
            if ($existente) {
                $pdo->commit();
                $resultado["omitidas"][] = array_merge($elegibles[$idContrato], [
                    "id_factura" => (string) $existente["id_factura"],
                    "numero" => $existente["numero"],
                    "estado_factura" => $existente["estado"],
                    "motivo" => "Ya existe una factura que cubre este período",
                ]);
                continue;
            }

            $servicio = calcularServicioFactura(
                (string) $contrato["fecha_activacion"],
                (string) $periodo["fecha_inicio"],
                (string) $periodo["fecha_fin"],
                (int) $prorratear,
                (float) $contrato["precio"]
            );
            if ($servicio === null) {
                throw new DomainException("La fecha de activación no permite facturar este período");
            }
            $numero = generarNumeroFactura(
                $pdo,
                $idContrato,
                (string) $periodo["fecha_inicio"]
            );
            $descripcion = descripcionFactura($contrato["nombre_plan"], $servicio);
            $insertar = $pdo->prepare(
                "INSERT INTO factura
                    (id_contrato, id_periodo, fecha_servicio_inicio, fecha_servicio_fin,
                     es_prorrateada, dias_facturados, descripcion, numero,
                     fecha_emision, fecha_vencimiento, total, saldo, estado)
                 VALUES
                    (:id_contrato, :id_periodo, :fecha_servicio_inicio, :fecha_servicio_fin,
                     :es_prorrateada, :dias_facturados, :descripcion, :numero,
                     :fecha_emision, :fecha_vencimiento, :total, :saldo, 'PENDIENTE')"
            );
            $insertar->execute([
                ":id_contrato" => $idContrato,
                ":id_periodo" => $periodo["id_periodo"],
                ":fecha_servicio_inicio" => $servicio["fecha_servicio_inicio"],
                ":fecha_servicio_fin" => $servicio["fecha_servicio_fin"],
                ":es_prorrateada" => $servicio["es_prorrateada"],
                ":dias_facturados" => $servicio["dias_facturados"],
                ":descripcion" => $descripcion,
                ":numero" => $numero,
                ":fecha_emision" => $entrada["fecha_emision"],
                ":fecha_vencimiento" => $entrada["fecha_vencimiento"],
                ":total" => $servicio["total"],
                ":saldo" => $servicio["total"],
            ]);
            $idFactura = (string) $pdo->lastInsertId();
            $auditoria = $pdo->prepare(
                "INSERT INTO auditoria (id_usuario, entidad, id_entidad, accion, motivo, detalle)
                 VALUES (:id_usuario, 'factura', :id_factura, 'GENERAR_ADMIN', 'Generación desde Admin', :detalle)"
            );
            $auditoria->execute([
                ":id_usuario" => $usuario["id_usuario"],
                ":id_factura" => $idFactura,
                ":detalle" => json_encode([
                    "id_contrato" => $idContrato,
                    "id_ciclo" => $entrada["id_ciclo"],
                    "id_periodo" => $periodo["id_periodo"],
                    "fecha_activacion" => $contrato["fecha_activacion"],
                    "fecha_servicio_inicio" => $servicio["fecha_servicio_inicio"],
                    "fecha_servicio_fin" => $servicio["fecha_servicio_fin"],
                    "es_prorrateada" => $servicio["es_prorrateada"],
                    "dias_facturados" => $servicio["dias_facturados"],
                    "total" => $servicio["total"],
                ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
            ]);
            $pdo->commit();
            $resultado["creadas"][] = [
                "id_factura" => $idFactura,
                "id_contrato" => $idContrato,
                "numero" => $numero,
                "nombre_cliente" => $contrato["nombre_cliente"],
                "nombre_plan" => $contrato["nombre_plan"],
                "fecha_activacion" => $contrato["fecha_activacion"],
                "fecha_servicio_inicio" => $servicio["fecha_servicio_inicio"],
                "fecha_servicio_fin" => $servicio["fecha_servicio_fin"],
                "es_prorrateada" => $servicio["es_prorrateada"],
                "dias_facturados" => $servicio["dias_facturados"],
                "descripcion" => $descripcion,
                "total" => $servicio["total"],
            ];
            $resultado["monto_total"] += (float) $servicio["total"];
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log("Error generando factura para contrato {$idContrato}: " . $exception->getMessage());
            if ($exception instanceof DomainException) {
                $mensaje = $exception->getMessage();
            } else {
                $mensaje = "No se pudo generar la factura para este contrato";
            }
            $resultado["errores"][] = [
                "id_contrato" => $idContrato,
                "error" => $mensaje,
            ];
        }
    }

    $resultado["monto_total"] = round($resultado["monto_total"], 2);
    $resultado["resumen"] = [
        "cantidad_creadas" => count($resultado["creadas"]),
        "cantidad_omitidas" => count($resultado["omitidas"]),
        "cantidad_errores" => count($resultado["errores"]),
        "monto_total" => $resultado["monto_total"],
    ];
    responderGeneracionFacturas($resultado);
} catch (InvalidArgumentException $exception) {
    responderGeneracionFacturas(["error" => $exception->getMessage()], 400);
} catch (DomainException $exception) {
    responderGeneracionFacturas(["error" => $exception->getMessage()], 409);
} catch (Throwable $exception) {
    error_log("Error en generación administrativa de facturas: " . $exception->getMessage());
    responderGeneracionFacturas(["error" => "No se pudo procesar la generación de facturas"], 500);
}
