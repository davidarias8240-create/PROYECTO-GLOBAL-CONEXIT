-- Guarda el prorrateo y el concepto mostrado en la factura.
-- Requiere migracion_fechas_servicio_factura.sql aplicada previamente.

ALTER TABLE factura
    ADD COLUMN es_prorrateada TINYINT(1) NULL AFTER fecha_servicio_fin,
    ADD COLUMN dias_facturados SMALLINT UNSIGNED NULL AFTER es_prorrateada,
    ADD COLUMN descripcion VARCHAR(255) NULL AFTER dias_facturados;

UPDATE factura f
INNER JOIN periodo_facturacion pf ON pf.id_periodo = f.id_periodo
INNER JOIN contrato co ON co.id_contrato = f.id_contrato
INNER JOIN plan pl ON pl.id_plan = co.id_plan
LEFT JOIN ciclo_facturacion c ON c.id_ciclo = pf.id_ciclo
SET f.es_prorrateada = IF(
        COALESCE(c.prorratear_primer_mes, 0) = 1
            AND co.fecha_inicio > pf.fecha_inicio
            AND co.fecha_inicio <= pf.fecha_fin,
        1,
        0
    ),
    f.fecha_servicio_inicio = IF(
        COALESCE(c.prorratear_primer_mes, 0) = 1
            AND co.fecha_inicio > pf.fecha_inicio
            AND co.fecha_inicio <= pf.fecha_fin,
        co.fecha_inicio,
        pf.fecha_inicio
    ),
    f.fecha_servicio_fin = pf.fecha_fin,
    f.dias_facturados = DATEDIFF(
        pf.fecha_fin,
        IF(
            COALESCE(c.prorratear_primer_mes, 0) = 1
                AND co.fecha_inicio > pf.fecha_inicio
                AND co.fecha_inicio <= pf.fecha_fin,
            co.fecha_inicio,
            pf.fecha_inicio
        )
    ) + 1,
    f.descripcion = IF(
        COALESCE(c.prorratear_primer_mes, 0) = 1
            AND co.fecha_inicio > pf.fecha_inicio
            AND co.fecha_inicio <= pf.fecha_fin,
        CONCAT(
            pl.nombre,
            ' - Prorrateo del ',
            DATE_FORMAT(co.fecha_inicio, '%d/%m/%Y'),
            ' al ',
            DATE_FORMAT(pf.fecha_fin, '%d/%m/%Y'),
            ' (',
            DATEDIFF(pf.fecha_fin, co.fecha_inicio) + 1,
            IF(
                DATEDIFF(pf.fecha_fin, co.fecha_inicio) = 0,
                CONVERT(0x2064C3AD6129 USING utf8mb4),
                CONVERT(0x2064C3AD617329 USING utf8mb4)
            )
        ),
        CONCAT(
            pl.nombre,
            ' - Servicio del ',
            DATE_FORMAT(pf.fecha_inicio, '%d/%m/%Y'),
            ' al ',
            DATE_FORMAT(pf.fecha_fin, '%d/%m/%Y'),
            ' (',
            DATEDIFF(pf.fecha_fin, pf.fecha_inicio) + 1,
            IF(
                DATEDIFF(pf.fecha_fin, pf.fecha_inicio) = 0,
                CONVERT(0x2064C3AD6129 USING utf8mb4),
                CONVERT(0x2064C3AD617329 USING utf8mb4)
            )
        )
    );

ALTER TABLE factura
    MODIFY COLUMN es_prorrateada TINYINT(1) NOT NULL DEFAULT 0,
    MODIFY COLUMN dias_facturados SMALLINT UNSIGNED NOT NULL,
    MODIFY COLUMN descripcion VARCHAR(255) NOT NULL,
    ADD CONSTRAINT chk_factura_es_prorrateada CHECK (es_prorrateada IN (0, 1)),
    ADD CONSTRAINT chk_factura_dias_facturados CHECK (dias_facturados >= 1),
    ADD CONSTRAINT uq_factura_contrato_periodo UNIQUE (id_contrato, id_periodo);
