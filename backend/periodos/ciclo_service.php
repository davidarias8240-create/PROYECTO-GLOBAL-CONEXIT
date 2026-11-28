<?php

function calcularFechasPeriodoCiclo(int $diaInicio, int $anio, int $mes): array
{
    if ($diaInicio < 1 || $diaInicio > 28 || $anio < 1000 || $anio > 9999 || $mes < 1 || $mes > 12
        || ($diaInicio > 1 && $anio === 9999 && $mes === 12)) {
        throw new InvalidArgumentException("La regla o el mes solicitado no es válido");
    }

    $zona = new DateTimeZone("America/Bogota");
    $inicioMes = DateTimeImmutable::createFromFormat(
        "!Y-n-j",
        "{$anio}-{$mes}-1",
        $zona
    );
    if (!$inicioMes) {
        throw new InvalidArgumentException("No se pudo construir la fecha de inicio del período");
    }

    $inicio = $inicioMes->setDate(
        $anio,
        $mes,
        $diaInicio
    );
    $mesSiguiente = $inicioMes->modify("first day of next month");
    $fin = $diaInicio === 1
        ? $inicioMes->modify("last day of this month")
        : $mesSiguiente->setDate(
            (int) $mesSiguiente->format("Y"),
            (int) $mesSiguiente->format("n"),
            $diaInicio - 1
        );

    return [
        "periodo_inicio" => $inicio->format("Y-m-d"),
        "periodo_fin" => $fin->format("Y-m-d"),
    ];
}

function fechaVencimientoCiclo(string $fechaEmision, int $diasVencimiento): string
{
    $zona = new DateTimeZone("America/Bogota");
    $emision = DateTimeImmutable::createFromFormat("!Y-m-d", $fechaEmision, $zona);
    $errores = DateTimeImmutable::getLastErrors();
    if (!$emision
        || ($errores !== false && ($errores["warning_count"] > 0 || $errores["error_count"] > 0))
        || $emision->format("Y-m-d") !== $fechaEmision
        || $diasVencimiento < 1) {
        throw new InvalidArgumentException("La fecha de emisión o el plazo de vencimiento no es válido");
    }

    return $emision->modify("+{$diasVencimiento} days")->format("Y-m-d");
}

function calcularServicioFactura(
    string $fechaActivacion,
    string $inicioPeriodo,
    string $finPeriodo,
    int $prorratear,
    float $precio
): ?array {
    if (!in_array($prorratear, [0, 1], true)) {
        throw new InvalidArgumentException("La configuración de prorrateo no es válida");
    }

    if ($fechaActivacion > $finPeriodo) {
        return null;
    }

    $zona = new DateTimeZone("America/Bogota");
    $inicioCiclo = new DateTimeImmutable($inicioPeriodo, $zona);
    $finCiclo = new DateTimeImmutable($finPeriodo, $zona);
    $diasPeriodo = (int) $inicioCiclo->diff($finCiclo)->days + 1;
    $esProrrateada = $prorratear === 1 && $fechaActivacion > $inicioPeriodo;
    $inicioServicio = $esProrrateada ? $fechaActivacion : $inicioPeriodo;
    $inicioCobro = new DateTimeImmutable($inicioServicio, $zona);
    $diasFacturados = $esProrrateada
        ? (int) $inicioCobro->diff($finCiclo)->days + 1
        : $diasPeriodo;
    $total = !$esProrrateada
        ? round($precio, 2)
        : round(($precio / $diasPeriodo) * $diasFacturados);

    return [
        "fecha_servicio_inicio" => $inicioServicio,
        "fecha_servicio_fin" => $finPeriodo,
        "es_prorrateada" => $esProrrateada ? 1 : 0,
        "dias_totales" => $diasPeriodo,
        "dias_facturados" => $diasFacturados,
        "total" => $total,
    ];
}

