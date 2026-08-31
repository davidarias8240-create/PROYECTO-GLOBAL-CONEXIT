import { useEffect, useState } from "react";
import { obtenerClientes } from "../services/api";
import ClienteModal from "../components/ClienteModal";
import { eliminarCliente } from "../services/api";

function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const handleEliminar = async (id) => {
    if (window.confirm("¿Seguro que deseas eliminar este cliente?")) {
      const res = await eliminarCliente(id);
      if (res.success) {
        obtenerClientes().then((data) => setClientes(data));
      } else {
        alert(res.message);
      }
    }
  };

  useEffect(() => {
    obtenerClientes()
      .then((data) => {
        setClientes(data);
        setLoading(false);
      })
      .catch(() => {
        setError("No se pudieron cargar los clientes");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p>Cargando clientes...</p>;
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  

  return (
    <>
      <div className="d-flex justify-content-between align-items-center">
        <h2>Clientes</h2>
        <button
          className="btn btn-success"
          data-bs-toggle="modal"
          data-bs-target="#clienteModal"
        >
          + Nuevo Cliente
        </button>
      </div>

      {/* <ClienteModal
        onClienteCreado={() => {
          setLoading(true);
          obtenerClientes().then((data) => {
            setClientes(data);
            setLoading(false);
          });
        }} /> */}

      <ClienteModal
        clienteSeleccionado={clienteSeleccionado}
        onClienteGuardado={() => {
          setLoading(true);
          obtenerClientes().then((data) => {
            setClientes(data);
            setLoading(false);
          });
          setClienteSeleccionado(null);
        }}
      />
<div className="tabla-container">
      <table className="table table-striped mt-4">
        <thead className="table-dark">
          <tr>
            
            <th>Nombre</th>
            <th>Documento</th>
            <th>Email</th>
            <th>Teléfono</th>
            <th>Dirección</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((cliente) => (
            <tr key={cliente.id}>
              
              <td>{cliente.nombre}</td>
              <td>{cliente.documento}</td>
              <td>{cliente.email}</td>
              <td>{cliente.telefono}</td>
              <td>{cliente.direccion}</td>
              <td>
                <div className="d-flex gap-2">
                <button 
                  className="btn btn-warning btn-sm"
                  data-bs-toggle="modal" data-bs-target="#clienteModal"
                  onClick={() => setClienteSeleccionado(cliente)}
                >Editar
                </button> 
                
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleEliminar(cliente.id)}
                  >Eliminar
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

export default Clientes;
