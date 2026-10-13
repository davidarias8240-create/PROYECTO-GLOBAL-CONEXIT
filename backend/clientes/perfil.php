<?php
require_once "../config/database.php";
require_once "../config/session.php";

if ($_SERVER["REQUEST_METHOD"] !== "GET") {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido"], JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($_SESSION["id_usuario"]) || ($_SESSION["tipo_sesion"] ?? "") !== "CLIENTE") {
    http_response_code(401);
    echo json_encode(["error" => "Inicia sesión para consultar tu cuenta"], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $stmt = $pdo->prepare(
        "SELECT
            u.id_usuario,
            u.correo,
            u.estado AS estado_usuario,
            u.fecha_creacion,
            u.ultimo_acceso,
            r.nombre AS rol,
            c.id_cliente,
            c.numero_cliente,
            c.tipo_documento,
            c.numero_documento,
            c.nombres,
            c.telefono,
            COALESCE(NULLIF(c.correo, ''), u.correo) AS correo_contacto,
            c.estado AS estado_cliente,
            (
                SELECT GROUP_CONCAT(
                    CONCAT(d.direccion, ', ', d.ciudad, ', ', d.departamento)
                    ORDER BY d.id_direccion
                    SEPARATOR ' · '
                )
                FROM direccion d
                WHERE d.id_cliente = c.id_cliente
                  AND d.estado = 'ACTIVA'
            ) AS direcciones
         FROM usuario u
         INNER JOIN rol r ON r.id_rol = u.id_rol
         INNER JOIN cliente c ON c.id_usuario = u.id_usuario
         WHERE u.id_usuario = :id_usuario
           AND u.estado = 'ACTIVO'
           AND c.estado = 'ACTIVO'
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
    $stmt->execute([":id_usuario" => $_SESSION["id_usuario"]]);
    $perfil = $stmt->fetch();

    if (!$perfil) {
        unset($_SESSION["id_usuario"]);
        http_response_code(401);
        echo json_encode(["error" => "La cuenta no está activa o no tiene un perfil de cliente"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $perfil["correo"] = $perfil["correo_contacto"];
    unset($perfil["correo_contacto"]);

    echo json_encode($perfil, JSON_UNESCAPED_UNICODE);
} catch (PDOException $exception) {
    error_log("Error consultando perfil de cliente: " . $exception->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "No se pudo cargar la información del perfil"], JSON_UNESCAPED_UNICODE);
}
