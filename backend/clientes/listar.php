<?php
header('Access-Control-Allow-Origin: *');
header("Access-Control-Allow-Headers: X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Request-Method");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");
header("Allow: GET, POST, OPTIONS, PUT, DELETE");
header("Content-Type: application/json");
require_once "../config/database.php";

$stmt = $pdo->query("SELECT
	c.id_cliente AS id,
	c.nombres AS nombre,
	c.numero_documento AS documento,
	c.correo AS email,
	c.telefono,
	GROUP_CONCAT(DISTINCT d.direccion ORDER BY d.id_direccion SEPARATOR ', ') AS direccion
FROM cliente c
LEFT JOIN direccion d ON d.id_cliente = c.id_cliente
GROUP BY c.id_cliente
ORDER BY c.id_cliente ASC");
$clientes = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo json_encode($clientes, JSON_UNESCAPED_UNICODE);
