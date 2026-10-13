<?php
require_once __DIR__ . "/database.php";
require_once __DIR__ . "/session.php";

function administradorAutenticado(PDO $pdo): bool
{
    if (empty($_SESSION["id_usuario"]) || ($_SESSION["tipo_sesion"] ?? "") !== "ADMINISTRADOR") {
        return false;
    }

    $stmt = $pdo->prepare(
        "SELECT u.estado, r.nombre AS rol
         FROM usuario u
         INNER JOIN rol r ON r.id_rol = u.id_rol
         WHERE u.id_usuario = :id_usuario
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
    $stmt->execute([":id_usuario" => $_SESSION["id_usuario"]]);
    $usuario = $stmt->fetch();

    if (!$usuario || $usuario["estado"] !== "ACTIVO" || $usuario["rol"] !== "ADMINISTRADOR") {
        $_SESSION = [];
        session_destroy();
        return false;
    }

    return true;
}
