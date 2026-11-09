<?php
require_once __DIR__ . "/../config/admin_auth.php";

$origin = $_SERVER["HTTP_ORIGIN"] ?? "";
$normalizedOrigin = rtrim($origin, "/");
$allowedOrigins = [
    "http://localhost",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
];

if ($origin !== "" && (in_array($normalizedOrigin, $allowedOrigins, true) || preg_match('#^https?://(localhost|127\.0\.0\.1)(:\d+)?/?$#', $normalizedOrigin))) {
    header("Access-Control-Allow-Origin: " . $origin);
    header("Vary: Origin");
}

header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") {
    http_response_code(204);
    exit;
}

if (!administradorAutenticado($pdo)) {
    http_response_code(401);
    echo json_encode(["error" => "Inicia sesión como administrador"], JSON_UNESCAPED_UNICODE);
    exit;
}

$configuracion = require __DIR__ . "/entidades_config.php";
$entidad = $_GET["entidad"] ?? "";
$operacion = $_GET["operacion"] ?? "";

if (!isset($configuracion[$entidad])) {
    http_response_code(404);
    echo json_encode(["error" => "La tabla solicitada no está disponible"], JSON_UNESCAPED_UNICODE);
    exit;
}

$definicion = $configuracion[$entidad];
$tabla = $definicion["tabla"];
$clave = $definicion["clave"];
$baseDatos = "global_conexit";
$metadatos = [];
$idClienteContexto = null;

if (array_key_exists("id_cliente", $_GET)) {
    $idClienteContexto = filter_var($_GET["id_cliente"], FILTER_VALIDATE_INT);
    if ($idClienteContexto === false || $idClienteContexto === null || $idClienteContexto <= 0) {
        responder(["error" => "Debe indicar un cliente válido"], 400);
    }
    if (filtroClienteEntidad($entidad) === null) {
        responder(["error" => "Este módulo no tiene una relación de cliente disponible"], 400);
    }
    $clienteExiste = $pdo->prepare("SELECT 1 FROM cliente WHERE id_cliente = :id_cliente");
    $clienteExiste->execute([":id_cliente" => $idClienteContexto]);
    if (!$clienteExiste->fetchColumn()) {
        responder(["error" => "No se encontró el cliente solicitado"], 404);
    }
}

function responder(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function filtroClienteEntidad(string $entidad): ?string
{
    return match ($entidad) {
        "direcciones", "solicitudes", "tickets" => "t.id_cliente = :cliente_contexto",
        "contratos" => "t.id_cliente = :cliente_contexto AND EXISTS (
            SELECT 1 FROM direccion d
            WHERE d.id_direccion = t.id_direccion
              AND d.id_cliente = :cliente_contexto_direccion
        )",
        "interacciones" => "EXISTS (
            SELECT 1 FROM ticket tc
            WHERE tc.id_ticket = t.id_ticket AND tc.id_cliente = :cliente_contexto
        )",
        "ordenes" => "EXISTS (
            SELECT 1
            FROM contrato co
            INNER JOIN direccion d ON d.id_direccion = t.id_direccion
            WHERE co.id_contrato = t.id_contrato
              AND co.id_cliente = :cliente_contexto
              AND d.id_cliente = :cliente_contexto_direccion
        )",
        "notificaciones" => "EXISTS (
            SELECT 1
            FROM cliente c
            INNER JOIN usuario u ON u.id_usuario = c.id_usuario
            WHERE c.id_cliente = :cliente_contexto
              AND u.id_usuario = t.id_usuario
        )",
        "facturas" => "EXISTS (
            SELECT 1 FROM contrato co
            WHERE co.id_contrato = t.id_contrato AND co.id_cliente = :cliente_contexto
        )",
        "pagos", "ajustes" => "EXISTS (
            SELECT 1
            FROM factura f
            INNER JOIN contrato co ON co.id_contrato = f.id_contrato
            WHERE f.id_factura = t.id_factura AND co.id_cliente = :cliente_contexto
        )",
        "periodos" => "EXISTS (
            SELECT 1
            FROM factura f
            INNER JOIN contrato co ON co.id_contrato = f.id_contrato
            WHERE f.id_periodo = t.id_periodo AND co.id_cliente = :cliente_contexto
        )",
        "planes" => "EXISTS (
            SELECT 1 FROM contrato co
            WHERE co.id_plan = t.id_plan AND co.id_cliente = :cliente_contexto
        )",
        default => null
    };
}

function parametrosFiltroCliente(string $entidad, int $idCliente): array
{
    $params = [":cliente_contexto" => $idCliente];
    if (in_array($entidad, ["contratos", "ordenes"], true)) {
        $params[":cliente_contexto_direccion"] = $idCliente;
    }
    return $params;
}

function registroPerteneceACliente(
    PDO $pdo,
    string $entidad,
    string $tabla,
    string $clave,
    string $idRegistro,
    int $idCliente
): bool {
    $filtro = filtroClienteEntidad($entidad);
    if ($filtro === null) {
        return false;
    }

    $stmt = $pdo->prepare(
        "SELECT 1 FROM `{$tabla}` t
         WHERE t.`{$clave}` = :id_registro AND ({$filtro}) LIMIT 1"
    );
    $stmt->execute(array_merge(
        [":id_registro" => $idRegistro],
        parametrosFiltroCliente($entidad, $idCliente)
    ));
    return (bool) $stmt->fetchColumn();
}

function auditar(PDO $pdo, string $entidad, string $id, string $accion, ?array $detalle = null): void
{
    $stmt = $pdo->prepare(
        "INSERT INTO auditoria (id_usuario, entidad, id_entidad, accion, detalle)
         VALUES (:id_usuario, :entidad, :id_entidad, :accion, :detalle)"
    );
    $stmt->execute([
        ":id_usuario" => $_SESSION["id_usuario"],
        ":entidad" => $entidad,
        ":id_entidad" => $id,
        ":accion" => $accion,
        ":detalle" => $detalle === null
            ? null
            : json_encode($detalle, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)
    ]);
}

function normalizarValor(array $column, mixed $value): mixed
{
    if (is_string($value)
        && in_array($column["type"], ["datetime", "timestamp"], true)
        && str_contains($value, "T")) {
        return str_replace("T", " ", $value);
    }
    return $value;
}

