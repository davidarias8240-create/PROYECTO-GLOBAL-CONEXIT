-- Conserva los períodos históricos existentes; sus nuevos campos quedan NULL.
-- Todo período nuevo debe identificar un ciclo, año y mes (validado por trigger).

CREATE TABLE ciclo_facturacion (
    id_ciclo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    dia_inicio TINYINT UNSIGNED NOT NULL DEFAULT 1,
    dias_vencimiento SMALLINT UNSIGNED NOT NULL DEFAULT 10,
    prorratear_primer_mes TINYINT(1) NOT NULL DEFAULT 1,
    estado ENUM('ACTIVO', 'INACTIVO') NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_ciclo_dia_inicio CHECK (dia_inicio BETWEEN 1 AND 28),
    CONSTRAINT chk_ciclo_dias_vencimiento CHECK (dias_vencimiento >= 1)
) ENGINE=InnoDB;

CREATE TABLE periodo_solapamiento_guard (
    id TINYINT UNSIGNED PRIMARY KEY
) ENGINE=InnoDB;

INSERT INTO periodo_solapamiento_guard (id) VALUES (1);

SET @drop_vencimiento = (
    SELECT IF(
        COUNT(*) > 0,
        'ALTER TABLE periodo_facturacion DROP CHECK chk_periodo_vencimiento',
        'DO 0'
    )
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'periodo_facturacion'
      AND CONSTRAINT_NAME = 'chk_periodo_vencimiento'
      AND CONSTRAINT_TYPE = 'CHECK'
);
PREPARE drop_vencimiento_stmt FROM @drop_vencimiento;
EXECUTE drop_vencimiento_stmt;
DEALLOCATE PREPARE drop_vencimiento_stmt;

ALTER TABLE periodo_facturacion
    ADD COLUMN id_ciclo INT UNSIGNED NULL AFTER id_periodo,
    ADD COLUMN anio SMALLINT UNSIGNED NULL AFTER id_ciclo,
    ADD COLUMN mes TINYINT UNSIGNED NULL AFTER anio,
    ADD CONSTRAINT uq_periodo_ciclo_anio_mes UNIQUE (id_ciclo, anio, mes),
    ADD CONSTRAINT fk_periodo_ciclo
        FOREIGN KEY (id_ciclo)
        REFERENCES ciclo_facturacion(id_ciclo)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    ADD CONSTRAINT chk_periodo_mes CHECK (mes BETWEEN 1 AND 12),
    ADD INDEX idx_periodo_ciclo_fechas (id_ciclo, fecha_inicio, fecha_fin);

DELIMITER $$

CREATE TRIGGER periodo_facturacion_bi
BEFORE INSERT ON periodo_facturacion
FOR EACH ROW
BEGIN
    DECLARE v_dia_inicio TINYINT UNSIGNED;
    DECLARE v_estado VARCHAR(10);
    DECLARE v_inicio DATE;
    DECLARE v_fin DATE;
    DECLARE v_guard TINYINT UNSIGNED;
    DECLARE v_solapados INT DEFAULT 0;

    IF NEW.id_ciclo IS NULL OR NEW.anio IS NULL OR NEW.mes IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Los períodos nuevos requieren ciclo, año y mes';
    END IF;

    SELECT id INTO v_guard
    FROM periodo_solapamiento_guard
    WHERE id = 1
    FOR UPDATE;

    SELECT dia_inicio, estado INTO v_dia_inicio, v_estado
    FROM ciclo_facturacion
    WHERE id_ciclo = NEW.id_ciclo;

    IF v_estado <> 'ACTIVO' OR NEW.anio < 1000 OR NEW.anio > 9999
        OR NEW.mes < 1 OR NEW.mes > 12 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'El ciclo, año o mes del período no es válido';
    END IF;

    SET v_inicio = STR_TO_DATE(
        CONCAT(NEW.anio, '-', LPAD(NEW.mes, 2, '0'), '-', LPAD(v_dia_inicio, 2, '0')),
        '%Y-%m-%d'
    );
    SET v_fin = IF(
        v_dia_inicio = 1,
        LAST_DAY(v_inicio),
        DATE_SUB(DATE_ADD(v_inicio, INTERVAL 1 MONTH), INTERVAL 1 DAY)
    );

    IF v_inicio IS NULL OR v_fin IS NULL
        OR NEW.fecha_inicio <> v_inicio OR NEW.fecha_fin <> v_fin THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Las fechas del periodo no corresponden a su ciclo';
    END IF;

    SELECT COUNT(*) INTO v_solapados
    FROM periodo_facturacion p
    WHERE p.id_ciclo = NEW.id_ciclo
      AND p.fecha_inicio <= NEW.fecha_fin
      AND p.fecha_fin >= NEW.fecha_inicio;
    IF v_solapados > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'El periodo se solapa con otro del mismo ciclo';
    END IF;
