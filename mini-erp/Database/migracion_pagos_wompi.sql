USE global_conexit;

CREATE TABLE IF NOT EXISTS intento_pago_wompi (
    id_intento BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_factura INT UNSIGNED NOT NULL,
    referencia VARCHAR(100) NOT NULL,
    wompi_transaction_id VARCHAR(100) NULL,
    amount_in_cents BIGINT UNSIGNED NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'COP',
    estado ENUM(
        'PENDING',
        'APPROVED',
        'DECLINED',
        'ERROR',
        'VOIDED',
        'APPROVED_REVIEW'
    ) NOT NULL DEFAULT 'PENDING',
    id_pago INT UNSIGNED NULL,
    expires_at DATETIME NOT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uq_intento_pago_wompi_referencia
        UNIQUE (referencia),
    CONSTRAINT uq_intento_pago_wompi_transaction
        UNIQUE (wompi_transaction_id),
    CONSTRAINT uq_intento_pago_wompi_pago
        UNIQUE (id_pago),
    CONSTRAINT fk_intento_pago_wompi_factura
        FOREIGN KEY (id_factura)
        REFERENCES factura(id_factura)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT fk_intento_pago_wompi_pago
        FOREIGN KEY (id_pago)
        REFERENCES pago(id_pago)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
    CONSTRAINT chk_intento_pago_wompi_amount
        CHECK (amount_in_cents > 0 AND currency = 'COP'),
    INDEX idx_intento_pago_wompi_factura_estado (id_factura, estado)
) ENGINE=InnoDB;
