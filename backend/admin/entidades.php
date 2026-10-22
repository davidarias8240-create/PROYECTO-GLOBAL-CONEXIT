<?php
require_once __DIR__ . "/../config/admin_auth.php";

header("Access-Control-Allow-Origin: http://localhost:5173");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type");
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

function responder(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
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
        if ($name === "contrasena_hash") {
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

function obtenerOpcionesRelacion(PDO $pdo, array $configuracion, string $tabla, string $columnaClave): array
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
        $candidateSql = "contrato.id_contrato AS id, cliente.nombres AS cliente_nombre,
            cliente.numero_cliente AS cliente_numero, plan.nombre AS plan_nombre,
            contrato.fecha_inicio";
        $fromSql = "contrato
            INNER JOIN cliente ON cliente.id_cliente = contrato.id_cliente
            INNER JOIN plan ON plan.id_plan = contrato.id_plan";
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
        "SELECT " . ($tabla === "contrato" ? $candidateSql : "{$keySql} AS id, {$candidateSql}")
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
        $options[] = ["value" => $row["id"], "label" => implode(" · ", $labels)];
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
                    $relation["column"]
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
        $sql .= " WHERE {$archiveFilter} ORDER BY {$keySql} ASC LIMIT 1000";
        $stmt = $pdo->prepare($sql);
        if ($definicion["archivable"]) {
            $stmt->execute([":archive_entity" => $entidad]);
        } else {
            $stmt->execute();
        }
        responder(["registros" => $stmt->fetchAll()]);
    }

    $data = json_decode(file_get_contents("php://input"), true);
    $id = is_array($data) && isset($data["id"]) ? trim((string) $data["id"]) : "";

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
            if (!isset($columns[$field]) || $columns[$field]["generated"]) {
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
        if (!$values) {
            responder(["error" => "No se recibieron campos para crear el registro"], 400);
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
            if ($field === $clave || !isset($columns[$field]) || $columns[$field]["generated"]) {
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
        $exists = $pdo->prepare(
            "SELECT 1 FROM `{$tabla}` t WHERE t.`{$clave}` = :id
             AND NOT EXISTS (
                 SELECT 1 FROM admin_bajas b
                 WHERE b.entidad COLLATE utf8mb4_unicode_ci = :entity COLLATE utf8mb4_unicode_ci
                   AND b.id_registro COLLATE utf8mb4_unicode_ci =
                       CAST(t.`{$clave}` AS CHAR) COLLATE utf8mb4_unicode_ci
             )"
        );
        $exists->execute([":id" => $id, ":entity" => $entidad]);
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
        if ($operacion === "eliminar") {
            $hasState = in_array("estado", array_column($metadata["columns"], "name"), true);
            $stateSelect = $hasState ? "`estado`" : "'' AS estado";
            $stmt = $pdo->prepare("SELECT {$stateSelect} FROM `{$tabla}` WHERE `{$clave}` = :id LIMIT 1");
            $stmt->execute([":id" => $id]);
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
            $pdo->commit();
            responder(["success" => true]);
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