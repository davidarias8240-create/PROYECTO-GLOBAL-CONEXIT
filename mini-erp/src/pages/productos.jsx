import { useEffect, useState } from "react";
import { obtenerProductos, eliminarProducto } from "../services/api";
import ProductoModal from "../components/ProductoModal";

function Productos() {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);

  const cargarProductos = () => {
    setLoading(true);
    obtenerProductos()
      .then((data) => {
        setProductos(data);
        setLoading(false);
      })
      .catch(() => {
        setError("No se pudieron cargar los productos");
        setLoading(false);
      });
  };

  const handleEliminar = async (id) => {
    if (window.confirm("¿Seguro que deseas eliminar este producto?")) {
      const res = await eliminarProducto(id);
      if (res.success) {
        cargarProductos();
      } else {
        alert(res.message);
      }
    }
  };

  useEffect(() => {
    cargarProductos();
  }, []);

  if (loading) {
    return <p>Cargando productos...</p>;
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center">
        <h2>Productos</h2>
        <button className="btn btn-success" data-bs-toggle="modal" data-bs-target="#productoModal" onClick={() => setProductoSeleccionado(null)}>
          + Nuevo Producto
        </button>
      </div>
      <ProductoModal
        productoSeleccionado={productoSeleccionado}
        onProductoGuardado={() => {
          cargarProductos();
          setProductoSeleccionado(null);
        }}
      />
      <div className="tabla-container">
        <table className="table table-striped mt-3">
          <thead className="table-dark">
            <tr>
              <th>Nombre</th>
              <th>Descripción</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productos.map((producto) => (
              <tr key={producto.id}>
                <td>{producto.nombre}</td>
                <td>{producto.descripcion}</td>
                <td>{producto.precio}</td>
                <td>{producto.stock}</td>
                <td>
                  <div className="d-flex">
                    <button
                      className="btn btn-warning btn-sm"
                      data-bs-toggle="modal"
                      data-bs-target="#productoModal"
                      onClick={() => setProductoSeleccionado(producto)}
                    >
                      Editar
                    </button>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleEliminar(producto.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default Productos;
