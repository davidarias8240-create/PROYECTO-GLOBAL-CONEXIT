<?php

$host = "localhost";
$db = "global_conexit";
$user = "root";
$pass = "";

header("Content-Type: application/json; charset=UTF-8");

$origin = $_SERVER["HTTP_ORIGIN"] ?? "";
$normalizedOrigin = rtrim($origin, "/");
$allowedOrigins = [
    "http://localhost",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
];

if ($origin !== "" && (in_array($normalizedOrigin, $allowedOrigins, true) || preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?/?$#', $normalizedOrigin))) {
    header("Access-Control-Allow-Origin: " . $origin);
    header("Vary: Origin");
}

header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

if (($_SERVER["REQUEST_METHOD"] ?? "GET") === "OPTIONS") {
    http_response_code(204);
    exit;
}

try {
    $pdo = new PDO(
        "mysql:host=$host;dbname=$db;charset=utf8mb4",
        $user,
        $pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]
    );

} catch (PDOException $e) {
    http_response_code(500);

    echo json_encode([
        "error" => "Error de conexión con la base de datos"
    ]);

    exit;
}