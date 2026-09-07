<?php
$host = "localhost";
$db   = "mini_erp";
$user = "root";
$pass = ""; // sin contraseña

try {
    $pdo = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    echo json_encode(["error" => "Error de conexión"]);
    exit;
}