function validarFechaCreacion(string $entidad, array $values): void
{
    $fechaActualDesde = [
        "planes" => ["vigencia_inicio" => "date"],
        "contratos" => ["fecha_inicio" => "date"],
        "facturas" => ["fecha_emision" => "date"],
        "ordenes" => ["fecha_programada" => "datetime"],
    ];
    $campos = $fechaActualDesde[$entidad] ?? [];
    $zonaHoraria = new DateTimeZone("America/Bogota");
    $ahora = new DateTimeImmutable("now", $zonaHoraria);
    $hoy = $ahora->format("Y-m-d");

    foreach ($campos as $campo => $tipo) {
        if (!isset($values[$campo]) || !is_string($values[$campo])) {
            continue;
        }
        $fecha = substr(trim($values[$campo]), 0, 10);
        $parsed = DateTimeImmutable::createFromFormat("!Y-m-d", $fecha);
        if (!$parsed || $parsed->format("Y-m-d") !== $fecha) {
            responder(["error" => "La fecha de " . $campo . " no es válida"], 400);
        }
        if ($fecha < $hoy) {
            responder(["error" => "La fecha de " . $campo . " no puede ser anterior a hoy"], 400);
        }
        if ($tipo === "datetime") {
            $fechaHoraTexto = substr(trim($values[$campo]), 0, 16);
            $fechaHora = DateTimeImmutable::createFromFormat(
                "!Y-m-d H:i",
                $fechaHoraTexto,
                $zonaHoraria
            );
            $erroresFechaHora = DateTimeImmutable::getLastErrors();
            if (!$fechaHora
                || $fechaHora->format("Y-m-d H:i") !== $fechaHoraTexto
                || ($erroresFechaHora !== false
                    && ($erroresFechaHora["warning_count"] > 0 || $erroresFechaHora["error_count"] > 0))) {
                responder(["error" => "La fecha de " . $campo . " no es válida"], 400);
            }
            $ahoraSinSegundos = $ahora->setTime(
                (int) $ahora->format("H"),
                (int) $ahora->format("i"),
                0
            );
            if (!$fechaHora || $fechaHora < $ahoraSinSegundos) {
                responder(["error" => "La fecha programada no puede estar en el pasado"], 400);
            }
        }
    }
}

function montoMonetarioValido(mixed $value): bool
{
    if (!is_string($value) && !is_int($value) && !is_float($value)) {
        return false;
    }
    $formatted = (string) $value;
    return preg_match("/^\\d+(?:\\.\\d{1,2})?$/D", $formatted) === 1
        && is_finite((float) $formatted)
        && (float) $formatted > 0;
}

function pagoPorClaveIdempotencia(PDO $pdo, string $clave): array|false
{
    $stmt = $pdo->prepare(
        "SELECT p.*,
                EXISTS (
                    SELECT 1 FROM admin_bajas b
                    WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'pagos' COLLATE utf8mb4_unicode_ci
                      AND b.id_registro COLLATE utf8mb4_unicode_ci =
                          CAST(p.id_pago AS CHAR) COLLATE utf8mb4_unicode_ci
                ) AS archivado
         FROM pago p
         WHERE p.idempotencia_key = :clave
         LIMIT 1 FOR UPDATE"
    );
    $stmt->execute([":clave" => $clave]);
    return $stmt->fetch();
}

function pagoCoincideConSolicitud(array $pago, array $values): bool
{
    foreach (["id_factura", "medio"] as $field) {
        if (array_key_exists($field, $values)
            && (string) $pago[$field] !== (string) $values[$field]) {
            return false;
        }
    }
    if ((string) $pago["estado"] !== (string) ($values["estado"] ?? "REGISTRADO")) {
        return false;
    }

    if (array_key_exists("valor", $values)
        && number_format((float) $pago["valor"], 2, ".", "")
            !== number_format((float) $values["valor"], 2, ".", "")) {
        return false;
    }
    foreach (["referencia", "motivo_anulacion"] as $field) {
        if (trim((string) ($pago[$field] ?? "")) !== trim((string) ($values[$field] ?? ""))) {
            return false;
        }
    }
    if (isset($values["fecha"])
        && substr((string) $pago["fecha"], 0, 16)
            !== substr((string) $values["fecha"], 0, 16)) {
        return false;
    }
    return true;
}

function validarRelacionesEntidad(PDO $pdo, string $entidad, array $values): void
{
    if ($entidad === "contratos"
        && isset($values["id_cliente"], $values["id_direccion"])) {
        $stmt = $pdo->prepare(
            "SELECT 1 FROM direccion
             WHERE id_direccion = :id_direccion AND id_cliente = :id_cliente
             LIMIT 1"
        );
        $stmt->execute([
            ":id_direccion" => $values["id_direccion"],
            ":id_cliente" => $values["id_cliente"],
        ]);
        if (!$stmt->fetchColumn()) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            responder(["error" => "La dirección seleccionada no pertenece al cliente"], 409);
        }
    }

    if ($entidad === "ordenes"
        && isset($values["id_contrato"], $values["id_direccion"])) {
        $stmt = $pdo->prepare(
            "SELECT 1
             FROM contrato co
             INNER JOIN direccion d ON d.id_direccion = :id_direccion
             WHERE co.id_contrato = :id_contrato
               AND d.id_cliente = co.id_cliente
             LIMIT 1"
        );
        $stmt->execute([
            ":id_direccion" => $values["id_direccion"],
            ":id_contrato" => $values["id_contrato"],
        ]);
        if (!$stmt->fetchColumn()) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            responder(["error" => "La dirección seleccionada no pertenece al cliente del contrato"], 409);
        }
    }
}

function bloquearContratoFactura(PDO $pdo, string $idContrato): bool
{
    $stmt = $pdo->prepare(
        "SELECT id_contrato FROM contrato WHERE id_contrato = :id_contrato FOR UPDATE"
    );
    $stmt->execute([":id_contrato" => $idContrato]);
    return (bool) $stmt->fetchColumn();
}

function existeFacturaParaPeriodo(PDO $pdo, string $idContrato, string $idPeriodo, ?string $idFactura = null): bool
{
    $idExclusion = $idFactura === null ? "" : " AND f.id_factura <> :id_factura";
    $stmt = $pdo->prepare(
        "SELECT 1
         FROM factura f
         INNER JOIN periodo_facturacion pf ON pf.id_periodo = f.id_periodo
         INNER JOIN periodo_facturacion periodo_solicitado
             ON periodo_solicitado.id_periodo = :id_periodo
            AND periodo_solicitado.fecha_inicio = pf.fecha_inicio
            AND periodo_solicitado.fecha_fin = pf.fecha_fin
         WHERE f.id_contrato = :id_contrato{$idExclusion}
         LIMIT 1"
    );
    $params = [":id_periodo" => $idPeriodo, ":id_contrato" => $idContrato];
    if ($idFactura !== null) {
        $params[":id_factura"] = $idFactura;
    }
    $stmt->execute($params);
    return (bool) $stmt->fetchColumn();
}

function obtenerFacturaBloqueada(PDO $pdo, string $idFactura): array|false
{
    $stmt = $pdo->prepare(
        "SELECT id_factura, total, saldo, fecha_vencimiento, estado
         FROM factura WHERE id_factura = :id_factura FOR UPDATE"
    );
    $stmt->execute([":id_factura" => $idFactura]);
    return $stmt->fetch();
}

function totalPagosRegistrados(PDO $pdo, string $idFactura, ?string $idPagoExcluido = null): float
{
    $exclusion = $idPagoExcluido === null ? "" : " AND p.id_pago <> :id_pago_excluido";
    $stmt = $pdo->prepare(
        "SELECT COALESCE(SUM(p.valor), 0)
         FROM pago p
         WHERE p.id_factura = :id_factura
           AND p.estado = 'REGISTRADO'
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'pagos' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(p.id_pago AS CHAR) COLLATE utf8mb4_unicode_ci
           ){$exclusion}"
    );
    $params = [":id_factura" => $idFactura];
    if ($idPagoExcluido !== null) {
        $params[":id_pago_excluido"] = $idPagoExcluido;
    }
    $stmt->execute($params);
    return (float) $stmt->fetchColumn();
}

