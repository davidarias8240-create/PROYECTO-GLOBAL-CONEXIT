// import { useState } from "react";
// import { crearCliente } from "../services/api";

// function ClienteModal({ onClienteCreado }) {
//     const [form, setForm] = useState({
//         nombre: "",
//         email: "",
//         telefono: "",
//         direccion: "",
//     });

//     const [error, setError] = useState(null);
//     const handleChange = (e) => {
//         setForm({ ...form, [e.target.name]: e.target.value });
//     };

//     const handleSubmit = async () => {
//         // Validaciones frontend
//         if (!form.nombre.trim()) {
//             setError("El nombre es obligatorio");
//             return;
//         }

//         const res = await crearCliente(form);
//         if (!res.success) {
//             setError(res.message);
//             return;
//         }
//         setError(null);
//         onClienteCreado();
//         document.getElementById("cerrarModal").click();
//     };

//     return (
//         <div className="modal fade" id="clienteModal">
//             <div className="modal-dialog">
//                 <div className="modal-content">
//                     <div className="modal-header">
//                         <h5 className="modal-title">Nuevo Cliente</h5>
//                         <button type="button" className="btn-close" data-bs-dismiss="modal" id="cerrarModal"></button>
//                     </div>

//                     <div className="modal-body">
//                         {error && <div className="alert alert-danger">{error}</div>}

//                         <input className="form-control mb-2" placeholder="Nombre" name="nombre" onChange={handleChange} />
//                         <input className="form-control mb-2" placeholder="Documento" name="documento" onChange={handleChange} />
//                         <input className="form-control mb-2" placeholder="Email" name="email" onChange={handleChange} />
//                         <input className="form-control mb-2" placeholder="Teléfono" name="telefono" onChange={handleChange} />
//                         <input className="form-control mb-2" placeholder="Dirección" name="direccion" onChange={handleChange} />
//                     </div>

//                     <div className="modal-footer">
//                         <button className="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
//                         <button className="btn btn-primary" onClick={handleSubmit}>Guardar</button>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// }

// export default ClienteModal;

import { useEffect, useState } from "react";
import { crearCliente, editarCliente } from "../services/api";

function ClienteModal({ clienteSeleccionado, onClienteGuardado }) {

    const [form, setForm] = useState({
        id: null,
        nombre: "",
        email: "",
        telefono: "",
        direccion: "",
        documento: "",
    });

    const [error, setError] = useState(null);


    useEffect(() => {
        if (clienteSeleccionado) {
            setForm(clienteSeleccionado);
        }
    }, [clienteSeleccionado]);

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        if (!form.nombre.trim()) {
            setError("El nombre es obligatorio");
            return;
        }

        let res;

        // 🔁 Diferenciar crear vs editar
        if (form.id) {
            res = await editarCliente(form);
        } else {
            res = await crearCliente(form);
        }

        if (!res.success) {
            setError(res.message);
            return;
        }

        setError(null);
        onClienteGuardado();

        document.getElementById("cerrarModal").click();

        // Reset
        setForm({
            id: null,
            nombre: "",
            email: "",
            telefono: "",
            direccion: "",
            documento: "",
        });
    };

    return (
        <div className="modal fade" id="clienteModal">
            <div className="modal-dialog">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">
                            {form.id ? "Editar Cliente" : "Nuevo Cliente"}
                        </h5>

                        <button className="btn-close" data-bs-dismiss="modal" id="cerrarModal"></button>
                    </div>

                    <div className="modal-body">
                        {error && <div className="alert alert-danger">{error}</div>}

                        <input className="form-control mb-2" name="nombre" placeholder="Nombre" value={form.nombre} onChange={handleChange} />
                        <input className="form-control mb-2" name="documento" placeholder="Documento" value={form.documento} onChange={handleChange} />
                        <input className="form-control mb-2" name="email" placeholder="Email" value={form.email} onChange={handleChange} />
                        <input className="form-control mb-2" name="telefono" placeholder="Teléfono" value={form.telefono} onChange={handleChange} />
                        <input className="form-control mb-2" name="direccion" placeholder="Dirección" value={form.direccion} onChange={handleChange} />

                    </div>

                    <div className="modal-footer">
                        <button className="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>

                        <button className="btn btn-primary" onClick={handleSubmit}>Guardar</button>
                    </div>

                </div>
            </div>
        </div>
    );
}

export default ClienteModal;