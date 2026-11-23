<?php

function obtenerConfiguracionWompi(?string $entorno = null, bool $requiereCheckout = false): array
{
    $entorno = $entorno ?? strtolower(trim((string) (getenv("WOMPI_ENVIRONMENT") ?: "sandbox")));
    if (!in_array($entorno, ["sandbox", "production"], true)) {
        throw new RuntimeException("WOMPI_ENVIRONMENT debe ser sandbox o production");
    }

    $prefijo = $entorno === "sandbox" ? "WOMPI_SANDBOX" : "WOMPI_PRODUCTION";
    $configuracion = [
        "environment" => $entorno,
        "event_environment" => $entorno === "sandbox" ? "test" : "prod",
        "api_url" => $entorno === "sandbox"
            ? "https://sandbox.wompi.co/v1/transactions/"
            : "https://production.wompi.co/v1/transactions/",
        "public_key" => trim((string) (getenv($prefijo . "_PUBLIC_KEY") ?: "pub_test_NFCat7pJOl5bhFWabYIk5ApVWbSFy6G4")),
        "integrity_secret" => trim((string) (getenv($prefijo . "_INTEGRITY_SECRET") ?: "test_integrity_WBapBSckxjRmBsEKKuuXuCqVr5UA5vVS")),
        "events_secret" => trim((string) (getenv($prefijo . "_EVENTS_SECRET") ?: "test_events_fO4MXZqcf689LUJL5BujtbLeJRSAuy5a")),
    ];

    if ($configuracion["events_secret"] === "") {
        throw new RuntimeException("Falta configurar el secreto de eventos de Wompi");
    }

    if ($requiereCheckout) {
        $prefijoLlave = $entorno === "sandbox" ? "pub_test_" : "pub_prod_";
        if (!str_starts_with($configuracion["public_key"], $prefijoLlave)
            || $configuracion["integrity_secret"] === "") {
            throw new RuntimeException("La configuración de checkout de Wompi está incompleta");
        }
    }

    return $configuracion;
}

function wompiCentavosDesdeDecimal(string $valor): int
{
    if (!preg_match('/^([0-9]+)(?:\.([0-9]{1,2}))?$/D', trim($valor), $partes)) {
        throw new RuntimeException("El saldo de la factura no tiene un formato monetario válido");
    }

    $unidades = ltrim($partes[1], "0");
    $unidades = $unidades === "" ? "0" : $unidades;
    $centavos = str_pad($partes[2] ?? "", 2, "0");
    $maximo = (string) intdiv(PHP_INT_MAX, 100);
    if (strlen($unidades) > strlen($maximo)
        || (strlen($unidades) === strlen($maximo) && strcmp($unidades, $maximo) > 0)) {
        throw new RuntimeException("El saldo de la factura supera el límite permitido");
    }

    return ((int) $unidades * 100) + (int) $centavos;
}

function wompiChecksumEventoValido(array $evento, string $secreto): bool
{
    $propiedades = $evento["signature"]["properties"] ?? null;
    $checksum = $evento["signature"]["checksum"] ?? null;
    $timestamp = $evento["timestamp"] ?? null;

    if (!is_array($propiedades) || count($propiedades) === 0 || count($propiedades) > 30
        || !is_string($checksum) || !preg_match('/^[a-f0-9]{64}$/iD', $checksum)
        || (!is_int($timestamp) && !(is_string($timestamp) && ctype_digit($timestamp)))
        || $secreto === "") {
        return false;
    }

    $datos = $evento["data"] ?? null;
    if (!is_array($datos)) {
        return false;
    }

    $partes = [];
    $incluyeIdTransaccion = false;
    foreach ($propiedades as $propiedad) {
        if (!is_string($propiedad)
            || !preg_match('/^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)*$/D', $propiedad)) {
            return false;
        }

        $valor = $datos;
        foreach (explode(".", $propiedad) as $segmento) {
            if (!is_array($valor) || !array_key_exists($segmento, $valor)) {
                return false;
            }
            $valor = $valor[$segmento];
        }

        if (!is_scalar($valor)) {
            return false;
        }
        $partes[] = (string) $valor;
        if ($propiedad === "transaction.id") {
            $incluyeIdTransaccion = true;
        }
    }

    if (!$incluyeIdTransaccion) {
        return false;
    }

    $concatenado = implode("", $partes) . (string) $timestamp . $secreto;
    return hash_equals(strtolower($checksum), hash("sha256", $concatenado));
}

function obtenerTransaccionWompi(string $idTransaccion, array $configuracion): array
{
    if (!function_exists("curl_init")) {
        throw new RuntimeException("La extensión cURL de PHP es necesaria para verificar transacciones");
    }

    $curl = curl_init($configuracion["api_url"] . rawurlencode($idTransaccion));
    if ($curl === false) {
        throw new RuntimeException("No se pudo iniciar la consulta de transacción Wompi");
    }

    curl_setopt_array($curl, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ["Accept: application/json"],
    ]);

    $respuesta = curl_exec($curl);
    $codigoHttp = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
    curl_close($curl);

    if (!is_string($respuesta) || $codigoHttp !== 200) {
        throw new RuntimeException("No se pudo verificar la transacción con Wompi");
    }

    $payload = json_decode($respuesta, true);
    if (!is_array($payload) || !is_array($payload["data"] ?? null)) {
        throw new RuntimeException("Wompi devolvió una respuesta de transacción inválida");
    }

    return $payload["data"];
}
