

CREATE DATABASE IF NOT EXISTS global_conexit
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE global_conexit;




CREATE TABLE rol (
    id_rol INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE,
    descripcion VARCHAR(255),
    estado ENUM('ACTIVO','INACTIVO') NOT NULL DEFAULT 'ACTIVO'
) ENGINE=InnoDB;



CREATE TABLE usuario (
    id_usuario INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_rol INT UNSIGNED NOT NULL,
    correo VARCHAR(150) NOT NULL UNIQUE,
    contrasena_hash VARCHAR(255) NOT NULL,
    estado ENUM('ACTIVO','INACTIVO','BLOQUEADO') NOT NULL DEFAULT 'ACTIVO',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_acceso DATETIME NULL,

    CONSTRAINT fk_usuario_rol
        FOREIGN KEY (id_rol)
        REFERENCES rol(id_rol)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;



CREATE TABLE cliente (
    id_cliente INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT UNSIGNED NULL UNIQUE,
    numero_cliente VARCHAR(30) NOT NULL UNIQUE,
    tipo_documento ENUM(
        'CC',
        'CE',
        'NIT',
        'TI',
        'PASAPORTE',
        'OTRO'
    ) NOT NULL,
    numero_documento VARCHAR(30) NOT NULL UNIQUE,
    nombres VARCHAR(120) NOT NULL,
    telefono VARCHAR(30),
    correo VARCHAR(150),
    estado ENUM(
        'ACTIVO',
        'INACTIVO',
        'SUSPENDIDO'
    ) NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT fk_cliente_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB;




CREATE TABLE direccion (
    id_direccion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_cliente INT UNSIGNED NOT NULL,
    direccion VARCHAR(255) NOT NULL,
    ciudad VARCHAR(100) NOT NULL,
    departamento VARCHAR(100) NOT NULL,
    referencia VARCHAR(255),
    estado ENUM(
        'ACTIVA',
        'INACTIVA'
    ) NOT NULL DEFAULT 'ACTIVA',

    CONSTRAINT fk_direccion_cliente
        FOREIGN KEY (id_cliente)
        REFERENCES cliente(id_cliente)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;




CREATE TABLE plan (
    id_plan INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    velocidad VARCHAR(50) NOT NULL,
    precio DECIMAL(12,2) NOT NULL,
    descripcion TEXT,
    vigencia_inicio DATE NOT NULL,
    vigencia_fin DATE NULL,
    estado ENUM(
        'ACTIVO',
        'INACTIVO'
    ) NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT chk_plan_precio
        CHECK (precio >= 0),

    CONSTRAINT chk_plan_vigencia
        CHECK (
            vigencia_fin IS NULL
            OR vigencia_fin >= vigencia_inicio
        )
) ENGINE=InnoDB;




CREATE TABLE contrato (
    id_contrato INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_cliente INT UNSIGNED NOT NULL,
    id_direccion INT UNSIGNED NOT NULL,
    id_plan INT UNSIGNED NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NULL,
    estado ENUM(
        'ACTIVO',
        'SUSPENDIDO',
        'CANCELADO',
        'FINALIZADO'
    ) NOT NULL DEFAULT 'ACTIVO',
    motivo_estado VARCHAR(255),

    CONSTRAINT fk_contrato_cliente
        FOREIGN KEY (id_cliente)
        REFERENCES cliente(id_cliente)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_contrato_direccion
        FOREIGN KEY (id_direccion)
        REFERENCES direccion(id_direccion)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_contrato_plan
        FOREIGN KEY (id_plan)
        REFERENCES plan(id_plan)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_contrato_fechas
        CHECK (
            fecha_fin IS NULL
            OR fecha_fin >= fecha_inicio
        )
) ENGINE=InnoDB;




CREATE TABLE periodo_facturacion (
    id_periodo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    estado ENUM(
        'ABIERTO',
        'CERRADO'
    ) NOT NULL DEFAULT 'ABIERTO',

    CONSTRAINT chk_periodo_fechas
        CHECK (fecha_fin >= fecha_inicio),

    CONSTRAINT chk_periodo_vencimiento
        CHECK (fecha_vencimiento >= fecha_fin)
) ENGINE=InnoDB;



CREATE TABLE factura (
    id_factura INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_contrato INT UNSIGNED NOT NULL,
    id_periodo INT UNSIGNED NOT NULL,
    numero VARCHAR(50) NOT NULL UNIQUE,
    fecha_emision DATE NOT NULL,
    fecha_vencimiento DATE NOT NULL,
    total DECIMAL(12,2) NOT NULL,
    saldo DECIMAL(12,2) NOT NULL,
    estado ENUM(
        'PENDIENTE',
        'PAGADA',
        'VENCIDA',
        'ANULADA'
    ) NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT fk_factura_contrato
        FOREIGN KEY (id_contrato)
        REFERENCES contrato(id_contrato)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_factura_periodo
        FOREIGN KEY (id_periodo)
        REFERENCES periodo_facturacion(id_periodo)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT uq_factura_contrato_periodo
        UNIQUE (id_contrato, id_periodo),

    CONSTRAINT chk_factura_total
        CHECK (total >= 0),

    CONSTRAINT chk_factura_saldo
        CHECK (
            saldo >= 0
            AND saldo <= total
        ),

    CONSTRAINT chk_factura_fechas
        CHECK (fecha_vencimiento >= fecha_emision)
) ENGINE=InnoDB;




CREATE TABLE pago (
    id_pago INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_factura INT UNSIGNED NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valor DECIMAL(12,2) NOT NULL,
    medio ENUM(
        'EFECTIVO',
        'TRANSFERENCIA',
        'PSE',
        'TARJETA',
        'CONSIGNACION',
        'OTRO'
    ) NOT NULL,
    referencia VARCHAR(100),
    estado ENUM(
        'REGISTRADO',
        'ANULADO',
        'REVERSADO'
    ) NOT NULL DEFAULT 'REGISTRADO',
    motivo_anulacion VARCHAR(255),

    CONSTRAINT fk_pago_factura
        FOREIGN KEY (id_factura)
        REFERENCES factura(id_factura)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_pago_valor
        CHECK (valor > 0)
) ENGINE=InnoDB;




CREATE TABLE ajuste_factura (
    id_ajuste INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_factura INT UNSIGNED NOT NULL,
    id_usuario INT UNSIGNED NOT NULL,
    tipo ENUM(
        'CARGO',
        'DESCUENTO',
        'AUMENTO',
        'DISMINUCION'
    ) NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    valor DECIMAL(12,2) NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    autorizado BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_ajuste_factura
        FOREIGN KEY (id_factura)
        REFERENCES factura(id_factura)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_ajuste_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_ajuste_valor
        CHECK (valor > 0)
) ENGINE=InnoDB;




CREATE TABLE ticket (
    id_ticket INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_cliente INT UNSIGNED NOT NULL,
    id_usuario_responsable INT UNSIGNED NULL,
    asunto VARCHAR(200) NOT NULL,
    descripcion TEXT NOT NULL,
    prioridad ENUM(
        'BAJA',
        'MEDIA',
        'ALTA',
        'URGENTE'
    ) NOT NULL DEFAULT 'MEDIA',
    estado ENUM(
        'ABIERTO',
        'EN_PROCESO',
        'PENDIENTE',
        'CERRADO'
    ) NOT NULL DEFAULT 'ABIERTO',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre DATETIME NULL,

    CONSTRAINT fk_ticket_cliente
        FOREIGN KEY (id_cliente)
        REFERENCES cliente(id_cliente)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_ticket_usuario
        FOREIGN KEY (id_usuario_responsable)
        REFERENCES usuario(id_usuario)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_ticket_cierre
        CHECK (
            fecha_cierre IS NULL
            OR fecha_cierre >= fecha_creacion
        )
) ENGINE=InnoDB;




CREATE TABLE interaccion (
    id_interaccion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_ticket INT UNSIGNED NOT NULL,
    id_usuario INT UNSIGNED NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    canal ENUM(
        'TELEFONO',
        'CORREO',
        'WHATSAPP',
        'CHAT',
        'PRESENCIAL',
        'OTRO'
    ) NOT NULL,
    razon VARCHAR(200) NOT NULL,
    descripcion TEXT NOT NULL,
    accion_pendiente VARCHAR(255),

    CONSTRAINT fk_interaccion_ticket
        FOREIGN KEY (id_ticket)
        REFERENCES ticket(id_ticket)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_interaccion_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;




CREATE TABLE orden_servicio (
    id_orden INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_contrato INT UNSIGNED NOT NULL,
    id_direccion INT UNSIGNED NOT NULL,
    id_usuario_tecnico INT UNSIGNED NULL,
    tipo ENUM(
        'INSTALACION',
        'REPARACION',
        'TRASLADO',
        'SUSPENSION',
        'RETIRO'
    ) NOT NULL,
    descripcion TEXT,
    prioridad ENUM(
        'BAJA',
        'MEDIA',
        'ALTA',
        'URGENTE'
    ) NOT NULL DEFAULT 'MEDIA',
    estado ENUM(
        'PENDIENTE',
        'PROGRAMADA',
        'EN_PROCESO',
        'REPROGRAMADA',
        'CERRADA',
        'CANCELADA'
    ) NOT NULL DEFAULT 'PENDIENTE',
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_programada DATETIME NULL,
    franja_atencion VARCHAR(100),
    resultado TEXT,
    fecha_cierre DATETIME NULL,
    motivo_reprogramacion VARCHAR(255),

    CONSTRAINT fk_orden_contrato
        FOREIGN KEY (id_contrato)
        REFERENCES contrato(id_contrato)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_orden_direccion
        FOREIGN KEY (id_direccion)
        REFERENCES direccion(id_direccion)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_orden_tecnico
        FOREIGN KEY (id_usuario_tecnico)
        REFERENCES usuario(id_usuario)
        ON UPDATE CASCADE
        ON DELETE SET NULL,

    CONSTRAINT chk_orden_cierre
        CHECK (
            fecha_cierre IS NULL
            OR fecha_cierre >= fecha_creacion
        )
) ENGINE=InnoDB;




CREATE TABLE notificacion (
    id_notificacion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT UNSIGNED NOT NULL,
    asunto VARCHAR(200) NOT NULL,
    mensaje TEXT NOT NULL,
    canal ENUM(
        'CORREO',
        'SMS',
        'WHATSAPP',
        'APP',
        'OTRO'
    ) NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado_entrega ENUM(
        'PENDIENTE',
        'ENVIADA',
        'ENTREGADA',
        'FALLIDA'
    ) NOT NULL DEFAULT 'PENDIENTE',
    fecha_lectura DATETIME NULL,

    CONSTRAINT fk_notificacion_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT chk_notificacion_lectura
        CHECK (
            fecha_lectura IS NULL
            OR fecha_lectura >= fecha
        )
) ENGINE=InnoDB;




CREATE TABLE solicitud_servicio (
    id_solicitud INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_cliente INT UNSIGNED NULL,
    nombre_contacto VARCHAR(120) NOT NULL,
    correo VARCHAR(150) NOT NULL,
    telefono VARCHAR(30),
    tipo_solicitud ENUM(
        'INFORMACION',
        'CONTRATACION',
        'CAMBIO_PLAN',
        'CONTACTO',
        'OTRA'
    ) NOT NULL,
    mensaje TEXT NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado ENUM(
        'PENDIENTE',
        'ATENDIDA',
        'CERRADA',
        'CANCELADA'
    ) NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT fk_solicitud_cliente
        FOREIGN KEY (id_cliente)
        REFERENCES cliente(id_cliente)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB;



CREATE TABLE auditoria (
    id_auditoria BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_usuario INT UNSIGNED NULL,
    entidad VARCHAR(100) NOT NULL,
    id_entidad VARCHAR(50) NOT NULL,
    accion VARCHAR(50) NOT NULL,
    fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motivo VARCHAR(255),
    detalle JSON NULL,

    CONSTRAINT fk_auditoria_usuario
        FOREIGN KEY (id_usuario)
        REFERENCES usuario(id_usuario)
        ON UPDATE CASCADE
        ON DELETE SET NULL
) ENGINE=InnoDB;




CREATE INDEX idx_cliente_nombre
    ON cliente(nombres);

CREATE INDEX idx_cliente_telefono
    ON cliente(telefono);

CREATE INDEX idx_direccion_cliente
    ON direccion(id_cliente);

CREATE INDEX idx_contrato_cliente
    ON contrato(id_cliente);

CREATE INDEX idx_contrato_plan
    ON contrato(id_plan);

CREATE INDEX idx_contrato_estado
    ON contrato(estado);

CREATE INDEX idx_factura_estado
    ON factura(estado);

CREATE INDEX idx_factura_vencimiento
    ON factura(fecha_vencimiento);

CREATE INDEX idx_pago_fecha
    ON pago(fecha);

CREATE INDEX idx_ticket_estado
    ON ticket(estado);

CREATE INDEX idx_orden_estado
    ON orden_servicio(estado);

CREATE INDEX idx_orden_fecha_programada
    ON orden_servicio(fecha_programada);

CREATE INDEX idx_solicitud_estado
    ON solicitud_servicio(estado);

CREATE INDEX idx_auditoria_entidad
    ON auditoria(entidad, id_entidad);




INSERT INTO rol (
    nombre,
    descripcion
) VALUES
(
    'ADMINISTRADOR',
    'Administrador general del sistema'
),
(
    'ASESOR_COMERCIAL',
    'Asesor o usuario del área comercial'
),
(
    'TECNICO',
    'Técnico encargado de órdenes de servicio'
),
(
    'CLIENTE',
    'Cliente de Global Conexit'
),
(
    'VISITANTE',
    'Visitante del portal público'
);




CREATE VIEW vw_facturas_clientes AS
SELECT
    f.id_factura,
    f.numero AS numero_factura,
    c.numero_cliente,
    c.nombres AS cliente,
    c.numero_documento,
    co.id_contrato,
    p.nombre AS plan,
    f.fecha_emision,
    f.fecha_vencimiento,
    f.total,
    f.saldo,
    f.estado
FROM factura f
INNER JOIN contrato co
    ON f.id_contrato = co.id_contrato
INNER JOIN cliente c
    ON co.id_cliente = c.id_cliente
INNER JOIN plan p
    ON co.id_plan = p.id_plan;




CREATE VIEW vw_contratos_activos AS
SELECT
    co.id_contrato,
    c.numero_cliente,
    c.nombres AS cliente,
    p.nombre AS plan,
    p.velocidad,
    p.precio,
    d.direccion,
    d.ciudad,
    d.departamento,
    co.fecha_inicio,
    co.estado
FROM contrato co
INNER JOIN cliente c
    ON co.id_cliente = c.id_cliente
INNER JOIN plan p
    ON co.id_plan = p.id_plan
INNER JOIN direccion d
    ON co.id_direccion = d.id_direccion
WHERE co.estado = 'ACTIVO';




SHOW TABLES;