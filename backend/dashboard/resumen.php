<?php
require_once __DIR__ . "/../config/admin_auth.php";

header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: GET, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

function responderDashboard(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "GET") {
    responderDashboard(["error" => "Método no permitido"], 405);
}

if (!administradorAutenticado($pdo)) {
    responderDashboard(["error" => "Inicia sesión como administrador"], 401);
}

try {
    $periodoInicio = (new DateTimeImmutable("first day of this month"))
        ->modify("-11 months")
        ->format("Y-m-01");
    $periodoFin = (new DateTimeImmutable("first day of next month"))->format("Y-m-01");
    $mesActualInicio = (new DateTimeImmutable("first day of this month"))->format("Y-m-01");
    $mesAnteriorInicio = (new DateTimeImmutable("first day of this month"))
        ->modify("-1 month")
        ->format("Y-m-01");

    $clientes = $pdo->query(
        "SELECT COUNT(*) AS total,
                COALESCE(SUM(c.estado = 'ACTIVO'), 0) AS activos
         FROM cliente c
         WHERE NOT EXISTS (
             SELECT 1 FROM admin_bajas b
             WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'clientes' COLLATE utf8mb4_unicode_ci
               AND b.id_registro COLLATE utf8mb4_unicode_ci =
                   CAST(c.id_cliente AS CHAR) COLLATE utf8mb4_unicode_ci
         )"
    )->fetch();

    $contratosActivos = (int) $pdo->query(
        "SELECT COUNT(*)
         FROM contrato co
         WHERE co.estado = 'ACTIVO'
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(co.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
           )"
    )->fetchColumn();

    $resumenFinanciero = $pdo->prepare(
        "SELECT
            COALESCE(SUM(
                CASE WHEN f.fecha_emision >= :current_start
                           AND f.fecha_emision < :current_end
                     THEN f.total ELSE 0 END
            ), 0) AS facturado_mes,
            COALESCE(SUM(
                CASE WHEN f.fecha_emision >= :previous_start
                           AND f.fecha_emision < :previous_end
                     THEN f.total ELSE 0 END
            ), 0) AS facturado_mes_anterior,
            COALESCE(SUM(
                CASE WHEN f.fecha_vencimiento < CURRENT_DATE()
                           AND f.estado IN ('PENDIENTE', 'VENCIDA')
                     THEN f.saldo ELSE 0 END
            ), 0) AS saldo_vencido,
            COALESCE(SUM(
                CASE WHEN f.fecha_vencimiento < CURRENT_DATE()
                           AND f.estado IN ('PENDIENTE', 'VENCIDA')
                     THEN 1 ELSE 0 END
            ), 0) AS facturas_vencidas
         FROM factura f
         WHERE f.estado <> 'ANULADA'
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'facturas' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(f.id_factura AS CHAR) COLLATE utf8mb4_unicode_ci
           )"
    );
    $resumenFinanciero->execute([
        ":current_start" => $mesActualInicio,
        ":current_end" => $periodoFin,
        ":previous_start" => $mesAnteriorInicio,
        ":previous_end" => $mesActualInicio,
    ]);
    $finanzas = $resumenFinanciero->fetch();

    $resumenPagos = $pdo->prepare(
        "SELECT
            COALESCE(SUM(
                CASE WHEN p.fecha >= :current_start AND p.fecha < :current_end
                     THEN p.valor ELSE 0 END
            ), 0) AS recaudo_mes,
            COALESCE(SUM(
                CASE WHEN p.fecha >= :previous_start AND p.fecha < :previous_end
                     THEN p.valor ELSE 0 END
            ), 0) AS recaudo_mes_anterior
         FROM pago p
         WHERE p.estado = 'REGISTRADO'
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'pagos' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(p.id_pago AS CHAR) COLLATE utf8mb4_unicode_ci
           )"
    );
    $resumenPagos->execute([
        ":current_start" => $mesActualInicio,
        ":current_end" => $periodoFin,
        ":previous_start" => $mesAnteriorInicio,
        ":previous_end" => $mesActualInicio,
    ]);
    $pagosMes = $resumenPagos->fetch();

    $facturacionMensual = $pdo->prepare(
        "SELECT DATE_FORMAT(f.fecha_emision, '%Y-%m') AS mes,
                COALESCE(SUM(f.total), 0) AS total
         FROM factura f
         WHERE f.fecha_emision >= :period_start
           AND f.fecha_emision < :period_end
           AND f.estado <> 'ANULADA'
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'facturas' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(f.id_factura AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         GROUP BY DATE_FORMAT(f.fecha_emision, '%Y-%m')"
    );
    $facturacionMensual->execute([
        ":period_start" => $periodoInicio,
        ":period_end" => $periodoFin,
    ]);
    $facturasPorMes = [];
    foreach ($facturacionMensual->fetchAll() as $row) {
        $facturasPorMes[$row["mes"]] = (float) $row["total"];
    }

    $recaudoMensual = $pdo->prepare(
        "SELECT DATE_FORMAT(p.fecha, '%Y-%m') AS mes,
                COALESCE(SUM(p.valor), 0) AS total
         FROM pago p
         WHERE p.fecha >= :period_start
           AND p.fecha < :period_end
           AND p.estado = 'REGISTRADO'
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'pagos' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(p.id_pago AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         GROUP BY DATE_FORMAT(p.fecha, '%Y-%m')"
    );
    $recaudoMensual->execute([
        ":period_start" => $periodoInicio,
        ":period_end" => $periodoFin,
    ]);
    $pagosPorMes = [];
    foreach ($recaudoMensual->fetchAll() as $row) {
        $pagosPorMes[$row["mes"]] = (float) $row["total"];
    }

    $meses = [];
    $cursor = new DateTimeImmutable($periodoInicio);
    $limite = new DateTimeImmutable($periodoFin);
    while ($cursor < $limite) {
        $claveMes = $cursor->format("Y-m");
        $meses[] = [
            "mes" => $claveMes,
            "etiqueta" => ucfirst(
                $cursor->format("M")
            ),
            "facturado" => $facturasPorMes[$claveMes] ?? 0,
            "recaudado" => $pagosPorMes[$claveMes] ?? 0,
        ];
        $cursor = $cursor->modify("+1 month");
    }

    $estadosTickets = $pdo->query(
        "SELECT t.estado, COUNT(*) AS total
         FROM ticket t
         WHERE NOT EXISTS (
             SELECT 1 FROM admin_bajas b
             WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'tickets' COLLATE utf8mb4_unicode_ci
               AND b.id_registro COLLATE utf8mb4_unicode_ci =
                   CAST(t.id_ticket AS CHAR) COLLATE utf8mb4_unicode_ci
         )
         GROUP BY t.estado"
    )->fetchAll();
    $tickets = [
        "ABIERTO" => 0,
        "EN_PROCESO" => 0,
        "PENDIENTE" => 0,
        "CERRADO" => 0,
    ];
    foreach ($estadosTickets as $row) {
        $tickets[$row["estado"]] = (int) $row["total"];
    }

    $solicitudesPendientes = $pdo->query(
        "SELECT COUNT(*)
         FROM solicitud_servicio s
         WHERE s.estado = 'PENDIENTE'
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'solicitudes' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(s.id_solicitud AS CHAR) COLLATE utf8mb4_unicode_ci
           )"
    )->fetchColumn();

    $ordenesPendientes = $pdo->query(
        "SELECT COUNT(*)
         FROM orden_servicio o
         WHERE o.estado IN ('PENDIENTE', 'PROGRAMADA', 'EN_PROCESO', 'REPROGRAMADA')
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'ordenes' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(o.id_orden AS CHAR) COLLATE utf8mb4_unicode_ci
           )"
    )->fetchColumn();

    $planesActivos = $pdo->query(
        "SELECT p.id_plan, p.nombre, p.velocidad, COUNT(co.id_contrato) AS contratos
         FROM plan p
         LEFT JOIN contrato co
           ON co.id_plan = p.id_plan
          AND co.estado = 'ACTIVO'
          AND NOT EXISTS (
              SELECT 1 FROM admin_bajas b
              WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
                AND b.id_registro COLLATE utf8mb4_unicode_ci =
                    CAST(co.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
          )
         WHERE NOT EXISTS (
             SELECT 1 FROM admin_bajas b
             WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'planes' COLLATE utf8mb4_unicode_ci
               AND b.id_registro COLLATE utf8mb4_unicode_ci =
                   CAST(p.id_plan AS CHAR) COLLATE utf8mb4_unicode_ci
         )
         GROUP BY p.id_plan, p.nombre, p.velocidad
         HAVING contratos > 0
         ORDER BY contratos DESC, p.nombre ASC
         LIMIT 5"
    )->fetchAll();

    $actividadReciente = $pdo->query(
        "SELECT a.id_auditoria, a.entidad, a.id_entidad, a.accion, a.fecha,
                u.correo AS usuario
         FROM auditoria a
         LEFT JOIN usuario u ON u.id_usuario = a.id_usuario
         ORDER BY a.fecha DESC, a.id_auditoria DESC
         LIMIT 6"
    )->fetchAll();

    $ordenesProximas = $pdo->query(
        "SELECT o.id_orden, o.tipo, o.estado, o.prioridad, o.fecha_programada,
                c.nombres AS cliente, u.correo AS tecnico
         FROM orden_servicio o
         INNER JOIN contrato co ON co.id_contrato = o.id_contrato
         INNER JOIN cliente c ON c.id_cliente = co.id_cliente
         LEFT JOIN usuario u ON u.id_usuario = o.id_usuario_tecnico
         WHERE o.estado IN ('PENDIENTE', 'PROGRAMADA', 'EN_PROCESO', 'REPROGRAMADA')
           AND (o.fecha_programada IS NULL OR DATE(o.fecha_programada) >= CURRENT_DATE())
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'ordenes' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(o.id_orden AS CHAR) COLLATE utf8mb4_unicode_ci
           )
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(co.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
           )
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'clientes' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(c.id_cliente AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         ORDER BY o.fecha_programada IS NULL, o.fecha_programada ASC, o.id_orden DESC
         LIMIT 5"
    )->fetchAll();

    $facturasVencidas = $pdo->query(
        "SELECT f.id_factura, f.numero, f.fecha_vencimiento, f.saldo, f.estado,
                c.nombres AS cliente
         FROM factura f
         INNER JOIN contrato co ON co.id_contrato = f.id_contrato
         INNER JOIN cliente c ON c.id_cliente = co.id_cliente
         WHERE f.fecha_vencimiento < CURRENT_DATE()
           AND f.estado IN ('PENDIENTE', 'VENCIDA')
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'facturas' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(f.id_factura AS CHAR) COLLATE utf8mb4_unicode_ci
           )
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(co.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
           )
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'clientes' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(c.id_cliente AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         ORDER BY f.fecha_vencimiento ASC
         LIMIT 5"
    )->fetchAll();

    responderDashboard([
        "resumen" => [
            "clientes" => [
                "total" => (int) $clientes["total"],
                "activos" => (int) $clientes["activos"],
            ],
            "contratosActivos" => $contratosActivos,
            "facturadoMes" => (float) $finanzas["facturado_mes"],
            "facturadoMesAnterior" => (float) $finanzas["facturado_mes_anterior"],
            "recaudadoMes" => (float) $pagosMes["recaudo_mes"],
            "recaudadoMesAnterior" => (float) $pagosMes["recaudo_mes_anterior"],
            "saldoVencido" => (float) $finanzas["saldo_vencido"],
            "facturasVencidas" => (int) $finanzas["facturas_vencidas"],
            "tickets" => $tickets,
            "solicitudesPendientes" => (int) $solicitudesPendientes,
            "ordenesPendientes" => (int) $ordenesPendientes,
        ],
        "meses" => $meses,
        "planes" => array_map(static fn(array $row): array => [
            "nombre" => $row["nombre"],
            "velocidad" => $row["velocidad"],
            "contratos" => (int) $row["contratos"],
        ], $planesActivos),
        "actividad" => $actividadReciente,
        "ordenes" => $ordenesProximas,
        "facturasVencidas" => $facturasVencidas,
    ]);
} catch (Throwable $exception) {
    error_log("Error cargando dashboard administrativo: " . $exception->getMessage());
    responderDashboard(["error" => "No se pudo cargar la información del dashboard"], 500);
}
