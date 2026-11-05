USE global_conexit;

SET @tiene_columna_idempotencia = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pago'
      AND COLUMN_NAME = 'idempotencia_key'
);

SET @sql_columna_idempotencia = IF(
    @tiene_columna_idempotencia = 0,
    'ALTER TABLE pago ADD COLUMN idempotencia_key CHAR(36) NULL',
    'SELECT 1'
);
PREPARE sentencia_columna_idempotencia FROM @sql_columna_idempotencia;
EXECUTE sentencia_columna_idempotencia;
DEALLOCATE PREPARE sentencia_columna_idempotencia;

SET @tiene_indice_idempotencia = (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'pago'
      AND INDEX_NAME = 'uq_pago_idempotencia_key'
);

SET @sql_indice_idempotencia = IF(
    @tiene_indice_idempotencia = 0,
    'ALTER TABLE pago ADD UNIQUE INDEX uq_pago_idempotencia_key (idempotencia_key)',
    'SELECT 1'
);
PREPARE sentencia_indice_idempotencia FROM @sql_indice_idempotencia;
EXECUTE sentencia_indice_idempotencia;
DEALLOCATE PREPARE sentencia_indice_idempotencia;
