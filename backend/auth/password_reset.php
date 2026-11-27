<?php

use PHPMailer\PHPMailer\Exception as PHPMailerException;

require_once __DIR__ . "/../config/database.php";
require_once __DIR__ . "/../config/mailer.php";

header("Cache-Control: no-store, private");
header("Referrer-Policy: no-referrer");

function passwordResetRespond(int $status, array $response): void
{
    http_response_code($status);
    echo json_encode($response, JSON_UNESCAPED_UNICODE);
    exit;
}

function passwordResetGenericResponse(): void
{
    passwordResetRespond(200, [
        "success" => true,
        "message" => "Si la cuenta puede recuperarse, recibirás instrucciones en el correo registrado."
    ]);
}

function passwordResetReadBody(): array
{
    $data = json_decode(file_get_contents("php://input"), true);
    return is_array($data) ? $data : [];
}

function passwordResetRequireJson(): void
{
    $contentType = strtolower(trim(explode(";", (string) ($_SERVER["CONTENT_TYPE"] ?? ""))[0]));
    if ($contentType !== "application/json") {
        passwordResetRespond(415, ["error" => "Se requiere una solicitud JSON"]);
    }
}

function passwordResetRoleScope(string $role): array
{
    if ($role === "CLIENTE") {
        return [
            "joins" => "INNER JOIN cliente c ON c.id_usuario = u.id_usuario",
            "filters" => "
                AND c.estado = 'ACTIVO'
                AND NOT EXISTS (
                    SELECT 1 FROM admin_bajas b
                    WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'clientes' COLLATE utf8mb4_unicode_ci
                      AND b.id_registro COLLATE utf8mb4_unicode_ci =
                          CAST(c.id_cliente AS CHAR) COLLATE utf8mb4_unicode_ci
                )"
        ];
    }

    if ($role === "ADMINISTRADOR") {
        return ["joins" => "", "filters" => ""];
    }

    throw new RuntimeException("Rol de recuperación no válido.");
}

function passwordResetAccountFilters(string $role): string
{
    $scope = passwordResetRoleScope($role);
    return "
        AND u.estado = 'ACTIVO'
        AND r.nombre = :rol
        AND r.estado = 'ACTIVO'
        {$scope["filters"]}
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
        )";
}

function passwordResetFindAccount(PDO $pdo, string $role, string $email): ?array
{
    $scope = passwordResetRoleScope($role);
    $statement = $pdo->prepare(
        "SELECT u.id_usuario
         FROM usuario u
         INNER JOIN rol r ON r.id_rol = u.id_rol
         {$scope["joins"]}
         WHERE u.correo = :correo " . passwordResetAccountFilters($role) . "
         LIMIT 1"
    );
    $statement->execute([":correo" => $email, ":rol" => $role]);
    $account = $statement->fetch();
    return $account ?: null;
}

function passwordResetFindByToken(PDO $pdo, string $role, string $tokenHash, bool $lock): ?array
{
    $scope = passwordResetRoleScope($role);
    $statement = $pdo->prepare(
        "SELECT pr.id_usuario
         FROM recuperacion_contrasena pr
         INNER JOIN usuario u ON u.id_usuario = pr.id_usuario
         INNER JOIN rol r ON r.id_rol = u.id_rol
         {$scope["joins"]}
         WHERE pr.token_hash = :token_hash
           AND pr.usado_en IS NULL
           AND pr.expira_en > CURRENT_TIMESTAMP " .
           passwordResetAccountFilters($role) . "
         LIMIT 1" . ($lock ? " FOR UPDATE" : "")
    );
    $statement->execute([":token_hash" => $tokenHash, ":rol" => $role]);
    $account = $statement->fetch();
    return $account ?: null;
}

function passwordResetTokenIsValid(string $token): bool
{
    return preg_match('/^[a-f0-9]{64}$/D', $token) === 1;
}

function passwordResetBaseUrl(): ?string
{
    $configuredUrl = trim((string) (getenv("PASSWORD_RESET_BASE_URL") ?: ""));
    $parts = parse_url($configuredUrl);
    if (!is_array($parts)
        || !isset($parts["scheme"], $parts["host"])
        || isset($parts["user"], $parts["pass"], $parts["query"], $parts["fragment"])
        || (isset($parts["path"]) && $parts["path"] !== "" && $parts["path"] !== "/")) {
        return null;
    }

    $scheme = strtolower($parts["scheme"]);
    $host = strtolower($parts["host"]);
    $isLocalHost = in_array($host, ["localhost", "127.0.0.1", "[::1]"], true);
    if ($scheme !== "https" && !($scheme === "http" && $isLocalHost)) {
        return null;
    }

    $port = isset($parts["port"]) ? ":" . $parts["port"] : "";
    return $scheme . "://" . $host . $port;
}

