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

try {
  $pdo->beginTransaction();

  $stmtDetalle = $pdo->prepare("DELETE FROM venta_detalle WHERE venta_id = :id");
  $stmtDetalle->execute([":id" => $data['id']]);

  $stmtVenta = $pdo->prepare("DELETE FROM ventas WHERE id = :id");
  $stmtVenta->execute([":id" => $data['id']]);

  $pdo->commit();

  echo json_encode(["success" => true, "message" => "Venta eliminada correctamente"]);
} catch (Exception $e) {
  $pdo->rollBack();
  echo json_encode(["success" => false, "message" => "No se pudo eliminar la venta: " . $e->getMessage()]);
}
