const BASE_URL = "http://localhost/PROYECTO-GLOBAL-CONEXIT/backend";

export async function obtenerClientes() {
  try {
    const response = await fetch(`${BASE_URL}/clientes/listar.php`);

    if (!response.ok) {
      throw new Error("Error al obtener clientes");
    }

    return await response.json();
  } catch (error) {
    console.error(error);
    throw error;
  }
}
export async function crearCliente(cliente) {
  const response = await fetch(
    `${BASE_URL}/clientes/crear.php`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cliente),
    }
  );
  return response.json();
}

export async function obtenerProductos() {
  try {
    const response = await fetch(`${BASE_URL}/productos/listar.php`);

    if (!response.ok) {
      throw new Error("Error al obtener productos");
    }

    return await response.json();
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function obtenerVentas() {
  try {
    const response = await fetch(`${BASE_URL}/ventas/listar.php`);

    if (!response.ok) {
      throw new Error("Error al obtener ventas");
    }

    return await response.json();
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function obtenerFacturas() {
  return obtenerVentas();
}

export async function crearProducto(producto) {
  const response = await fetch(`${BASE_URL}/productos/crear.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(producto),
  });
  return response.json();
}

export async function crearVenta(venta) {
  const response = await fetch(`${BASE_URL}/ventas/crear.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(venta),
  });
  return response.json();
}

export async function crearFactura(factura) {
  return crearVenta(factura);
}

export async function editarCliente(cliente) {
  const response = await fetch(`${BASE_URL}/clientes/editar.php`,{
      method: "POST",
      headers: { "Content-Type": "application/json",},
      body: JSON.stringify(cliente),
    });

  return response.json();
}

export async function editarProducto(producto) {
  const response = await fetch(`${BASE_URL}/productos/editar.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(producto),
  });
  return response.json();
}

export async function editarVenta(venta) {
  const response = await fetch(`${BASE_URL}/ventas/editar.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(venta),
  });
  return response.json();
}

export async function editarFactura(factura) {
  return editarVenta(factura);
}

export async function eliminarCliente(id) {
  const response = await fetch(`${BASE_URL}/clientes/eliminar.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return response.json();
}

export async function eliminarProducto(id) {
  const response = await fetch(`${BASE_URL}/productos/eliminar.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return response.json();
}

export async function eliminarVenta(id) {
  const response = await fetch(`${BASE_URL}/ventas/eliminar.php`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  return response.json();
}

export async function eliminarFactura(id) {
  return eliminarVenta(id);
}