function passwordResetRegisterAttempt(PDO $pdo): bool
{
    $remoteAddress = (string) ($_SERVER["REMOTE_ADDR"] ?? "unknown");
    $addressHash = hash("sha256", $remoteAddress);
    $pdo->exec(
        "DELETE FROM recuperacion_contrasena_limite
         WHERE ventana_inicio < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 DAY)"
    );
    $update = $pdo->prepare(
        "INSERT INTO recuperacion_contrasena_limite (ip_hash, ventana_inicio, intentos)
         VALUES (:ip_hash, CURRENT_TIMESTAMP, 1)
         ON DUPLICATE KEY UPDATE
            intentos = IF(
                ventana_inicio <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR),
                1,
                LEAST(intentos + 1, 11)
            ),
            ventana_inicio = IF(
                ventana_inicio <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 1 HOUR),
                CURRENT_TIMESTAMP,
                ventana_inicio
            )"
    );
    $update->execute([":ip_hash" => $addressHash]);
    $count = $pdo->prepare(
        "SELECT intentos
         FROM recuperacion_contrasena_limite
         WHERE ip_hash = :ip_hash"
    );
    $count->execute([":ip_hash" => $addressHash]);
    return (int) $count->fetchColumn() <= 10;
}

function passwordResetValidEmail(string $email): bool
{
    $domain = substr(strrchr($email, "@") ?: "", 1);
    return $email !== ""
        && mb_strlen($email) <= 150
        && !preg_match('/\s/u', $email)
        && filter_var($email, FILTER_VALIDATE_EMAIL) !== false
        && $domain !== ""
        && preg_match('/\.[A-Za-z]{2,}$/D', $domain) === 1;
}

function passwordResetHandleRequest(string $role): void
{
    if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
        passwordResetRespond(405, ["error" => "Método no permitido"]);
    }
    passwordResetRequireJson();

    $data = passwordResetReadBody();
    $email = is_string($data["correo"] ?? null) ? mb_strtolower(trim($data["correo"])) : "";
    if (!passwordResetValidEmail($email)) {
        passwordResetGenericResponse();
    }

    global $pdo;
    try {
        $pdo->beginTransaction();
        if (!passwordResetRegisterAttempt($pdo)) {
            $pdo->commit();
            passwordResetGenericResponse();
        }

        $baseUrl = passwordResetBaseUrl();
        if ($baseUrl === null) {
            $pdo->commit();
            error_log("No se procesó la recuperación: falta PASSWORD_RESET_BASE_URL HTTPS válido.");
            passwordResetGenericResponse();
        }

        $account = passwordResetFindAccount($pdo, $role, $email);
        if (!$account) {
            $pdo->commit();
            passwordResetGenericResponse();
        }

        $token = bin2hex(random_bytes(32));
        $saveToken = $pdo->prepare(
            "INSERT INTO recuperacion_contrasena
                (id_usuario, token_hash, creado_en, expira_en, usado_en)
             VALUES
                (:id_usuario, :token_hash, CURRENT_TIMESTAMP,
                 DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 MINUTE), NULL)
             ON DUPLICATE KEY UPDATE
                token_hash = VALUES(token_hash),
                creado_en = CURRENT_TIMESTAMP,
                expira_en = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 30 MINUTE),
                usado_en = NULL"
        );
        $saveToken->execute([
            ":id_usuario" => $account["id_usuario"],
            ":token_hash" => hash("sha256", $token)
        ]);
        $pdo->commit();

        $rolePath = $role === "CLIENTE" ? "cliente" : "administrador";
        $resetUrl = $baseUrl . "/recuperar-contrasena/" . $rolePath . "#token=" . $token;
        $safeUrl = htmlspecialchars($resetUrl, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8");
        $subject = "Recuperación de contraseña - Global Conexit";
        $html = "<!doctype html><html lang=\"es\"><body>" .
            "<h1>Recuperación de contraseña</h1>" .
            "<p>Recibimos una solicitud para cambiar la contraseña de tu cuenta.</p>" .
            "<p><a href=\"" . $safeUrl . "\">Crear una contraseña nueva</a></p>" .
            "<p>El enlace vence en 30 minutos y solo se puede usar una vez. Si no solicitaste el cambio, ignora este correo.</p>" .
            "</body></html>";
        $text = "Recibimos una solicitud para cambiar la contraseña de tu cuenta. " .
            "Abre este enlace para crear una contraseña nueva (vence en 30 minutos y solo se puede usar una vez): " .
            $resetUrl . "\nSi no solicitaste el cambio, ignora este correo.";

        try {
            enviarCorreo($email, $subject, $html, $text);
        } catch (PHPMailerException | RuntimeException $exception) {
            error_log("No se pudo enviar un correo de recuperación de contraseña.");
        }
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log("Error interno procesando una solicitud de recuperación de contraseña.");
        passwordResetRespond(500, ["error" => "No se pudo procesar la solicitud"]);
    }

    passwordResetGenericResponse();
}

