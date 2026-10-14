<?php
require_once __DIR__ . "/../config/database.php";

if ($_SERVER["REQUEST_METHOD"] !== "GET") {
    http_response_code(405);
    header("Allow: GET, OPTIONS");
    echo json_encode(["error" => "Método no permitido"], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $stmt = $pdo->prepare(
        "SELECT p.id_plan, p.nombre, p.velocidad, p.precio, p.descripcion
         FROM plan p
         WHERE p.estado = 'ACTIVO'
           AND p.vigencia_inicio <= CURRENT_DATE()
           AND (p.vigencia_fin IS NULL OR p.vigencia_fin >= CURRENT_DATE())
           AND NOT EXISTS (
               SELECT 1
               FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci =
                         'planes' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                         CAST(p.id_plan AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         ORDER BY p.id_plan ASC"
    );
    $stmt->execute();

    echo json_encode(
        ["planes" => $stmt->fetchAll()],
        JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
    );
} catch (PDOException $exception) {
    error_log("Error listando planes públicos: " . $exception->getMessage());
    http_response_code(500);
    echo json_encode(
        ["error" => "No se pudieron cargar los planes"],
        JSON_UNESCAPED_UNICODE
    );
}
