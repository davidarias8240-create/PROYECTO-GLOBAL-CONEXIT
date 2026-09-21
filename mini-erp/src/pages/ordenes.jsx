import { useEffect, useState } from "react";
import { obtenerClientes, obtenerOrdenes, eliminarOrden } from "../services/api";
import OrdenModal from "../components/OrdenModal";

function Ordenes() {
  const [ordenes, setOrdenes] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState(null);

  const getClienteNombre = (clienteId) => {
    const cliente = clientes.find((item) => String(item.id) === String(clienteId));
    return cliente ? cliente.nombre : "Cliente no encontrado";
  };

  const cargarOrdenes = () => {
    setLoading(true);
    Promise.all([obtenerClientes(), obtenerOrdenes()])
      .then(([clientesData, ordenesData]) => {
        setClientes(clientesData);
        setOrdenes(ordenesData);
        setLoading(false);
      })
      .catch(() => {
        setError("No se pudieron cargar las ordenes");
        setLoading(false);
      });
  };

  const handleEliminar = async (id) => {
    if (window.confirm("¿Seguro que deseas eliminar esta orden?")) {
      const res = await eliminarOrden(id);
      if (res.success) {
        cargarOrdenes();
      } else {
        alert(res.message);
      }
    }
  };

  useEffect(() => {
    cargarOrdenes();
  }, []);

  if (loading) {
    return <p>Cargando ordenes...</p>;
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center">
        <h2>Ordenes</h2>
        <button
          className="btn btn-success"
          data-bs-toggle="modal"
          data-bs-target="#ordenModal"
          onClick={() => setOrdenSeleccionada(null)}
        >
          + Nueva Orden
        </button>
      </div>

      <OrdenModal
        ordenSeleccionada={ordenSeleccionada}
        onOrdenGuardada={() => {
          cargarOrdenes();
          setOrdenSeleccionada(null);
        }}
      />

      <div className="tabla-container">
        <table className="table table-striped mt-3">
          <thead className="table-dark">
            <tr>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ordenes.map((orden) => (
              <tr key={orden.id}>
                <td>{getClienteNombre(orden.cliente_id)}</td>
                <td>{orden.fecha}</td>
                <td>{new Intl.NumberFormat("es-CL", {
                  style: "currency",
                  currency: "CLP",
                }).format(Number(orden.total || 0))}</td>
                <td>
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-warning btn-sm"
                      data-bs-toggle="modal"
                      data-bs-target="#ordenModal"
                      onClick={() => setOrdenSeleccionada(orden)}
                    >
                      Editar
                    </button>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleEliminar(orden.id)}
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

export default Ordenes;