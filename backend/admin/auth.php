<?php
require_once "../config/database.php";
require_once "../config/session.php";

$method = $_SERVER["REQUEST_METHOD"];

if ($method === "GET") {
    require_once "../config/admin_auth.php";

    if (!administradorAutenticado($pdo)) {
        http_response_code(401);
        echo json_encode(["error" => "Inicia sesión como administrador"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo json_encode(["success" => true], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido"], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$correo = is_array($data) && is_string($data["correo"] ?? null)
    ? trim($data["correo"])
    : "";
$contrasena = is_array($data) && is_string($data["contrasena"] ?? null)
    ? $data["contrasena"]
    : "";

if (!filter_var($correo, FILTER_VALIDATE_EMAIL) || $contrasena === "") {
    http_response_code(400);
    echo json_encode(["error" => "Ingresa un correo válido y una contraseña"], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $stmt = $pdo->prepare(
        "SELECT u.id_usuario, u.contrasena_hash
         FROM usuario u
         INNER JOIN rol r ON r.id_rol = u.id_rol
         WHERE u.correo = :correo
           AND u.estado = 'ACTIVO'
           AND r.nombre = 'ADMINISTRADOR'
           AND r.estado = 'ACTIVO'
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'usuarios' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(u.id_usuario AS CHAR) COLLATE utf8mb4_unicode_ci
           )
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'roles' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(r.id_rol AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         LIMIT 1"
    );
    $stmt->execute([":correo" => $correo]);
    $usuario = $stmt->fetch();

    if (!$usuario || !password_verify($contrasena, $usuario["contrasena_hash"])) {
        http_response_code(401);
        echo json_encode(["error" => "Correo o contraseña incorrectos"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $update = $pdo->prepare(
        "UPDATE usuario
         SET ultimo_acceso = CURRENT_TIMESTAMP
         WHERE id_usuario = :id_usuario"
    );
    $update->execute([":id_usuario" => $usuario["id_usuario"]]);

    session_regenerate_id(true);
    $_SESSION["id_usuario"] = (int) $usuario["id_usuario"];
    $_SESSION["tipo_sesion"] = "ADMINISTRADOR";

    echo json_encode(["success" => true], JSON_UNESCAPED_UNICODE);
} catch (PDOException $exception) {
    error_log("Error iniciando sesión administrativa: " . $exception->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "No se pudo validar la cuenta administrativa"], JSON_UNESCAPED_UNICODE);
}
