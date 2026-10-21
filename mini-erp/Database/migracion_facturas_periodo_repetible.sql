USE global_conexit;

-- Permite registrar más de una factura para el mismo contrato y período.
-- Ejecutar una sola vez en instalaciones que ya tengan la restricción anterior.
ALTER TABLE factura
    DROP INDEX uq_factura_contrato_periodo;
