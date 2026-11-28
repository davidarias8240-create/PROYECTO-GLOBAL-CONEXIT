<?php

function descripcionFactura(string $nombrePlan, array $servicio): string
{
    $zona = new DateTimeZone("America/Bogota");
    $inicio = (new DateTimeImmutable($servicio["fecha_servicio_inicio"], $zona))->format("d/m/Y");
    $fin = (new DateTimeImmutable($servicio["fecha_servicio_fin"], $zona))->format("d/m/Y");
    $tipo = (int) $servicio["es_prorrateada"] === 1 ? "Prorrateo" : "Servicio";

    return sprintf(
        "%s - %s del %s al %s (%d %s)",
        $nombrePlan,
        $tipo,
        $inicio,
        $fin,
        (int) $servicio["dias_facturados"],
        (int) $servicio["dias_facturados"] === 1 ? "día" : "días"
    );
}

function generarNumeroFactura(PDO $pdo, string $idContrato, string $fechaInicioPeriodo): string
{
    $base = "AUTO-{$idContrato}-" . str_replace("-", "", $fechaInicioPeriodo);
    $numero = $base;
    $sufijo = 1;
    $consulta = $pdo->prepare("SELECT 1 FROM factura WHERE numero = :numero LIMIT 1");

    do {
        $consulta->execute([":numero" => $numero]);
        if (!$consulta->fetchColumn()) {
            return $numero;
        }
        $sufijo++;
        $numero = $base . "-" . $sufijo;
    } while (true);
}
