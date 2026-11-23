<?php
require_once "../config/database.php";
require_once "../config/session.php";
require_once "../config/wompi.php";

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido"], JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($_SESSION["id_usuario"]) || ($_SESSION["tipo_sesion"] ?? "") !== "CLIENTE") {
    http_response_code(401);
    echo json_encode(["error" => "Inicia sesión como cliente para pagar una factura"], JSON_UNESCAPED_UNICODE);
    exit;
}

$data = json_decode(file_get_contents("php://input"), true);
$idFactura = is_array($data) && filter_var($data["id_factura"] ?? null, FILTER_VALIDATE_INT)
    ? (int) $data["id_factura"]
    : 0;
if ($idFactura <= 0) {
    http_response_code(400);
    echo json_encode(["error" => "Selecciona una factura válida"], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $configuracion = obtenerConfiguracionWompi(null, true);

    $clienteStmt = $pdo->prepare(
        "SELECT c.id_cliente
         FROM cliente c
         INNER JOIN usuario u ON u.id_usuario = c.id_usuario
         INNER JOIN rol r ON r.id_rol = u.id_rol
         WHERE c.id_usuario = :id_usuario
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
    $clienteStmt->execute([":id_usuario" => $_SESSION["id_usuario"]]);
    $idCliente = $clienteStmt->fetchColumn();

    if (!$idCliente) {
        http_response_code(401);
        echo json_encode(["error" => "La cuenta no tiene un perfil de cliente activo"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $pdo->beginTransaction();
    $facturaStmt = $pdo->prepare(
        "SELECT f.id_factura, f.numero, f.saldo, f.estado
         FROM factura f
         INNER JOIN contrato c ON c.id_contrato = f.id_contrato
         WHERE f.id_factura = :id_factura
           AND c.id_cliente = :id_cliente
           AND NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'facturas' COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST(f.id_factura AS CHAR) COLLATE utf8mb4_unicode_ci
           )
         LIMIT 1
         FOR UPDATE"
    );
    $facturaStmt->execute([":id_factura" => $idFactura, ":id_cliente" => $idCliente]);
    $factura = $facturaStmt->fetch();

    if (!$factura) {
        $pdo->rollBack();
        http_response_code(404);
        echo json_encode(["error" => "No se encontró esa factura en tu cuenta"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if (!in_array($factura["estado"], ["PENDIENTE", "VENCIDA"], true)) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode(["error" => "La factura no admite pagos"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $montoCentavos = wompiCentavosDesdeDecimal((string) $factura["saldo"]);
    if ($montoCentavos <= 0) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode(["error" => "La factura no tiene saldo pendiente"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $intentoPendiente = $pdo->prepare(
        "SELECT referencia
         FROM intento_pago_wompi
        WHERE id_factura = :id_factura
          AND estado IN ('PENDING', 'APPROVED_REVIEW')
         LIMIT 1
         FOR UPDATE"
    );
    $intentoPendiente->execute([":id_factura" => $idFactura]);
    if ($intentoPendiente->fetchColumn()) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode([
            "error" => "Ya hay un pago en proceso para esta factura. Espera la confirmación de Wompi antes de intentar nuevamente."
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $referencia = "GC" . strtoupper(bin2hex(random_bytes(16)));
    $expiracion = (new DateTimeImmutable("now", new DateTimeZone("UTC")))->modify("+30 minutes");
    $expirationTime = $expiracion->format("Y-m-d\\TH:i:s.000\\Z");
    $firma = hash(
        "sha256",
        $referencia . $montoCentavos . "COP" . $expirationTime . $configuracion["integrity_secret"]
    );

    $intentoStmt = $pdo->prepare(
        "INSERT INTO intento_pago_wompi
            (id_factura, referencia, amount_in_cents, currency, estado, expires_at)
         VALUES
            (:id_factura, :referencia, :amount_in_cents, 'COP', 'PENDING', :expires_at)"
    );
    $intentoStmt->execute([
        ":id_factura" => $idFactura,
        ":referencia" => $referencia,
        ":amount_in_cents" => $montoCentavos,
        ":expires_at" => $expiracion->format("Y-m-d H:i:s"),
    ]);
    $pdo->commit();

    echo json_encode([
        "public_key" => $configuracion["public_key"],
        "currency" => "COP",
        "amount_in_cents" => $montoCentavos,
        "reference" => $referencia,
        "signature" => ["integrity" => $firma],
        "expiration_time" => $expirationTime,
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("Error iniciando pago Wompi: " . $exception->getMessage());
    http_response_code($exception instanceof RuntimeException ? 503 : 500);
    echo json_encode([
        "error" => $exception instanceof RuntimeException
            ? $exception->getMessage()
            : "No se pudo iniciar el pago",
    ], JSON_UNESCAPED_UNICODE);
}
