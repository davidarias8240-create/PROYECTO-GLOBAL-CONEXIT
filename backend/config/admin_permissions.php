<?php

function rolesPanelAdministrativo(): array
{
    return ["ADMINISTRADOR", "ASESOR_COMERCIAL", "TECNICO"];
}

function permisosPanelAdministrativo(string $rol): array
{
    $sinPermisos = [
        "leer" => false,
        "crear" => false,
        "editar" => false,
        "archivar" => false,
        "campos_edicion" => [],
    ];

    $soloLectura = [
        "leer" => true,
        "crear" => false,
        "editar" => false,
        "archivar" => false,
        "campos_edicion" => [],
    ];

    $administrador = [
        "leer" => true,
        "crear" => true,
        "editar" => true,
        "archivar" => true,
        "campos_edicion" => null,
    ];

    $politicas = [
        "ADMINISTRADOR" => [
            "dashboard" => true,
            "desactivados" => true,
            "finanzas_cliente" => true,
            "entidades" => array_fill_keys([
                "roles", "usuarios", "clientes", "direcciones", "planes", "contratos",
                "periodos", "facturas", "pagos", "ajustes", "tickets", "interacciones",
                "ordenes", "notificaciones", "solicitudes", "auditoria",
            ], $administrador),
        ],
        "ASESOR_COMERCIAL" => [
            "dashboard" => false,
            "desactivados" => false,
            "finanzas_cliente" => true,
            "entidades" => [
                "clientes" => [
                    "leer" => true, "crear" => true, "editar" => true, "archivar" => false,
                    "campos_edicion" => ["nombres", "telefono", "correo"],
                ],
                "direcciones" => [
                    "leer" => true, "crear" => true, "editar" => true, "archivar" => false,
                    "campos_edicion" => ["direccion", "ciudad", "departamento", "referencia"],
                ],
                "solicitudes" => [
                    "leer" => true, "crear" => true, "editar" => true, "archivar" => false,
                    "campos_edicion" => ["estado"],
                ],
                "tickets" => [
                    "leer" => true, "crear" => true, "editar" => true, "archivar" => false,
                    "campos_edicion" => [], "gestion_ticket" => true,
                ],
                "interacciones" => $soloLectura,
                "notificaciones" => $soloLectura,
                "planes" => $soloLectura,
                "contratos" => $soloLectura,
                "periodos" => $soloLectura,
                "ordenes" => $soloLectura,
                "facturas" => $soloLectura,
                "pagos" => $soloLectura,
            ],
        ],
        "TECNICO" => [
            "dashboard" => false,
            "desactivados" => false,
            "finanzas_cliente" => false,
            "entidades" => [
                "clientes" => $soloLectura,
                "direcciones" => $soloLectura,
                "solicitudes" => $soloLectura,
                "tickets" => [
                    "leer" => true, "crear" => false, "editar" => true, "archivar" => false,
                    "campos_edicion" => [], "gestion_ticket" => true,
                ],
                "interacciones" => $soloLectura,
                "notificaciones" => $soloLectura,
                "ordenes" => [
                    "leer" => true, "crear" => false, "editar" => true, "archivar" => false,
                    "campos_edicion" => ["estado", "resultado", "motivo_reprogramacion"],
                ],
            ],
        ],
    ];

    return $politicas[$rol] ?? [
        "dashboard" => false,
        "desactivados" => false,
        "finanzas_cliente" => false,
        "entidades" => [],
    ];
}

function permisoEntidadAdministrativa(string $rol, string $entidad): array
{
    $permisos = permisosPanelAdministrativo($rol);
    return $permisos["entidades"][$entidad] ?? [
        "leer" => false,
        "crear" => false,
        "editar" => false,
        "archivar" => false,
        "campos_edicion" => [],
    ];
}

function campoEditableAdministrativo(string $rol, string $entidad, string $campo): bool
{
    $permisos = permisoEntidadAdministrativa($rol, $entidad);
    if (!$permisos["editar"]) {
        return false;
    }

    return $permisos["campos_edicion"] === null
        || in_array($campo, $permisos["campos_edicion"], true);
}

function campoCreableAdministrativo(string $rol, string $entidad, string $campo): bool
{
    if ($rol === "ADMINISTRADOR") {
        return true;
    }

    $campos = [
        "ASESOR_COMERCIAL" => [
            "clientes" => ["numero_cliente", "tipo_documento", "numero_documento", "nombres", "telefono", "correo"],
            "direcciones" => ["id_cliente", "direccion", "ciudad", "departamento", "referencia"],
            "solicitudes" => ["id_cliente", "nombre_contacto", "correo", "telefono", "tipo_solicitud", "mensaje"],
            "tickets" => ["id_cliente", "asunto", "descripcion", "prioridad"],
        ],
    ];

    return in_array($campo, $campos[$rol][$entidad] ?? [], true);
}

