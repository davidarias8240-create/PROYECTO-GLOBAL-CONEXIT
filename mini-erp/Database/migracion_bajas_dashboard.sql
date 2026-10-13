USE global_conexit;

CREATE TABLE IF NOT EXISTS admin_bajas (
    entidad VARCHAR(40) NOT NULL,
    id_registro VARCHAR(30) NOT NULL,
    estado_anterior VARCHAR(30) NOT NULL DEFAULT '',
    fecha_baja DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_usuario_admin INT UNSIGNED NOT NULL,

    PRIMARY KEY (entidad, id_registro),
    INDEX idx_admin_bajas_usuario (id_usuario_admin),

    CONSTRAINT fk_admin_bajas_usuario
        FOREIGN KEY (id_usuario_admin)
        REFERENCES usuario(id_usuario)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;