USE global_conexit;

-- Asegura una sola factura por contrato y período, sin borrar ni modificar facturas.
-- Si ya existen duplicados, MariaDB rechaza la restricción y requiere revisión manual.
SET @tiene_indice_contrato = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'factura'
      AND INDEX_NAME = 'idx_factura_contrato'
);

SET @sql_indice_contrato = IF(
    @tiene_indice_contrato = 0,
    'ALTER TABLE factura ADD INDEX idx_factura_contrato (id_contrato)',
    'SELECT 1'
);
PREPARE sentencia_indice_contrato FROM @sql_indice_contrato;
EXECUTE sentencia_indice_contrato;
DEALLOCATE PREPARE sentencia_indice_contrato;

SET @tiene_indice_unico = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'factura'
      AND INDEX_NAME = 'uq_factura_contrato_periodo'
);

SET @sql_indice_unico = IF(
    @tiene_indice_unico > 0,
    'SELECT 1',
    'ALTER TABLE factura ADD CONSTRAINT uq_factura_contrato_periodo UNIQUE (id_contrato, id_periodo)'
);
PREPARE sentencia_indice_unico FROM @sql_indice_unico;
EXECUTE sentencia_indice_unico;
DEALLOCATE PREPARE sentencia_indice_unico;
