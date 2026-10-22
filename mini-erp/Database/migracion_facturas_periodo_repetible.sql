USE global_conexit;

-- Reemplaza el índice único contrato-período por uno no único.
-- Así se admiten facturas repetidas y se conserva el índice que usa la clave foránea.
-- Las comprobaciones permiten ejecutar este archivo aunque la migración ya se haya aplicado.
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
    'ALTER TABLE factura DROP INDEX uq_factura_contrato_periodo',
    'SELECT 1'
);
PREPARE sentencia_indice_unico FROM @sql_indice_unico;
EXECUTE sentencia_indice_unico;
DEALLOCATE PREPARE sentencia_indice_unico;