function passwordResetHandleValidation(string $role): void
{
    if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
        passwordResetRespond(405, ["error" => "Método no permitido"]);
    }
    passwordResetRequireJson();

    $data = passwordResetReadBody();
    $token = is_string($data["token"] ?? null) ? $data["token"] : "";
    if (!passwordResetTokenIsValid($token)) {
        passwordResetRespond(400, ["error" => "El enlace no es válido o ya venció. Solicita uno nuevo."]);
    }

    global $pdo;
    try {
        $account = passwordResetFindByToken($pdo, $role, hash("sha256", $token), false);
    } catch (Throwable $exception) {
        error_log("Error interno validando un enlace de recuperación de contraseña.");
        passwordResetRespond(500, ["error" => "No se pudo validar el enlace"]);
    }

    if (!$account) {
        passwordResetRespond(400, ["error" => "El enlace no es válido o ya venció. Solicita uno nuevo."]);
    }
    passwordResetRespond(200, ["success" => true]);
}

function passwordResetHandleCompletion(string $role): void
{
    if (($_SERVER["REQUEST_METHOD"] ?? "") !== "POST") {
        passwordResetRespond(405, ["error" => "Método no permitido"]);
    }
    passwordResetRequireJson();

    $data = passwordResetReadBody();
    $token = is_string($data["token"] ?? null) ? $data["token"] : "";
    $password = is_string($data["contrasena"] ?? null) ? $data["contrasena"] : "";
    $confirmation = is_string($data["confirmar_contrasena"] ?? null)
        ? $data["confirmar_contrasena"]
        : "";
    if (!passwordResetTokenIsValid($token)) {
        passwordResetRespond(400, ["error" => "El enlace no es válido o ya venció. Solicita uno nuevo."]);
    }
    if (strlen($password) < 8 || strlen($password) > 72) {
        passwordResetRespond(400, ["error" => "La contraseña debe tener entre 8 y 72 bytes."]);
    }
    if (!hash_equals($password, $confirmation)) {
        passwordResetRespond(400, ["error" => "Las contraseñas no coinciden."]);
    }

    global $pdo;
    try {
        $pdo->beginTransaction();
        $tokenHash = hash("sha256", $token);
        $account = passwordResetFindByToken($pdo, $role, $tokenHash, true);
        if (!$account) {
            $pdo->rollBack();
            passwordResetRespond(400, ["error" => "El enlace no es válido o ya venció. Solicita uno nuevo."]);
        }

        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        if (!is_string($passwordHash)) {
            throw new RuntimeException("No se pudo generar el hash de la contraseña.");
        }
        $updatePassword = $pdo->prepare(
            "UPDATE usuario
             SET contrasena_hash = :contrasena_hash
             WHERE id_usuario = :id_usuario"
        );
        $updatePassword->execute([
            ":contrasena_hash" => $passwordHash,
            ":id_usuario" => $account["id_usuario"]
        ]);

        $markUsed = $pdo->prepare(
            "UPDATE recuperacion_contrasena
             SET usado_en = CURRENT_TIMESTAMP
             WHERE id_usuario = :id_usuario
               AND token_hash = :token_hash
               AND usado_en IS NULL
               AND expira_en > CURRENT_TIMESTAMP"
        );
        $markUsed->execute([
            ":id_usuario" => $account["id_usuario"],
            ":token_hash" => $tokenHash
        ]);
        if ($markUsed->rowCount() !== 1) {
            $pdo->rollBack();
            passwordResetRespond(400, ["error" => "El enlace no es válido o ya venció. Solicita uno nuevo."]);
        }

        $pdo->commit();
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log("Error interno actualizando una contraseña recuperada.");
        passwordResetRespond(500, ["error" => "No se pudo actualizar la contraseña"]);
    }

    passwordResetRespond(200, [
        "success" => true,
        "message" => "La contraseña se actualizó correctamente."
    ]);
}
