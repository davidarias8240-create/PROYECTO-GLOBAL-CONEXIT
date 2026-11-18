<?php

header("Content-Type: application/json; charset=UTF-8");

$requestHost = strtolower((string) ($_SERVER["HTTP_HOST"] ?? ""));
$requestHost = preg_replace('/:\d+$/', "", $requestHost);
$isLocalRequest = in_array($requestHost, ["localhost", "127.0.0.1"], true);

$host = getenv("DB_HOST");
$db = getenv("DB_NAME");
$user = getenv("DB_USER");
$pass = getenv("DB_PASS");

$host = $host !== false && $host !== "" ? $host : "localhost";
$db = $db !== false && $db !== "" ? $db : ($isLocalRequest ? "global_conexit" : "");
$user = $user !== false && $user !== "" ? $user : ($isLocalRequest ? "root" : "");
$pass = $pass === false ? "" : $pass;

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

if ($db === "" || $user === "") {
    error_log("Configuración de base de datos incompleta: define DB_NAME y DB_USER.");
    http_response_code(500);
    echo json_encode([
        "error" => "Configuración de la base de datos incompleta"
    ], JSON_UNESCAPED_UNICODE);
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
    error_log("Error de conexión con la base de datos: " . $e->getMessage());
    http_response_code(500);

    echo json_encode([
        "error" => "Error de conexión con la base de datos"
    ], JSON_UNESCAPED_UNICODE);

    exit;
}