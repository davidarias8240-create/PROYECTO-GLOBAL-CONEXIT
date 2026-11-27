<?php

use PHPMailer\PHPMailer\PHPMailer;

require_once dirname(__DIR__, 2) . "/vendor/autoload.php";

function cargarConfiguracionMailer(): array
{
    $configPath = __DIR__ . "/mail.local.php";
    $config = [];
    if (is_file($configPath)) {
        $localConfig = require $configPath;
        if (!is_array($localConfig)) {
            throw new RuntimeException("La configuración SMTP debe devolver un arreglo.");
        }
        $config = $localConfig;
    }

    $environmentVariables = [
        "host" => "SMTP_HOST",
        "port" => "SMTP_PORT",
        "username" => "SMTP_USERNAME",
        "password" => "SMTP_PASSWORD",
        "from_email" => "SMTP_FROM_EMAIL",
        "from_name" => "SMTP_FROM_NAME",
        "notification_email" => "SMTP_NOTIFICATION_EMAIL",
        "encryption" => "SMTP_ENCRYPTION",
    ];
    foreach ($environmentVariables as $field => $variable) {
        $value = getenv($variable);
        if ($value !== false && $value !== "") {
            $config[$field] = $value;
        }
    }

    return $config;
}

function obtenerCorreoNotificaciones(): string
{
    $config = cargarConfiguracionMailer();
    $destinatario = trim((string) ($config["notification_email"] ?? ""));
    if ($destinatario === "") {
        $destinatario = trim((string) ($config["username"] ?? ""));
    }

    if (!filter_var($destinatario, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException("Configura un correo válido para recibir las solicitudes.");
    }

    return $destinatario;
}

function crearMailer(): PHPMailer
{
    $config = cargarConfiguracionMailer();
    foreach (["host", "port", "username", "password"] as $field) {
        if (!isset($config[$field]) || trim((string) $config[$field]) === "") {
            throw new RuntimeException("Falta configurar el campo SMTP '{$field}'.");
        }
    }

    $port = filter_var($config["port"], FILTER_VALIDATE_INT);
    if ($port === false || $port < 1 || $port > 65535) {
        throw new RuntimeException("El puerto SMTP configurado no es válido.");
    }

    $mailer = new PHPMailer(true);
    $mailer->isSMTP();
    $mailer->Host = (string) $config["host"];
    $mailer->SMTPAuth = true;
    $mailer->Username = (string) $config["username"];
    $password = (string) $config["password"];
    if (strcasecmp($mailer->Host, "smtp.gmail.com") === 0) {
        $password = preg_replace('/\s+/', "", $password) ?? $password;
    }
    $mailer->Password = $password;
    $encryption = strtolower(trim((string) ($config["encryption"] ?? "")));
    if ($encryption === "") {
        $encryption = $port === 465 ? "ssl" : "tls";
    }
    if (!in_array($encryption, ["tls", "ssl"], true)) {
        throw new RuntimeException("La seguridad SMTP debe ser 'tls' o 'ssl'.");
    }
    $mailer->SMTPSecure = $encryption === "ssl"
        ? PHPMailer::ENCRYPTION_SMTPS
        : PHPMailer::ENCRYPTION_STARTTLS;
    $mailer->Port = $port;
    $mailer->CharSet = PHPMailer::CHARSET_UTF8;
    $mailer->setFrom(
        trim((string) ($config["from_email"] ?? "")) ?: $mailer->Username,
        (string) ($config["from_name"] ?? "Global Conexit")
    );

    return $mailer;
}

function enviarCorreo(
    string $destinatario,
    string $asunto,
    string $mensajeHtml,
    ?string $mensajeTexto = null,
    ?string $correoRespuesta = null,
    ?string $nombreRespuesta = null
): void {
    $mailer = crearMailer();
    $mailer->addAddress($destinatario);
    if ($correoRespuesta !== null) {
        $mailer->addReplyTo($correoRespuesta, $nombreRespuesta ?? "");
    }
    $mailer->isHTML(true);
    $mailer->Subject = $asunto;
    $mailer->Body = $mensajeHtml;
    $mailer->AltBody = $mensajeTexto ?? html_entity_decode(
        strip_tags($mensajeHtml),
        ENT_QUOTES | ENT_HTML5,
        "UTF-8"
    );
    $mailer->send();
}
