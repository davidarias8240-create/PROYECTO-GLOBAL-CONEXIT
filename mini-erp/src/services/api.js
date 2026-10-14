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

export function cerrarSesionCliente() {
  return request("clientes/logout.php", { method: "POST" });
}

export function iniciarSesionAdmin(credenciales) {
  return request("admin/auth.php", { method: "POST", body: credenciales });
}

export function verificarSesionAdmin() {
  return request("admin/auth.php");
}

async function solicitarEntidad(entity, file, options) {
  return request(`${entity}/${file}${options?.query || ""}`, options);
}

export function obtenerMetadatosEntidad(entity) {
  return solicitarEntidad(entity, "metadata.php");
}

export function obtenerRegistrosEntidad(entity, archivados = false) {
  return solicitarEntidad(entity, "listar.php", {
    query: archivados ? "?archivados=1" : "",
  });
}

export function obtenerPlanesPublicos() {
  return request("planes/publicos.php", { credentials: "omit" });
}

export function guardarRegistroEntidad(entity, data, id = null) {
  if (id === null) {
    return solicitarEntidad(entity, "crear.php", {
      method: "POST",
      body: data,
    });
  }
  return solicitarEntidad(entity, "editar.php", {
    method: "POST",
    body: { id, ...data },
  });
}

export function desactivarRegistroEntidad(entity, id) {
  return solicitarEntidad(entity, "eliminar.php", {
    method: "POST",
    body: { id },
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
