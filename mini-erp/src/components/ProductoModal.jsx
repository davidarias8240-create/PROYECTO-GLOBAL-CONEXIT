import { useEffect, useState } from "react";
import { crearProducto, editarProducto } from "../services/api";

function ProductoModal({ productoSeleccionado, onProductoGuardado }) {
  const [form, setForm] = useState({
    id: null,
    nombre: "",
    descripcion: "",
    precio: "",
    stock: "",
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (productoSeleccionado) {
      setForm(productoSeleccionado);
    } else {
      setForm({
        id: null,
        nombre: "",
        descripcion: "",
        precio: "",
        stock: "",
      });
    }
  }, [productoSeleccionado]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async () => {
    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio");
      return;
    }

    const res = form.id ? await editarProducto(form) : await crearProducto(form);

    if (!res.success) {
      setError(res.message);
      return;
    }

    setError(null);
    onProductoGuardado();
    document.getElementById("cerrarProductoModal").click();

    setForm({
      id: null,
      nombre: "",
      descripcion: "",
      precio: "",
      stock: "",
    });
  };

  return (
    <div className="modal fade" id="productoModal">
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{form.id ? "Editar Producto" : "Nuevo Producto"}</h5>
            <button type="button" className="btn-close" data-bs-dismiss="modal" id="cerrarProductoModal"></button>
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-danger">{error}</div>}
            <input className="form-control mb-2" placeholder="Nombre" name="nombre" value={form.nombre} onChange={handleChange} />
            <input className="form-control mb-2" placeholder="Descripción" name="descripcion" value={form.descripcion} onChange={handleChange} />
            <input className="form-control mb-2" placeholder="Precio" name="precio" type="number" value={form.precio} onChange={handleChange} />
            <input className="form-control mb-2" placeholder="Stock" name="stock" type="number" value={form.stock} onChange={handleChange} />
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

export default ProductoModal;
