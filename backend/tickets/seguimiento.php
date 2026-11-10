<?php
require_once __DIR__ . "/../config/admin_auth.php";

header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, OPTIONS");

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

$idTicket = filter_input(INPUT_GET, "id_ticket", FILTER_VALIDATE_INT);
if ($idTicket === false || $idTicket === null || $idTicket <= 0) {
    http_response_code(400);
    echo json_encode(["error" => "Debe indicar un ticket válido"], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $ticketStmt = $pdo->prepare(
        "SELECT t.*, c.nombres AS cliente_nombre, c.numero_cliente
         FROM ticket t
         INNER JOIN cliente c ON c.id_cliente = t.id_cliente
         WHERE t.id_ticket = :id_ticket
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'tickets' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(t.id_ticket AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         LIMIT 1"
    );
    $ticketStmt->execute([":id_ticket" => $idTicket]);
    $ticket = $ticketStmt->fetch();
    if (!$ticket) {
        http_response_code(404);
        echo json_encode(["error" => "No se encontró el ticket activo"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $historialStmt = $pdo->prepare(
        "SELECT i.id_interaccion, i.id_ticket, i.id_usuario, i.fecha, i.razon,
                i.descripcion, i.accion_pendiente, u.correo AS responsable
         FROM interaccion i
         LEFT JOIN usuario u ON u.id_usuario = i.id_usuario
         WHERE i.id_ticket = :id_ticket
           AND i.razon IN ('CAMBIO_ESTADO_TICKET', 'SEGUIMIENTO_TICKET')
         ORDER BY i.fecha DESC, i.id_interaccion DESC"
    );
    $historialStmt->execute([":id_ticket" => $idTicket]);
    $historial = [];
    foreach ($historialStmt->fetchAll() as $item) {
        if (is_string($item["accion_pendiente"])
            && preg_match('/^ESTADO\\|([^|]+)\\|([^|]+)$/D', $item["accion_pendiente"], $match)) {
            $item["estado_anterior"] = $match[1];
            $item["estado_nuevo"] = $match[2];
        } else {
            $item["estado_anterior"] = null;
            $item["estado_nuevo"] = null;
        }
        unset($item["accion_pendiente"]);
        $historial[] = $item;
    }

    $ticket["fecha_actualizacion"] = $historial[0]["fecha"] ?? $ticket["fecha_creacion"];
    $ticket["respuesta_admin"] = "";
    foreach ($historial as $item) {
        if (trim((string) $item["descripcion"]) !== "") {
            $ticket["respuesta_admin"] = $item["descripcion"];
            break;
        }
    }

    echo json_encode(
        ["ticket" => $ticket, "historial" => $historial],
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );
} catch (PDOException $exception) {
    error_log("Error consultando seguimiento del ticket: " . $exception->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "No se pudo consultar el seguimiento del ticket"], JSON_UNESCAPED_UNICODE);
}
