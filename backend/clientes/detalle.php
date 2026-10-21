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

if ($_SERVER["REQUEST_METHOD"] !== "GET") {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido"], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!administradorAutenticado($pdo)) {
    http_response_code(401);
    echo json_encode(["error" => "Inicia sesión como administrador"], JSON_UNESCAPED_UNICODE);
    exit;
}

function existeBaja(PDO $pdo, string $entidad, string $idRegistro): bool
{
    $stmt = $pdo->prepare(
        "SELECT 1
         FROM admin_bajas b
         WHERE b.entidad COLLATE utf8mb4_unicode_ci = :entidad COLLATE utf8mb4_unicode_ci
           AND b.id_registro COLLATE utf8mb4_unicode_ci = CAST(:id_registro AS CHAR) COLLATE utf8mb4_unicode_ci
         LIMIT 1"
    );
    $stmt->execute([
        ":entidad" => $entidad,
        ":id_registro" => $idRegistro,
    ]);
    return (bool) $stmt->fetchColumn();
}

$idCliente = filter_input(INPUT_GET, "id_cliente", FILTER_VALIDATE_INT);
if ($idCliente === false || $idCliente === null || $idCliente <= 0) {
    http_response_code(400);
    echo json_encode(["error" => "Debe indicar un cliente válido"], JSON_UNESCAPED_UNICODE);
    exit;
}

$clienteStmt = $pdo->prepare(
    "SELECT c.*, u.correo AS correo_usuario, u.estado AS estado_usuario
     FROM cliente c
     LEFT JOIN usuario u ON u.id_usuario = c.id_usuario
     WHERE c.id_cliente = :id_cliente
       AND NOT EXISTS (
           SELECT 1 FROM admin_bajas b
           WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'clientes' COLLATE utf8mb4_unicode_ci
             AND b.id_registro COLLATE utf8mb4_unicode_ci = CAST(c.id_cliente AS CHAR) COLLATE utf8mb4_unicode_ci
       )
     LIMIT 1"
);
$clienteStmt->execute([":id_cliente" => $idCliente]);
$cliente = $clienteStmt->fetch();

if (!$cliente) {
    http_response_code(404);
    echo json_encode(["error" => "No se encontró el cliente solicitado"], JSON_UNESCAPED_UNICODE);
    exit;
}

$direccionesStmt = $pdo->prepare(
    "SELECT d.*
     FROM direccion d
     WHERE d.id_cliente = :id_cliente
       AND NOT EXISTS (
           SELECT 1 FROM admin_bajas b
           WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'direcciones' COLLATE utf8mb4_unicode_ci
             AND b.id_registro COLLATE utf8mb4_unicode_ci = CAST(d.id_direccion AS CHAR) COLLATE utf8mb4_unicode_ci
       )
     ORDER BY d.id_direccion DESC"
);
$direccionesStmt->execute([":id_cliente" => $idCliente]);
$direcciones = $direccionesStmt->fetchAll();

