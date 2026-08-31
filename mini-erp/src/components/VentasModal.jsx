import { useState } from "react";
 import { registrarVenta } from "../services/api";

 function VentasModal({ onVentaRegistrada }) {
 const [form, setForm] = useState({
 cliente_id: "",
 fecha: "",
 total: "",
 });

 const [error, setError] = useState(null);
 const handleChange = (e) => {
 setForm({ ...form, [e.target.name]: e.target.value });
 };

 const handleSubmit = async () => {
 // Validaciones frontend
 if (!form.cliente_id.trim()) {
 setError("El ID del cliente es obligatorio");
 return;
 }

 const res = await registrarVenta(form);
 if (!res.success) {
 setError(res.message);
 return;
 }
 setError(null);
 onVentaRegistrada();
 document.getElementById("cerrarModal").click();
 };

 return (
 <div className="modal fade" id="ventaModal">
 <div className="modal-dialog">
 <div className="modal-content">
 <div className="modal-header">
 <h5 className="modal-title">Registrar Venta</h5>
 <button
 type="button"
 className="btn-close"
 data-bs-dismiss="modal"
 id="cerrarModal"
 ></button>
 </div>

 <div className="modal-body">
 {error && <div className="alert alert-danger">{error}</div>}

 <input
 className="form-control mb-2"
 placeholder="Cliente ID"
 name="cliente_id"
 onChange={handleChange}
 />
 <input
 className="form-control mb-2"
 placeholder="Fecha"
 name="fecha"
 onChange={handleChange}
 />
 <input
 className="form-control mb-2"
 placeholder="Total"
 name="total"
 onChange={handleChange}
 />

 </div>

 <div className="modal-footer">
 <button className="btn btn-secondary" data-bs-dismiss="modal">
 Cancelar
 </button>
 <button className="btn btn-primary"
onClick={handleSubmit}>
 Guardar
 </button>
 </div>
 </div>
 </div>
 </div>
 );
 }

 export default VentasModal;