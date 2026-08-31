<?php
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Headers: X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Request-Method");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Allow: GET, POST, OPTIONS, PUT, DELETE");
header("Content-Type: application/json");
require_once "../config/database.php";

$data = json_decode(file_get_contents("php://input"), true);

if (empty($data['id']) || empty($data['nombre'])) {
  echo json_encode(["success" => false, "message" => "ID y nombre son obligatorios"]);
  exit;
}

$sql = "UPDATE productos 
        SET nombre = :nombre, descripcion = :descripcion, precio = :precio, stock = :stock 
        WHERE id = :id";
$stmt = $pdo->prepare($sql);
$stmt->execute([
  ":id" => $data['id'],
  ":nombre" => $data['nombre'],
  ":descripcion" => $data['descripcion'] ?? null,
  ":precio" => $data['precio'],
  ":stock" => $data['stock'] ?? 0
]);

echo json_encode(["success" => true, "message" => "Producto actualizado correctamente"]);
