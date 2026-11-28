<?php
use PHPMailer\PHPMailer\Exception as PHPMailerException;

header("Content-Type: application/json; charset=UTF-8");

try {
    require_once __DIR__ . "/../config/database.php";
    require_once __DIR__ . "/../config/mailer.php";

    if ($_SERVER["REQUEST_METHOD"] !== "POST") {
        http_response_code(405);
        echo json_encode(["error" => "Método no permitido"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $data = json_decode(file_get_contents("php://input"), true);
    $requiredFields = ["nombre", "documento", "email", "telefono", "direccion"];
    foreach ($requiredFields as $field) {
        if (!is_array($data) || !is_string($data[$field] ?? null) || trim($data[$field]) === "") {
            http_response_code(400);
            echo json_encode(["error" => "El campo " . $field . " es obligatorio"], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    if (($data["autorizacion_tratamiento"] ?? false) !== true) {
        http_response_code(400);
        echo json_encode(["error" => "Debes autorizar el tratamiento de tus datos personales"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $commercialAuthorization = $data["autorizacion_comercial"] ?? false;
    if (!is_bool($commercialAuthorization)) {
        http_response_code(400);
        echo json_encode(["error" => "La autorización comercial debe ser verdadera o falsa"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $emailDomain = substr(strrchr($data["email"], "@") ?: "", 1);
    if (!filter_var($data["email"], FILTER_VALIDATE_EMAIL)
        || preg_match('/\s/u', $data["email"])
        || $emailDomain === ""
        || preg_match('/\.[A-Za-z]{2,}$/D', $emailDomain) !== 1
        || mb_strlen($data["email"]) > 150) {
        http_response_code(400);
        echo json_encode(["error" => "El correo no es válido"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $nombre = trim($data["nombre"]);
    $documento = trim($data["documento"]);
    $telefono = trim($data["telefono"]);
    $direccion = trim($data["direccion"]);
    $planId = filter_var($data["id_plan"] ?? null, FILTER_VALIDATE_INT);
    if ($planId === false || $planId < 1) {
        http_response_code(400);
        echo json_encode(["error" => "El plan seleccionado no es válido"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $partesDocumento = preg_split('/\s+/', $documento, 2);
    $tipoDocumento = strtoupper((string) ($partesDocumento[0] ?? ""));
    $numeroDocumento = (string) ($partesDocumento[1] ?? "");
    if (preg_match("/^[\\p{L}\\p{M}]+(?:[ '\\x{2019}-][\\p{L}\\p{M}]+)*$/uD", $nombre) !== 1
        || mb_strlen($nombre) > 150) {
        http_response_code(400);
        echo json_encode(["error" => "Ingresa un nombre válido, sin números y de hasta 150 caracteres"], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (!in_array($tipoDocumento, ["CC", "TI", "NIT", "CE", "PA", "PASAPORTE"], true)) {
        http_response_code(400);
        echo json_encode(["error" => "El tipo de documento no es válido"], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (preg_match('/^[0-9]{1,20}$/D', $numeroDocumento) !== 1) {
        http_response_code(400);
        echo json_encode(["error" => "El documento debe contener solo números y tener máximo 20 dígitos"], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (preg_match('/^[0-9]{10}$/D', $telefono) !== 1) {
        http_response_code(400);
        echo json_encode(["error" => "El celular debe tener exactamente 10 dígitos, sin espacios ni caracteres especiales"], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (mb_strlen($direccion) > 255) {
        http_response_code(400);
        echo json_encode(["error" => "La dirección supera la longitud permitida"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $planStatement = $pdo->prepare(
        "SELECT p.id_plan, p.nombre, p.velocidad, p.precio
         FROM plan p
         WHERE p.id_plan = :id_plan
           AND p.estado = 'ACTIVO'
           AND p.vigencia_inicio <= CURRENT_DATE()
           AND (p.vigencia_fin IS NULL OR p.vigencia_fin >= CURRENT_DATE())
           AND NOT EXISTS (
               SELECT 1
               FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci =
                         'planes' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                         CAST(p.id_plan AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         LIMIT 1"
    );
    $planStatement->execute([":id_plan" => $planId]);
    $planDetails = $planStatement->fetch();
    if (!$planDetails) {
        http_response_code(400);
        echo json_encode(["error" => "El plan seleccionado ya no está disponible"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $plan = (string) $planDetails["nombre"];
    $email = trim($data["email"]);
    $fechaSolicitud = new DateTimeImmutable("now", new DateTimeZone("America/Bogota"));
    $commercialAuthorizationAt = $commercialAuthorization
        ? $fechaSolicitud->format(DATE_ATOM)
        : null;
    $message = sprintf(
        "Solicitud para el plan %s. Documento: %s. Dirección de instalación: %s. El titular autorizó el tratamiento de sus datos personales conforme a la Ley 1581 de 2012. Autorización para fines comerciales: %s%s.",
        $plan,
        $documento,
        $direccion,
        $commercialAuthorization ? "Sí" : "No",
        $commercialAuthorizationAt === null ? "" : " (registrada el " . $commercialAuthorizationAt . ")"
    );

    $pdo->beginTransaction();
    $stmt = $pdo->prepare(
        "INSERT INTO solicitud_servicio
            (nombre_contacto, correo, telefono, tipo_solicitud, mensaje)
         VALUES
            (:nombre, :correo, :telefono, 'CONTRATACION', :mensaje)"
    );
    $stmt->execute([
        ":nombre" => $nombre,
        ":correo" => $email,
        ":telefono" => $telefono,
        ":mensaje" => $message
    ]);
    $idSolicitud = (int) $pdo->lastInsertId();

    $audit = $pdo->prepare(
        "INSERT INTO auditoria (id_usuario, entidad, id_entidad, accion, detalle)
         VALUES (NULL, 'solicitud_servicio', :id_entidad, 'CREAR', :detalle)"
    );
    $audit->execute([
        ":id_entidad" => (string) $idSolicitud,
        ":detalle" => json_encode(
            [
                "tipo_solicitud" => "CONTRATACION",
                "autorizacion_comercial" => $commercialAuthorization,
                "autorizacion_comercial_fecha" => $commercialAuthorizationAt
            ],
            JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE
        )
    ]);
    $pdo->commit();

    $referencia = sprintf("SOL-%06d", $idSolicitud);
    $detallesCorreo = [
        "Estado" => "Solicitud Recibida",
        "Orden de servicio (referencia de solicitud)" => $referencia,
        "Fecha de recepción" => $fechaSolicitud->format("d/m/Y H:i:s"),
        "Nombre completo" => $nombre,
        "Documento" => $documento,
        "Correo electrónico" => $email,
        "Teléfono / celular" => $telefono,
        "Dirección de instalación" => $direccion,
        "Plan solicitado" => $plan,
        "Velocidad" => (string) $planDetails["velocidad"],
        "Precio mensual" => "COP " . number_format((float) $planDetails["precio"], 0, ",", "."),
        "Autorización de tratamiento de datos" => "Sí",
        "Autorización comercial" => $commercialAuthorization
            ? "Sí (registrada el " . $commercialAuthorizationAt . ")"
            : "No"
    ];
    $filasHtml = "";
    $lineasTexto = ["Solicitud Recibida", ""];
    foreach ($detallesCorreo as $etiqueta => $valor) {
        $filasHtml .= "<tr><th style=\"padding:8px;text-align:left\">" .
            htmlspecialchars($etiqueta, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8") .
            "</th><td style=\"padding:8px\">" .
            htmlspecialchars($valor, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8") .
            "</td></tr>";
        $lineasTexto[] = $etiqueta . ": " . $valor;
    }

    $asunto = "Solicitud Recibida - Orden de servicio " . $referencia;
    $mensajeHtml = "<!doctype html><html lang=\"es\"><body>" .
        "<h1>Solicitud Recibida</h1>" .
        "<p>Hemos recibido la solicitud de cotización del plan. La referencia identifica esta solicitud de servicio; está pendiente de gestión por un representante.</p>" .
        "<table style=\"border-collapse:collapse\">" . $filasHtml . "</table>" .
        "</body></html>";
    $mensajeTexto = implode("\n", $lineasTexto);

    try {
        enviarCorreo(
            obtenerCorreoNotificaciones(),
            $asunto,
            $mensajeHtml,
            $mensajeTexto,
            $email,
            $nombre
        );
    } catch (PHPMailerException | RuntimeException $exception) {
        error_log("Error enviando notificación interna para solicitud pública {$referencia}: " . $exception->getMessage());
    }

    $emailEnviado = false;
    try {
        enviarCorreo($email, $asunto, $mensajeHtml, $mensajeTexto);
        $emailEnviado = true;
    } catch (PHPMailerException | RuntimeException $exception) {
        error_log("Error enviando confirmación al cliente para solicitud pública {$referencia}: " . $exception->getMessage());
    }

    http_response_code(201);
    echo json_encode([
        "success" => true,
        "message" => "Solicitud Recibida correctamente",
        "numero_solicitud" => $referencia,
        "email_enviado" => $emailEnviado
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $exception) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("Error registrando solicitud pública de contratación: " . $exception->getMessage());
    if (!headers_sent()) {
        http_response_code(500);
        header("Content-Type: application/json; charset=UTF-8");
    }
    echo json_encode(["error" => "No se pudo registrar la solicitud"], JSON_UNESCAPED_UNICODE);
}