function referenciaPagoDuplicada(PDO $pdo, array $values, ?string $idPago = null): bool
{
    $referencia = trim((string) ($values["referencia"] ?? ""));
    if ($referencia === "" || ($values["estado"] ?? "REGISTRADO") !== "REGISTRADO") {
        return false;
    }

    $exclusion = $idPago === null ? "" : " AND p.id_pago <> :id_pago";
    $stmt = $pdo->prepare(
        "SELECT 1 FROM pago p
         WHERE p.id_factura = :id_factura
           AND p.referencia = :referencia
           AND p.estado = 'REGISTRADO'
           AND NOT EXISTS (
               SELECT 1 FROM admin_bajas b
               WHERE b.entidad COLLATE utf8mb4_unicode_ci = 'pagos' COLLATE utf8mb4_unicode_ci
                 AND b.id_registro COLLATE utf8mb4_unicode_ci =
                     CAST(p.id_pago AS CHAR) COLLATE utf8mb4_unicode_ci
           ){$exclusion}
         LIMIT 1"
    );
    $params = [
        ":id_factura" => $values["id_factura"],
        ":referencia" => $referencia,
    ];
    if ($idPago !== null) {
        $params[":id_pago"] = $idPago;
    }
    $stmt->execute($params);
    return (bool) $stmt->fetchColumn();
}

function actualizarSaldoFactura(PDO $pdo, string $idFactura): void
{
    $factura = obtenerFacturaBloqueada($pdo, $idFactura);
    if (!$factura || $factura["estado"] === "ANULADA") {
        return;
    }

    $saldo = max(0, round((float) $factura["total"] - totalPagosRegistrados($pdo, $idFactura), 2));
    $hoy = (new DateTimeImmutable("today", new DateTimeZone("America/Bogota")))->format("Y-m-d");
    $estado = $saldo <= 0
        ? "PAGADA"
        : ((string) $factura["fecha_vencimiento"] < $hoy ? "VENCIDA" : "PENDIENTE");
    $stmt = $pdo->prepare(
        "UPDATE factura SET saldo = :saldo, estado = :estado WHERE id_factura = :id_factura"
    );
    $stmt->execute([
        ":saldo" => number_format($saldo, 2, ".", ""),
        ":estado" => $estado,
        ":id_factura" => $idFactura,
    ]);
}

function obtenerMetadatos(PDO $pdo, string $baseDatos, string $tabla, string $clave): array
{
    $columns = $pdo->prepare(
        "SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, DATA_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table
         ORDER BY ORDINAL_POSITION"
    );
    $columns->execute([":schema" => $baseDatos, ":table" => $tabla]);
    $rows = $columns->fetchAll();

    if (!$rows) {
        throw new RuntimeException("No se encontró la tabla configurada: " . $tabla);
    }

    $foreignKeys = $pdo->prepare(
        "SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = :schema AND TABLE_NAME = :table
           AND REFERENCED_TABLE_NAME IS NOT NULL"
    );
    $foreignKeys->execute([":schema" => $baseDatos, ":table" => $tabla]);
    $relations = [];
    foreach ($foreignKeys->fetchAll() as $foreignKey) {
        $relations[$foreignKey["COLUMN_NAME"]] = [
            "table" => $foreignKey["REFERENCED_TABLE_NAME"],
            "column" => $foreignKey["REFERENCED_COLUMN_NAME"]
        ];
    }

    $meta = [];
    foreach ($rows as $column) {
        $name = $column["COLUMN_NAME"];
        if (in_array($name, ["contrasena_hash", "idempotencia_key"], true)) {
            continue;
        }
        $enumValues = [];
        if (str_starts_with(strtolower($column["COLUMN_TYPE"]), "enum(")) {
            preg_match_all("/'((?:[^'\\\\]|\\\\.)*)'/", $column["COLUMN_TYPE"], $matches);
            $enumValues = array_map(
                static fn(string $value): string => stripcslashes($value),
                $matches[1] ?? []
            );
        }

        $meta[] = [
            "name" => $name,
            "type" => $column["DATA_TYPE"],
            "columnType" => $column["COLUMN_TYPE"],
            "nullable" => $column["IS_NULLABLE"] === "YES",
            "default" => $column["COLUMN_DEFAULT"],
            "generated" => str_contains($column["EXTRA"], "auto_increment")
                || str_contains($column["EXTRA"], "DEFAULT_GENERATED")
                || preg_match(
                    "/^CURRENT_TIMESTAMP(?:\\(\\))?$/i",
                    trim((string) $column["COLUMN_DEFAULT"], "'")
                ) === 1
                || $name === "ultimo_acceso",
            "enum" => $enumValues,
            "relation" => $relations[$name] ?? null
        ];
    }

    return ["columns" => $meta, "primaryKey" => $clave, "relations" => $relations];
}