function obtenerOCrearPeriodo(
    PDO $pdo,
    int $idCiclo,
    int $anio,
    int $mes,
    ?string $fechaEmision = null
): array {
    $iniciarTransaccion = !$pdo->inTransaction();
    if ($iniciarTransaccion) {
        $pdo->beginTransaction();
    }

    try {
        $bloqueo = $pdo->query("SELECT id FROM periodo_solapamiento_guard WHERE id = 1 FOR UPDATE");
        if (!$bloqueo->fetchColumn()) {
            throw new RuntimeException("No está instalada la protección de períodos de facturación");
        }

        $cicloStmt = $pdo->prepare(
            "SELECT id_ciclo, dia_inicio, dias_vencimiento, estado
             FROM ciclo_facturacion
             WHERE id_ciclo = :id_ciclo
             FOR UPDATE"
        );
        $cicloStmt->execute([":id_ciclo" => $idCiclo]);
        $ciclo = $cicloStmt->fetch();
        if (!$ciclo || $ciclo["estado"] !== "ACTIVO") {
            throw new DomainException("Selecciona un ciclo de facturación activo");
        }

        $fechas = calcularFechasPeriodoCiclo((int) $ciclo["dia_inicio"], $anio, $mes);
        $periodoStmt = $pdo->prepare(
            "SELECT id_periodo, id_ciclo, anio, mes, fecha_inicio, fecha_fin, fecha_vencimiento, estado
             FROM periodo_facturacion
             WHERE id_ciclo = :id_ciclo AND anio = :anio AND mes = :mes
             FOR UPDATE"
        );
        $periodoStmt->execute([
            ":id_ciclo" => $idCiclo,
            ":anio" => $anio,
            ":mes" => $mes,
        ]);
        $periodo = $periodoStmt->fetch();

        if ($periodo) {
            if ($periodo["fecha_inicio"] !== $fechas["periodo_inicio"]
                || $periodo["fecha_fin"] !== $fechas["periodo_fin"]) {
                throw new RuntimeException(
                    "La regla cambió después de generar este período; no se puede alterar un período existente"
                );
            }
            if ($iniciarTransaccion) {
                $pdo->commit();
            }
            $periodo["dias_vencimiento"] = (int) $ciclo["dias_vencimiento"];
            return $periodo;
        }

        $solapado = $pdo->prepare(
            "SELECT id_periodo
             FROM periodo_facturacion
             WHERE id_ciclo = :id_ciclo
               AND fecha_inicio <= :fecha_fin
               AND fecha_fin >= :fecha_inicio
             LIMIT 1
             FOR UPDATE"
        );
        $solapado->execute([
            ":id_ciclo" => $idCiclo,
            ":fecha_inicio" => $fechas["periodo_inicio"],
            ":fecha_fin" => $fechas["periodo_fin"],
        ]);
        if ($solapado->fetchColumn()) {
            throw new DomainException("El período se solapa con otro período del mismo ciclo");
        }

        $fechaEmision = $fechaEmision ?? (new DateTimeImmutable(
            "today",
            new DateTimeZone("America/Bogota")
        ))->format("Y-m-d");
        $vencimiento = fechaVencimientoCiclo($fechaEmision, (int) $ciclo["dias_vencimiento"]);
        $insertar = $pdo->prepare(
            "INSERT INTO periodo_facturacion
                (id_ciclo, anio, mes, fecha_inicio, fecha_fin, fecha_vencimiento, estado)
             VALUES
                (:id_ciclo, :anio, :mes, :fecha_inicio, :fecha_fin, :fecha_vencimiento, 'ABIERTO')"
        );
        $insertar->execute([
            ":id_ciclo" => $idCiclo,
            ":anio" => $anio,
            ":mes" => $mes,
            ":fecha_inicio" => $fechas["periodo_inicio"],
            ":fecha_fin" => $fechas["periodo_fin"],
            ":fecha_vencimiento" => $vencimiento,
        ]);
        $periodo = [
            "id_periodo" => (string) $pdo->lastInsertId(),
            "id_ciclo" => $idCiclo,
            "anio" => $anio,
            "mes" => $mes,
            "fecha_inicio" => $fechas["periodo_inicio"],
            "fecha_fin" => $fechas["periodo_fin"],
            "fecha_vencimiento" => $vencimiento,
            "estado" => "ABIERTO",
            "dias_vencimiento" => (int) $ciclo["dias_vencimiento"],
        ];

        if ($iniciarTransaccion) {
            $pdo->commit();
        }
        return $periodo;
    } catch (Throwable $exception) {
        if ($iniciarTransaccion && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $exception;
    }
}
