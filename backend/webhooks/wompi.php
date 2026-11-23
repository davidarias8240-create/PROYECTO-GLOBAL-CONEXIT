<?php
require_once "../config/database.php";
require_once "../config/wompi.php";

function responderWebhookWompi(int $codigo = 200): void
{
    http_response_code($codigo);
    echo json_encode(["received" => $codigo === 200], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER["REQUEST_METHOD"] !== "POST") {
    responderWebhookWompi(405);
}

$cuerpo = file_get_contents("php://input");
if (!is_string($cuerpo) || strlen($cuerpo) > 65536) {
    responderWebhookWompi(413);
}

$payload = json_decode($cuerpo, true);
if (!is_array($payload)) {
    responderWebhookWompi(400);
}

if (($payload["event"] ?? "") !== "transaction.updated") {
    responderWebhookWompi();
}

$entornoEvento = $payload["environment"] ?? null;
if (!in_array($entornoEvento, ["test", "prod"], true)) {
    responderWebhookWompi(400);
}
$entorno = $entornoEvento === "test" ? "sandbox" : "production";

try {
    $configuracion = obtenerConfiguracionWompi($entorno);
} catch (RuntimeException $exception) {
    error_log("Falta configuración Wompi para validar el webhook");
    responderWebhookWompi(503);
}

if (!wompiChecksumEventoValido($payload, $configuracion["events_secret"])) {
    responderWebhookWompi(401);
}

$transaccionEvento = $payload["data"]["transaction"] ?? null;
if (!is_array($transaccionEvento)
    || !is_string($transaccionEvento["id"] ?? null)
    || !is_string($transaccionEvento["reference"] ?? null)
    || !is_string($transaccionEvento["status"] ?? null)
    || !is_string($transaccionEvento["currency"] ?? null)
    || !is_int($transaccionEvento["amount_in_cents"] ?? null)) {
    responderWebhookWompi(400);
}

try {
    $transaccionWompi = obtenerTransaccionWompi($transaccionEvento["id"], $configuracion);
} catch (RuntimeException $exception) {
    error_log("No se pudo verificar una transacción del webhook con Wompi");
    responderWebhookWompi(503);
}

foreach (["id", "reference", "status", "currency", "amount_in_cents"] as $campo) {
    if (!array_key_exists($campo, $transaccionWompi)
        || (string) $transaccionWompi[$campo] !== (string) $transaccionEvento[$campo]) {
        responderWebhookWompi();
    }
}

$estadosAdmitidos = ["PENDING", "APPROVED", "DECLINED", "ERROR", "VOIDED"];
if (!in_array($transaccionEvento["status"], $estadosAdmitidos, true)) {
    responderWebhookWompi();
}

try {
    $lookupIntento = $pdo->prepare(
        "SELECT id_intento, id_factura
         FROM intento_pago_wompi
         WHERE referencia = :referencia
         LIMIT 1"
    );
    $lookupIntento->execute([":referencia" => $transaccionEvento["reference"]]);
    $intentoInicial = $lookupIntento->fetch();
    if (!$intentoInicial) {
        responderWebhookWompi();
    }

    $pdo->beginTransaction();
    $facturaStmt = $pdo->prepare(
        "SELECT id_factura, saldo, estado
         FROM factura
         WHERE id_factura = :id_factura
         FOR UPDATE"
    );
    $facturaStmt->execute([":id_factura" => $intentoInicial["id_factura"]]);
    $factura = $facturaStmt->fetch();

    $intentoStmt = $pdo->prepare(
        "SELECT id_intento, id_factura, referencia, amount_in_cents, currency,
                estado, wompi_transaction_id, id_pago
         FROM intento_pago_wompi
         WHERE id_intento = :id_intento
         FOR UPDATE"
    );
    $intentoStmt->execute([":id_intento" => $intentoInicial["id_intento"]]);
    $intento = $intentoStmt->fetch();

    if (!$factura || !$intento) {
        $pdo->rollBack();
        responderWebhookWompi();
    }

    $transaccionAsignada = $pdo->prepare(
        "SELECT id_intento
         FROM intento_pago_wompi
         WHERE wompi_transaction_id = :transaction_id
           AND id_intento <> :id_intento
         LIMIT 1"
    );
    $transaccionAsignada->execute([
        ":transaction_id" => $transaccionEvento["id"],
        ":id_intento" => $intento["id_intento"],
    ]);
    if ($transaccionAsignada->fetchColumn()
        || ($intento["wompi_transaction_id"] !== null
            && $intento["wompi_transaction_id"] !== $transaccionEvento["id"])) {
        $pdo->commit();
        responderWebhookWompi();
    }

    if ((int) $intento["amount_in_cents"] !== $transaccionEvento["amount_in_cents"]
        || $intento["currency"] !== $transaccionEvento["currency"]) {
        $revisionStmt = $pdo->prepare(
            "UPDATE intento_pago_wompi
             SET estado = 'APPROVED_REVIEW', wompi_transaction_id = :transaction_id
             WHERE id_intento = :id_intento AND id_pago IS NULL"
        );
        $revisionStmt->execute([
            ":transaction_id" => $transaccionEvento["id"],
            ":id_intento" => $intento["id_intento"],
        ]);
        $pdo->commit();
        responderWebhookWompi();
    }

    if ($intento["id_pago"] !== null || $intento["estado"] === "APPROVED") {
        $pdo->commit();
        responderWebhookWompi();
    }

    $estadoActual = $intento["estado"];
    $estadoEntrante = $transaccionEvento["status"];
    if ($estadoActual !== "PENDING" && $estadoEntrante === "PENDING") {
        $pdo->commit();
        responderWebhookWompi();
    }

    if ($estadoEntrante !== "APPROVED") {
        $actualizarIntento = $pdo->prepare(
            "UPDATE intento_pago_wompi
             SET estado = :estado, wompi_transaction_id = :transaction_id
             WHERE id_intento = :id_intento"
        );
        $actualizarIntento->execute([
            ":estado" => $estadoEntrante,
            ":transaction_id" => $transaccionEvento["id"],
            ":id_intento" => $intento["id_intento"],
        ]);
        $pdo->commit();
        responderWebhookWompi();
    }

    $saldoCentavos = wompiCentavosDesdeDecimal((string) $factura["saldo"]);
    if ($transaccionEvento["currency"] !== "COP"
        || $transaccionEvento["amount_in_cents"] !== $saldoCentavos
        || !in_array($factura["estado"], ["PENDIENTE", "VENCIDA"], true)) {
        $revisionStmt = $pdo->prepare(
            "UPDATE intento_pago_wompi
             SET estado = 'APPROVED_REVIEW', wompi_transaction_id = :transaction_id
             WHERE id_intento = :id_intento"
        );
        $revisionStmt->execute([
            ":transaction_id" => $transaccionEvento["id"],
            ":id_intento" => $intento["id_intento"],
        ]);
        $pdo->commit();
        responderWebhookWompi();
    }

    $tipoMedio = strtoupper((string) ($transaccionWompi["payment_method_type"] ?? ""));
    $medio = $tipoMedio === "PSE" ? "PSE" : ($tipoMedio === "CARD" ? "TARJETA" : "OTRO");
    $valor = intdiv($saldoCentavos, 100) . "." . str_pad((string) ($saldoCentavos % 100), 2, "0", STR_PAD_LEFT);
    $pagoStmt = $pdo->prepare(
        "INSERT INTO pago (id_factura, valor, medio, referencia, estado)
         VALUES (:id_factura, :valor, :medio, :referencia, 'REGISTRADO')"
    );
    $pagoStmt->execute([
        ":id_factura" => $factura["id_factura"],
        ":valor" => $valor,
        ":medio" => $medio,
        ":referencia" => $intento["referencia"],
    ]);
    $idPago = (int) $pdo->lastInsertId();

    $actualizarFactura = $pdo->prepare(
        "UPDATE factura SET saldo = 0, estado = 'PAGADA'
         WHERE id_factura = :id_factura"
    );
    $actualizarFactura->execute([":id_factura" => $factura["id_factura"]]);

    $actualizarIntento = $pdo->prepare(
        "UPDATE intento_pago_wompi
         SET estado = 'APPROVED', wompi_transaction_id = :transaction_id, id_pago = :id_pago
         WHERE id_intento = :id_intento AND id_pago IS NULL"
    );
    $actualizarIntento->execute([
        ":transaction_id" => $transaccionEvento["id"],
        ":id_pago" => $idPago,
        ":id_intento" => $intento["id_intento"],
    ]);
    if ($actualizarIntento->rowCount() !== 1) {
        throw new RuntimeException("No se pudo marcar el intento Wompi como procesado");
    }

    $pdo->commit();
    responderWebhookWompi();
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("Error procesando notificación de pago Wompi: " . $exception->getMessage());
    responderWebhookWompi(500);
}
