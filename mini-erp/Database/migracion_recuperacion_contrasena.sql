USE u567671800_global_conexit;

CREATE TABLE IF NOT EXISTS recuperacion_contrasena (
    id_recuperacion BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT UNSIGNED NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    creado_en DATETIME NOT NULL,
    expira_en DATETIME NOT NULL,
    usado_en DATETIME NULL,
    UNIQUE KEY uq_recuperacion_contrasena_usuario (id_usuario),
    UNIQUE KEY uq_recuperacion_contrasena_token (token_hash),
    KEY idx_recuperacion_contrasena_expira (expira_en),
    CONSTRAINT fk_recuperacion_contrasena_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario)
        ON UPDATE CASCADE
        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recuperacion_contrasena_limite (
    ip_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    ventana_inicio DATETIME NOT NULL,
    intentos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    KEY idx_recuperacion_contrasena_limite_ventana (ventana_inicio)
) ENGINE=InnoDB;
