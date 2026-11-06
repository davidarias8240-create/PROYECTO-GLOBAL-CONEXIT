<?php
require_once __DIR__ . "/../config/database.php";

if ($_SERVER["REQUEST_METHOD"] !== "GET") {
    http_response_code(405);
    header("Allow: GET, OPTIONS");
    echo json_encode(["error" => "Método no permitido"], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $total = $pdo->query(
        "SELECT COALESCE(SUM(c.estado = 'ACTIVO'), 0)
         FROM cliente c
         WHERE NOT EXISTS (
             SELECT 1
             FROM admin_bajas b
             WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'clientes' COLLATE utf8mb4_unicode_ci
               AND b.id_registro COLLATE utf8mb4_unicode_ci =
                   CAST(c.id_cliente AS CHAR) COLLATE utf8mb4_unicode_ci
         )"
    )->fetchColumn();

    echo json_encode(
        ["clientes_activos" => (int) $total],
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );
} catch (PDOException $exception) {
    error_log("Error consultando total público de clientes activos: " . $exception->getMessage());
    http_response_code(500);
    echo json_encode(
        ["error" => "No se pudo cargar el total de clientes activos"],
        JSON_UNESCAPED_UNICODE
    );
}
