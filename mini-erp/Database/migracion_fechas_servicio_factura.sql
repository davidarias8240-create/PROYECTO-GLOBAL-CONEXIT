-- Guarda en cada factura el intervalo real cobrado, separado del período técnico del ciclo.
-- Los registros existentes conservan como intervalo cobrado las fechas de su período actual.

ALTER TABLE factura
    ADD COLUMN fecha_servicio_inicio DATE NULL AFTER id_periodo,
    ADD COLUMN fecha_servicio_fin DATE NULL AFTER fecha_servicio_inicio;

UPDATE factura f
INNER JOIN periodo_facturacion p ON p.id_periodo = f.id_periodo
SET f.fecha_servicio_inicio = p.fecha_inicio,
    f.fecha_servicio_fin = p.fecha_fin;

ALTER TABLE factura
    MODIFY COLUMN fecha_servicio_inicio DATE NOT NULL,
    MODIFY COLUMN fecha_servicio_fin DATE NOT NULL,
    ADD CONSTRAINT chk_factura_fechas_servicio
        CHECK (fecha_servicio_fin >= fecha_servicio_inicio);

DELIMITER $$

CREATE TRIGGER factura_bi_validar_fechas_servicio
BEFORE INSERT ON factura
FOR EACH ROW
BEGIN
    DECLARE v_inicio DATE;
    DECLARE v_fin DATE;

    SELECT fecha_inicio, fecha_fin INTO v_inicio, v_fin
    FROM periodo_facturacion
    WHERE id_periodo = NEW.id_periodo;

    IF v_inicio IS NULL OR v_fin IS NULL
        OR NEW.fecha_servicio_inicio < v_inicio
        OR NEW.fecha_servicio_fin > v_fin
        OR NEW.fecha_servicio_fin < NEW.fecha_servicio_inicio THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Las fechas de servicio de la factura deben estar dentro del período';
    END IF;
END$$

CREATE TRIGGER factura_bu_validar_fechas_servicio
BEFORE UPDATE ON factura
FOR EACH ROW
BEGIN
    DECLARE v_inicio DATE;
    DECLARE v_fin DATE;

    SELECT fecha_inicio, fecha_fin INTO v_inicio, v_fin
    FROM periodo_facturacion
    WHERE id_periodo = NEW.id_periodo;

    IF v_inicio IS NULL OR v_fin IS NULL
        OR NEW.fecha_servicio_inicio < v_inicio
        OR NEW.fecha_servicio_fin > v_fin
        OR NEW.fecha_servicio_fin < NEW.fecha_servicio_inicio THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Las fechas de servicio de la factura deben estar dentro del período';
    END IF;
END$$

DELIMITER ;
