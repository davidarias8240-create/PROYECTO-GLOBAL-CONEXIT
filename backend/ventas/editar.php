<?php
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Headers: X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Request-Method");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Allow: GET, POST, OPTIONS, PUT, DELETE");
header("Content-Type: application/json");
require_once "../config/database.php";

$data = json_decode(file_get_contents("php://input"), true);

if (empty($data['id']) || empty($data['cliente_id']) || empty($data['fecha']) || empty($data['total'])) {
  echo json_encode(["success" => false, "message" => "Datos incompletos"]);
  exit;
}

$sql = "UPDATE ventas 
        SET cliente_id = :cliente_id, fecha = :fecha, total = :total 
        WHERE id = :id";
$stmt = $pdo->prepare($sql);
$stmt->execute([
  ":id" => $data['id'],
  ":cliente_id" => $data['cliente_id'],
  ":fecha" => $data['fecha'],
  ":total" => $data['total']
]);

echo json_encode(["success" => true, "message" => "Venta actualizada correctamente"]);
