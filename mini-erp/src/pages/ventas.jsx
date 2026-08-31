import { useEffect, useState } from "react";
import { obtenerVentas, eliminarVenta } from "../services/api";
import VentaModal from "../components/VentaModal";

function Ventas() {
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ventaSeleccionada, setVentaSeleccionada] = useState(null);

  const cargarVentas = () => {
    setLoading(true);
    obtenerVentas()
      .then((data) => {
        setVentas(data);
        setLoading(false);
      })
      .catch(() => {
        setError("No se pudieron cargar las ventas");
        setLoading(false);
      });
  };

  const handleEliminar = async (id) => {
    if (window.confirm("¿Seguro que deseas eliminar esta venta?")) {
      const res = await eliminarVenta(id);
      if (res.success) {
        cargarVentas();
      } else {
        alert(res.message);
      }
    }
  };

  useEffect(() => {
    cargarVentas();
  }, []);

  if (loading) {
    return <p>Cargando ventas...</p>;
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center">
        <h2>Ventas</h2>
        <button className="btn btn-success" data-bs-toggle="modal" data-bs-target="#ventaModal" onClick={() => setVentaSeleccionada(null)}>
          + Nueva Venta
        </button>
      </div>
      <VentaModal
        ventaSeleccionado={ventaSeleccionada}
        onVentaGuardada={() => {
          cargarVentas();
          setVentaSeleccionada(null);
        }}
      />
      <div className="tabla-container">
        <table className="table table-striped mt-3">
          <thead className="table-dark">
            <tr>
              <th>Fecha</th>
              <th>Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ventas.map((venta) => (
              <tr key={venta.id}>
                <td>{venta.fecha}</td>
                <td>{venta.total}</td>
                <td>
                  <div className="d-flex">
                    <button
                      className="btn btn-warning btn-sm"
                      data-bs-toggle="modal"
                      data-bs-target="#ventaModal"
                      onClick={() => setVentaSeleccionada(venta)}
                    >
                      Editar
                    </button>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleEliminar(venta.id)}
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

export default Ventas;