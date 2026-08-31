<?php
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Headers: X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Request-Method");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Allow: GET, POST, OPTIONS, PUT, DELETE");
header("Content-Type: application/json");
require_once "../config/database.php";

$data = json_decode(file_get_contents("php://input"), true);

if (empty($data['nombre'])) {
  echo json_encode(["success" => false, "message" => "El nombre es obligatorio"]);
  exit;
}

$sql = "INSERT INTO productos (nombre, descripcion, precio, stock)
        VALUES (:nombre, :descripcion, :precio, :stock)";
$stmt = $pdo->prepare($sql);
$stmt->execute([
  ":nombre" => $data['nombre'],
  ":descripcion" => $data['descripcion'] ?? null,
  ":precio" => $data['precio'],
  ":stock" => $data['stock'] ?? 0
]);

echo json_encode(["success" => true, "message" => "Producto creado correctamente"]);
