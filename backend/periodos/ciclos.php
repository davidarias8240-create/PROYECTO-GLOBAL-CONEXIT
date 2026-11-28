<?php
require_once __DIR__ . "/../config/admin_auth.php";
require_once __DIR__ . "/ciclo_service.php";

header("Content-Type: application/json; charset=UTF-8");

function responderCiclos(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

try {
    $usuario = usuarioPanelAdministrativoAutenticado($pdo);
} catch (Throwable $exception) {
    error_log("Error al autenticar el módulo de ciclos: " . $exception->getMessage());
    responderCiclos(["error" => "No se pudo validar la sesión administrativa"], 500);
}
if ($usuario === null) {
    responderCiclos(["error" => "Inicia sesión en el panel administrativo"], 401);
}
$permisos = permisoEntidadAdministrativa($usuario["rol"], "periodos");
$metodo = $_SERVER["REQUEST_METHOD"] ?? "GET";

if ($metodo === "GET") {
    if (!$permisos["leer"]) {
        responderCiclos(["error" => "No tienes permiso para consultar este módulo"], 403);
    }

    try {
        $soloActivos = ($_GET["activos"] ?? "0") === "1";
        $consulta = $pdo->prepare(
            "SELECT c.id_ciclo, c.nombre, c.dia_inicio, c.dias_vencimiento,
                    c.prorratear_primer_mes, c.estado, c.fecha_creacion,
                    (SELECT COUNT(*) FROM periodo_facturacion p
                     WHERE p.id_ciclo = c.id_ciclo) AS periodos_generados
             FROM ciclo_facturacion c
             WHERE (:solo_activos = 0 OR c.estado = 'ACTIVO')
             ORDER BY c.id_ciclo DESC"
        );
        $consulta->execute([":solo_activos" => $soloActivos ? 1 : 0]);
        responderCiclos([
            "ciclos" => $consulta->fetchAll(),
            "permisos" => $permisos,
        ]);
    } catch (Throwable $exception) {
        error_log("Error al consultar ciclos de facturación: " . $exception->getMessage());
        responderCiclos(["error" => "No se pudieron consultar los ciclos de facturación"], 500);
    }
}

if ($metodo !== "POST") {
    header("Allow: GET, POST");
    responderCiclos(["error" => "Método no permitido"], 405);
}

$entrada = json_decode(file_get_contents("php://input"), true);
if (!is_array($entrada)) {
    responderCiclos(["error" => "La solicitud debe contener un objeto JSON válido"], 400);
}
$operacion = $entrada["operacion"] ?? "";
if ($operacion === "obtener_periodo") {
    if (!$permisos["crear"]) {
        responderCiclos(["error" => "No tienes permiso para generar períodos"], 403);
    }
    $idCiclo = filter_var($entrada["id_ciclo"] ?? null, FILTER_VALIDATE_INT);
    $anio = filter_var($entrada["anio"] ?? null, FILTER_VALIDATE_INT);
    $mes = filter_var($entrada["mes"] ?? null, FILTER_VALIDATE_INT);
    $fechaEmision = $entrada["fecha_emision"] ?? null;
    if ($idCiclo === false || $idCiclo <= 0
        || $anio === false || $anio < 1000 || $anio > 9999
        || $mes === false || $mes < 1 || $mes > 12
        || !is_string($fechaEmision)) {
        responderCiclos(["error" => "El ciclo, mes, año o fecha de emisión no es válido"], 400);
    }

    try {
        $pdo->beginTransaction();
        $pdo->query("SELECT id FROM periodo_solapamiento_guard WHERE id = 1 FOR UPDATE")->fetchColumn();
        $existe = $pdo->prepare(
            "SELECT id_periodo
             FROM periodo_facturacion
             WHERE id_ciclo = :id_ciclo AND anio = :anio AND mes = :mes"
        );
        $existe->execute([":id_ciclo" => $idCiclo, ":anio" => $anio, ":mes" => $mes]);
        $yaExistia = $existe->fetchColumn();
        $periodo = obtenerOCrearPeriodo($pdo, $idCiclo, $anio, $mes, $fechaEmision);
        $fechaVencimiento = fechaVencimientoCiclo(
            $fechaEmision,
            (int) $periodo["dias_vencimiento"]
        );
        if (!$yaExistia) {
            $auditoria = $pdo->prepare(
                "INSERT INTO auditoria (id_usuario, entidad, id_entidad, accion, detalle)
                 VALUES (:id_usuario, 'periodo_facturacion', :id_periodo, 'GENERAR_AUTOMATICO', :detalle)"
            );
            $auditoria->execute([
                ":id_usuario" => $usuario["id_usuario"],
                ":id_periodo" => $periodo["id_periodo"],
                ":detalle" => json_encode([
                    "id_ciclo" => $idCiclo,
                    "anio" => $anio,
                    "mes" => $mes,
                    "fecha_inicio" => $periodo["fecha_inicio"],
                    "fecha_fin" => $periodo["fecha_fin"],
                ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
            ]);
        }
        $pdo->commit();
        responderCiclos([
            "periodo" => $periodo,
            "fecha_vencimiento_sugerida" => $fechaVencimiento,
        ]);
    } catch (InvalidArgumentException $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        responderCiclos(["error" => $exception->getMessage()], 400);
    } catch (DomainException $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        responderCiclos(["error" => $exception->getMessage()], 409);
    } catch (Throwable $exception) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log("Error al obtener o crear el período: " . $exception->getMessage());
        responderCiclos(["error" => "No se pudo generar el período de facturación"], 500);
    }
}

if (!in_array($operacion, ["crear", "editar", "cambiar_estado"], true)) {
    responderCiclos(["error" => "La operación solicitada no es válida"], 400);
}
if (($operacion === "crear" && !$permisos["crear"])
    || ($operacion !== "crear" && !$permisos["editar"])) {
    responderCiclos(["error" => "No tienes permiso para modificar los ciclos"], 403);
}

try {
    $pdo->beginTransaction();
    $idCiclo = filter_var($entrada["id_ciclo"] ?? null, FILTER_VALIDATE_INT);
    $nombre = trim((string) ($entrada["nombre"] ?? ""));

    if ($operacion === "crear" || $operacion === "editar") {
        $diaInicio = filter_var($entrada["dia_inicio"] ?? null, FILTER_VALIDATE_INT);
        $diasVencimiento = filter_var($entrada["dias_vencimiento"] ?? null, FILTER_VALIDATE_INT);
        $prorratear = $entrada["prorratear_primer_mes"] ?? true;
        if ($nombre === "" || mb_strlen($nombre) > 100
            || $diaInicio === false || $diaInicio < 1 || $diaInicio > 28
            || $diasVencimiento === false || $diasVencimiento < 1 || $diasVencimiento > 65535
            || !in_array($prorratear, [true, false, 0, 1, "0", "1"], true)) {
            throw new InvalidArgumentException("Revisa el nombre, el día de inicio, el plazo y el prorrateo");
        }
        $prorratear = (int) filter_var($prorratear, FILTER_VALIDATE_BOOLEAN);

        if ($operacion === "crear") {
            $stmt = $pdo->prepare(
                "INSERT INTO ciclo_facturacion
                    (nombre, dia_inicio, dias_vencimiento, prorratear_primer_mes, estado)
                 VALUES
                    (:nombre, :dia_inicio, :dias_vencimiento, :prorratear, 'ACTIVO')"
            );
            $stmt->execute([
                ":nombre" => $nombre,
                ":dia_inicio" => $diaInicio,
                ":dias_vencimiento" => $diasVencimiento,
                ":prorratear" => $prorratear,
            ]);
            $idCiclo = (int) $pdo->lastInsertId();
            $accion = "CREAR";
        } else {
            if ($idCiclo === false || $idCiclo <= 0) {
                throw new InvalidArgumentException("El ciclo seleccionado no es válido");
            }
            $actual = $pdo->prepare(
                "SELECT dia_inicio FROM ciclo_facturacion WHERE id_ciclo = :id_ciclo FOR UPDATE"
            );
            $actual->execute([":id_ciclo" => $idCiclo]);
            $diaActual = $actual->fetchColumn();
            if ($diaActual === false) {
                throw new DomainException("No se encontró el ciclo seleccionado");
            }
            if ((int) $diaActual !== $diaInicio) {
                $periodosExistentes = $pdo->prepare(
                    "SELECT 1 FROM periodo_facturacion WHERE id_ciclo = :id_ciclo LIMIT 1"
                );
                $periodosExistentes->execute([":id_ciclo" => $idCiclo]);
                if ($periodosExistentes->fetchColumn()) {
                    throw new DomainException(
                        "No se puede cambiar el día de inicio después de generar períodos para este ciclo"
                    );
                }
            }
            $stmt = $pdo->prepare(
                "UPDATE ciclo_facturacion
                 SET nombre = :nombre, dia_inicio = :dia_inicio,
                     dias_vencimiento = :dias_vencimiento, prorratear_primer_mes = :prorratear
                 WHERE id_ciclo = :id_ciclo"
            );
            $stmt->execute([
                ":nombre" => $nombre,
                ":dia_inicio" => $diaInicio,
                ":dias_vencimiento" => $diasVencimiento,
                ":prorratear" => $prorratear,
                ":id_ciclo" => $idCiclo,
            ]);
            $accion = "EDITAR";
        }
    } else {
        if ($idCiclo === false || $idCiclo <= 0) {
            throw new InvalidArgumentException("El ciclo seleccionado no es válido");
        }
        $estado = $entrada["estado"] ?? "";
        if (!in_array($estado, ["ACTIVO", "INACTIVO"], true)) {
            throw new InvalidArgumentException("El estado del ciclo no es válido");
        }
        $actual = $pdo->prepare(
            "SELECT id_ciclo FROM ciclo_facturacion WHERE id_ciclo = :id_ciclo FOR UPDATE"
        );
        $actual->execute([":id_ciclo" => $idCiclo]);
        if (!$actual->fetchColumn()) {
            throw new DomainException("No se encontró el ciclo seleccionado");
        }
        $stmt = $pdo->prepare(
            "UPDATE ciclo_facturacion SET estado = :estado WHERE id_ciclo = :id_ciclo"
        );
        $stmt->execute([":estado" => $estado, ":id_ciclo" => $idCiclo]);
        $accion = $estado === "ACTIVO" ? "ACTIVAR" : "INACTIVAR";
    }

    $auditoria = $pdo->prepare(
        "INSERT INTO auditoria (id_usuario, entidad, id_entidad, accion, detalle)
         VALUES (:id_usuario, 'ciclo_facturacion', :id_ciclo, :accion, :detalle)"
    );
    $auditoria->execute([
        ":id_usuario" => $usuario["id_usuario"],
        ":id_ciclo" => $idCiclo,
        ":accion" => $accion,
        ":detalle" => json_encode($entrada, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE),
    ]);
    $pdo->commit();
    responderCiclos(["success" => true, "id_ciclo" => (string) $idCiclo]);
} catch (InvalidArgumentException $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    responderCiclos(["error" => $exception->getMessage()], 400);
} catch (DomainException $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    responderCiclos(["error" => $exception->getMessage()], 409);
} catch (Throwable $exception) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("Error al guardar ciclo de facturación: " . $exception->getMessage());
    responderCiclos(["error" => "No se pudo guardar el ciclo de facturación"], 500);
}
