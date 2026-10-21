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

if (!filter_var($data["email"], FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(["error" => "El correo no es válido"], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $message = sprintf(
        "Solicitud para el plan %s. Documento: %s. Dirección de instalación: %s.",
        trim($data["plan"]),
        trim($data["documento"]),
        trim($data["direccion"])
    );
    $pdo->beginTransaction();
    $stmt = $pdo->prepare(
        "INSERT INTO solicitud_servicio
            (nombre_contacto, correo, telefono, tipo_solicitud, mensaje)
         VALUES
            (:nombre, :correo, :telefono, 'CONTRATACION', :mensaje)"
    );
    $stmt->execute([
        ":nombre" => trim($data["nombre"]),
        ":correo" => trim($data["email"]),
        ":telefono" => trim($data["telefono"]),
        ":mensaje" => $message
    ]);

    $audit = $pdo->prepare(
        "INSERT INTO auditoria (id_usuario, entidad, id_entidad, accion, detalle)
         VALUES (NULL, 'solicitud_servicio', :id_entidad, 'CREAR', :detalle)"
    );
    $audit->execute([
        ":id_entidad" => (string) $pdo->lastInsertId(),
        ":detalle" => json_encode(
            ["tipo_solicitud" => "CONTRATACION"],
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