function obtenerOpcionesRelacion(
    PDO $pdo,
    array $configuracion,
    string $tabla,
    string $columnaClave,
    ?string $entidadContexto = null,
    ?int $idClienteContexto = null
): array
{
    $labelCandidates = match ($tabla) {
        "usuario" => ["correo"],
        "cliente" => ["nombres", "numero_cliente"],
        "rol", "plan" => ["nombre"],
        "direccion" => ["direccion", "ciudad"],
        "contrato" => ["cliente_nombre", "cliente_numero", "plan_nombre", "fecha_inicio"],
        "periodo_facturacion" => ["fecha_inicio", "fecha_fin"],
        "factura" => ["numero"],
        "ticket" => ["asunto"],
        default => [$columnaClave]
    };

    $tableSql = "`" . str_replace("`", "``", $tabla) . "`";
    $keySql = "`" . str_replace("`", "``", $columnaClave) . "`";
    if ($tabla === "contrato") {
        // Para elegir una factura, se identifica el contrato por el cliente y el plan, no por su ID interno.
        $candidateSql = "contrato.id_contrato AS id, contrato.id_cliente AS cliente_id,
            contrato.id_direccion AS direccion_id, cliente.nombres AS cliente_nombre,
            cliente.numero_cliente AS cliente_numero, plan.nombre AS plan_nombre,
            plan.precio AS plan_precio, cliente.tipo_documento, cliente.numero_documento,
            cliente.telefono, cliente.correo, direccion.direccion AS direccion_texto,
            contrato.fecha_inicio";
        $fromSql = "contrato
            INNER JOIN cliente ON cliente.id_cliente = contrato.id_cliente
            INNER JOIN plan ON plan.id_plan = contrato.id_plan
            INNER JOIN direccion ON direccion.id_direccion = contrato.id_direccion";
    } elseif ($tabla === "factura") {
        $labelCandidates = ["numero", "cliente_nombre"];
        $candidateSql = "factura.id_factura AS id, factura.numero, factura.total, factura.saldo,
            factura.estado, cliente.id_cliente AS cliente_id, cliente.nombres AS cliente_nombre";
        $fromSql = "factura
            INNER JOIN contrato ON contrato.id_contrato = factura.id_contrato
            INNER JOIN cliente ON cliente.id_cliente = contrato.id_cliente";
    } elseif ($tabla === "cliente") {
        $candidateSql = "cliente.id_cliente AS id, cliente.nombres, cliente.numero_cliente,
            cliente.tipo_documento, cliente.numero_documento, cliente.telefono, cliente.correo";
        $fromSql = "cliente";
    } elseif ($tabla === "direccion") {
        $candidateSql = "direccion.id_direccion AS id, direccion.direccion, direccion.ciudad,
            direccion.id_cliente AS cliente_id";
        $fromSql = "direccion";
    } elseif ($tabla === "plan") {
        $candidateSql = "plan.id_plan AS id, plan.nombre, plan.precio, plan.velocidad";
        $fromSql = "plan";
    } elseif ($tabla === "periodo_facturacion") {
        $candidateSql = "periodo_facturacion.id_periodo AS id,
            periodo_facturacion.fecha_inicio, periodo_facturacion.fecha_fin,
            periodo_facturacion.fecha_vencimiento";
        $fromSql = "periodo_facturacion";
    } else {
        $candidateSql = implode(",", array_map(
            static fn(string $column): string => "`" . str_replace("`", "``", $column) . "`",
            $labelCandidates
        ));
        $fromSql = "{$tableSql}";
    }
    $filters = [];
    $params = [];
    if ($tabla === "rol") {
        $filters[] = "`estado` = 'ACTIVO'";
    }
    if ($tabla === "plan") {
        $filters[] = "plan.estado = 'ACTIVO'";
    }
    foreach ($configuracion as $entity => $definition) {
        if ($definition["tabla"] === $tabla && $definition["archivable"]) {
            $filters[] = "NOT EXISTS (
                SELECT 1 FROM admin_bajas b
                WHERE b.entidad COLLATE utf8mb4_unicode_ci = :archive_entity COLLATE utf8mb4_unicode_ci
                  AND b.id_registro COLLATE utf8mb4_unicode_ci =
                      CAST({$tableSql}.{$keySql} AS CHAR) COLLATE utf8mb4_unicode_ci
            )";
            $params[":archive_entity"] = $entity;
            break;
        }
    }
    $where = $filters ? " WHERE " . implode(" AND ", $filters) : "";
    $query = $pdo->prepare(
        "SELECT " . (in_array(
            $tabla,
            ["contrato", "factura", "cliente", "direccion", "plan", "periodo_facturacion"],
            true
        )
            ? $candidateSql
            : "{$keySql} AS id, {$candidateSql}")
        . " FROM {$fromSql}{$where} ORDER BY {$tableSql}.{$keySql} ASC LIMIT 1000"
    );
    $query->execute($params);
    $options = [];

    foreach ($query->fetchAll() as $row) {
        $labels = [];
        foreach ($labelCandidates as $candidate) {
            if (isset($row[$candidate]) && (string) $row[$candidate] !== "") {
                $labels[] = (string) $row[$candidate];
            }
        }
        $details = match ($tabla) {
            "cliente" => [
                "nombres" => $row["nombres"],
                "numero_cliente" => $row["numero_cliente"],
                "tipo_documento" => $row["tipo_documento"],
                "numero_documento" => $row["numero_documento"],
                "telefono" => $row["telefono"],
                "correo" => $row["correo"],
            ],
            "direccion" => ["cliente_id" => $row["cliente_id"]],
            "contrato" => [
                "cliente_id" => $row["cliente_id"],
                "direccion_id" => $row["direccion_id"],
                "cliente_nombre" => $row["cliente_nombre"],
                "cliente_numero" => $row["cliente_numero"],
                "tipo_documento" => $row["tipo_documento"],
                "numero_documento" => $row["numero_documento"],
                "telefono" => $row["telefono"],
                "correo" => $row["correo"],
                "direccion" => $row["direccion_texto"],
                "plan_nombre" => $row["plan_nombre"],
                "plan_precio" => $row["plan_precio"],
            ],
            "factura" => [
                "cliente_nombre" => $row["cliente_nombre"],
                "total" => $row["total"],
                "saldo" => $row["saldo"],
                "estado" => $row["estado"],
            ],
            "plan" => [
                "precio" => $row["precio"],
                "velocidad" => $row["velocidad"],
            ],
            "periodo_facturacion" => [
                "fecha_vencimiento" => $row["fecha_vencimiento"],
            ],
            default => [],
        };
        $options[] = [
            "value" => $row["id"],
            "label" => implode(" · ", $labels),
            "details" => $details,
        ];
    }

    if ($idClienteContexto !== null) {
        $allowedIds = null;
        if ($tabla === "cliente") {
            $allowedIds = [(string) $idClienteContexto];
        } elseif ($tabla === "usuario" && $entidadContexto === "notificaciones") {
            $user = $pdo->prepare("SELECT id_usuario FROM cliente WHERE id_cliente = :id_cliente");
            $user->execute([":id_cliente" => $idClienteContexto]);
            $userId = $user->fetchColumn();
            $allowedIds = $userId === false || $userId === null ? [] : [(string) $userId];
        } elseif ($tabla === "plan" && $entidadContexto === "contratos") {
            // Los planes son un catálogo independiente y se pueden contratar para un cliente nuevo.
            $allowedIds = null;
        } else {
            $relationEntity = match ($tabla) {
                "direccion" => "direcciones",
                "contrato" => "contratos",
                "ticket" => "tickets",
                "factura" => "facturas",
                default => null
            };
            $relationDefinition = $relationEntity === null ? null : ($configuracion[$relationEntity] ?? null);
            $relationFilter = $relationEntity === null ? null : filtroClienteEntidad($relationEntity);
            if ($relationDefinition !== null && $relationFilter !== null) {
                $relationTable = $relationDefinition["tabla"];
                $relationKey = $relationDefinition["clave"];
                $relatedRows = $pdo->prepare(
                    "SELECT t.`{$relationKey}` FROM `{$relationTable}` t WHERE {$relationFilter}"
                );
                $relatedRows->execute(parametrosFiltroCliente($relationEntity, $idClienteContexto));
                $allowedIds = array_map("strval", $relatedRows->fetchAll(PDO::FETCH_COLUMN));
            }
        }

        if ($allowedIds !== null) {
            $allowedLookup = array_fill_keys($allowedIds, true);
            $options = array_values(array_filter(
                $options,
                static fn(array $option): bool => isset($allowedLookup[(string) $option["value"]])
            ));
        }
    }

    return $options;
}

