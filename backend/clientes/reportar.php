<?php
require_once "../config/database.php";
require_once "../config/session.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido"], JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($_SESSION["id_usuario"]) || ($_SESSION["tipo_sesion"] ?? "") !== "CLIENTE") {
    http_response_code(401);
    echo json_encode(["error" => "Inicia sesión para enviar un reporte"], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$asunto = is_array($data) && is_string($data["asunto"] ?? null) ? trim($data["asunto"]) : "";
$descripcion = is_array($data) && is_string($data["descripcion"] ?? null)
    ? trim($data["descripcion"])
    : "";
$prioridad = is_array($data) && is_string($data["prioridad"] ?? null)
    ? strtoupper(trim($data["prioridad"]))
    : "MEDIA";

if ($asunto === "" || mb_strlen($asunto) > 200 || $descripcion === "" || mb_strlen($descripcion) > 5000) {
    http_response_code(400);
    echo json_encode(["error" => "Indica el tipo de falla y una descripción de hasta 5000 caracteres"], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!in_array($prioridad, ["BAJA", "MEDIA", "ALTA", "URGENTE"], true)) {
    http_response_code(400);
    echo json_encode(["error" => "La prioridad seleccionada no es válida"], JSON_UNESCAPED_UNICODE);
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
                WHERE b.entidad = 'usuarios'
                  AND b.id_registro = CAST(u.id_usuario AS CHAR)
           )
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad = 'clientes'
                  AND b.id_registro = CAST(c.id_cliente AS CHAR)
           )
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad = 'roles'
                  AND b.id_registro = CAST(r.id_rol AS CHAR)
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

    $stmt = $pdo->prepare(
        "INSERT INTO ticket (id_cliente, asunto, descripcion, prioridad)
         VALUES (:id_cliente, :asunto, :descripcion, :prioridad)"
    );
    $stmt->execute([
        ":id_cliente" => $idCliente,
        ":asunto" => $asunto,
        ":descripcion" => $descripcion,
        ":prioridad" => $prioridad
    ]);

    echo json_encode([
        "success" => true,
        "ticket" => [
            "id_ticket" => (int) $pdo->lastInsertId(),
            "asunto" => $asunto,
            "descripcion" => $descripcion,
            "prioridad" => $prioridad,
            "estado" => "ABIERTO",
            "fecha_creacion" => date("Y-m-d H:i:s")
        ]
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (PDOException $exception) {
    error_log("Error creando reporte de cliente: " . $exception->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "No se pudo guardar el reporte"], JSON_UNESCAPED_UNICODE);
}