END$$

CREATE TRIGGER periodo_facturacion_bu
BEFORE UPDATE ON periodo_facturacion
FOR EACH ROW
BEGIN
    DECLARE v_dia_inicio TINYINT UNSIGNED;
    DECLARE v_estado VARCHAR(10);
    DECLARE v_inicio DATE;
    DECLARE v_fin DATE;
    DECLARE v_guard TINYINT UNSIGNED;
    DECLARE v_solapados INT DEFAULT 0;

    IF NEW.id_ciclo IS NULL OR NEW.anio IS NULL OR NEW.mes IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Los períodos nuevos requieren ciclo, año y mes';
    END IF;

    SELECT id INTO v_guard
    FROM periodo_solapamiento_guard
    WHERE id = 1
    FOR UPDATE;

    SELECT dia_inicio, estado INTO v_dia_inicio, v_estado
    FROM ciclo_facturacion
    WHERE id_ciclo = NEW.id_ciclo;

    IF v_estado <> 'ACTIVO' OR NEW.anio < 1000 OR NEW.anio > 9999
        OR NEW.mes < 1 OR NEW.mes > 12 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'El ciclo, año o mes del período no es válido';
    END IF;

    SET v_inicio = STR_TO_DATE(
        CONCAT(NEW.anio, '-', LPAD(NEW.mes, 2, '0'), '-', LPAD(v_dia_inicio, 2, '0')),
        '%Y-%m-%d'
    );
    SET v_fin = IF(
        v_dia_inicio = 1,
        LAST_DAY(v_inicio),
        DATE_SUB(DATE_ADD(v_inicio, INTERVAL 1 MONTH), INTERVAL 1 DAY)
    );

    IF v_inicio IS NULL OR v_fin IS NULL
        OR NEW.fecha_inicio <> v_inicio OR NEW.fecha_fin <> v_fin THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Las fechas del periodo no corresponden a su ciclo';
    END IF;

    SELECT COUNT(*) INTO v_solapados
    FROM periodo_facturacion p
    WHERE p.id_ciclo = NEW.id_ciclo
      AND p.id_periodo <> NEW.id_periodo
      AND p.fecha_inicio <= NEW.fecha_fin
      AND p.fecha_fin >= NEW.fecha_inicio;
    IF v_solapados > 0 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'El periodo se solapa con otro del mismo ciclo';
    END IF;
END$$

CREATE TRIGGER factura_bi_sin_solapamiento
BEFORE INSERT ON factura
FOR EACH ROW
BEGIN
    DECLARE v_guard TINYINT UNSIGNED;
    DECLARE v_solapadas INT DEFAULT 0;
    DECLARE v_inicio DATE;
    DECLARE v_fin DATE;

    IF NEW.estado <> 'ANULADA' THEN
        SELECT id INTO v_guard
        FROM periodo_solapamiento_guard
        WHERE id = 1
        FOR UPDATE;

        SELECT fecha_inicio, fecha_fin INTO v_inicio, v_fin
        FROM periodo_facturacion
        WHERE id_periodo = NEW.id_periodo;

        SELECT COUNT(*) INTO v_solapadas
        FROM factura f
        INNER JOIN periodo_facturacion p ON p.id_periodo = f.id_periodo
        WHERE f.id_contrato = NEW.id_contrato
          AND f.estado <> 'ANULADA'
          AND p.fecha_inicio <= v_fin
          AND p.fecha_fin >= v_inicio;
        IF v_solapadas > 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'El contrato ya tiene una factura para días solapados';
        END IF;
    END IF;
END$$

CREATE TRIGGER factura_bu_sin_solapamiento
BEFORE UPDATE ON factura
FOR EACH ROW
BEGIN
    DECLARE v_guard TINYINT UNSIGNED;
    DECLARE v_solapadas INT DEFAULT 0;
    DECLARE v_inicio DATE;
    DECLARE v_fin DATE;

    IF NEW.estado <> 'ANULADA' THEN
        SELECT id INTO v_guard
        FROM periodo_solapamiento_guard
        WHERE id = 1
        FOR UPDATE;

        SELECT fecha_inicio, fecha_fin INTO v_inicio, v_fin
        FROM periodo_facturacion
        WHERE id_periodo = NEW.id_periodo;

        SELECT COUNT(*) INTO v_solapadas
        FROM factura f
        INNER JOIN periodo_facturacion p ON p.id_periodo = f.id_periodo
        WHERE f.id_contrato = NEW.id_contrato
          AND f.id_factura <> NEW.id_factura
          AND f.estado <> 'ANULADA'
          AND p.fecha_inicio <= v_fin
          AND p.fecha_fin >= v_inicio;
        IF v_solapadas > 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'El contrato ya tiene una factura para días solapados';
        END IF;
    END IF;
END$$

DELIMITER ;
