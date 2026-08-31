<?php
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Headers: X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Request-Method");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Allow: GET, POST, OPTIONS, PUT, DELETE");
header("Content-Type: application/json");
require_once "../config/database.php";

$data = json_decode(file_get_contents("php://input"), true);

if (empty($data['id'])) {
  echo json_encode(["success" => false, "message" => "ID requerido"]);
  exit;
}

$sql = "DELETE FROM productos WHERE id = :id";
$stmt = $pdo->prepare($sql);
$stmt->execute([":id" => $data['id']]);

echo json_encode(["success" => true, "message" => "Producto eliminado correctamente"]);
