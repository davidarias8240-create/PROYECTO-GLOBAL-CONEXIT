const BASE_URL = "http://localhost/PROYECTO-GLOBAL-CONEXIT/backend";

async function readResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "No se pudo completar la operación");
  }
  return data;
}

async function request(path, { method = "GET", body, credentials = "include" } = {}) {
  const response = await fetch(`${BASE_URL}/${path}`, {
    method,
    credentials,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return readResponse(response);
}

export function iniciarSesionCliente(credenciales) {
  return request("clientes/login.php", { method: "POST", body: credenciales });
}

export function obtenerPerfilCliente() {
  return request("clientes/perfil.php");
}

export function obtenerPortalCliente() {
  return request("clientes/portal.php");
}

export function pagarFacturaSimulada(pago) {
  return request("clientes/pagar_simulado.php", { method: "POST", body: pago });
}

export function reportarFallaCliente(reporte) {
  return request("clientes/reportar.php", { method: "POST", body: reporte });
}

export function cerrarSesionCliente() {
  return request("clientes/logout.php", { method: "POST" });
}

export function iniciarSesionAdmin(credenciales) {
  return request("admin/auth.php", { method: "POST", body: credenciales });
}

export function verificarSesionAdmin() {
  return request("admin/auth.php");
}

export function obtenerResumenDashboard() {
  return request("dashboard/resumen.php");
}

export function obtenerNotificacionesAuditoria() {
  return request("auditoria/notificaciones.php");
}

function entityQuery({ customerId, search, archived = false } = {}) {
  const query = new URLSearchParams();
  if (archived) query.set("archivados", "1");
  if (customerId !== null && customerId !== undefined) query.set("id_cliente", customerId);
  if (search) query.set("buscar", search);
  const value = query.toString();
  return value ? `?${value}` : "";
}

async function solicitarEntidad(entity, file, options) {
  return request(`${entity}/${file}${options?.query || ""}`, options);
}

export function obtenerMetadatosEntidad(entity, customerId = null) {
  return solicitarEntidad(entity, "metadata.php", {
    query: entityQuery({ customerId }),
  });
}

export function obtenerRegistrosEntidad(entity, archivados = false, customerId = null, search = "") {
  return solicitarEntidad(entity, "listar.php", {
    query: entityQuery({ archived: archivados, customerId, search }),
  });
}

export function obtenerDetalleCliente(idCliente) {
  return request(`clientes/detalle.php?id_cliente=${encodeURIComponent(idCliente)}`);
}

export function obtenerPlanesPublicos() {
  return request("planes/publicos.php", { credentials: "omit" });
}

export function guardarRegistroEntidad(entity, data, id = null, customerId = null) {
  const query = entityQuery({ customerId });
  if (id === null) {
    return solicitarEntidad(entity, "crear.php", {
      method: "POST",
      body: data,
      query,
    });
  }
  return solicitarEntidad(entity, "editar.php", {
    method: "POST",
    body: { id, ...data },
    query,
  });
}

export function desactivarRegistroEntidad(entity, id, customerId = null) {
  return solicitarEntidad(entity, "eliminar.php", {
    method: "POST",
    body: { id },
    query: entityQuery({ customerId }),
  });
}

export function reactivarRegistroEntidad(entity, id) {
  return solicitarEntidad(entity, "reactivar.php", {
    method: "POST",
    body: { id },
  });
}

export function crearSolicitudPublica(solicitud) {
  return request("solicitudes/crear_publica.php", {
    method: "POST",
    body: solicitud,
    credentials: "omit",
  });
}
