<?php
require_once "../config/database.php";
require_once "../config/session.php";

if ($_SERVER["REQUEST_METHOD"] !== "GET") {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido"], JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($_SESSION["id_usuario"]) || ($_SESSION["tipo_sesion"] ?? "") !== "CLIENTE") {
    http_response_code(401);
    echo json_encode(["error" => "Inicia sesión para consultar tu cuenta"], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $clienteStmt = $pdo->prepare(
        "SELECT c.id_cliente
         FROM cliente c
         INNER JOIN usuario u ON u.id_usuario = c.id_usuario
         INNER JOIN rol r ON r.id_rol = u.id_rol
         WHERE c.id_usuario = :id_usuario
           AND c.estado = 'ACTIVO'
           AND u.estado = 'ACTIVO'
           AND r.nombre = 'CLIENTE'
           AND r.estado = 'ACTIVO'
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'usuarios' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(u.id_usuario AS CHAR) COLLATE utf8mb4_unicode_ci
           )
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'clientes' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(c.id_cliente AS CHAR) COLLATE utf8mb4_unicode_ci
           )
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'roles' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(r.id_rol AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         LIMIT 1"
    );
    $clienteStmt->execute([":id_usuario" => $_SESSION["id_usuario"]]);
    $idCliente = $clienteStmt->fetchColumn();

    if (!$idCliente) {
        http_response_code(401);
        echo json_encode(["error" => "La cuenta no tiene un perfil de cliente activo"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $contratoStmt = $pdo->prepare(
        "SELECT
            c.id_contrato,
            c.fecha_inicio,
            c.fecha_fin,
            c.estado,
            p.nombre AS plan_nombre,
            p.velocidad,
            p.precio,
            d.direccion,
            d.ciudad,
            d.departamento
         FROM contrato c
         INNER JOIN plan p ON p.id_plan = c.id_plan
         INNER JOIN direccion d ON d.id_direccion = c.id_direccion
         WHERE c.id_cliente = :id_cliente
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(c.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         ORDER BY CASE
                WHEN c.estado = 'ACTIVO' THEN 0
                WHEN c.estado = 'SUSPENDIDO' THEN 1
                ELSE 2
            END, c.fecha_inicio DESC
         LIMIT 1"
    );
    $contratoStmt->execute([":id_cliente" => $idCliente]);
    $contrato = $contratoStmt->fetch() ?: null;

    $facturasStmt = $pdo->prepare(
        "SELECT
            f.id_factura,
            f.id_contrato,
            f.numero,
            f.fecha_emision,
            f.fecha_vencimiento,
            f.total,
            f.saldo,
            f.estado,
            pf.fecha_inicio AS periodo_inicio,
            pf.fecha_fin AS periodo_fin,
            COALESCE((
                SELECT SUM(pg.valor)
                FROM pago pg
                WHERE pg.id_factura = f.id_factura
                  AND pg.estado = 'REGISTRADO'
            ), 0) AS total_pagado
         FROM factura f
         INNER JOIN contrato c ON c.id_contrato = f.id_contrato
         INNER JOIN periodo_facturacion pf ON pf.id_periodo = f.id_periodo
         WHERE c.id_cliente = :id_cliente
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'facturas' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(f.id_factura AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         ORDER BY f.fecha_emision DESC, f.id_factura DESC"
    );
    $facturasStmt->execute([":id_cliente" => $idCliente]);
    $facturas = $facturasStmt->fetchAll();

    $ticketsStmt = $pdo->prepare(
        "SELECT t.id_ticket, t.asunto, t.descripcion, t.prioridad, t.estado,
                t.fecha_creacion, t.fecha_cierre
         FROM ticket t
         WHERE t.id_cliente = :id_cliente
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'tickets' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(t.id_ticket AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         ORDER BY t.fecha_creacion DESC, t.id_ticket DESC"
    );
    $ticketsStmt->execute([":id_cliente" => $idCliente]);
    $tickets = $ticketsStmt->fetchAll();

    $historialTicketsStmt = $pdo->prepare(
        "SELECT i.id_interaccion, i.id_ticket, i.id_usuario, i.fecha, i.razon,
                i.descripcion, i.accion_pendiente, u.correo AS responsable
         FROM interaccion i
         INNER JOIN ticket t ON t.id_ticket = i.id_ticket
         LEFT JOIN usuario u ON u.id_usuario = i.id_usuario
         WHERE t.id_cliente = :id_cliente
           AND i.razon IN ('CAMBIO_ESTADO_TICKET', 'SEGUIMIENTO_TICKET')
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'tickets' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(t.id_ticket AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         ORDER BY i.fecha DESC, i.id_interaccion DESC"
    );
    $historialTicketsStmt->execute([":id_cliente" => $idCliente]);
    $historialPorTicket = [];
    foreach ($historialTicketsStmt->fetchAll() as $item) {
        if (is_string($item["accion_pendiente"])
            && preg_match('/^ESTADO\\|([^|]+)\\|([^|]+)$/D', $item["accion_pendiente"], $match)) {
            $item["estado_anterior"] = $match[1];
            $item["estado_nuevo"] = $match[2];
        } else {
            $item["estado_anterior"] = null;
            $item["estado_nuevo"] = null;
        }
        unset($item["accion_pendiente"]);
        $historialPorTicket[(string) $item["id_ticket"]][] = $item;
    }
    foreach ($tickets as &$ticket) {
        $ticket["historial"] = $historialPorTicket[(string) $ticket["id_ticket"]] ?? [];
        $ticket["fecha_actualizacion"] = $ticket["historial"][0]["fecha"] ?? $ticket["fecha_creacion"];
        $ticket["respuesta_admin"] = "";
        foreach ($ticket["historial"] as $item) {
            if (trim((string) $item["descripcion"]) !== "") {
                $ticket["respuesta_admin"] = $item["descripcion"];
                break;
            }
        }
    }
    unset($ticket);

    $notificacionesStmt = $pdo->prepare(
        "SELECT n.id_notificacion, n.asunto, n.mensaje, n.canal, n.fecha, n.estado_entrega
         FROM notificacion n
         WHERE n.id_usuario = :id_usuario
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'notificaciones' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(n.id_notificacion AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         ORDER BY n.fecha DESC, n.id_notificacion DESC
         LIMIT 20"
    );
    $notificacionesStmt->execute([":id_usuario" => $_SESSION["id_usuario"]]);
    $notificaciones = $notificacionesStmt->fetchAll();

    $pendiente = 0.0;
    $pagado = 0.0;
    foreach ($facturas as $factura) {
        if ($factura["estado"] !== "ANULADA") {
            $pendiente += (float) $factura["saldo"];
            $pagado += (float) $factura["total_pagado"];
        }
    }

    echo json_encode([
        "contrato" => $contrato,
        "facturas" => $facturas,
        "tickets" => $tickets,
        "notificaciones" => $notificaciones,
        "resumen" => [
            "pendiente" => round($pendiente, 2),
            "pagado" => round($pagado, 2),
            "paz_y_salvo" => $contrato !== null && $pendiente <= 0
        ]
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (PDOException $exception) {
    error_log("Error consultando el portal del cliente: " . $exception->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "No se pudo cargar la información del servicio"], JSON_UNESCAPED_UNICODE);
}
