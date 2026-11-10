<?php

function errorCampoFormulario(
    string $tabla,
    string $campo,
    mixed $valor,
    array $column,
    array $values
): ?string {
    if ($valor === null) {
        return null;
    }
    if (!is_scalar($valor)) {
        return "El valor ingresado no tiene el formato esperado";
    }

    $nombre = trim($campo);
    if (is_string($valor)) {
        $valor = trim($valor);
        if ($valor === "") {
            return null;
        }
        if (preg_match('/\s{2,}/u', $valor) && in_array($nombre, ["correo", "email", "telefono", "numero_documento"], true)) {
            return match ($nombre) {
                "correo", "email" => "El correo no puede contener espacios",
                "telefono" => "El teléfono debe contener únicamente 10 dígitos, sin espacios",
                default => "El documento no puede contener espacios",
            };
        }

        if (preg_match('/^([a-zA-Z]+)\((\d+)\)/', (string) ($column["columnType"] ?? ""), $lengthMatch)
            && mb_strlen($valor) > (int) $lengthMatch[2]) {
            return "El campo supera el máximo de {$lengthMatch[2]} caracteres";
        }
    }

    if (in_array($nombre, ["correo", "email"], true)) {
        if (!is_string($valor) || preg_match('/\s/u', $valor) || !filter_var($valor, FILTER_VALIDATE_EMAIL)) {
            return "Ingresa un correo válido, por ejemplo usuario@dominio.com";
        }
        $domain = substr(strrchr($valor, "@") ?: "", 1);
        if ($domain === "" || !str_contains($domain, ".")
            || preg_match('/\.[a-zA-Z]{2,}$/D', $domain) !== 1) {
            return "El correo debe incluir un dominio y una terminación válida";
        }
    }

    if (in_array($nombre, ["telefono", "celular", "numero_celular", "telefono_contacto"], true)) {
        if (!is_string($valor) && !is_int($valor)) {
            return "Ingresa un celular de exactamente 10 dígitos";
        }
        if (preg_match('/^[0-9]{10}$/D', (string) $valor) !== 1) {
            return "El celular debe tener exactamente 10 dígitos, sin letras ni espacios";
        }
    }

    if (in_array($nombre, ["numero_documento", "documento"], true)) {
        if (!is_string($valor) && !is_int($valor)) {
            return "Ingresa un documento válido";
        }
        $tipo = strtoupper(trim((string) ($values["tipo_documento"] ?? "")));
        $documento = (string) $valor;
        $patron = match ($tipo) {
            "CC", "TI" => '/^[0-9]+$/D',
            "NIT" => '/^[0-9]+(?:-[0-9])?$/D',
            "CE", "PASAPORTE", "PA" => '/^[A-Za-z0-9-]+$/D',
            default => '/^[A-Za-z0-9.-]+$/D',
        };
        if (preg_match($patron, $documento) !== 1) {
            return match ($tipo) {
                "CC", "TI" => "Este tipo de documento admite únicamente dígitos",
                "NIT" => "El NIT debe contener dígitos y, opcionalmente, un guion antes del dígito de verificación",
                default => "El documento contiene caracteres no permitidos para el tipo seleccionado",
            };
        }
    }

    if (in_array($nombre, ["nombres", "nombre_contacto", "apellidos"], true)) {
        if (!is_string($valor)
            || preg_match("/^[\\p{L}\\p{M}]+(?:[ '\\x{2019}-][\\p{L}\\p{M}]+)*$/uD", $valor) !== 1) {
            return "Ingresa un nombre con letras, tildes, espacios o guiones; no uses números";
        }
    }

    $tipo = strtolower((string) ($column["type"] ?? ""));
    if (in_array($tipo, ["char", "varchar", "tinytext", "text", "mediumtext", "longtext", "enum", "set"], true)
        && !is_string($valor)
        && !in_array($nombre, ["telefono", "celular", "numero_celular", "telefono_contacto"], true)) {
        return "Ingresa texto para este campo";
    }

    if (!empty($column["enum"]) && !in_array((string) $valor, $column["enum"], true)) {
        return "Selecciona una opción válida";
    }

    if (in_array($tipo, ["tinyint", "smallint", "mediumint", "int", "bigint"], true)) {
        if ((!is_string($valor) && !is_int($valor))
            || preg_match('/^-?[0-9]+$/D', (string) $valor) !== 1) {
            return "Ingresa un número entero válido";
        }
        if (str_contains(strtolower((string) ($column["columnType"] ?? "")), "unsigned")
            && str_starts_with((string) $valor, "-")) {
            return "El valor no puede ser negativo";
        }
    }

    if (in_array($tipo, ["decimal", "float", "double"], true)) {
        if ((!is_string($valor) && !is_int($valor) && !is_float($valor))
            || !is_finite((float) $valor)
            || preg_match('/^[0-9]+(?:\.[0-9]+)?$/D', (string) $valor) !== 1) {
            return "Ingresa un valor numérico válido, sin letras ni símbolos";
        }
        if (preg_match('/\((\d+),(\d+)\)/', (string) ($column["columnType"] ?? ""), $precisionMatch)) {
            $integerDigits = strlen((string) (int) $valor);
            $decimalDigits = str_contains((string) $valor, ".")
                ? strlen(substr((string) $valor, strpos((string) $valor, ".") + 1))
                : 0;
            if ($integerDigits > (int) $precisionMatch[1] - (int) $precisionMatch[2]
                || $decimalDigits > (int) $precisionMatch[2]) {
                return "El valor supera la precisión permitida para este campo";
            }
        }
        if ((float) $valor < 0) {
            return "El valor no puede ser negativo";
        }
        if (in_array($nombre, ["valor"], true) && in_array($tabla, ["pago", "ajuste_factura"], true)
            && (float) $valor <= 0) {
            return "El valor debe ser mayor que cero";
        }
    }

    if (in_array($tipo, ["date", "datetime", "timestamp"], true)) {
        if (!is_string($valor) || !fechaFormularioValida($tipo, $valor)) {
            return "Ingresa una fecha válida";
        }
    }

    return null;
}

function fechaFormularioValida(string $tipo, string $valor): bool
{
    $formatos = $tipo === "date"
        ? ["!Y-m-d"]
        : ["!Y-m-d H:i", "!Y-m-d H:i:s", "!Y-m-d\\TH:i"];
    foreach ($formatos as $formato) {
        $fecha = DateTimeImmutable::createFromFormat($formato, $valor);
        $errores = DateTimeImmutable::getLastErrors();
        if ($fecha
            && $fecha->format(substr($formato, 1)) === $valor
            && ($errores === false || ($errores["warning_count"] === 0 && $errores["error_count"] === 0))) {
            return true;
        }
    }
    return false;
}
