<?php
require_once __DIR__ . "/../config/database.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido"], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$requiredFields = ["nombre", "documento", "email", "telefono", "direccion", "plan"];
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
$plan = trim($data["plan"]);
$partesDocumento = preg_split('/\s+/', $documento, 2);
$tipoDocumento = strtoupper((string) ($partesDocumento[0] ?? ""));
$numeroDocumento = (string) ($partesDocumento[1] ?? "");
$patronDocumento = match ($tipoDocumento) {
    "CC", "TI" => '/^[0-9]+$/D',
    "NIT" => '/^[0-9]+(?:-[0-9])?$/D',
    "CE", "PA", "PASAPORTE" => '/^[A-Za-z0-9-]+$/D',
    default => null,
};
if (preg_match("/^[\\p{L}\\p{M}]+(?:[ '\\x{2019}-][\\p{L}\\p{M}]+)*$/uD", $nombre) !== 1
    || mb_strlen($nombre) > 150) {
    http_response_code(400);
    echo json_encode(["error" => "Ingresa un nombre válido, sin números y de hasta 150 caracteres"], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($patronDocumento === null || preg_match($patronDocumento, $numeroDocumento) !== 1
    || mb_strlen($numeroDocumento) > 50) {
    http_response_code(400);
    echo json_encode(["error" => "El documento contiene caracteres no permitidos para el tipo seleccionado"], JSON_UNESCAPED_UNICODE);
    exit;
}
if (preg_match('/^[0-9]{10}$/D', $telefono) !== 1) {
    http_response_code(400);
    echo json_encode(["error" => "El celular debe tener exactamente 10 dígitos, sin espacios ni caracteres especiales"], JSON_UNESCAPED_UNICODE);
    exit;
}
if (mb_strlen($direccion) > 255 || mb_strlen($plan) > 150) {
    http_response_code(400);
    echo json_encode(["error" => "La dirección o el nombre del plan supera la longitud permitida"], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $commercialAuthorizationAt = $commercialAuthorization
        ? (new DateTimeImmutable("now", new DateTimeZone("America/Bogota")))->format(DATE_ATOM)
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
        ":correo" => trim($data["email"]),
        ":telefono" => $telefono,
        ":mensaje" => $message
    ]);

    $audit = $pdo->prepare(
        "INSERT INTO auditoria (id_usuario, entidad, id_entidad, accion, detalle)
         VALUES (NULL, 'solicitud_servicio', :id_entidad, 'CREAR', :detalle)"
    );
    $audit->execute([
        ":id_entidad" => (string) $pdo->lastInsertId(),
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

    http_response_code(201);
    echo json_encode([
        "success" => true,
        "message" => "Solicitud de contratación registrada correctamente"
    ], JSON_UNESCAPED_UNICODE);
} catch (PDOException $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("Error registrando solicitud pública de contratación: " . $exception->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "No se pudo registrar la solicitud"], JSON_UNESCAPED_UNICODE);
}
