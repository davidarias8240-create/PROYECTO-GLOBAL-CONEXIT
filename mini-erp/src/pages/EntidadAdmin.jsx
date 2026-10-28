import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  desactivarRegistroEntidad,
  guardarRegistroEntidad,
  obtenerDetalleCliente,
  obtenerMetadatosEntidad,
  obtenerRegistrosEntidad,
} from "../services/api";

const customerFields = [
  { name: "numero_cliente", label: "Número de cliente", required: true, maxLength: 30 },
  {
    name: "tipo_documento",
    label: "Tipo de documento",
    required: true,
    options: ["CC", "CE", "NIT", "TI", "PASAPORTE", "OTRO"],
  },
  { name: "numero_documento", label: "Número de documento", required: true, maxLength: 30 },
  { name: "nombres", label: "Nombre del cliente", required: true, maxLength: 120 },
  { name: "telefono", label: "Teléfono", maxLength: 30 },
];

// El formulario de usuarios reutiliza estos campos cuando se selecciona el rol CLIENTE.

function humanize(name) {
  return name
    .replace(/^id_/, "ID ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function inputType(column) {
  if (column.name === "correo") return "email";
  if (column.name === "telefono") return "tel";
  if (["int", "bigint", "decimal", "float", "double"].includes(column.type)) return "number";
  if (column.type === "date") return "date";
  if (column.type === "datetime" || column.type === "timestamp") return "datetime-local";
  return "text";
}

function fieldValue(column, value) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (column.type === "datetime" || column.type === "timestamp") {
    return stringValue.replace(" ", "T").slice(0, 16);
  }
  return stringValue;
}

function defaultFieldValue(column) {
  if (column.default === null || column.generated) return "";
  if (typeof column.default === "string" && /^'.*'$/.test(column.default)) {
    return column.default.slice(1, -1).replaceAll("''", "'");
  }
  return String(column.default);
}