function filtroAlcanceAdministrativo(string $rol, string $entidad): ?string
{
    if ($rol === "ASESOR_COMERCIAL") {
        return match ($entidad) {
            "tickets" => "(t.id_usuario_responsable = :scope_user OR t.id_usuario_responsable IS NULL)",
            "interacciones" => "EXISTS (
                SELECT 1 FROM ticket ts
                WHERE ts.id_ticket = t.id_ticket
                  AND (ts.id_usuario_responsable = :scope_user OR ts.id_usuario_responsable IS NULL)
            )",
            default => null,
        };
    }

    if ($rol !== "TECNICO") {
        return null;
    }

    return match ($entidad) {
        "tickets" => "t.id_usuario_responsable = :scope_user",
        "ordenes" => "t.id_usuario_tecnico = :scope_user",
        "interacciones" => "EXISTS (
            SELECT 1 FROM ticket ts
            WHERE ts.id_ticket = t.id_ticket
              AND ts.id_usuario_responsable = :scope_user
        )",
        "clientes" => "(
            EXISTS (
                SELECT 1 FROM ticket ts
                WHERE ts.id_cliente = t.id_cliente
                  AND ts.id_usuario_responsable = :scope_ticket_user
                  AND NOT EXISTS (
                      SELECT 1 FROM admin_bajas bx
                      WHERE bx.entidad COLLATE utf8mb4_unicode_ci = 'tickets' COLLATE utf8mb4_unicode_ci
                        AND bx.id_registro COLLATE utf8mb4_unicode_ci =
                            CAST(ts.id_ticket AS CHAR) COLLATE utf8mb4_unicode_ci
                  )
            )
            OR EXISTS (
                SELECT 1
                FROM orden_servicio os
                INNER JOIN contrato cos ON cos.id_contrato = os.id_contrato
                WHERE cos.id_cliente = t.id_cliente
                  AND os.id_usuario_tecnico = :scope_order_user
                  AND NOT EXISTS (
                      SELECT 1 FROM admin_bajas bx
                      WHERE bx.entidad COLLATE utf8mb4_unicode_ci = 'ordenes' COLLATE utf8mb4_unicode_ci
                        AND bx.id_registro COLLATE utf8mb4_unicode_ci =
                            CAST(os.id_orden AS CHAR) COLLATE utf8mb4_unicode_ci
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM admin_bajas bx
                      WHERE bx.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
                        AND bx.id_registro COLLATE utf8mb4_unicode_ci =
                            CAST(cos.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
                  )
            )
        )",
        "direcciones" => "(
            EXISTS (
                SELECT 1 FROM ticket ts
                WHERE ts.id_cliente = t.id_cliente
                  AND ts.id_usuario_responsable = :scope_ticket_user
                  AND NOT EXISTS (
                      SELECT 1 FROM admin_bajas bx
                      WHERE bx.entidad COLLATE utf8mb4_unicode_ci = 'tickets' COLLATE utf8mb4_unicode_ci
                        AND bx.id_registro COLLATE utf8mb4_unicode_ci =
                            CAST(ts.id_ticket AS CHAR) COLLATE utf8mb4_unicode_ci
                  )
            )
            OR EXISTS (
                SELECT 1 FROM orden_servicio os
                WHERE os.id_direccion = t.id_direccion
                  AND os.id_usuario_tecnico = :scope_order_user
                  AND NOT EXISTS (
                      SELECT 1 FROM admin_bajas bx
                      WHERE bx.entidad COLLATE utf8mb4_unicode_ci = 'ordenes' COLLATE utf8mb4_unicode_ci
                        AND bx.id_registro COLLATE utf8mb4_unicode_ci =
                            CAST(os.id_orden AS CHAR) COLLATE utf8mb4_unicode_ci
                  )
            )
        )",
        "solicitudes" => "(EXISTS (
            SELECT 1 FROM ticket ts
            WHERE ts.id_cliente = t.id_cliente
              AND ts.id_usuario_responsable = :scope_ticket_user
              AND NOT EXISTS (
                  SELECT 1 FROM admin_bajas bx
                  WHERE bx.entidad COLLATE utf8mb4_unicode_ci = 'tickets' COLLATE utf8mb4_unicode_ci
                    AND bx.id_registro COLLATE utf8mb4_unicode_ci =
                        CAST(ts.id_ticket AS CHAR) COLLATE utf8mb4_unicode_ci
              )
        ) OR EXISTS (
            SELECT 1
            FROM orden_servicio os
            INNER JOIN contrato cos ON cos.id_contrato = os.id_contrato
            WHERE cos.id_cliente = t.id_cliente
              AND os.id_usuario_tecnico = :scope_order_user
              AND NOT EXISTS (
                  SELECT 1 FROM admin_bajas bx
                  WHERE bx.entidad COLLATE utf8mb4_unicode_ci = 'ordenes' COLLATE utf8mb4_unicode_ci
                    AND bx.id_registro COLLATE utf8mb4_unicode_ci =
                        CAST(os.id_orden AS CHAR) COLLATE utf8mb4_unicode_ci
              )
              AND NOT EXISTS (
                  SELECT 1 FROM admin_bajas bx
                  WHERE bx.entidad COLLATE utf8mb4_unicode_ci = 'contratos' COLLATE utf8mb4_unicode_ci
                    AND bx.id_registro COLLATE utf8mb4_unicode_ci =
                        CAST(cos.id_contrato AS CHAR) COLLATE utf8mb4_unicode_ci
              )
        ))",
        "notificaciones" => "t.id_usuario = :scope_user",
        default => null,
    };
}

function parametrosAlcanceAdministrativo(string $rol, string $entidad, int $idUsuario): array
{
    if ($rol === "TECNICO" && in_array($entidad, ["clientes", "direcciones", "solicitudes"], true)) {
        return [
            ":scope_ticket_user" => $idUsuario,
            ":scope_order_user" => $idUsuario,
        ];
    }

    if (filtroAlcanceAdministrativo($rol, $entidad) !== null) {
        return [":scope_user" => $idUsuario];
    }

    return [];
}

function permisosFrontendAdministrativo(string $rol): array
{
    $permisos = permisosPanelAdministrativo($rol);
    return [
        "rol" => $rol,
        "dashboard" => $permisos["dashboard"],
        "desactivados" => $permisos["desactivados"],
        "finanzas_cliente" => $permisos["finanzas_cliente"],
        "entidades" => $permisos["entidades"],
    ];
}
