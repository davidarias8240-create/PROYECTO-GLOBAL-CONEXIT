import { useEffect, useState } from "react";
import { obtenerFacturas, eliminarFactura } from "../services/api";
import FacturaModal from "../components/FacturaModal";

function Facturas() {
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);

  const cargarFacturas = () => {
    setLoading(true);
    obtenerFacturas()
      .then((data) => {
        setFacturas(data);
        setLoading(false);
      })
      .catch(() => {
        setError("No se pudieron cargar las facturas");
        setLoading(false);
      });
  };

  const handleEliminar = async (id) => {
    if (window.confirm("¿Seguro que deseas eliminar esta factura?")) {
      const res = await eliminarFactura(id);
      if (res.success) {
        cargarFacturas();
      } else {
        alert(res.message);
      }
    }
  };

  useEffect(() => {
    cargarFacturas();
  }, []);

  if (loading) {
    return <p>Cargando facturas...</p>;
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  return (
    <>
      <div className="d-flex justify-content-between align-items-center">
        <h2>Facturas</h2>
        <button
          className="btn btn-success"
          data-bs-toggle="modal"
          data-bs-target="#facturaModal"
          onClick={() => setFacturaSeleccionada(null)}
        >
          + Nueva Factura
        </button>
      </div>

      <FacturaModal
        facturaSeleccionada={facturaSeleccionada}
        onFacturaGuardada={() => {
          cargarFacturas();
          setFacturaSeleccionada(null);
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
            {facturas.map((factura) => (
              <tr key={factura.id}>
                <td>{factura.fecha}</td>
                <td>{factura.total}</td>
                <td>
                  <div className="d-flex">
                    <button
                      className="btn btn-warning btn-sm"
                      data-bs-toggle="modal"
                      data-bs-target="#facturaModal"
                      onClick={() => setFacturaSeleccionada(factura)}
                    >
                      Editar
                    </button>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleEliminar(factura.id)}
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

export default Facturas;