<?php
require_once "../config/database.php";
require_once "../config/session.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido"], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$tipoDocumento = is_array($data) && is_string($data["tipo_documento"] ?? null)
    ? trim($data["tipo_documento"])
    : "";
$numeroDocumento = is_array($data) && is_string($data["numero_documento"] ?? null)
    ? trim($data["numero_documento"])
    : "";
$contrasena = is_array($data) && is_string($data["contrasena"] ?? null)
    ? $data["contrasena"]
    : "";

if (!in_array($tipoDocumento, ["CC", "CE", "NIT", "TI", "PASAPORTE", "OTRO"], true)
    || $numeroDocumento === "" || $contrasena === "") {
    http_response_code(400);
    echo json_encode(["error" => "Ingresa tu tipo y número de documento y contraseña"], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $stmt = $pdo->prepare(
        "SELECT u.id_usuario, u.contrasena_hash
         FROM cliente c
         INNER JOIN usuario u ON u.id_usuario = c.id_usuario
         INNER JOIN rol r ON r.id_rol = u.id_rol
         WHERE c.tipo_documento = :tipo_documento
           AND c.numero_documento = :numero_documento
           AND c.estado = 'ACTIVO'
           AND u.estado = 'ACTIVO'
           AND r.nombre = 'CLIENTE'
           AND r.estado = 'ACTIVO'
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'usuarios' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(u.id_usuario AS CHAR) COLLATE utf8mb4_unicode_ci
           )
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'clientes' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(c.id_cliente AS CHAR) COLLATE utf8mb4_unicode_ci
           )
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'roles' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(r.id_rol AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         LIMIT 1"
    );
    $stmt->execute([
        ":tipo_documento" => $tipoDocumento,
        ":numero_documento" => $numeroDocumento
    ]);
    $usuario = $stmt->fetch();

    if (!$usuario || !password_verify($contrasena, $usuario["contrasena_hash"])) {
        http_response_code(401);
        echo json_encode(["error" => "Documento o contraseña incorrectos"], JSON_UNESCAPED_UNICODE);
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
    $_SESSION["tipo_sesion"] = "CLIENTE";

    echo json_encode(["success" => true], JSON_UNESCAPED_UNICODE);
} catch (PDOException $exception) {
    error_log("Error iniciando sesión de cliente: " . $exception->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "No se pudo validar la cuenta"], JSON_UNESCAPED_UNICODE);
}