function EntityField({ column, value, onChange, disabled = false, requiredOverride }) {
  const [relationSearch, setRelationSearch] = useState("");
  const label = humanize(column.name);
  const required = requiredOverride ?? (!column.nullable && column.default === null && !column.generated);
  const isBoolean = column.type === "tinyint" && column.columnType.includes("(1)");

  if (isBoolean) {
    return (
      <label className="form-check d-flex align-items-center gap-2">
        <input
          className="form-check-input"
          type="checkbox"
          checked={value === true || value === 1 || value === "1"}
          onChange={(event) => onChange(event.target.checked ? "1" : "0")}
          disabled={disabled}
        />
        <span>{label}</span>
      </label>
    );
  }

  if (column.enum?.length || column.relation) {
    const options = column.enum?.length
      ? column.enum.map((option) => ({ value: option, label: option }))
      : column.options || [];
    const query = relationSearch.trim().toLocaleLowerCase("es");
    const filteredOptions = query
      ? options.filter((option) => option.label.toLocaleLowerCase("es").includes(query))
      : options;
    const selectedOption = options.find((option) => String(option.value) === String(value));

    return (
      <label className="admin-entity-field">
        <span>{label}{required ? " *" : ""}</span>
        {column.relation && (
          <input
            className="form-control"
            type="search"
            aria-label={`Buscar ${label.toLocaleLowerCase("es")}`}
            placeholder="Buscar por nombre..."
            value={relationSearch}
            onChange={(event) => setRelationSearch(event.target.value)}
            disabled={disabled}
          />
        )}
        {/* El buscador solo filtra las etiquetas; el select conserva el ID que requiere el backend. */}
        <select
          className="form-select"
          value={value ?? ""}
          onChange={(event) => {
            onChange(event.target.value);
            setRelationSearch("");
          }}
          required={required}
          disabled={disabled}
        >
          <option value="">Selecciona...</option>
          {selectedOption && !filteredOptions.some((option) => String(option.value) === String(value)) && (
            <option value={selectedOption.value}>{selectedOption.label}</option>
          )}
          {filteredOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  const isLongText = ["text", "longtext", "mediumtext"].includes(column.type);
  return (
    <label className="admin-entity-field">
      <span>{label}{required ? " *" : ""}</span>
      {isLongText ? (
        <textarea
          className="form-control"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          disabled={disabled}
          rows={3}
        />
      ) : (
        <input
          className="form-control"
          type={inputType(column)}
          step={column.type === "decimal" || column.type === "float" || column.type === "double" ? "0.01" : undefined}
          value={fieldValue(column, value)}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          disabled={disabled}
          maxLength={column.columnType.match(/\((\d+)\)/)?.[1]}
        />
      )}
    </label>
  );
}

function EntityAdmin({ entity, customerId = null, customerUserId = null }) {
  const contextReadOnly = Boolean(customerId && ["planes", "periodos"].includes(entity));
  const [metadata, setMetadata] = useState(null);
  const [rows, setRows] = useState([]);
  const [values, setValues] = useState({});
  const [customer, setCustomer] = useState({});
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingCustomerDetail, setLoadingCustomerDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const requestSequence = useRef(0);
  const lastClientSearch = useRef("");

  const loadData = useCallback(async (clientSearch = "") => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const [meta, records] = await Promise.all([
        obtenerMetadatosEntidad(entity, customerId),
        obtenerRegistrosEntidad(entity, false, customerId, clientSearch),
      ]);
      if (requestId === requestSequence.current) {
        setMetadata(meta);
        setRows(records.registros);
      }
    } catch (loadError) {
      if (requestId === requestSequence.current) setError(loadError.message);
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [customerId, entity]);

  useEffect(() => {
    lastClientSearch.current = "";
    setMetadata(null);
    setRows([]);
    setShowForm(false);
    setSelectedCustomer(null);
    setLoadingCustomerDetail(false);
    setSearch("");
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (entity !== "clientes") return undefined;
    const query = search.trim();
    if (!query && !lastClientSearch.current) return undefined;
    const timeout = window.setTimeout(() => {
      lastClientSearch.current = query;
      loadData(query);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [entity, loadData, search]);

  const visibleColumns = useMemo(
    () => (metadata?.columnas || []).filter((column) =>
      !(entity === "clientes" && column.name === "id_usuario")
    ),
    [entity, metadata]
  );

  // La clave primaria y referencias sin etiqueta se ocultan; las claves foráneas muestran su nombre relacionado.
  const tableColumns = useMemo(
    () => visibleColumns.filter((column) =>
      !column.name.startsWith("id_") || (column.name !== metadata?.clave && column.relation)
    ),
    [metadata, visibleColumns]
  );

  const formColumns = useMemo(
    () => visibleColumns.filter((column) =>
      column.name !== metadata.clave
      && !column.generated
      && column.name !== "contrasena_hash"
    ),
    [metadata, visibleColumns]
  );

  const isClientRole = useMemo(() => {
    if (entity !== "usuarios") return false;
    const roleColumn = metadata?.columnas.find((column) => column.name === "id_rol");
    const role = roleColumn?.options?.find((option) =>
      String(option.value) === String(values.id_rol)
    );
    return role?.label.toUpperCase().includes("CLIENTE") || false;
  }, [entity, metadata, values.id_rol]);

  const visibleRows = useMemo(() => {
    if (entity === "clientes" && search.trim()) return rows;
    const query = search.trim().toLocaleLowerCase("es");
    if (!query) return rows;
    return rows.filter((row) =>
      Object.values(row).some((value) =>
        String(value ?? "").toLocaleLowerCase("es").includes(query)
      )
    );
  }, [entity, rows, search]);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setValues({});
    setCustomer({});
    setPassword("");
  };

  const closeCustomerDetail = () => {
    setSelectedCustomer(null);
  };

  const openCustomerDetail = async (row) => {
    if (entity !== "clientes") return;
    setLoadingCustomerDetail(true);
    setError("");
    try {
      const detail = await obtenerDetalleCliente(row[metadata.clave]);
      setSelectedCustomer(detail);
    } catch (detailError) {
      setError(detailError.message);
    } finally {
      setLoadingCustomerDetail(false);
    }
  };

  const startCreate = () => {
    setNotice("");
    const initialValues = Object.fromEntries(formColumns.map((column) => [
      column.name,
      defaultFieldValue(column),
    ]));
    if (customerId && Object.hasOwn(initialValues, "id_cliente")) {
      initialValues.id_cliente = customerId;
    }
    if (entity === "notificaciones" && customerUserId && Object.hasOwn(initialValues, "id_usuario")) {
      initialValues.id_usuario = customerUserId;
    }
    setValues(initialValues);
    setCustomer({});
    setPassword("");
    setEditingId(null);
    setShowForm(true);
  };

  const startEdit = (row) => {
    setNotice("");
    setEditingId(row[metadata.clave]);
    setValues(Object.fromEntries(formColumns.map((column) => [
      column.name,
      fieldValue(column, row[column.name]),
    ])));
    setPassword("");
    setShowForm(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    const datos = {};
    for (const column of formColumns) {
      const value = values[column.name];
      if (value === "" && column.nullable) {
        datos[column.name] = null;
      } else if (value !== undefined && value !== "") {
        datos[column.name] = value;
      }
    }

    try {
      const payload = { datos };
      if (entity === "usuarios" && password) payload.contrasena = password;
      if (entity === "clientes" && !editingId) {
        if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
        payload.contrasena = password;
      }
      if (entity === "usuarios" && !editingId) {
        if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
        if (isClientRole) {
          for (const field of customerFields) {
            if (field.required && !customer[field.name]?.trim()) {
              throw new Error(`Completa el campo ${field.label} del perfil cliente.`);
            }
          }
          payload.cliente = customer;
        }
      }

      await guardarRegistroEntidad(entity, payload, editingId, customerId);
      closeForm();
      setNotice(editingId ? "Cambios guardados." : "Registro creado.");
      await loadData(entity === "clientes" ? search.trim() : "");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (row) => {
    const id = row[metadata.clave];
    if (!window.confirm(`¿Desactivar este registro de ${metadata.titulo.toLowerCase()}? Podrás reactivarlo después.`)) return;

    setError("");
    setNotice("");
    try {
      await desactivarRegistroEntidad(entity, id, customerId);
      setNotice("Registro desactivado. Puedes reactivarlo desde Desactivados.");
      await loadData(entity === "clientes" ? search.trim() : "");
    } catch (archiveError) {
      setError(archiveError.message);
    }
  };

  const formatMoney = (value) =>
    new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const formatDate = (value) => {
    if (!value) return "Sin fecha";
    const date = new Date(value.includes(" ") ? value.replace(" ", "T") : value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const renderCustomerDetail = () => {
    if (!selectedCustomer || !selectedCustomer.cliente) return null;

    const { cliente, resumen = {}, direcciones = [], contratos = [], solicitudes = [], tickets = [], interacciones = [], notificaciones = [], facturas = [], pagos = [], ajustes = [], historial = [] } = selectedCustomer;
    const renderList = (items, emptyLabel) =>
      items.length ? (
        <ul className="list-group list-group-flush">
          {items.map((item, index) => (
            <li key={`${item.id || index}-${item.numero || item.asunto || item.id_factura || index}`} className="list-group-item px-0">
              {typeof item === "string" ? item : (
                <div className="d-flex justify-content-between gap-3 align-items-start flex-wrap">
                  <div>
                    <strong>{item.numero || item.numero_cliente || item.asunto || item.numero_factura || item.nombre || item.direccion || item.motivo || item.id_factura || item.id_ticket || item.id_solicitud || item.id_pago || item.id_ajuste || item.id_notificacion || item.id_contrato || item.id_direccion || "Registro"}</strong>
                    {(item.estado || item.tipo || item.plan_nombre || item.fecha || item.fecha_emision || item.fecha_creacion || item.fecha_inicio || item.fecha_fin || item.canal || item.motivo) && (
                      <div className="text-muted small">
                        {item.estado || item.tipo || item.plan_nombre || item.fecha || item.fecha_emision || item.fecha_creacion || item.fecha_inicio || item.fecha_fin || item.canal || item.motivo}
                      </div>
                    )}
                  </div>
                  <div className="text-end small">
                    {item.valor != null && <div>{formatMoney(item.valor)}</div>}
                    {item.total != null && <div>{formatMoney(item.total)}</div>}
                    {item.saldo != null && <div>Saldo: {formatMoney(item.saldo)}</div>}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="text-muted mb-0">{emptyLabel}</p>;

    return (
      <div className="card border-0 shadow-sm mt-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
            <div>
              <h3 className="h5 mb-1">Detalle del cliente</h3>
              <div className="text-muted">{cliente.nombres} · {cliente.numero_cliente}</div>
            </div>
            <div className="d-flex gap-2">
              <Link className="btn btn-info btn-sm text-white" to={`/clientes/${cliente.id_cliente}`}>
                Abrir ficha por módulos
              </Link>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeCustomerDetail}>Cerrar</button>
            </div>
          </div>

          <div className="row g-3 mb-4">
            <div className="col-md-2">
              <div className="border rounded p-3 h-100">
                <small className="text-muted d-block">Servicios</small>
                <strong>{resumen.cantidad_servicios ?? contratos.length}</strong>
              </div>
            </div>
            <div className="col-md-2">
              <div className="border rounded p-3 h-100">
                <small className="text-muted d-block">Solicitudes</small>
                <strong>{resumen.cantidad_solicitudes ?? solicitudes.length}</strong>
              </div>
            </div>
            <div className="col-md-2">
              <div className="border rounded p-3 h-100">
                <small className="text-muted d-block">Tickets</small>
                <strong>{resumen.cantidad_tickets ?? tickets.length}</strong>
              </div>
            </div>
            <div className="col-md-3">
              <div className="border rounded p-3 h-100">
                <small className="text-muted d-block">Total facturado</small>
                <strong>{formatMoney(resumen.total_facturado)}</strong>
              </div>
            </div>
            <div className="col-md-3">
              <div className="border rounded p-3 h-100">
                <small className="text-muted d-block">Saldo pendiente</small>
                <strong>{formatMoney(resumen.saldo_pendiente)}</strong>
              </div>
            </div>
          </div>

          <div className="row g-4">
            <div className="col-lg-6">
              <div className="border rounded p-3 h-100">
                <h4 className="h6 mb-3">Resumen general</h4>
                <dl className="row mb-0">
                  <dt className="col-sm-5">Identificación</dt>
                  <dd className="col-sm-7">{cliente.tipo_documento} · {cliente.numero_documento}</dd>
                  <dt className="col-sm-5">Teléfono</dt>
                  <dd className="col-sm-7">{cliente.telefono || "No registrado"}</dd>
                  <dt className="col-sm-5">Correo</dt>
                  <dd className="col-sm-7">{cliente.correo || cliente.correo_usuario || "No registrado"}</dd>
                  <dt className="col-sm-5">Estado</dt>
                  <dd className="col-sm-7">{cliente.estado}</dd>
                  <dt className="col-sm-5">Número cliente</dt>
                  <dd className="col-sm-7">{cliente.numero_cliente}</dd>
                </dl>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="border rounded p-3 h-100">
                <h4 className="h6 mb-3">Direcciones</h4>
                {renderList(direcciones.map((direccion) => ({
                  ...direccion,
                  nombre: `${direccion.direccion} · ${direccion.ciudad} · ${direccion.departamento}`,
                  estado: direccion.estado,
                })), "No hay direcciones registradas")}
              </div>
            </div>

            <div className="col-lg-6">
              <div className="border rounded p-3 h-100">
                <h4 className="h6 mb-3">Servicios y contratos</h4>
                {renderList(contratos.map((contrato) => ({
                  ...contrato,
                  numero: `Contrato #${contrato.id_contrato}`,
                  plan_nombre: contrato.plan_nombre,
                  estado: contrato.estado,
                  fecha_inicio: formatDate(contrato.fecha_inicio),
                })), "No hay contratos asociados")}
              </div>
            </div>

            <div className="col-lg-6">
              <div className="border rounded p-3 h-100">
                <h4 className="h6 mb-3">Solicitudes y tickets</h4>
                <div className="mb-3">
                  <strong className="d-block mb-2">Solicitudes</strong>
                  {renderList(solicitudes.map((solicitud) => ({
                    ...solicitud,
                    numero: `Solicitud #${solicitud.id_solicitud}`,
                    estado: solicitud.estado,
                    tipo: solicitud.tipo_solicitud,
                    fecha: formatDate(solicitud.fecha),
                  })), "No hay solicitudes")}
                </div>
                <div>
                  <strong className="d-block mb-2">Tickets</strong>
                  {renderList(tickets.map((ticket) => ({
                    ...ticket,
                    numero: `Ticket #${ticket.id_ticket}`,
                    estado: ticket.estado,
                    motivo: ticket.asunto,
                    fecha: formatDate(ticket.fecha_creacion),
                  })), "No hay tickets")}
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="border rounded p-3 h-100">
                <h4 className="h6 mb-3">Facturación y finanzas</h4>
                <div className="mb-3">
                  <strong className="d-block mb-2">Facturas</strong>
                  {renderList(facturas.map((factura) => ({
                    ...factura,
                    numero: `Factura ${factura.numero}`,
                    estado: factura.estado,
                    total: factura.total,
                    saldo: factura.saldo,
                    fecha_emision: formatDate(factura.fecha_emision),
                  })), "No hay facturas")}
                </div>
                <div className="mb-3">
                  <strong className="d-block mb-2">Pagos</strong>
                  {renderList(pagos.map((pago) => ({
                    ...pago,
                    numero: `Pago #${pago.id_pago}`,
                    valor: pago.valor,
                    estado: pago.estado,
                    fecha: formatDate(pago.fecha),
                  })), "No hay pagos registrados")}
                </div>
                <div>
                  <strong className="d-block mb-2">Ajustes</strong>
                  {renderList(ajustes.map((ajuste) => ({
                    ...ajuste,
                    numero: `Ajuste #${ajuste.id_ajuste}`,
                    valor: ajuste.valor,
                    tipo: ajuste.tipo,
                    motivo: ajuste.motivo,
                    fecha: formatDate(ajuste.fecha),
                  })), "No hay ajustes")}
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="border rounded p-3 h-100">
                <h4 className="h6 mb-3">Historial</h4>
                <div className="mb-3">
                  <strong className="d-block mb-2">Interacciones</strong>
                  {renderList(interacciones.map((interaccion) => ({
                    ...interaccion,
                    numero: `Interacción #${interaccion.id_interaccion}`,
                    estado: interaccion.canal,
                    motivo: interaccion.razon,
                    fecha: formatDate(interaccion.fecha),
                  })), "No hay interacciones")}
                </div>
                <div className="mb-3">
                  <strong className="d-block mb-2">Notificaciones</strong>
                  {renderList(notificaciones.map((notificacion) => ({
                    ...notificacion,
                    numero: `Notif. #${notificacion.id_notificacion}`,
                    estado: notificacion.estado_entrega,
                    motivo: notificacion.asunto,
                    fecha: formatDate(notificacion.fecha),
                  })), "No hay notificaciones")}
                </div>
                <div>
                  <strong className="d-block mb-2">Auditoría</strong>
                  {renderList(historial.map((item) => ({
                    ...item,
                    numero: `${item.entidad} / ${item.id_entidad}`,
                    estado: item.accion,
                    fecha: formatDate(item.fecha),
                  })), "No hay historial disponible")}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCell = (column, row) => {
    const value = row[column.name];
    if (value === null || value === undefined || value === "") return "—";
    if (column.relation) {
      const option = column.options?.find((item) => String(item.value) === String(value));
      if (option) return option.label;
    }
    if (column.type === "tinyint" && column.columnType.includes("(1)")) {
      return Number(value) ? "Sí" : "No";
    }
    return String(value);
  };

  if (loading && !metadata) return <p role="status">Cargando {entity}...</p>;

  return (
    <section className="admin-entity-page">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <div>
          <h2 className="mb-1">{metadata?.titulo || "Registros"}</h2>
          <p className="text-muted mb-0">Datos consultados desde la base de datos del sistema.</p>
        </div>
        {!metadata?.soloLectura && !contextReadOnly && (
          <button type="button" className="btn btn-success" onClick={startCreate}>
            + Crear {entity === "usuarios" ? "usuario" : entity === "clientes" ? "cliente" : "registro"}
          </button>
        )}
      </div>

      {notice && <p className="alert alert-success" role="status">{notice}</p>}
      {error && <p className="alert alert-danger" role="alert">{error}</p>}

      {customerId && (
        <div className="d-flex align-items-center gap-2 mb-3">
          <Link className="btn btn-outline-secondary btn-sm" to={`/clientes/${customerId}`}>
            Volver al cliente
          </Link>
          <span className="text-muted">Mostrando solo registros relacionados con este cliente.</span>
        </div>
      )}

      {entity === "clientes" && selectedCustomer && renderCustomerDetail()}
      {entity === "clientes" && loadingCustomerDetail && <p className="alert alert-info">Cargando detalle del cliente...</p>}

      {showForm && (
        <form className="dashboard-card admin-entity-form mb-4" onSubmit={handleSave}>
          <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
            <h3 className="h5 mb-0">
              {editingId ? "Editar registro" : `Crear ${entity === "clientes" ? "cliente" : entity === "usuarios" ? "usuario" : "registro"}`}
            </h3>
            <button type="button" className="btn-close" aria-label="Cerrar" onClick={closeForm} />
          </div>
          {entity === "clientes" && !editingId && (
            /* El backend crea la cuenta vinculada con rol CLIENTE usando el correo y la contraseña ingresados. */
            <p className="text-muted">Se creará una cuenta de usuario activa con el rol CLIENTE y los datos de acceso indicados abajo.</p>
          )}
          <div className="admin-entity-fields">
            {formColumns.map((column) => (
              <EntityField
                key={column.name}
                column={column}
                value={values[column.name] ?? ""}
                onChange={(value) => setValues((current) => ({ ...current, [column.name]: value }))}
                disabled={Boolean(
                  customerId
                  && (column.name === "id_cliente"
                    || (entity === "notificaciones" && column.name === "id_usuario"))
                )}
                requiredOverride={entity === "clientes" && column.name === "correo" && !editingId ? true : undefined}
              />
            ))}
            {(entity === "usuarios" || (entity === "clientes" && !editingId)) && (
              <label className="admin-entity-field">
                <span>
                  {editingId ? "Nueva contraseña (opcional, mínimo 8 caracteres)" : "Contraseña (mínimo 8 caracteres)"}
                  {editingId ? "" : " *"}
                </span>
                <input
                  className="form-control"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required={!editingId}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
            )}
          </div>
          {entity === "usuarios" && isClientRole && !editingId && (
            <>
              <h4 className="h6 mt-4">Datos del perfil cliente</h4>
              <div className="admin-entity-fields">
                {customerFields.map((field) => (
                  <label className="admin-entity-field" key={field.name}>
                    <span>{field.label}{field.required ? " *" : ""}</span>
                    {field.options ? (
                      <select
                        className="form-select"
                        value={customer[field.name] || ""}
                        onChange={(event) => setCustomer((current) => ({ ...current, [field.name]: event.target.value }))}
                        required={field.required}
                      >
                        <option value="">Selecciona...</option>
                        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input
                        className="form-control"
                        value={customer[field.name] || ""}
                        maxLength={field.maxLength}
                        required={field.required}
                        onChange={(event) => setCustomer((current) => ({ ...current, [field.name]: event.target.value }))}
                      />
                    )}
                  </label>
                ))}
              </div>
            </>
          )}
          <div className="d-flex gap-2 mt-4">
            <button className="btn btn-success" type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button className="btn btn-outline-secondary" type="button" onClick={closeForm}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
        <label className="admin-entity-search">
          <span className="visually-hidden">Buscar en esta tabla</span>
          <input
            className="form-control"
            type="search"
            placeholder={entity === "clientes"
              ? "Buscar por nombre, documento, número, teléfono, correo o dirección..."
              : "Buscar..."}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span className="text-muted">{visibleRows.length} registros</span>
      </div>

      <div className="tabla-container admin-entity-table">
        <table className="table table-striped table-hover">
          <thead className="table-dark">
            <tr>
              {tableColumns.map((column) => <th key={column.name}>{humanize(column.name.replace(/^id_/, ""))}</th>)}
              {!metadata?.soloLectura && !contextReadOnly && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={tableColumns.length + (metadata?.soloLectura || contextReadOnly ? 0 : 1)} className="text-center text-muted">
                  {customerId ? "Este cliente no tiene registros en esta sección." : "No hay registros para mostrar."}
                </td>
              </tr>
            ) : visibleRows.map((row) => (
              <tr
                key={row[metadata.clave]}
                onClick={entity === "clientes" ? () => openCustomerDetail(row) : undefined}
                style={entity === "clientes" ? { cursor: "pointer" } : undefined}
              >
                {tableColumns.map((column) => (
                  <td key={column.name}>{renderCell(column, row)}</td>
                ))}
                {!metadata.soloLectura && !contextReadOnly && (
                  <td>
                    <div className="d-flex justify-content-center align-items-center gap-2 flex-wrap">
                      {entity === "clientes" && (
                        <>
                          <button
                            type="button"
                            className="btn btn-info btn-sm text-white"
                            onClick={(event) => {
                              event.stopPropagation();
                              openCustomerDetail(row);
                            }}
                          >
                            Ver detalle
                          </button>
                          <Link
                            className="btn btn-outline-info btn-sm"
                            to={`/clientes/${row[metadata.clave]}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            Gestionar
                          </Link>
                        </>
                      )}
                      <button type="button" className="btn btn-warning btn-sm" onClick={(event) => {
                        event.stopPropagation();
                        startEdit(row);
                      }}>Editar</button>
                      {metadata.archivable && (
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={(event) => {
                          event.stopPropagation();
                          handleArchive(row);
                        }}>
                          Desactivar
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default EntityAdmin;
