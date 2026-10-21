<?php
require_once __DIR__ . "/../config/admin_auth.php";

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

try {
    $stmt = $pdo->query(
        "SELECT id_auditoria, entidad, id_entidad, accion, fecha
         FROM auditoria
         ORDER BY id_auditoria DESC
         LIMIT 12"
    );
    echo json_encode(
        ["notificaciones" => $stmt->fetchAll()],
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );
} catch (PDOException $exception) {
    error_log("Error cargando notificaciones de auditoría: " . $exception->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "No se pudieron cargar las notificaciones"], JSON_UNESCAPED_UNICODE);
}
