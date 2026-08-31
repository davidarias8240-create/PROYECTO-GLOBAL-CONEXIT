<?php
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Headers: X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Request-Method");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Allow: GET, POST, OPTIONS, PUT, DELETE");
header("Content-Type: application/json");
require_once "../config/database.php";

// Obtener JSON enviado desde React
$data = json_decode(file_get_contents("php://input"), true);

// Validaciones backend
if (empty($data['nombre'])) {
    echo json_encode([
        "success" => false,
        "message" => "El nombre es obligatorio"
    ]);
    exit;
}

if (!empty($data['email']) && !filter_var($data['email'], FILTER_VALIDATE_EMAIL)) {
    echo json_encode([
        "success" => false,
        "message" => "Email no válido"
    ]);
    exit;
}

$sql = "INSERT INTO clientes (nombre, documento, email, telefono, direccion)
VALUES (:nombre, :documento, :email, :telefono, :direccion)";

$stmt = $pdo->prepare($sql);
$stmt->execute([
    ":nombre" => $data['nombre'],
    ":documento" => $data['documento'] ?? null,
    ":email" => $data['email'] ?? null,
    ":telefono" => $data['telefono'] ?? null,
    ":direccion" => $data['direccion'] ?? null
]);

echo json_encode([
    "success" => true,
    "message" => "Cliente creado correctamente"
]);