$contratosStmt = $pdo->prepare(
    "SELECT co.*, p.nombre AS plan_nombre, p.velocidad, p.precio, d.direccion, d.ciudad, d.departamento
     FROM contrato co
     INNER JOIN plan p ON p.id_plan = co.id_plan
     INNER JOIN direccion d ON d.id_direccion = co.id_direccion
     WHERE co.id_cliente = :id_cliente
       AND NOT EXISTS (
           SELECT 1 FROM admin_bajas b
           WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
             AND b.id_registro COLLATE utf8mb4_unicode_ci = CAST(co.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
       )
     ORDER BY co.fecha_inicio DESC, co.id_contrato DESC"
);
$contratosStmt->execute([":id_cliente" => $idCliente]);
$contratos = $contratosStmt->fetchAll();

$solicitudesStmt = $pdo->prepare(
    "SELECT s.*
     FROM solicitud_servicio s
     WHERE s.id_cliente = :id_cliente
       AND NOT EXISTS (
           SELECT 1 FROM admin_bajas b
           WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'solicitudes' COLLATE utf8mb4_unicode_ci
             AND b.id_registro COLLATE utf8mb4_unicode_ci = CAST(s.id_solicitud AS CHAR) COLLATE utf8mb4_unicode_ci
       )
     ORDER BY s.fecha DESC"
);
$solicitudesStmt->execute([":id_cliente" => $idCliente]);
$solicitudes = $solicitudesStmt->fetchAll();

$ticketStmt = $pdo->prepare(
    "SELECT t.*
     FROM ticket t
     WHERE t.id_cliente = :id_cliente
       AND NOT EXISTS (
           SELECT 1 FROM admin_bajas b
           WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'tickets' COLLATE utf8mb4_unicode_ci
             AND b.id_registro COLLATE utf8mb4_unicode_ci = CAST(t.id_ticket AS CHAR) COLLATE utf8mb4_unicode_ci
       )
     ORDER BY t.fecha_creacion DESC"
);
$ticketStmt->execute([":id_cliente" => $idCliente]);
$tickets = $ticketStmt->fetchAll();

$interaccionesStmt = $pdo->prepare(
    "SELECT i.*, t.id_cliente, t.asunto, u.correo AS responsable_correo
     FROM interaccion i
     INNER JOIN ticket t ON t.id_ticket = i.id_ticket
     LEFT JOIN usuario u ON u.id_usuario = i.id_usuario
     WHERE t.id_cliente = :id_cliente
     ORDER BY i.fecha DESC"
);
$interaccionesStmt->execute([":id_cliente" => $idCliente]);
$interacciones = $interaccionesStmt->fetchAll();

$notificacionesStmt = $pdo->prepare(
    "SELECT n.*
     FROM notificacion n
     INNER JOIN usuario u ON u.id_usuario = n.id_usuario
     INNER JOIN cliente c ON c.id_usuario = u.id_usuario
     WHERE c.id_cliente = :id_cliente
       AND NOT EXISTS (
           SELECT 1 FROM admin_bajas b
           WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'notificaciones' COLLATE utf8mb4_unicode_ci
             AND b.id_registro COLLATE utf8mb4_unicode_ci = CAST(n.id_notificacion AS CHAR) COLLATE utf8mb4_unicode_ci
       )
     ORDER BY n.fecha DESC"
);
$notificacionesStmt->execute([":id_cliente" => $idCliente]);
$notificaciones = $notificacionesStmt->fetchAll();

$facturasStmt = $pdo->prepare(
    "SELECT f.*, co.id_cliente, p.nombre AS plan_nombre, pf.fecha_inicio AS periodo_inicio, pf.fecha_fin AS periodo_fin,
            pf.fecha_vencimiento AS periodo_vencimiento
     FROM factura f
     INNER JOIN contrato co ON co.id_contrato = f.id_contrato
     INNER JOIN plan p ON p.id_plan = co.id_plan
     INNER JOIN periodo_facturacion pf ON pf.id_periodo = f.id_periodo
     WHERE co.id_cliente = :id_cliente
       AND NOT EXISTS (
           SELECT 1 FROM admin_bajas b
           WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'facturas' COLLATE utf8mb4_unicode_ci
             AND b.id_registro COLLATE utf8mb4_unicode_ci = CAST(f.id_factura AS CHAR) COLLATE utf8mb4_unicode_ci
       )
     ORDER BY f.fecha_emision DESC, f.id_factura DESC"
);
$facturasStmt->execute([":id_cliente" => $idCliente]);
$facturas = $facturasStmt->fetchAll();

$pagosStmt = $pdo->prepare(
    "SELECT p.*, f.numero AS numero_factura, co.id_cliente
     FROM pago p
     INNER JOIN factura f ON f.id_factura = p.id_factura
     INNER JOIN contrato co ON co.id_contrato = f.id_contrato
     WHERE co.id_cliente = :id_cliente
       AND NOT EXISTS (
           SELECT 1 FROM admin_bajas b
           WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'pagos' COLLATE utf8mb4_unicode_ci
             AND b.id_registro COLLATE utf8mb4_unicode_ci = CAST(p.id_pago AS CHAR) COLLATE utf8mb4_unicode_ci
       )
     ORDER BY p.fecha DESC"
);
$pagosStmt->execute([":id_cliente" => $idCliente]);
$pagos = $pagosStmt->fetchAll();

$ajustesStmt = $pdo->prepare(
    "SELECT af.*, f.numero AS numero_factura, u.correo AS usuario_correo
     FROM ajuste_factura af
     INNER JOIN factura f ON f.id_factura = af.id_factura
     INNER JOIN contrato co ON co.id_contrato = f.id_contrato
     LEFT JOIN usuario u ON u.id_usuario = af.id_usuario
     WHERE co.id_cliente = :id_cliente
       AND NOT EXISTS (
           SELECT 1 FROM admin_bajas b
           WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'ajustes' COLLATE utf8mb4_unicode_ci
             AND b.id_registro COLLATE utf8mb4_unicode_ci = CAST(af.id_ajuste AS CHAR) COLLATE utf8mb4_unicode_ci
       )
     ORDER BY af.fecha DESC"
);
$ajustesStmt->execute([":id_cliente" => $idCliente]);
$ajustes = $ajustesStmt->fetchAll();

$historialStmt = $pdo->prepare(
    "SELECT a.*
     FROM auditoria a
     WHERE a.entidad = 'cliente'
       AND a.id_entidad = :id_cliente
     ORDER BY a.fecha DESC
     LIMIT 50"
);
$historialStmt->execute([":id_cliente" => (string) $idCliente]);
$historial = $historialStmt->fetchAll();

$totalFacturado = array_reduce($facturas, static fn(float $total, array $factura): float => $total + (float) ($factura["total"] ?? 0), 0.0);
$totalPagado = array_reduce($pagos, static function (float $total, array $pago): float {
    if (($pago["estado"] ?? "") === "REGISTRADO") {
        return $total + (float) ($pago["valor"] ?? 0);
    }
    return $total;
}, 0.0);
$saldoPendiente = array_reduce($facturas, static fn(float $total, array $factura): float => $total + (float) ($factura["saldo"] ?? 0), 0.0);
$ajustesTotal = array_reduce($ajustes, static fn(float $total, array $ajuste): float => $total + (float) ($ajuste["valor"] ?? 0), 0.0);

$resumen = [
    "cantidad_servicios" => count($contratos),
    "cantidad_solicitudes" => count($solicitudes),
    "cantidad_tickets" => count($tickets),
    "cantidad_direcciones" => count($direcciones),
    "total_facturado" => $totalFacturado,
    "total_pagado" => $totalPagado,
    "saldo_pendiente" => $saldoPendiente,
    "ajustes_total" => $ajustesTotal,
];

echo json_encode([
    "cliente" => $cliente,
    "direcciones" => $direcciones,
    "contratos" => $contratos,
    "solicitudes" => $solicitudes,
    "tickets" => $tickets,
    "interacciones" => $interacciones,
    "notificaciones" => $notificaciones,
    "facturas" => $facturas,
    "pagos" => $pagos,
    "ajustes" => $ajustes,
    "historial" => $historial,
    "resumen" => $resumen,
], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
