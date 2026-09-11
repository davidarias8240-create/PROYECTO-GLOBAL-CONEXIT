import { useEffect, useState } from "react";
import { crearFactura, editarFactura } from "../services/api";

function FacturaModal({ facturaSeleccionada, onFacturaGuardada }) {
  const [form, setForm] = useState({
    id: null,
    cliente_id: "",
    fecha: "",
    total: "",
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (facturaSeleccionada) {
      setForm(facturaSeleccionada);
    } else {
      setForm({
        id: null,
        cliente_id: "",
        fecha: "",
        total: "",
      });
    }
  }, [facturaSeleccionada]);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async () => {
    const clienteId = String(form.cliente_id ?? "").trim();
    const fecha = String(form.fecha ?? "").trim();
    const total = String(form.total ?? "").trim();

    if (!clienteId || !fecha || !total) {
      setError("Todos los campos son obligatorios");
      return;
    }

    const payload = {
      ...form,
      cliente_id: Number(clienteId),
      total: Number(total),
    };

    const res = form.id ? await editarFactura(payload) : await crearFactura(payload);

    if (!res.success) {
      setError(res.message);
      return;
    }

    setError(null);
    if (onFacturaGuardada) onFacturaGuardada();
    document.getElementById("cerrarFacturaModal").click();

    setForm({
      id: null,
      cliente_id: "",
      fecha: "",
      total: "",
    });
  };

  return (
    <div className="modal fade" id="facturaModal">
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              {form.id ? "Editar Factura" : "Nueva Factura"}
            </h5>
            <button
              type="button"
              className="btn-close"
              data-bs-dismiss="modal"
              id="cerrarFacturaModal"
            ></button>
          </div>

          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}
            <input
              className="form-control mb-2"
              placeholder="ID del Cliente"
              name="cliente_id"
              value={form.cliente_id}
              onChange={handleChange}
            />
            <input
              type="date"
              className="form-control mb-2"
              placeholder="Fecha"
              name="fecha"
              value={form.fecha}
              onChange={handleChange}
            />
            <input
              className="form-control mb-2"
              placeholder="Total"
              name="total"
              value={form.total}
              onChange={handleChange}
            />
          </div>

          <div className="modal-footer">
            <button className="btn btn-secondary" data-bs-dismiss="modal">
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleSubmit}>
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FacturaModal;
