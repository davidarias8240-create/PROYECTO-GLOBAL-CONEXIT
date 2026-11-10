import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  desactivarRegistroEntidad,
  guardarRegistroEntidad,
  obtenerDetalleCliente,
  obtenerMetadatosEntidad,
  obtenerRegistrosEntidad,
  obtenerSeguimientoTicket,
} from "../services/api";
import { sanitizeDocument, sanitizePhone, validateFieldSet, validateFieldValue } from "../utils/formValidation";

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

function customerFieldColumn(field) {
  const maxLength = field.name === "nombres" ? 120 : field.maxLength || 30;
  return {
    name: field.name,
    type: "varchar",
    columnType: `varchar(${maxLength})`,
    nullable: !field.required,
    default: field.required ? null : "",
    generated: false,
    enum: field.options || [],
  };
}

// El formulario de usuarios reutiliza estos campos cuando se selecciona el rol CLIENTE.

function humanize(name) {
  return name
    .replace(/^id_/, "ID ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ticketStatusLabel(status) {
  const labels = {
    ABIERTO: "Abierto",
    EN_PROCESO: "En proceso",
    PENDIENTE: "Pendiente del cliente",
    CERRADO: "Cerrado",
  };
  return labels[status] || status;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
}

function relationOption(metadata, row, field) {
  const column = metadata?.columnas.find((item) => item.name === field);
  return column?.options?.find((option) => String(option.value) === String(row[field]));
}

function documentDate(value) {
  if (!value) return "No especificada";
  const rawValue = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawValue);
  const date = dateOnly
    ? new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12))
    : new Date(rawValue.includes(" ") ? rawValue.replace(" ", "T") : rawValue);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(date);
}

