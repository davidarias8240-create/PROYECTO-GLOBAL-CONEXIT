<?php
require_once "../config/database.php";
require_once "../config/session.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido"], JSON_UNESCAPED_UNICODE);
    exit;
}

$_SESSION = [];

if (ini_get("session.use_cookies")) {
    $cookieParams = session_get_cookie_params();
    setcookie(session_name(), "", [
        "expires" => time() - 42000,
        "path" => $cookieParams["path"],
        "domain" => $cookieParams["domain"],
        "secure" => $cookieParams["secure"],
        "httponly" => $cookieParams["httponly"],
        "samesite" => $cookieParams["samesite"]
    ]);
}

session_destroy();
echo json_encode(["success" => true], JSON_UNESCAPED_UNICODE);
