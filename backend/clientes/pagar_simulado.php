<?php
require_once "../config/database.php";
require_once "../config/session.php";

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
$medio = is_array($data) && is_string($data["medio"] ?? null)
    ? strtoupper(trim($data["medio"]))
    : "";

if ($idFactura <= 0 || !in_array($medio, ["TARJETA", "PSE", "TRANSFERENCIA"], true)) {
    http_response_code(400);
    echo json_encode(["error" => "Selecciona una factura y un método de pago válido"], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    // Solo se localiza el cliente activo ligado a la sesión; el ID de cliente nunca viene del navegador.
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

    // Se bloquea la factura mientras se registra el pago para evitar cobrar dos veces su saldo.
    $facturaStmt = $pdo->prepare(
        "SELECT f.id_factura, f.numero, f.total, f.saldo, f.estado
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

    if (!in_array($factura["estado"], ["PENDIENTE", "VENCIDA"], true) || (float) $factura["saldo"] <= 0) {
        $pdo->rollBack();
        http_response_code(409);
        echo json_encode(["error" => "La factura ya está pagada o no admite pagos"], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // El registro se marca como simulado en su referencia; no se conecta a ninguna pasarela bancaria.
    $valor = (float) $factura["saldo"];
    $referencia = "SIM-" . strtoupper(bin2hex(random_bytes(8)));
    $pagoStmt = $pdo->prepare(
        "INSERT INTO pago (id_factura, valor, medio, referencia, estado)
         VALUES (:id_factura, :valor, :medio, :referencia, 'REGISTRADO')"
    );
    $pagoStmt->execute([
        ":id_factura" => $idFactura,
        ":valor" => $valor,
        ":medio" => $medio,
        ":referencia" => $referencia
    ]);
    $idPago = (int) $pdo->lastInsertId();

    $actualizarStmt = $pdo->prepare(
        "UPDATE factura
         SET saldo = 0, estado = 'PAGADA'
         WHERE id_factura = :id_factura"
    );
    $actualizarStmt->execute([":id_factura" => $idFactura]);
    $pdo->commit();

    echo json_encode([
        "success" => true,
        "mensaje" => "Pago simulado registrado correctamente",
        "pago" => [
            "id_pago" => $idPago,
            "valor" => $valor,
            "medio" => $medio,
            "referencia" => $referencia,
            "estado" => "REGISTRADO"
        ],
        "factura" => [
            "id_factura" => (int) $factura["id_factura"],
            "numero" => $factura["numero"],
            "total" => (float) $factura["total"],
            "saldo" => 0,
            "estado" => "PAGADA"
        ]
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("Error registrando pago simulado: " . $exception->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "No se pudo registrar el pago simulado"], JSON_UNESCAPED_UNICODE);
}