try {
    $metadata = obtenerMetadatos($pdo, $baseDatos, $tabla, $clave);
    $method = $_SERVER["REQUEST_METHOD"];

    if ($method === "GET" && $operacion === "meta") {
        foreach ($metadata["columns"] as &$column) {
            if ($column["relation"] !== null) {
                $relation = $column["relation"];
                $column["options"] = obtenerOpcionesRelacion(
                    $pdo,
                    $configuracion,
                    $relation["table"],
                    $relation["column"],
                    $entidad,
                    $idClienteContexto
                );
            } else {
                $column["options"] = [];
            }
        }
        unset($column);
        responder([
            "entidad" => $entidad,
            "titulo" => $definicion["titulo"],
            "clave" => $clave,
            "soloLectura" => !$definicion["editable"],
            "archivable" => $definicion["archivable"],
            "columnas" => $metadata["columns"]
        ]);
    }

    if ($method === "GET" && $operacion === "listar") {
        $archivados = ($_GET["archivados"] ?? "0") === "1";
        $columns = array_column($metadata["columns"], "name");
        $select = implode(", ", array_map(
            static fn(string $name): string => "t.`" . str_replace("`", "``", $name) . "`",
            $columns
        ));
        $keySql = "t.`" . str_replace("`", "``", $clave) . "`";
        $archiveFilter = !$definicion["archivable"]
            ? "1 = 1"
            : ($archivados
                ? "1 = 1"
                : "NOT EXISTS (
                    SELECT 1 FROM admin_bajas b
                    WHERE b.entidad COLLATE utf8mb4_unicode_ci = :archive_entity COLLATE utf8mb4_unicode_ci
                      AND b.id_registro COLLATE utf8mb4_unicode_ci =
                          CAST({$keySql} AS CHAR) COLLATE utf8mb4_unicode_ci
                )");
        $sql = "SELECT {$select}" . ($archivados && $definicion["archivable"]
            ? ", b.fecha_baja, b.estado_anterior"
            : "") . " FROM `{$tabla}` t";
        if ($archivados && $definicion["archivable"]) {
            $sql .= " INNER JOIN admin_bajas b
                ON b.entidad COLLATE utf8mb4_unicode_ci = :archive_entity COLLATE utf8mb4_unicode_ci
                AND b.id_registro COLLATE utf8mb4_unicode_ci =
                    CAST({$keySql} AS CHAR) COLLATE utf8mb4_unicode_ci";
        }
        $customerFilter = $idClienteContexto === null
            ? ""
            : " AND (" . filtroClienteEntidad($entidad) . ")";
        $searchFilter = "";
        $searchValue = $_GET["buscar"] ?? "";
        if (!is_string($searchValue)) {
            responder(["error" => "El criterio de búsqueda no es válido"], 400);
        }
        $search = trim($searchValue);
        $params = [];
        if ($definicion["archivable"]) {
            $params[":archive_entity"] = $entidad;
        }
        if ($idClienteContexto !== null) {
            $params = array_merge($params, parametrosFiltroCliente($entidad, $idClienteContexto));
        }
        if ($entidad === "clientes" && $search !== "") {
            $searchFilter = " AND (
                CAST(t.id_cliente AS CHAR) LIKE :buscar_id
                OR t.numero_cliente LIKE :buscar_numero
                OR t.tipo_documento LIKE :buscar_tipo_documento
                OR t.numero_documento LIKE :buscar_documento
                OR t.nombres LIKE :buscar_nombre
                OR t.telefono LIKE :buscar_telefono
                OR t.correo LIKE :buscar_correo
                OR EXISTS (
                    SELECT 1 FROM direccion d
                    WHERE d.id_cliente = t.id_cliente
                      AND CONCAT_WS(' ', d.direccion, d.ciudad, d.departamento, d.referencia)
                          LIKE :buscar_direccion
                )
            )";
            $term = "%" . $search . "%";
            foreach (["id", "numero", "tipo_documento", "documento", "nombre", "telefono", "correo", "direccion"] as $field) {
                $params[":buscar_" . $field] = $term;
            }
        }
        $listLimit = $idClienteContexto === null ? " LIMIT 1000" : "";
        $sql .= " WHERE {$archiveFilter}{$customerFilter}{$searchFilter} ORDER BY {$keySql} ASC{$listLimit}";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        responder(["registros" => $stmt->fetchAll()]);
    }

    $data = json_decode(file_get_contents("php://input"), true);
    $id = is_array($data) && isset($data["id"]) ? trim((string) $data["id"]) : "";
    $idempotenciaPago = null;
    if ($method === "POST" && $operacion === "crear" && $tabla === "pago") {
        $idempotenciaPago = is_array($data) && is_string($data["idempotencia_key"] ?? null)
            ? trim($data["idempotencia_key"])
            : "";
        if (!preg_match(
            '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
            $idempotenciaPago
        )) {
            responder(["error" => "La clave de idempotencia del pago no es válida"], 400);
        }
    }
    if ($idClienteContexto !== null
        && in_array($entidad, ["planes", "periodos"], true)
        && $method === "POST") {
        responder(["error" => "Este catálogo solo se puede consultar desde el detalle del cliente"], 405);
    }

    if ($method === "POST" && $operacion === "crear") {
        if (!$definicion["editable"] || !is_array($data)) {
            responder(["error" => "Esta tabla no permite crear registros"], 405);
        }
        $input = is_array($data["datos"] ?? null) ? $data["datos"] : [];
        if ($tabla === "cliente") {
            // Crear un cliente desde esta pantalla también crea su cuenta de acceso con rol CLIENTE.
            $password = is_string($data["contrasena"] ?? null) ? $data["contrasena"] : "";
            $correo = is_string($input["correo"] ?? null) ? trim($input["correo"]) : "";
            if (strlen($password) < 8) {
                responder(["error" => "La contraseña debe tener al menos 8 caracteres"], 400);
            }
            if (!filter_var($correo, FILTER_VALIDATE_EMAIL)) {
                responder(["error" => "Ingresa un correo válido para el cliente"], 400);
            }
            unset($input["id_usuario"]);
        }
        if ($tabla === "usuario") {
            $password = is_string($data["contrasena"] ?? null) ? $data["contrasena"] : "";
            if (strlen($password) < 8) {
                responder(["error" => "La contraseña debe tener al menos 8 caracteres"], 400);
            }
            $input["contrasena_hash"] = password_hash($password, PASSWORD_DEFAULT);
        }
        $columns = array_column($metadata["columns"], null, "name");
        $values = [];
        foreach ($input as $field => $value) {
            if ($field === "contrasena_hash") {
                if ($tabla === "usuario") {
                    $values[$field] = $value;
                    continue;
                }
                continue;
            }
            $fechaPagoEditable = $tabla === "pago" && $field === "fecha";
            if (!isset($columns[$field])
                || ($columns[$field]["generated"] && !$fechaPagoEditable)) {
                responder(["error" => "Campo no permitido: " . $field], 400);
            }
            if ($value === "" && $columns[$field]["nullable"]) {
                $values[$field] = null;
            } elseif ($value === "" && $columns[$field]["default"] !== null) {
                unset($values[$field]);
            } elseif ($value === "") {
                responder(["error" => "El campo " . $field . " es obligatorio"], 400);
            } else {
                $values[$field] = normalizarValor($columns[$field], $value);
            }
        }
        foreach ($metadata["columns"] as $column) {
            if ($column["name"] === $clave || $column["name"] === "contrasena_hash") {
                continue;
            }
            if (!$column["nullable"] && $column["default"] === null && !array_key_exists($column["name"], $values)) {
                responder(["error" => "El campo " . $column["name"] . " es obligatorio"], 400);
            }
        }
        validarFechaCreacion($entidad, $values);
        validarRelacionesEntidad($pdo, $entidad, $values);
        if ($tabla === "pago") {
            $valorPago = $values["valor"] ?? null;
            if (!montoMonetarioValido($valorPago)) {
                responder(["error" => "El valor del pago debe ser mayor que cero"], 400);
            }
        }
        if (!$values) {
            responder(["error" => "No se recibieron campos para crear el registro"], 400);
        }
        if ($tabla === "pago") {
            $values["idempotencia_key"] = $idempotenciaPago;
        }
        $rolClienteId = null;
        if ($tabla === "cliente") {
            $role = $pdo->prepare(
                "SELECT id_rol FROM rol
                 WHERE nombre = 'CLIENTE' AND estado = 'ACTIVO'
                 LIMIT 1"
            );
            $role->execute();
            $rolClienteId = $role->fetchColumn();
            if (!$rolClienteId) {
                responder(["error" => "No existe un rol CLIENTE activo"], 409);
            }
        }
        $names = array_keys($values);
        $fieldsSql = implode(", ", array_map(static fn(string $name): string => "`{$name}`", $names));
        $paramsSql = implode(", ", array_map(static fn(string $name): string => ":" . $name, $names));
        $pdo->beginTransaction();
        if ($tabla === "factura") {
            $idContratoFactura = (string) ($values["id_contrato"] ?? "");
            $idPeriodoFactura = (string) ($values["id_periodo"] ?? "");
            if ($idContratoFactura === "" || $idPeriodoFactura === ""
                || !bloquearContratoFactura($pdo, $idContratoFactura)) {
                $pdo->rollBack();
                responder(["error" => "Selecciona un contrato válido para la factura"], 400);
            }
            if (existeFacturaParaPeriodo($pdo, $idContratoFactura, $idPeriodoFactura)) {
                $pdo->rollBack();
                responder(["error" => "Ya existe una factura para este contrato y período"], 409);
            }
        }
        if ($tabla === "pago") {
            $idFacturaPago = (string) ($values["id_factura"] ?? "");
            $facturaPago = $idFacturaPago === "" ? false : obtenerFacturaBloqueada($pdo, $idFacturaPago);
            if (!$facturaPago) {
                $pdo->rollBack();
                responder(["error" => "Selecciona una factura válida que admita pagos"], 409);
            }
            $pagoExistente = pagoPorClaveIdempotencia($pdo, $idempotenciaPago);
            if ($pagoExistente) {
                if ((int) $pagoExistente["archivado"] === 1
                    || !pagoCoincideConSolicitud($pagoExistente, $values)) {
                    $pdo->rollBack();
                    responder(["error" => "La clave de idempotencia ya se usó con otra solicitud"], 409);
                }
                $pdo->commit();
                responder(["success" => true, "id" => (string) $pagoExistente["id_pago"], "repetido" => true]);
            }
            if ($facturaPago["estado"] === "ANULADA") {
                $pdo->rollBack();
                responder(["error" => "Selecciona una factura válida que admita pagos"], 409);
            }
            if (($values["estado"] ?? "REGISTRADO") === "REGISTRADO") {
                if (!in_array($facturaPago["estado"], ["PENDIENTE", "VENCIDA"], true)) {
                    $pdo->rollBack();
                    responder(["error" => "La factura no admite nuevos pagos"], 409);
                }
                $saldoReal = max(
                    0,
                    round((float) $facturaPago["total"] - totalPagosRegistrados($pdo, $idFacturaPago), 2)
                );
                if ((float) $values["valor"] > $saldoReal) {
                    $pdo->rollBack();
                    responder(["error" => "El pago supera el saldo pendiente de la factura"], 409);
                }
                if (referenciaPagoDuplicada($pdo, $values)) {
                    $pdo->rollBack();
                    responder(["error" => "Ya existe un pago registrado con esa referencia para la factura"], 409);
                }
            }
        }
        if ($tabla === "cliente") {
            $userInsert = $pdo->prepare(
                "INSERT INTO usuario (id_rol, correo, contrasena_hash, estado)
                 VALUES (:id_rol, :correo, :contrasena_hash, 'ACTIVO')"
            );
            $userInsert->execute([
                ":id_rol" => $rolClienteId,
                ":correo" => $correo,
                ":contrasena_hash" => password_hash($password, PASSWORD_DEFAULT)
            ]);
            $values["id_usuario"] = (string) $pdo->lastInsertId();
            $names = array_keys($values);
            $fieldsSql = implode(", ", array_map(static fn(string $name): string => "`{$name}`", $names));
            $paramsSql = implode(", ", array_map(static fn(string $name): string => ":" . $name, $names));
        }
        $stmt = $pdo->prepare("INSERT INTO `{$tabla}` ({$fieldsSql}) VALUES ({$paramsSql})");
        $stmt->execute(array_combine(
            array_map(static fn(string $name): string => ":" . $name, $names),
            array_values($values)
        ));
        $newId = (string) $pdo->lastInsertId();
        if ($idClienteContexto !== null
            && !registroPerteneceACliente($pdo, $entidad, $tabla, $clave, $newId, $idClienteContexto)) {
            $pdo->rollBack();
            responder(["error" => "El registro no quedó asociado al cliente seleccionado"], 409);
        }
        if ($tabla === "pago" && ($values["estado"] ?? "REGISTRADO") === "REGISTRADO") {
            actualizarSaldoFactura($pdo, (string) $values["id_factura"]);
        }

        if ($tabla === "cliente") {
            auditar($pdo, "usuario", (string) $values["id_usuario"], "CREAR", [
                "correo" => $correo,
                "id_rol" => $rolClienteId
            ]);
        }

        if ($tabla === "usuario") {
            $role = $pdo->prepare("SELECT nombre FROM rol WHERE id_rol = :id_rol");
            $role->execute([":id_rol" => $values["id_rol"]]);
            if ($role->fetchColumn() === "CLIENTE") {
                $client = is_array($data["cliente"] ?? null) ? $data["cliente"] : [];
                $requiredClientFields = ["numero_cliente", "tipo_documento", "numero_documento", "nombres"];
                foreach ($requiredClientFields as $requiredField) {
                    if (!is_string($client[$requiredField] ?? null) || trim($client[$requiredField]) === "") {
                        $pdo->rollBack();
                        responder(["error" => "Completa los datos requeridos del perfil cliente: " . $requiredField], 400);
                    }
                }
                $clientInsert = $pdo->prepare(
                    "INSERT INTO cliente
                        (id_usuario, numero_cliente, tipo_documento, numero_documento, nombres, telefono, correo, estado)
                     VALUES
                        (:id_usuario, :numero_cliente, :tipo_documento, :numero_documento, :nombres, :telefono, :correo, 'ACTIVO')"
                );
                $clientInsert->execute([
                    ":id_usuario" => $newId,
                    ":numero_cliente" => trim($client["numero_cliente"]),
                    ":tipo_documento" => trim($client["tipo_documento"]),
                    ":numero_documento" => trim($client["numero_documento"]),
                    ":nombres" => trim($client["nombres"]),
                    ":telefono" => trim((string) ($client["telefono"] ?? "")) ?: null,
                    ":correo" => $values["correo"]
                ]);
                auditar($pdo, "cliente", (string) $pdo->lastInsertId(), "CREAR", [
                    "id_usuario" => $newId,
                    "numero_cliente" => $client["numero_cliente"]
                ]);
            }
        }
        unset($values["idempotencia_key"]);
        unset($values["contrasena_hash"]);
        auditar($pdo, $tabla, $newId, "CREAR", $values);
        $pdo->commit();
        responder(["success" => true, "id" => $newId], 201);
    }

    if ($method === "POST" && $operacion === "editar") {
        if (!$definicion["editable"] || $id === "" || !is_array($data)
            || !is_array($data["datos"] ?? null)) {
            responder(["error" => "No se puede editar este registro"], 400);
        }
        $input = $data["datos"];
        if ($tabla === "rol" && ($input["estado"] ?? null) === "INACTIVO") {
            $activeAdmins = $pdo->prepare(
                "SELECT COUNT(*)
                 FROM usuario u
                 INNER JOIN rol r ON r.id_rol = u.id_rol
                 WHERE r.id_rol = :role_id
                   AND r.nombre = 'ADMINISTRADOR'
                   AND u.estado = 'ACTIVO'"
            );
            $activeAdmins->execute([":role_id" => $id]);
            if ((int) $activeAdmins->fetchColumn() > 0) {
                responder(["error" => "No puedes desactivar el rol mientras haya administradores activos"], 409);
            }
        }
        if ($tabla === "usuario" && $id === (string) $_SESSION["id_usuario"]) {
            $currentRole = $pdo->prepare("SELECT id_rol FROM usuario WHERE id_usuario = :id");
            $currentRole->execute([":id" => $_SESSION["id_usuario"]]);
            if (($input["estado"] ?? "ACTIVO") !== "ACTIVO"
                || (isset($input["id_rol"])
                    && (int) $input["id_rol"] !== (int) $currentRole->fetchColumn())) {
                responder(["error" => "No puedes desactivar ni cambiar el rol de tu propia cuenta"], 400);
            }
        }
        if ($tabla === "usuario" && isset($data["contrasena"]) && $data["contrasena"] !== "") {
            if (!is_string($data["contrasena"]) || strlen($data["contrasena"]) < 8) {
                responder(["error" => "La contraseña debe tener al menos 8 caracteres"], 400);
            }
            $input["contrasena_hash"] = password_hash($data["contrasena"], PASSWORD_DEFAULT);
        }
        $columns = array_column($metadata["columns"], null, "name");
        $values = [];
        foreach ($input as $field => $value) {
            if ($field === "contrasena_hash" && $tabla === "usuario") {
                $values[$field] = $value;
                continue;
            }
            $fechaPagoEditable = $tabla === "pago" && $field === "fecha";
            if ($field === $clave || !isset($columns[$field])
                || ($columns[$field]["generated"] && !$fechaPagoEditable)) {
                responder(["error" => "Campo no permitido: " . $field], 400);
            }
            if ($value === "" && $columns[$field]["nullable"]) {
                $values[$field] = null;
            } elseif ($value === "") {
                responder(["error" => "El campo " . $field . " no puede quedar vacío"], 400);
            } else {
                $values[$field] = normalizarValor($columns[$field], $value);
            }
        }
        if (!$values) {
            responder(["error" => "No se recibieron cambios"], 400);
        }
        $customerFilter = $idClienteContexto === null
            ? ""
            : " AND (" . filtroClienteEntidad($entidad) . ")";
        $exists = $pdo->prepare(
            "SELECT 1 FROM `{$tabla}` t WHERE t.`{$clave}` = :id{$customerFilter}
             AND NOT EXISTS (
                 SELECT 1 FROM admin_bajas b
                 WHERE b.entidad COLLATE utf8mb4_unicode_ci = :entity COLLATE utf8mb4_unicode_ci
                   AND b.id_registro COLLATE utf8mb4_unicode_ci =
                       CAST(t.`{$clave}` AS CHAR) COLLATE utf8mb4_unicode_ci
             )"
        );
        $existsParams = [":id" => $id, ":entity" => $entidad];
        if ($idClienteContexto !== null) {
            $existsParams = array_merge($existsParams, parametrosFiltroCliente($entidad, $idClienteContexto));
        }
        $exists->execute($existsParams);
        if (!$exists->fetchColumn()) {
            responder(["error" => "No se encontró el registro activo"], 404);
        }
        $assignments = implode(", ", array_map(static fn(string $name): string => "`{$name}` = :{$name}", array_keys($values)));
        $updateValues = [];
        foreach ($values as $field => $value) {
            $updateValues[":" . $field] = $value;
        }
        $updateValues[":record_id"] = $id;
        $stmt = $pdo->prepare("UPDATE `{$tabla}` SET {$assignments} WHERE `{$clave}` = :record_id");
        $pdo->beginTransaction();
        $paymentInvoiceIds = [];
        if (in_array($tabla, ["contrato", "orden_servicio", "factura", "pago"], true)) {
            $currentStmt = $pdo->prepare(
                "SELECT * FROM `{$tabla}` WHERE `{$clave}` = :record_id FOR UPDATE"
            );
            $currentStmt->execute([":record_id" => $id]);
            $currentRecord = $currentStmt->fetch();
            if (!$currentRecord) {
                $pdo->rollBack();
                responder(["error" => "No se encontró el registro activo"], 404);
            }
            $effectiveValues = array_merge($currentRecord, $values);
            if (in_array($tabla, ["contrato", "orden_servicio"], true)) {
                validarRelacionesEntidad($pdo, $entidad, $effectiveValues);
            }
            if ($tabla === "factura") {
                $contractIds = array_unique([
                    (string) $currentRecord["id_contrato"],
                    (string) ($effectiveValues["id_contrato"] ?? ""),
                ]);
                sort($contractIds, SORT_NUMERIC);
                foreach ($contractIds as $contractId) {
                    if ($contractId === "" || !bloquearContratoFactura($pdo, $contractId)) {
                        $pdo->rollBack();
                        responder(["error" => "Selecciona un contrato válido para la factura"], 400);
                    }
                }
                if (existeFacturaParaPeriodo(
                    $pdo,
                    (string) $effectiveValues["id_contrato"],
                    (string) $effectiveValues["id_periodo"],
                    $id
                )) {
                    $pdo->rollBack();
                    responder(["error" => "Ya existe una factura para este contrato y período"], 409);
                }
            }
            if ($tabla === "pago") {
                $oldInvoiceId = (string) $currentRecord["id_factura"];
                $newInvoiceId = (string) ($effectiveValues["id_factura"] ?? "");
                $paymentInvoiceIds = array_values(array_unique([$oldInvoiceId, $newInvoiceId]));
                sort($paymentInvoiceIds, SORT_NUMERIC);
                $lockedInvoices = [];
                foreach ($paymentInvoiceIds as $invoiceId) {
                    $lockedInvoice = $invoiceId === "" ? false : obtenerFacturaBloqueada($pdo, $invoiceId);
                    if (!$lockedInvoice) {
                        $pdo->rollBack();
                        responder(["error" => "Selecciona una factura válida"], 409);
                    }
                    $lockedInvoices[$invoiceId] = $lockedInvoice;
                }
                $paymentValues = array_merge($currentRecord, $effectiveValues);
                $valorPago = $paymentValues["valor"] ?? null;
                if (!montoMonetarioValido($valorPago)) {
                    $pdo->rollBack();
                    responder(["error" => "El valor del pago debe ser mayor que cero"], 400);
                }
                if (($paymentValues["estado"] ?? "") === "REGISTRADO") {
                    $facturaDestino = $lockedInvoices[$newInvoiceId];
                    if ($facturaDestino["estado"] === "ANULADA") {
                        $pdo->rollBack();
                        responder(["error" => "No se puede asociar un pago a una factura anulada"], 409);
                    }
                    $exclusion = $oldInvoiceId === $newInvoiceId ? $id : null;
                    $saldoDisponible = max(
                        0,
                        round(
                            (float) $facturaDestino["total"]
                            - totalPagosRegistrados($pdo, $newInvoiceId, $exclusion),
                            2
                        )
                    );
                    if ((float) $valorPago > $saldoDisponible) {
                        $pdo->rollBack();
                        responder(["error" => "El pago supera el saldo pendiente de la factura"], 409);
                    }
                    if (referenciaPagoDuplicada($pdo, $paymentValues, $id)) {
                        $pdo->rollBack();
                        responder(["error" => "Ya existe un pago registrado con esa referencia para la factura"], 409);
                    }
                }
            }
        }
        if ($tabla === "cliente" && array_key_exists("correo", $values)) {
            // El correo también es el usuario de inicio de sesión del cliente vinculado.
            $linkedUser = $pdo->prepare("SELECT id_usuario FROM cliente WHERE id_cliente = :id_cliente");
            $linkedUser->execute([":id_cliente" => $id]);
            $linkedUserId = $linkedUser->fetchColumn();
            if ($linkedUserId) {
                if (!is_string($values["correo"]) || !filter_var($values["correo"], FILTER_VALIDATE_EMAIL)) {
                    $pdo->rollBack();
                    responder(["error" => "Ingresa un correo válido para la cuenta del cliente"], 400);
                }
                $updateUserEmail = $pdo->prepare(
                    "UPDATE usuario SET correo = :correo WHERE id_usuario = :id_usuario"
                );
                $updateUserEmail->execute([
                    ":correo" => $values["correo"],
                    ":id_usuario" => $linkedUserId
                ]);
            }
        }
        $stmt->execute($updateValues);
        if ($idClienteContexto !== null
            && !registroPerteneceACliente($pdo, $entidad, $tabla, $clave, $id, $idClienteContexto)) {
            $pdo->rollBack();
            responder(["error" => "No puedes asociar el registro a otro cliente"], 409);
        }
        if ($tabla === "pago") {
            foreach ($paymentInvoiceIds as $invoiceId) {
                actualizarSaldoFactura($pdo, $invoiceId);
            }
        }
        unset($input["contrasena_hash"]);
        auditar($pdo, $tabla, $id, "EDITAR", $input);
        $pdo->commit();
        responder(["success" => true]);
    }

    if ($method === "POST" && ($operacion === "eliminar" || $operacion === "reactivar")) {
        if (!$definicion["archivable"] || $id === "" || !is_array($data)) {
            responder(["error" => "Esta tabla no permite desactivar o reactivar registros"], 400);
        }
        if ($tabla === "usuario" && $id === (string) $_SESSION["id_usuario"] && $operacion === "eliminar") {
            responder(["error" => "No puedes desactivar tu propia cuenta administrativa"], 400);
        }
        if ($tabla === "rol" && $operacion === "eliminar") {
            $activeAdmins = $pdo->prepare(
                "SELECT COUNT(*)
                 FROM usuario u
                 INNER JOIN rol r ON r.id_rol = u.id_rol
                 WHERE r.id_rol = :role_id
                   AND r.nombre = 'ADMINISTRADOR'
                   AND u.estado = 'ACTIVO'"
            );
            $activeAdmins->execute([":role_id" => $id]);
            if ((int) $activeAdmins->fetchColumn() > 0) {
                responder(["error" => "No puedes desactivar el rol mientras haya administradores activos"], 409);
            }
        }
        $pdo->beginTransaction();
        $paymentInvoiceId = null;
        if ($tabla === "pago") {
            $paymentStmt = $pdo->prepare(
                "SELECT id_factura, valor, estado FROM pago WHERE id_pago = :id_pago FOR UPDATE"
            );
            $paymentStmt->execute([":id_pago" => $id]);
            $payment = $paymentStmt->fetch();
            if (!$payment) {
                $pdo->rollBack();
                responder(["error" => "No se encontró el pago"], 404);
            }
            $paymentInvoiceId = (string) $payment["id_factura"];
            $lockedInvoice = obtenerFacturaBloqueada($pdo, $paymentInvoiceId);
            if (!$lockedInvoice) {
                $pdo->rollBack();
                responder(["error" => "No se encontró la factura asociada al pago"], 404);
            }
            if ($operacion === "reactivar" && $payment["estado"] === "REGISTRADO") {
                $saldoDisponible = max(
                    0,
                    round((float) $lockedInvoice["total"] - totalPagosRegistrados($pdo, $paymentInvoiceId), 2)
                );
                if ((float) $payment["valor"] > $saldoDisponible
                    || $lockedInvoice["estado"] === "ANULADA") {
                    $pdo->rollBack();
                    responder(["error" => "No se puede reactivar el pago porque excede el saldo de la factura"], 409);
                }
            }
        }
        if ($operacion === "eliminar") {
            $hasState = in_array("estado", array_column($metadata["columns"], "name"), true);
            $stateSelect = $hasState ? "`estado`" : "'' AS estado";
            $customerFilter = $idClienteContexto === null
                ? ""
                : " AND (" . filtroClienteEntidad($entidad) . ")";
            $stmt = $pdo->prepare("SELECT {$stateSelect} FROM `{$tabla}` t WHERE t.`{$clave}` = :id{$customerFilter} LIMIT 1");
            $archiveParams = [":id" => $id];
            if ($idClienteContexto !== null) {
                $archiveParams = array_merge($archiveParams, parametrosFiltroCliente($entidad, $idClienteContexto));
            }
            $stmt->execute($archiveParams);
            $record = $stmt->fetch();
            if (!$record) {
                $pdo->rollBack();
                responder(["error" => "No se encontró el registro"], 404);
            }
            $state = isset($record["estado"]) ? (string) $record["estado"] : "";
            $archive = $pdo->prepare(
                "INSERT INTO admin_bajas (entidad, id_registro, estado_anterior, id_usuario_admin)
                 VALUES (:entidad, :id, :state, :admin)"
            );
            $archive->execute([
                ":entidad" => $entidad,
                ":id" => $id,
                ":state" => $state,
                ":admin" => $_SESSION["id_usuario"]
            ]);
            auditar($pdo, $tabla, $id, "DESACTIVAR");
            if ($tabla === "pago" && $payment["estado"] === "REGISTRADO") {
                actualizarSaldoFactura($pdo, $paymentInvoiceId);
            }
            $pdo->commit();
            responder(["success" => true]);
        }

        if ($idClienteContexto !== null
            && !registroPerteneceACliente($pdo, $entidad, $tabla, $clave, $id, $idClienteContexto)) {
            $pdo->rollBack();
            responder(["error" => "No puedes reactivar un registro ajeno al cliente seleccionado"], 404);
        }
        $restore = $pdo->prepare(
            "DELETE FROM admin_bajas
             WHERE entidad COLLATE utf8mb4_unicode_ci = :entidad COLLATE utf8mb4_unicode_ci
               AND id_registro COLLATE utf8mb4_unicode_ci = :id COLLATE utf8mb4_unicode_ci"
        );
        $restore->execute([":entidad" => $entidad, ":id" => $id]);
        if ($restore->rowCount() === 0) {
            $pdo->rollBack();
            responder(["error" => "No se encontró un registro desactivado"], 404);
        }
        auditar($pdo, $tabla, $id, "REACTIVAR");
        if ($tabla === "pago" && $payment["estado"] === "REGISTRADO") {
            actualizarSaldoFactura($pdo, $paymentInvoiceId);
        }
        $pdo->commit();
        responder(["success" => true]);
    }

    responder(["error" => "Operación o método no permitido"], 405);
} catch (PDOException $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("Error en CRUD de " . $entidad . ": " . $exception->getMessage());
    $code = $exception->getCode() === "23000" ? 409 : 422;
    responder([
        "error" => $code === 409
            ? "El registro duplica un dato único o está relacionado con otros datos"
            : "La operación no cumple las reglas de la base de datos"
    ], $code);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("Error interno en CRUD de " . $entidad . ": " . $exception->getMessage());
    responder(["error" => "No se pudo completar la operación"], 500);
}