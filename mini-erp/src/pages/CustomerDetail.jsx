import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import EntityAdmin from "./EntidadAdmin";
import { obtenerDetalleCliente } from "../services/api";

const customerSections = [
  { key: "direcciones", label: "Direcciones" },
  { key: "contratos", label: "Contratos y servicios" },
  { key: "planes", label: "Planes" },
  { key: "periodos", label: "Períodos" },
  { key: "solicitudes", label: "Solicitudes" },
  { key: "tickets", label: "Tickets" },
  { key: "interacciones", label: "Interacciones" },
  { key: "ordenes", label: "Órdenes de servicio" },
  { key: "facturas", label: "Facturas" },
  { key: "pagos", label: "Pagos" },
  { key: "ajustes", label: "Ajustes financieros" },
  { key: "notificaciones", label: "Notificaciones" },
];

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function CustomerDetail() {
  const { clienteId, entidad } = useParams();
  return <CustomerDetailView key={clienteId} clienteId={clienteId} entidad={entidad} />;
}

function CustomerDetailView({ clienteId, entidad }) {
  const [state, setState] = useState({ detail: null, loading: true, error: "" });

  useEffect(() => {
    let active = true;
    obtenerDetalleCliente(clienteId)
      .then((result) => {
        if (active) setState({ detail: result, loading: false, error: "" });
      })
      .catch((loadError) => {
        if (active) setState({ detail: null, loading: false, error: loadError.message });
      });

    return () => {
      active = false;
    };
  }, [clienteId]);

  const { detail, loading, error } = state;
  const selectedSection = customerSections.find((section) => section.key === entidad);

  if (loading) {
    return <p role="status">Cargando la información del cliente...</p>;
  }

  if (error) {
    return (
      <div className="alert alert-danger" role="alert">
        <p className="mb-2">{error}</p>
        <Link to="/clientes" className="btn btn-outline-secondary btn-sm">Volver a clientes</Link>
      </div>
    );
  }

  if (!detail?.cliente) {
    return <p className="alert alert-danger" role="alert">No se encontró la información del cliente.</p>;
  }

  if (entidad && !selectedSection) {
    return <p className="alert alert-warning" role="alert">La sección solicitada no está disponible para clientes.</p>;
  }

  const { cliente, resumen } = detail;

  return (
    <section className="admin-entity-page">
      <header className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <p className="text-muted mb-1">Ficha integral del cliente</p>
          <h1 className="h3 mb-1">{cliente.nombres}</h1>
          <p className="text-muted mb-0">
            Cliente {cliente.numero_cliente} · {cliente.tipo_documento} {cliente.numero_documento}
          </p>
        </div>
        <Link to="/clientes" className="btn btn-outline-secondary">Volver al listado</Link>
      </header>

      <div className="row g-3 mb-4">
        <div className="col-md-6 col-xl-3">
          <div className="card h-100"><div className="card-body">
            <small className="text-muted d-block">Teléfono</small>
            <strong>{cliente.telefono || "No registrado"}</strong>
          </div></div>
        </div>
        <div className="col-md-6 col-xl-3">
          <div className="card h-100"><div className="card-body">
            <small className="text-muted d-block">Correo electrónico</small>
            <strong>{cliente.correo || cliente.correo_usuario || "No registrado"}</strong>
          </div></div>
        </div>
        <div className="col-md-6 col-xl-3">
          <div className="card h-100"><div className="card-body">
            <small className="text-muted d-block">Estado</small>
            <strong>{cliente.estado}</strong>
          </div></div>
        </div>
        <div className="col-md-6 col-xl-3">
          <div className="card h-100"><div className="card-body">
            <small className="text-muted d-block">Saldo pendiente</small>
            <strong>{currency.format(Number(resumen?.saldo_pendiente || 0))}</strong>
          </div></div>
        </div>
      </div>

      <nav className="d-flex flex-wrap gap-2 mb-4" aria-label="Secciones del cliente">
        <Link
          to={`/clientes/${clienteId}`}
          className={`btn btn-sm ${!entidad ? "btn-primary" : "btn-outline-primary"}`}
          aria-current={!entidad ? "page" : undefined}
        >
          Resumen
        </Link>
        {customerSections.map((section) => (
          <Link
            key={section.key}
            to={`/clientes/${clienteId}/${section.key}`}
            className={`btn btn-sm ${entidad === section.key ? "btn-primary" : "btn-outline-primary"}`}
            aria-current={entidad === section.key ? "page" : undefined}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {selectedSection ? (
        <>
          {["planes", "periodos"].includes(selectedSection.key) && (
            <p className="alert alert-info">
              Este es un catálogo compartido; en la ficha del cliente está disponible solo para consulta.
            </p>
          )}
          <EntityAdmin
            key={`${selectedSection.key}-${clienteId}`}
            entity={selectedSection.key}
            customerId={clienteId}
            customerUserId={cliente.id_usuario}
          />
        </>
      ) : (
        <div className="card border-0 shadow-sm">
          <div className="card-body">
            <h2 className="h5">Resumen del cliente</h2>
            <p className="text-muted">
              Selecciona una sección para consultar y gestionar únicamente los registros asociados a este cliente.
            </p>
            <div className="row g-3">
              {[
                ["Direcciones", resumen?.cantidad_direcciones ?? detail.direcciones?.length ?? 0],
                ["Contratos y servicios", resumen?.cantidad_servicios ?? detail.contratos?.length ?? 0],
                ["Solicitudes", resumen?.cantidad_solicitudes ?? detail.solicitudes?.length ?? 0],
                ["Tickets", resumen?.cantidad_tickets ?? detail.tickets?.length ?? 0],
                ["Total facturado", currency.format(Number(resumen?.total_facturado || 0))],
                ["Pagos registrados", detail.pagos?.length ?? 0],
              ].map(([label, value]) => (
                <div className="col-sm-6 col-lg-4" key={label}>
                  <div className="border rounded p-3 h-100">
                    <small className="text-muted d-block">{label}</small>
                    <strong>{value}</strong>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <h3 className="h6">Historial administrativo del cliente</h3>
              {detail.historial?.length ? (
                <ul className="list-group list-group-flush">
                  {detail.historial.map((entry) => (
                    <li className="list-group-item px-0" key={entry.id_auditoria}>
                      <strong>{entry.accion} · {entry.entidad}</strong>
                      <span className="text-muted ms-2">
                        {entry.fecha ? new Date(entry.fecha.replace(" ", "T")).toLocaleString("es-CO") : "Sin fecha"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted mb-0">No hay historial disponible para este cliente.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default CustomerDetail;