function documentMoney(value) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function documentField(label, value) {
  if (value === null || value === undefined || value === "") return "";
  return `<div class="field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function buildRelatedDocument(entity, row, metadata) {
  const isContract = entity === "contratos";
  const clientOption = relationOption(metadata, row, isContract ? "id_cliente" : "id_contrato");
  const clientDetails = clientOption?.details;
  const clientName = isContract
    ? clientDetails?.nombres || clientOption?.label?.split(" · ")[0]
    : clientDetails?.cliente_nombre;
  const title = isContract ? "Contrato de servicio" : "Factura de servicio";
  const reference = isContract
    ? `Contrato #${row.id_contrato}`
    : `Factura ${row.numero || `#${row.id_factura}`}`;
  const clientFields = [
    documentField("Cliente", clientName),
    documentField("Número de cliente", clientDetails?.cliente_numero || clientDetails?.numero_cliente),
    documentField(
      "Documento",
      [clientDetails?.tipo_documento, clientDetails?.numero_documento].filter(Boolean).join(" ")
    ),
    documentField("Teléfono", clientDetails?.telefono),
    documentField("Correo", clientDetails?.correo),
  ].join("");

  let content;
  if (isContract) {
    const plan = relationOption(metadata, row, "id_plan");
    const address = relationOption(metadata, row, "id_direccion");
    content = `
      <section><h2>Datos del cliente</h2><div class="grid">${clientFields}</div></section>
      <section><h2>Servicio contratado</h2><div class="grid">
        ${documentField("Plan", plan?.label)}
        ${documentField("Velocidad", plan?.details?.velocidad)}
        ${documentField("Valor mensual", plan?.details?.precio == null ? "" : documentMoney(plan.details.precio))}
        ${documentField("Dirección del servicio", address?.label)}
      </div></section>
      <section><h2>Vigencia y estado</h2><div class="grid">
        ${documentField("Fecha de inicio", documentDate(row.fecha_inicio))}
        ${documentField("Fecha de finalización", documentDate(row.fecha_fin))}
        ${documentField("Estado", row.estado)}
        ${documentField("Motivo / observación", row.motivo_estado)}
      </div></section>
      <p class="note">Documento informativo generado a partir del registro del contrato en el sistema.</p>`;
  } else {
    const period = relationOption(metadata, row, "id_periodo");
    const planName = clientDetails?.plan_nombre;
    content = `
      <section><h2>Datos del cliente</h2><div class="grid">${clientFields}</div></section>
      <section><h2>Detalle de facturación</h2>
        <div class="grid">
          ${documentField("Contrato", `Contrato #${row.id_contrato}`)}
          ${documentField("Plan", planName)}
          ${documentField("Período facturado", period?.label)}
          ${documentField("Fecha de emisión", documentDate(row.fecha_emision))}
          ${documentField("Fecha de vencimiento", documentDate(row.fecha_vencimiento))}
          ${documentField("Estado", row.estado)}
        </div>
        <table><thead><tr><th>Concepto</th><th class="amount">Valor</th></tr></thead>
          <tbody><tr><td>Servicio ${escapeHtml(planName || "contratado")}</td><td class="amount">${escapeHtml(documentMoney(row.total))}</td></tr></tbody>
          <tfoot>
            <tr><th>Total</th><th class="amount">${escapeHtml(documentMoney(row.total))}</th></tr>
            <tr><td>Saldo pendiente</td><td class="amount">${escapeHtml(documentMoney(row.saldo))}</td></tr>
          </tfoot>
        </table>
      </section>
      <p class="note">Documento generado a partir de la factura registrada en el sistema. El saldo refleja los pagos aplicados al momento de la consulta.</p>`;
  }

  const generatedAt = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date());
  return `<!doctype html>
    <html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(reference)}</title>
      <style>
        *{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#252525;margin:0;padding:40px}
        header{border-bottom:3px solid #e9650a;padding-bottom:18px;margin-bottom:28px}
        .brand{color:#e9650a;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:1px}
        h1{font-size:25px;margin:8px 0}.reference{color:#555}
        section{margin:24px 0}h2{font-size:16px;border-bottom:1px solid #ddd;padding-bottom:8px}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px 28px}
        .field span{display:block;color:#666;font-size:11px;text-transform:uppercase;margin-bottom:4px}
        .field strong{font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere}
        table{width:100%;border-collapse:collapse;margin-top:20px}
        th,td{padding:10px;border-bottom:1px solid #ddd;text-align:left}
        thead{background:#f4f4f4}.amount{text-align:right}
        tfoot th,tfoot td{border-bottom:0}.note{font-size:11px;color:#666;margin-top:30px}
        footer{border-top:1px solid #ddd;color:#777;font-size:10px;margin-top:40px;padding-top:10px}
        @media print{body{padding:12mm}section{break-inside:avoid}header{break-after:avoid}}
      </style>
    </head><body>
      <header><div class="brand">Global Conexit</div><h1>${escapeHtml(title)}</h1><div class="reference">${escapeHtml(reference)}</div></header>
      ${content}
      <footer>Generado el ${escapeHtml(generatedAt)} · Global Conexit</footer>
    </body></html>`;
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

function currentBusinessDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function currentBusinessTime() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function currentBusinessDateTime() {
  const { year, month, day } = currentBusinessDate();
  const { hour, minute } = currentBusinessTime();
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function createIdempotencyKey() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function minimumDate(entity, column) {
  const restrictedFields = {
    planes: ["vigencia_inicio"],
    contratos: ["fecha_inicio"],
    facturas: ["fecha_emision"],
    ordenes: ["fecha_programada"],
  };
  if (!restrictedFields[entity]?.includes(column.name)) return undefined;

  const { year, month, day } = currentBusinessDate();
  if (column.type === "date") return `${year}-${month}-${day}`;
  if (["datetime", "timestamp"].includes(column.type)) {
    const { hour, minute } = currentBusinessTime();
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }
  return undefined;
}

function formatRelationDetails(column, option) {
  const details = option?.details;
  if (!details) return "";
  const money = (value) => new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

  if (column.relation.table === "cliente") {
    return [
      [details.tipo_documento, details.numero_documento].filter(Boolean).join(" "),
      details.telefono,
      details.correo,
    ].filter(Boolean).join(" · ");
  }
  if (column.relation.table === "factura") {
    return `Cliente: ${details.cliente_nombre} · Total: ${money(details.total)} · Saldo: ${money(details.saldo)} · ${details.estado}`;
  }
  if (column.relation.table === "contrato") {
    return `Cliente: ${details.cliente_nombre} · Plan: ${money(details.plan_precio)} · Dirección: ${details.direccion}`;
  }
  if (column.relation.table === "plan") {
    return `${details.velocidad} · ${money(details.precio)}`;
  }
  if (column.relation.table === "periodo_facturacion") {
    return `Vence: ${details.fecha_vencimiento}`;
  }
  return "";
}

function EntityField({
  entity,
  column,
  value,
  values,
  error,
  onChange,
  onBlur,
  disabled = false,
  requiredOverride,
}) {
  const [relationSearch, setRelationSearch] = useState("");
  const label = humanize(column.name);
  const required = requiredOverride ?? (!column.nullable && column.default === null && !column.generated);
  const isBoolean = column.type === "tinyint" && column.columnType.includes("(1)");
  const min = minimumDate(entity, column);
  const maxLength = Number(column.columnType.match(/varchar\((\d+)\)/i)?.[1]) || 255;
  const controlClass = (base) => `${base}${error ? " is-invalid" : ""}`;
  const changeValue = (rawValue) => {
    if (["telefono", "celular", "numero_celular", "telefono_contacto"].includes(column.name)) {
      onChange(sanitizePhone(rawValue));
      return;
    }
    if (["numero_documento", "documento"].includes(column.name)) {
      onChange(sanitizeDocument(rawValue, values.tipo_documento, maxLength));
      return;
    }
    onChange(rawValue);
  };
  const fieldError = error && <small className="text-danger d-block" role="alert">{error}</small>;

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
          className={controlClass("form-select")}
          value={value ?? ""}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            onChange(event.target.value);
            setRelationSearch("");
          }}
          onBlur={onBlur}
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
        {fieldError}
        {selectedOption && formatRelationDetails(column, selectedOption) && (
          <small className="text-muted">
            {formatRelationDetails(column, selectedOption)}
          </small>
        )}
      </label>
    );
  }

  const isLongText = ["text", "longtext", "mediumtext"].includes(column.type);
  return (
    <label className="admin-entity-field">
      <span>{label}{required ? " *" : ""}</span>
      {isLongText ? (
        <textarea
          className={controlClass("form-control")}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={Boolean(error)}
          required={required}
          disabled={disabled}
          rows={3}
        />
      ) : (
        <input
          className={controlClass("form-control")}
          type={inputType(column)}
          inputMode={["telefono", "celular", "numero_celular", "telefono_contacto"].includes(column.name)
            ? "numeric"
            : ["numero_documento", "documento"].includes(column.name)
              && ["CC", "TI", "NIT"].includes(values.tipo_documento)
              ? "numeric"
              : ["decimal", "float", "double"].includes(column.type) ? "decimal" : undefined}
          step={column.type === "decimal" || column.type === "float" || column.type === "double" ? "0.01" : undefined}
          min={entity === "pagos" && column.name === "valor" ? "0.01" : min}
          value={fieldValue(column, value)}
          onChange={(event) => changeValue(event.target.value)}
          onBlur={onBlur}
          aria-invalid={Boolean(error)}
          required={required}
          disabled={disabled}
          maxLength={["telefono", "celular", "numero_celular", "telefono_contacto"].includes(column.name) ? 10 : maxLength}
        />
      )}
      {fieldError}
    </label>
  );
}

function EntityAdmin({ entity, customerId = null, customerUserId = null }) {
  const contextReadOnly = Boolean(customerId && ["planes", "periodos"].includes(entity));
  const [metadata, setMetadata] = useState(null);
  const [rows, setRows] = useState([]);
  const [values, setValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [customer, setCustomer] = useState({});
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [ticketStatus, setTicketStatus] = useState("");
  const [ticketComment, setTicketComment] = useState("");
  const [loadingTicketDetail, setLoadingTicketDetail] = useState(false);
  const [savingTicket, setSavingTicket] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingCustomerDetail, setLoadingCustomerDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const savingRef = useRef(false);
  const requestSequence = useRef(0);
  const lastClientSearch = useRef("");
  const relationRequestSequence = useRef(0);
  const paymentIdempotencyKey = useRef(null);

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
    setSelectedTicket(null);
    setTicketComment("");
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

  useEffect(() => {
    if (!showForm || !["contratos", "tickets", "solicitudes"].includes(entity)) return undefined;
    const requestId = ++relationRequestSequence.current;
    const selectedClientId = values.id_cliente || null;
    let cancelled = false;

    obtenerMetadatosEntidad(entity, selectedClientId)
      .then((meta) => {
        if (cancelled || requestId !== relationRequestSequence.current) return;
        setMetadata((current) => current && ({
          ...current,
          columnas: current.columnas.map((column) => {
            const updatedColumn = meta.columnas.find((item) => item.name === column.name);
            return column.name !== "id_cliente" && column.relation && updatedColumn
              ? { ...column, options: updatedColumn.options }
              : column;
          }),
        }));
      })
      .catch((loadError) => {
        if (!cancelled && requestId === relationRequestSequence.current) {
          setError(loadError.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [entity, showForm, values.id_cliente]);

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
      && !(entity === "tickets" && ["estado", "fecha_cierre"].includes(column.name))
      && (!column.generated || (entity === "pagos" && column.name === "fecha"))
      && column.name !== "contrasena_hash"
    ),
    [entity, metadata, visibleColumns]
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
    setFieldErrors({});
    paymentIdempotencyKey.current = null;
    setValues({});
    setCustomer({});
    setPassword("");
  };

  const openTicketDetail = async (row) => {
    setLoadingTicketDetail(true);
    setError("");
    setNotice("");
    try {
      const detail = await obtenerSeguimientoTicket(row.id_ticket);
      setSelectedTicket(detail);
      setTicketStatus(detail.ticket.estado);
      setTicketComment("");
    } catch (detailError) {
      setError(detailError.message);
    } finally {
      setLoadingTicketDetail(false);
    }
  };

  const closeTicketDetail = () => {
    setSelectedTicket(null);
    setTicketComment("");
  };

  const handleTicketManagement = async (event) => {
    event.preventDefault();
    if (!selectedTicket) return;

    setSavingTicket(true);
    setError("");
    setNotice("");
    try {
      await guardarRegistroEntidad("tickets", {
        datos: { estado: ticketStatus },
        gestion_ticket: true,
        observacion_gestion: ticketComment,
      }, selectedTicket.ticket.id_ticket, customerId);
      const detail = await obtenerSeguimientoTicket(selectedTicket.ticket.id_ticket);
      setSelectedTicket(detail);
      setTicketStatus(detail.ticket.estado);
      setTicketComment("");
      setNotice("Seguimiento del ticket actualizado.");
      await loadData();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingTicket(false);
    }
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
    paymentIdempotencyKey.current = entity === "pagos" ? createIdempotencyKey() : null;
    const initialValues = Object.fromEntries(formColumns.map((column) => [
      column.name,
      defaultFieldValue(column),
    ]));
    if (entity === "pagos" && Object.hasOwn(initialValues, "fecha")) {
      initialValues.fecha = currentBusinessDateTime();
    }
    if (entity === "facturas" && Object.hasOwn(initialValues, "fecha_emision")) {
      const { year, month, day } = currentBusinessDate();
      initialValues.fecha_emision = `${year}-${month}-${day}`;
    }
    if (customerId && Object.hasOwn(initialValues, "id_cliente")) {
      initialValues.id_cliente = customerId;
    }
    if (entity === "notificaciones" && customerUserId && Object.hasOwn(initialValues, "id_usuario")) {
      initialValues.id_usuario = customerUserId;
    }
    setValues(initialValues);
    setFieldErrors({});
    setCustomer({});
    setPassword("");
    setEditingId(null);
    setShowForm(true);
  };

  const handleFieldChange = (column, value) => {
    setValues((current) => {
      const next = { ...current, [column.name]: value };
      if (column.name === "id_cliente" && String(current.id_cliente ?? "") !== String(value)) {
        for (const relatedColumn of formColumns) {
          if (relatedColumn.name === "id_cliente") continue;
          if (["direccion", "contrato", "factura"].includes(relatedColumn.relation?.table)) {
            next[relatedColumn.name] = "";
          }
        }
        if (entity === "solicitudes") {
          const client = column.options?.find((option) => String(option.value) === String(value));
          next.nombre_contacto = client?.details?.nombres || "";
          next.correo = client?.details?.correo || "";
          next.telefono = client?.details?.telefono || "";
        }
      }

      if (column.name === "id_contrato" && entity === "ordenes") {
        const contract = column.options?.find((option) => String(option.value) === String(value));
        next.id_direccion = contract?.details?.direccion_id || "";
      }
      if (entity === "facturas" && column.name === "id_contrato" && !editingId) {
        const contract = column.options?.find((option) => String(option.value) === String(value));
        next.id_periodo = "";
        next.fecha_vencimiento = "";
        next.total = contract?.details?.plan_precio || "";
        next.saldo = contract?.details?.plan_precio || "";
      }
      if (entity === "facturas" && column.name === "id_periodo" && !editingId) {
        const period = column.options?.find((option) => String(option.value) === String(value));
        next.fecha_vencimiento = period?.details?.fecha_vencimiento || "";
      }
      if (column.name === "id_factura" && entity === "pagos" && !editingId) {
        const invoice = column.options?.find((option) => String(option.value) === String(value));
        next.valor = invoice?.details?.saldo || "";
      }
      setFieldErrors((currentErrors) => {
        const required = !column.nullable && column.default === null && !column.generated;
        const error = validateFieldValue(column, next[column.name], { entity, values: next, required });
        const updatedErrors = { ...currentErrors };
        if (error) updatedErrors[column.name] = error;
        else delete updatedErrors[column.name];
        if (column.name === "tipo_documento" && next.numero_documento) {
          const documentColumn = formColumns.find((item) => item.name === "numero_documento");
          if (documentColumn) {
            const documentError = validateFieldValue(documentColumn, next.numero_documento, {
              entity,
              values: next,
              required: !documentColumn.nullable,
            });
            if (documentError) updatedErrors.numero_documento = documentError;
            else delete updatedErrors.numero_documento;
          }
        }
        return updatedErrors;
      });
      return next;
    });
  };

  const handleFieldBlur = (column) => {
    const required = !column.nullable && column.default === null && !column.generated;
    const error = validateFieldValue(column, values[column.name], { entity, values, required });
    setFieldErrors((current) => {
      const next = { ...current };
      if (error) next[column.name] = error;
      else delete next[column.name];
      return next;
    });
  };

  const handleCustomerFieldChange = (field, rawValue) => {
    let value = rawValue;
    if (field.name === "telefono") value = sanitizePhone(value);
    if (field.name === "numero_documento") {
      value = sanitizeDocument(value, customer.tipo_documento, field.maxLength);
    }
    const nextCustomer = { ...customer, [field.name]: value };
    setCustomer(nextCustomer);
    const error = validateFieldValue(customerFieldColumn(field), value, {
      entity: "clientes",
      values: nextCustomer,
      required: field.required,
    });
    const documentField = customerFields.find((item) => item.name === "numero_documento");
    const documentError = field.name === "tipo_documento" && documentField && nextCustomer.numero_documento
      ? validateFieldValue(customerFieldColumn(documentField), nextCustomer.numero_documento, {
        entity: "clientes",
        values: nextCustomer,
        required: true,
      })
      : "";
    setFieldErrors((current) => {
      const next = { ...current };
      if (error) next[`cliente.${field.name}`] = error;
      else delete next[`cliente.${field.name}`];
      if (field.name === "tipo_documento") {
        if (documentError) next["cliente.numero_documento"] = documentError;
        else delete next["cliente.numero_documento"];
      }
      return next;
    });
  };

  const startEdit = (row) => {
    setNotice("");
    paymentIdempotencyKey.current = null;
    setEditingId(row[metadata.clave]);
    setValues(Object.fromEntries(formColumns.map((column) => [
      column.name,
      fieldValue(column, row[column.name]),
    ])));
    setFieldErrors({});
    setPassword("");
    setShowForm(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    const errors = validateFieldSet(formColumns, values, entity);
    if (entity === "usuarios" && !editingId && isClientRole) {
      if (!["CC", "CE", "NIT", "TI", "PASAPORTE", "OTRO"].includes(customer.tipo_documento)) {
        errors["cliente.tipo_documento"] = "Selecciona un tipo de documento válido.";
      }
      for (const field of customerFields) {
        const error = validateFieldValue(customerFieldColumn(field), customer[field.name] || "", {
          entity: "clientes",
          values: customer,
          required: field.required,
        });
        if (error) errors[`cliente.${field.name}`] = error;
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    savingRef.current = true;
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
      if (entity === "pagos" && !editingId) {
        payload.idempotencia_key = paymentIdempotencyKey.current;
      }
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
      savingRef.current = false;
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

  const canDownloadDocument = ["contratos", "facturas"].includes(entity);
  const canManageRecords = !metadata?.soloLectura && !contextReadOnly;
  const downloadDocument = (row) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("El navegador bloqueó la ventana del documento. Permite ventanas emergentes e inténtalo de nuevo.");
      return;
    }
    setError("");
    printWindow.document.open();
    printWindow.document.write(buildRelatedDocument(entity, row, metadata));
    printWindow.document.close();
    window.setTimeout(() => {
      if (printWindow.closed) return;
      printWindow.focus();
      printWindow.print();
    }, 250);
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
      {entity === "tickets" && loadingTicketDetail && <p className="alert alert-info">Cargando detalle del ticket...</p>}
      {entity === "tickets" && selectedTicket && (
        <section className="dashboard-card admin-entity-form mb-4">
          <div className="d-flex justify-content-between align-items-start gap-2 mb-3">
            <div>
              <h3 className="h5 mb-1">Ticket #{selectedTicket.ticket.id_ticket}</h3>
              <p className="text-muted mb-0">
                {selectedTicket.ticket.cliente_nombre} · {selectedTicket.ticket.numero_cliente}
              </p>
            </div>
            <button type="button" className="btn-close" aria-label="Cerrar detalle del ticket" onClick={closeTicketDetail} />
          </div>
          <dl className="row mb-4">
            <dt className="col-sm-3">Asunto</dt>
            <dd className="col-sm-9">{selectedTicket.ticket.asunto}</dd>
            <dt className="col-sm-3">Descripción</dt>
            <dd className="col-sm-9">{selectedTicket.ticket.descripcion}</dd>
            <dt className="col-sm-3">Creado</dt>
            <dd className="col-sm-9">{formatDate(selectedTicket.ticket.fecha_creacion)}</dd>
            <dt className="col-sm-3">Última actualización</dt>
            <dd className="col-sm-9">{formatDate(selectedTicket.ticket.fecha_actualizacion)}</dd>
          </dl>
          <form onSubmit={handleTicketManagement}>
            <div className="admin-entity-fields">
              <label className="admin-entity-field">
                <span>Estado del ticket</span>
                <select
                  className="form-select"
                  value={ticketStatus}
                  onChange={(event) => setTicketStatus(event.target.value)}
                  required
                >
                  {metadata.columnas
                    .find((column) => column.name === "estado")
                    ?.enum.filter((status) => status === selectedTicket.ticket.estado
                      || ({
                        ABIERTO: ["EN_PROCESO", "PENDIENTE", "CERRADO"],
                        EN_PROCESO: ["PENDIENTE", "CERRADO"],
                        PENDIENTE: ["EN_PROCESO", "CERRADO"],
                        CERRADO: ["ABIERTO"],
                      })[selectedTicket.ticket.estado]?.includes(status))
                    .map((status) => (
                      <option key={status} value={status}>{ticketStatusLabel(status)}</option>
                    ))}
                </select>
              </label>
              <label className="admin-entity-field">
                <span>Observación o respuesta para el cliente</span>
                <textarea
                  className="form-control"
                  value={ticketComment}
                  onChange={(event) => setTicketComment(event.target.value)}
                  maxLength={5000}
                  rows={3}
                />
              </label>
            </div>
            <div className="d-flex gap-2 mt-3">
              <button
                className="btn btn-success"
                type="submit"
                disabled={savingTicket || (ticketStatus === selectedTicket.ticket.estado && !ticketComment.trim())}
              >
                {savingTicket ? "Guardando..." : "Guardar seguimiento"}
              </button>
              <button className="btn btn-outline-secondary" type="button" onClick={closeTicketDetail}>Cerrar</button>
            </div>
          </form>
          <div className="mt-4">
            <h4 className="h6">Historial de seguimiento</h4>
            {selectedTicket.historial.length === 0 ? (
              <p className="text-muted mb-0">No hay cambios de estado ni observaciones registradas.</p>
            ) : (
              <ol className="mb-0">
                {selectedTicket.historial.map((item) => (
                  <li className="mb-3" key={item.id_interaccion}>
                    <strong>
                      {item.estado_anterior && item.estado_nuevo
                        ? `${ticketStatusLabel(item.estado_anterior)} → ${ticketStatusLabel(item.estado_nuevo)}`
                        : "Observación de gestión"}
                    </strong>
                    <div className="text-muted">{formatDate(item.fecha)} · {item.responsable || "Usuario administrador"}</div>
                    {item.descripcion && <p className="mb-0">{item.descripcion}</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      )}

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
              (() => {
                let fieldColumn = column;
                if (entity === "ordenes" && column.name === "id_direccion" && values.id_contrato) {
                  const contract = metadata.columnas
                    .find((item) => item.name === "id_contrato")
                    ?.options?.find((option) => String(option.value) === String(values.id_contrato));
                  if (contract?.details?.cliente_id) {
                    fieldColumn = {
                      ...column,
                      options: column.options.filter((option) =>
                        String(option.details?.cliente_id) === String(contract.details.cliente_id)
                      ),
                    };
                  }
                }
                return (
                  <EntityField
                    key={column.name}
                    entity={entity}
                    column={fieldColumn}
                    value={values[column.name] ?? ""}
                    values={values}
                    error={fieldErrors[column.name]}
                    onChange={(value) => handleFieldChange(column, value)}
                    onBlur={() => handleFieldBlur(column)}
                    disabled={Boolean(
                      customerId
                      && (column.name === "id_cliente"
                        || (entity === "notificaciones" && column.name === "id_usuario"))
                    )}
                    requiredOverride={entity === "clientes" && column.name === "correo" && !editingId ? true : undefined}
                  />
                );
              })()
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
                        onChange={(event) => handleCustomerFieldChange(field, event.target.value)}
                        onBlur={() => {
                          const error = validateFieldValue(customerFieldColumn(field), customer[field.name] || "", {
                            entity: "clientes",
                            values: customer,
                            required: field.required,
                          });
                          setFieldErrors((current) => {
                            const next = { ...current };
                            if (error) next[`cliente.${field.name}`] = error;
                            else delete next[`cliente.${field.name}`];
                            return next;
                          });
                        }}
                        required={field.required}
                        aria-invalid={Boolean(fieldErrors[`cliente.${field.name}`])}
                      >
                        <option value="">Selecciona...</option>
                        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input
                        className={`form-control${fieldErrors[`cliente.${field.name}`] ? " is-invalid" : ""}`}
                        type={field.name === "telefono" ? "tel" : "text"}
                        inputMode={["telefono", "numero_documento"].includes(field.name) ? "numeric" : undefined}
                        value={customer[field.name] || ""}
                        maxLength={field.name === "telefono" ? 10 : field.maxLength}
                        required={field.required}
                        aria-invalid={Boolean(fieldErrors[`cliente.${field.name}`])}
                        onChange={(event) => handleCustomerFieldChange(field, event.target.value)}
                        onBlur={() => {
                          const error = validateFieldValue(customerFieldColumn(field), customer[field.name] || "", {
                            entity: "clientes",
                            values: customer,
                            required: field.required,
                          });
                          setFieldErrors((current) => {
                            const next = { ...current };
                            if (error) next[`cliente.${field.name}`] = error;
                            else delete next[`cliente.${field.name}`];
                            return next;
                          });
                        }}
                      />
                    )}
                    {fieldErrors[`cliente.${field.name}`] && (
                      <small className="text-danger d-block" role="alert">{fieldErrors[`cliente.${field.name}`]}</small>
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
              {(canManageRecords || canDownloadDocument) && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={tableColumns.length + (canManageRecords || canDownloadDocument ? 1 : 0)} className="text-center text-muted">
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
                {(canManageRecords || canDownloadDocument) && (
                  <td>
                    <div className="d-flex justify-content-center align-items-center gap-2 flex-wrap">
                      {canDownloadDocument && (
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          title="Imprimir o guardar como PDF"
                          aria-label="Imprimir o guardar como PDF"
                          onClick={(event) => {
                            event.stopPropagation();
                            downloadDocument(row);
                          }}
                        >
                          <i className="bi bi-file-earmark-pdf" aria-hidden="true" />
                        </button>
                      )}
                      {canManageRecords && (
                        <>
                          {entity === "tickets" && (
                            <button
                              type="button"
                              className="btn btn-info btn-sm text-white"
                              title="Gestionar ticket"
                              aria-label={`Gestionar ticket ${row.id_ticket}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                openTicketDetail(row);
                              }}
                            >
                              <i className="bi bi-chat-square-text" aria-hidden="true" />
                            </button>
                          )}
                          {entity === "clientes" && (
                            <>
                              <button
                                type="button"
                                className="btn btn-info btn-sm text-white"
                                title="Ver detalle"
                                aria-label="Ver detalle"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openCustomerDetail(row);
                                }}
                              >
                                <i className="bi bi-eye" aria-hidden="true" />
                              </button>
                              <Link
                                className="btn btn-outline-info btn-sm"
                                to={`/clientes/${row[metadata.clave]}`}
                                title="Gestionar cliente"
                                aria-label="Gestionar cliente"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <i className="bi bi-gear" aria-hidden="true" />
                              </Link>
                            </>
                          )}
                          <button
                            type="button"
                            className="btn btn-warning btn-sm"
                            title="Editar"
                            aria-label="Editar"
                            onClick={(event) => {
                              event.stopPropagation();
                              startEdit(row);
                            }}
                          >
                            <i className="bi bi-pencil" aria-hidden="true" />
                          </button>
                          {metadata.archivable && (
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm"
                              title="Desactivar"
                              aria-label="Desactivar"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleArchive(row);
                              }}
                            >
                              <i className="bi bi-toggle-off" aria-hidden="true" />
                            </button>
                          )}
                        </>
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
