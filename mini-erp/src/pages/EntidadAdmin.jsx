import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import Stepper, { Step } from "../components/Stepper";
import { confirmAction, showErrorAlert, showSuccessAlert } from "../utils/alerts";
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

const addressFields = [
  { name: "direccion", label: "Dirección", required: true, maxLength: 255 },
  { name: "ciudad", label: "Ciudad", required: true, maxLength: 100 },
  { name: "departamento", label: "Departamento", required: true, maxLength: 100 },
  { name: "referencia", label: "Referencia o punto cercano", required: false, maxLength: 255 },
];

const formStepOrder = [
  ["identity", "Identificación"],
  ["main", "Datos principales"],
  ["relations", "Relaciones"],
  ["details", "Información adicional"],
  ["contact", "Contacto"],
  ["schedule", "Fechas y valores"],
  ["status", "Estado y configuración"],
  ["access", "Acceso"],
  ["address", "Dirección"],
];

const singularEntityNames = {
  ajustes: "ajuste",
  auditoria: "registro de auditoría",
  clientes: "cliente",
  contratos: "contrato",
  direcciones: "dirección",
  facturas: "factura",
  interacciones: "interacción",
  notificaciones: "notificación",
  ordenes: "orden de servicio",
  pagos: "pago",
  periodos: "período",
  planes: "plan",
  roles: "rol",
  solicitudes: "solicitud",
  tickets: "ticket",
  usuarios: "usuario",
};

function formStepKey(column) {
  const name = column.name.toLocaleLowerCase("es");
  if (/documento|^nit$/.test(name)) return "identity";
  if (["direccion", "ciudad", "departamento", "referencia", "id_direccion"].includes(name)) return "address";
  if (/correo|email|telefono|celular/.test(name)) return "contact";
  if (/fecha|valor|saldo|total|precio|monto/.test(name)) return "schedule";
  if (/estado|activo|prioridad/.test(name)) return "status";
  if (name.startsWith("id_")) return "relations";
  if (/nombre|asunto|descripcion|mensaje|tipo/.test(name)) return "main";
  return "details";
}

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

function technicianOrderStatuses(state, hasSchedule) {
  const transitions = {
    PENDIENTE: ["PROGRAMADA", "CANCELADA"],
    PROGRAMADA: ["EN_PROCESO", "REPROGRAMADA", "CANCELADA"],
    EN_PROCESO: ["CERRADA", "REPROGRAMADA"],
    REPROGRAMADA: ["PROGRAMADA", "EN_PROCESO", "CANCELADA"],
    CERRADA: [],
    CANCELADA: [],
  };
  return [state, ...(transitions[state] || [])].filter((status) =>
    status !== "PROGRAMADA" || hasSchedule
  );
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

function requestSummary(message) {
  const text = String(message || "");
  const extract = (pattern) => {
    const match = text.match(pattern);
    return match?.[1]?.trim() || "";
  };

  return {
    plan: extract(/Solicitud para el plan\s+(.+?)\.\s*Documento:/i),
    document: extract(/Documento:\s*([^.\n]+)\.\s*Direcci[oó]n/i),
    address: extract(/Direcci[oó]n de instalaci[oó]n:\s*([^.\n]+)\.\s*(?:El titular|El titular)/i)
      || extract(/Direcci[oó]n de instalaci[oó]n:\s*([^.\n]+)/i),
    authorization: /Autorizaci[oó]n para fines comerciales:\s*Si\b/i.test(text)
      ? "Sí"
      : /Autorizaci[oó]n para fines comerciales:\s*No\b/i.test(text)
        ? "No"
        : "No especificada",
  };
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
    documentField("Número de cliente", clientDetails?.cliente_numero || clientDetails?.numero_cliente),
    documentField(
      "Documento",
      [clientDetails?.tipo_documento, clientDetails?.numero_documento].filter(Boolean).join(" ")
    ),
    documentField("Teléfono", clientDetails?.telefono),
    documentField("Correo", clientDetails?.correo),
  ].join("");
  const issuerDetails = `
    ${documentField("NIT", "900.123.456-7")}
    ${documentField("Dirección", "Cra. 15 #93-75, Argelia Ant.")}
    ${documentField("Teléfono", "+57 305-915-7061")}
    ${documentField("Correo", "soporte@globalconexit.com")}`;
  const partyDetails = `
    <section class="party-grid">
      <article class="party-card">
        <span class="eyebrow">EMISOR</span>
        <h2>Global Conexit S.A.S.</h2>
        <div class="fields">${issuerDetails}</div>
      </article>
      <article class="party-card">
        <span class="eyebrow">CLIENTE</span>
        <h2>${escapeHtml(clientName || "Cliente")}</h2>
        <div class="fields">${clientFields || '<div class="field"><span>Datos de contacto</span><strong>No registrados</strong></div>'}</div>
      </article>
    </section>`;

  let content;
  if (isContract) {
    const plan = relationOption(metadata, row, "id_plan");
    const address = relationOption(metadata, row, "id_direccion");
    content = `
      ${partyDetails}
      <section class="contract-summary">
        <div class="section-heading"><span class="eyebrow">DETALLE DEL ACUERDO</span><h2>Servicio contratado</h2></div>
        <div class="service-card">
          <div class="service-name"><span>Plan</span><strong>${escapeHtml(plan?.label || "No especificado")}</strong></div>
          <div class="service-facts">
            ${documentField("Velocidad", plan?.details?.velocidad)}
            ${documentField("Valor mensual", plan?.details?.precio == null ? "" : documentMoney(plan.details.precio))}
            ${documentField("Dirección del servicio", address?.label)}
          </div>
        </div>
      </section>
      <section class="term-section">
        <div class="section-heading"><span class="eyebrow">VIGENCIA</span><h2>Plazo y estado</h2></div>
        <div class="term-grid">
          ${documentField("Fecha de inicio", documentDate(row.fecha_inicio))}
          ${documentField("Fecha de finalización", documentDate(row.fecha_fin))}
          ${documentField("Estado del contrato", row.estado)}
          ${documentField("Motivo / observación", row.motivo_estado)}
        </div>
      </section>
      <section class="signatures" aria-label="Espacios de suscripción">
        <div><span></span><strong>Global Conexit S.A.S.</strong><small>EL PRESTADOR</small></div>
        <div><span></span><strong>${escapeHtml(clientName || "Cliente")}</strong><small>EL CLIENTE</small></div>
      </section>
      <p class="note">Resumen informativo generado a partir del registro del contrato en el sistema. Este documento no incluye firmas.</p>`;
  } else {
    const period = relationOption(metadata, row, "id_periodo");
    const planName = clientDetails?.plan_nombre;
    content = `
      ${partyDetails}
      <section class="invoice-details">
        <div class="section-heading"><span class="eyebrow">RESUMEN DE FACTURACIÓN</span><h2>Detalle del servicio</h2></div>
        <div class="invoice-meta">
          ${documentField("Contrato", `Contrato #${row.id_contrato}`)}
          ${documentField("Plan", planName)}
          ${documentField("Período facturado", period?.label)}
          ${documentField("Fecha de emisión", documentDate(row.fecha_emision))}
          ${documentField("Fecha de vencimiento", documentDate(row.fecha_vencimiento))}
        </div>
        <table>
          <thead><tr><th>Descripción</th><th>Período</th><th class="amount">Valor</th></tr></thead>
          <tbody><tr>
            <td>Servicio de conectividad · ${escapeHtml(planName || "Plan contratado")}</td>
            <td>${escapeHtml(period?.label || "—")}</td>
            <td class="amount">${escapeHtml(documentMoney(row.total))}</td>
          </tr></tbody>
        </table>
        <div class="invoice-bottom">
          <p class="invoice-note">El saldo pendiente refleja los pagos aplicados a esta factura al momento de su generación.</p>
          <div class="totals">
            <div><span>Total factura</span><strong>${escapeHtml(documentMoney(row.total))}</strong></div>
            <div class="balance"><span>Saldo pendiente</span><strong>${escapeHtml(documentMoney(row.saldo))}</strong></div>
          </div>
        </div>
      </section>
      <p class="note">Documento informativo generado a partir de la factura registrada en el sistema.</p>`;
  }

  const generatedAt = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date());
  return `<!doctype html>
    <html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(reference)}</title>
      <style>
        *{box-sizing:border-box}
        body{max-width:900px;margin:28px auto;padding:36px;font:14px/1.5 Arial,sans-serif;color:#202b3c;background:#fff}
        .document-header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;border-bottom:3px solid #ef7410;padding-bottom:22px}
        .brand-lockup{display:flex;align-items:center;gap:12px;min-width:190px}
        .brand-mark{display:grid;place-items:center;width:42px;height:42px;border-radius:11px;background:#ef7410;color:#fff;font-size:15px;font-weight:800;letter-spacing:-1px}
        .brand-name{display:block;color:#202b3c;font-size:13px;font-weight:800;letter-spacing:.08em}
        .brand-tagline{display:block;color:#758094;font-size:10px;margin-top:2px}
        .document-heading{flex:1}
        .eyebrow{display:block;color:#e9650a;font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
        h1{font-size:25px;line-height:1.2;margin:4px 0}
        .reference{color:#596579;font-size:12px;font-weight:600}
        .status{padding:7px 11px;border:1px solid #f3c49f;border-radius:20px;background:#fff7ef;color:#a84808;font-size:10px;font-weight:800;text-transform:uppercase;white-space:nowrap}
        .party-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:24px 0}
        .party-card{padding:17px 19px;border:1px solid #e5e9ef;border-radius:9px;background:#fbfcfe;break-inside:avoid}
        .party-card h2{margin:5px 0 12px;font-size:15px}
        .fields{display:grid;grid-template-columns:1fr 1fr;gap:11px 16px}
        .field span{display:block;color:#758094;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}
        .field strong{display:block;color:#283448;font-size:12px;font-weight:600;white-space:pre-wrap;overflow-wrap:anywhere}
        section{margin:25px 0}
        .section-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:12px}
        .section-heading h2{margin:2px 0 0;font-size:17px}
        .invoice-meta,.term-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px 20px}
        .invoice-meta{padding:15px 17px;border-radius:8px;background:#f4f6f9}
        table{width:100%;border-collapse:collapse;margin-top:18px}
        th,td{padding:12px 13px;border-bottom:1px solid #e5e9ef;text-align:left;vertical-align:top}
        thead{background:#263449;color:#fff;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
        tbody td{font-size:12px}
        .amount{text-align:right;white-space:nowrap}
        .invoice-bottom{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-top:18px}
        .invoice-note{max-width:330px;margin:0;color:#758094;font-size:10px}
        .totals{width:min(100%,290px);border:1px solid #e5e9ef;border-radius:8px;overflow:hidden}
        .totals>div{display:flex;justify-content:space-between;gap:20px;padding:10px 13px;font-size:12px}
        .totals .balance{background:#fff5ec;color:#aa4c0a;font-size:13px}
        .totals strong{white-space:nowrap}
        .service-card{border:1px solid #e5e9ef;border-radius:9px;overflow:hidden}
        .service-name{padding:15px 18px;background:#263449;color:#fff}
        .service-name span{display:block;color:#c5ceda;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
        .service-name strong{display:block;margin-top:3px;font-size:16px}
        .service-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:17px 18px}
        .term-grid{grid-template-columns:repeat(2,1fr);padding:16px 18px;border:1px solid #e5e9ef;border-radius:9px}
        .signatures{display:grid;grid-template-columns:1fr 1fr;gap:54px;margin:56px 10px 20px;break-inside:avoid}
        .signatures>div{text-align:center}
        .signatures>div>span{display:block;height:35px;border-bottom:1px solid #8892a2;margin-bottom:8px}
        .signatures strong,.signatures small{display:block}
        .signatures strong{font-size:11px}
        .signatures small{margin-top:2px;color:#758094;font-size:9px;letter-spacing:.08em}
        .note{margin:24px 0 0;padding-top:11px;border-top:1px solid #e5e9ef;color:#758094;font-size:10px}
        footer{display:flex;justify-content:space-between;gap:12px;margin-top:24px;padding-top:11px;border-top:1px solid #e5e9ef;color:#758094;font-size:9px}
        @page{size:A4;margin:15mm}
        @media print{
          body{max-width:none;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .document-header{break-after:avoid}
          section,.party-card,.service-card,table,.totals{break-inside:avoid}
          thead{display:table-header-group}
        }
        @media screen and (max-width:650px){
          body{margin:0;padding:20px}
          .document-header{flex-wrap:wrap}
          .party-grid,.invoice-meta,.service-facts,.term-grid{grid-template-columns:1fr 1fr}
          .invoice-bottom{flex-direction:column}
        }
      </style>
    </head><body>
      <header class="document-header">
        <div class="brand-lockup"><span class="brand-mark">GC</span><div><span class="brand-name">GLOBAL CONEXIT</span><span class="brand-tagline">Servicios de conectividad</span></div></div>
        <div class="document-heading"><span class="eyebrow">${isContract ? "DOCUMENTO DE SERVICIO" : "COMPROBANTE DE COBRO"}</span><h1>${escapeHtml(title)}</h1><div class="reference">${escapeHtml(reference)}</div></div>
        <span class="status">${escapeHtml(row.estado || "SIN ESTADO")}</span>
      </header>
      ${content}
      <footer><span>Generado el ${escapeHtml(generatedAt)}</span><span>Global Conexit S.A.S. · NIT 900.123.456-7</span></footer>
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
  const navigate = useNavigate();
  const location = useLocation();
  const [metadata, setMetadata] = useState(null);
  const [rows, setRows] = useState([]);
  const [values, setValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [customer, setCustomer] = useState({});
  const [address, setAddress] = useState({});
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formStep, setFormStep] = useState(1);
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
  const formRef = useRef(null);
  const requestSequence = useRef(0);
  const lastClientSearch = useRef("");
  const relationRequestSequence = useRef(0);
  const paymentIdempotencyKey = useRef(null);
  const contractPrefillRef = useRef(false);

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
    contractPrefillRef.current = false;
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

  useEffect(() => {
    if (!showForm) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !saving) setShowForm(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showForm, saving]);

  const visibleColumns = useMemo(
    () => (metadata?.columnas || []).filter((column) =>
      !(entity === "clientes" && column.name === "id_usuario")
    ),
    [entity, metadata]
  );

  // La clave primaria y referencias sin etiqueta se ocultan; las claves foráneas muestran su nombre relacionado.
  const tableColumns = useMemo(
    () => entity === "solicitudes"
      ? [
          {
            name: "numero_radicado",
            type: "varchar",
            columnType: "varchar(30)",
            nullable: false,
          },
          ...visibleColumns.filter((column) =>
            column.name !== "id_cliente"
            && column.name !== metadata?.clave
            && !column.name.startsWith("id_")
          ),
        ]
      : visibleColumns.filter((column) =>
          !column.name.startsWith("id_") || (column.name !== metadata?.clave && column.relation)
        ),
    [entity, metadata, visibleColumns]
  );

  const formColumns = useMemo(
    () => visibleColumns.filter((column) =>
      column.name !== metadata.clave
      && !(entity === "clientes" && column.name === "numero_cliente")
      && !(entity === "tickets" && ["estado", "fecha_cierre"].includes(column.name))
      && (!column.generated || (entity === "pagos" && column.name === "fecha"))
      && column.name !== "contrasena_hash"
    ),
    [entity, metadata, visibleColumns]
  );
  const createFormColumns = useMemo(
    () => formColumns.filter((column) => column.creatable !== false),
    [formColumns]
  );
  const editFormColumns = useMemo(
    () => formColumns.filter((column) => column.editable !== false),
    [formColumns]
  );

  const isClientRole = useMemo(() => {
    if (entity !== "usuarios") return false;
    const roleColumn = metadata?.columnas.find((column) => column.name === "id_rol");
    const role = roleColumn?.options?.find((option) =>
      String(option.value) === String(values.id_rol)
    );
    return role?.label.toUpperCase().includes("CLIENTE") || false;
  }, [entity, metadata, values.id_rol]);

  const activeFormColumns = editingId ? editFormColumns : createFormColumns;
  const includeClientProfile = entity === "usuarios" && !editingId && isClientRole;
  const includeAddressDetails = !editingId && (entity === "clientes" || includeClientProfile);
  const formSteps = useMemo(() => {
    const groups = new Map(formStepOrder.map(([key, title]) => [key, {
      key,
      title,
      columns: [],
      customerFields: [],
      includePassword: false,
      includeAddress: false,
    }]));
    const addToGroup = (key, property, item = true) => {
      const group = groups.get(key);
      if (property === "includePassword" || property === "includeAddress") {
        group[property] = true;
      } else {
        group[property].push(item);
      }
    };
    for (const column of activeFormColumns) {
      addToGroup(formStepKey(column), "columns", column);
    }
    if (includeClientProfile) {
      for (const field of customerFields) {
        addToGroup(formStepKey({ name: field.name }), "customerFields", field);
      }
    }
    if (entity === "usuarios" || (entity === "clientes" && !editingId)) {
      addToGroup("access", "includePassword");
    }
    if (includeAddressDetails) addToGroup("address", "includeAddress");
    return formStepOrder
      .map(([key]) => groups.get(key))
      .filter((group) => group.columns.length || group.customerFields.length || group.includePassword || group.includeAddress);
  }, [activeFormColumns, editingId, entity, includeAddressDetails, includeClientProfile]);

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
    setAddress({});
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

  const handleCreateContractFromRequest = async (row) => {
    const requestNumber = `SOL-${String(row[metadata.clave]).padStart(6, "0")}`;
    if (!await confirmAction({
      title: "¿Crear contrato?",
      text: `Se creará un contrato para el radicado ${requestNumber}.`,
      confirmButtonText: "Crear contrato",
    })) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await guardarRegistroEntidad("solicitudes", {
        datos: { estado: "ATENDIDA" },
      }, row[metadata.clave], customerId);
      await showSuccessAlert("Solicitud atendida", `Se creó el contrato para el radicado ${requestNumber}.`);
      navigate("/contratos", { state: { solicitud: row } });
    } catch (saveError) {
      await showErrorAlert("No se pudo crear el contrato", saveError.message);
    } finally {
      setSaving(false);
    }
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
      await showSuccessAlert("Seguimiento actualizado", "Los cambios del ticket se guardaron correctamente.");
      await loadData();
    } catch (saveError) {
      await showErrorAlert("No se pudo actualizar el ticket", saveError.message);
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

  const startCreate = useCallback((overrides = null) => {
    setNotice("");
    setError("");
    setFormStep(1);
    paymentIdempotencyKey.current = entity === "pagos" ? createIdempotencyKey() : null;
    const initialValues = Object.fromEntries(createFormColumns.map((column) => [
      column.name,
      defaultFieldValue(column),
    ]));
    if (overrides && typeof overrides === "object" && !overrides.nativeEvent) {
      Object.assign(initialValues, overrides);
    }
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
    setAddress({});
    setPassword("");
    setEditingId(null);
    setShowForm(true);
  }, [createFormColumns, customerId, customerUserId, entity]);

  useEffect(() => {
    const solicitud = location.state?.solicitud;
    if (entity !== "contratos" || !solicitud || !metadata || contractPrefillRef.current) return;

    contractPrefillRef.current = true;
    const message = String(solicitud.mensaje || "");
    const planMatch = message.match(/Solicitud para el plan\s+([^.]+)\./i);
    const addressMatch = message.match(/Direcci[oó]n de instalaci[oó]n:\s*([^.\n]+)/i);
    const planName = planMatch?.[1]?.trim();
    const addressName = addressMatch?.[1]?.trim();

    const getColumn = (name) => metadata.columnas.find((column) => column.name === name);
    const clientColumn = getColumn("id_cliente");
    const planColumn = getColumn("id_plan");
    const addressColumn = getColumn("id_direccion");
    const clientOption = clientColumn?.options?.find((option) =>
      String(option.details?.correo || "").toLocaleLowerCase("es") === String(solicitud.correo || "").toLocaleLowerCase("es")
      || String(option.label || "").toLocaleLowerCase("es").includes(String(solicitud.nombre_contacto || "").toLocaleLowerCase("es"))
    );
    const planOption = planColumn?.options?.find((option) =>
      planName && String(option.label || "").toLocaleLowerCase("es").includes(planName.toLocaleLowerCase("es"))
    );
    const addressOption = addressColumn?.options?.find((option) =>
      addressName && String(option.label || "").toLocaleLowerCase("es").includes(addressName.toLocaleLowerCase("es"))
    );

    const businessDate = currentBusinessDate();
    const overrides = {
      fecha_inicio: `${businessDate.year}-${String(businessDate.month).padStart(2, "0")}-${String(businessDate.day).padStart(2, "0")}`,
      estado: "ACTIVO",
    };
    if (clientOption) overrides.id_cliente = clientOption.value;
    if (planOption) overrides.id_plan = planOption.value;
    if (addressOption) overrides.id_direccion = addressOption.value;
    startCreate(overrides);
    navigate(location.pathname, { replace: true, state: null });
  }, [entity, location, metadata, navigate, startCreate]);

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
        const client = column.options?.find((option) => String(option.value) === String(value));
        const details = client?.details || {};
        const clientMappings = {
          tipo_documento: "tipo_documento",
          numero_documento: "numero_documento",
          nombres: "nombres",
          nombre_contacto: "nombres",
          telefono: "telefono",
          telefono_contacto: "telefono",
          correo: "correo",
          numero_cliente: "numero_cliente",
        };
        for (const [fieldName, detailName] of Object.entries(clientMappings)) {
          if (Object.hasOwn(next, fieldName) && details[detailName]) {
            next[fieldName] = details[detailName];
          }
        }
        if (details.direccion || details.ciudad || details.departamento || details.referencia) {
          setAddress((currentAddress) => ({
            ...currentAddress,
            direccion: details.direccion || currentAddress.direccion || "",
            ciudad: details.ciudad || currentAddress.ciudad || "",
            departamento: details.departamento || currentAddress.departamento || "",
            referencia: details.referencia || currentAddress.referencia || "",
          }));
        }
        if (Object.hasOwn(next, "id_direccion")) {
          const addressColumn = formColumns.find((item) => item.name === "id_direccion");
          const firstAddress = addressColumn?.options?.find((option) =>
            String(option.details?.cliente_id) === String(value)
          );
          if (firstAddress) {
            next.id_direccion = String(firstAddress.value);
            const addressDetails = firstAddress.details || {};
            for (const fieldName of ["direccion", "ciudad", "departamento", "referencia"]) {
              if (Object.hasOwn(next, fieldName) && addressDetails[fieldName]) {
                next[fieldName] = addressDetails[fieldName];
              }
            }
            setAddress((currentAddress) => ({
              ...currentAddress,
              direccion: addressDetails.direccion || currentAddress.direccion || "",
              ciudad: addressDetails.ciudad || currentAddress.ciudad || "",
              departamento: addressDetails.departamento || currentAddress.departamento || "",
              referencia: addressDetails.referencia || currentAddress.referencia || "",
            }));
          } else {
            next.id_direccion = "";
          }
        }
        if (entity === "solicitudes") {
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
    setError("");
    setFormStep(1);
    paymentIdempotencyKey.current = null;
    setEditingId(row[metadata.clave]);
    setValues(Object.fromEntries(editFormColumns.map((column) => [
      column.name,
      fieldValue(column, row[column.name]),
    ])));
    setFieldErrors({});
    setAddress({});
    setPassword("");
    setShowForm(true);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (savingRef.current) return;
    const activeFormColumns = editingId ? editFormColumns : createFormColumns;
    const errors = validateFieldSet(activeFormColumns, values, entity);
    if ((entity === "clientes" && !editingId) || (entity === "usuarios" && !editingId && isClientRole)) {
      for (const field of addressFields) {
        if (field.required && !address[field.name]?.trim()) {
          errors[`direccion.${field.name}`] = `Completa el campo ${field.label}.`;
        }
      }
    }
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
    if (((entity === "clientes" || entity === "usuarios") && !editingId) || (editingId && password)) {
      if (password.length < 8) {
        errors.password = "La contraseña debe tener al menos 8 caracteres.";
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstInvalidStep = formSteps.findIndex((group) =>
        Object.keys(errors).some((fieldName) =>
          group.columns.some((column) => column.name === fieldName)
          || (group.key === "identity" && fieldName.startsWith("cliente.") && fieldName.includes("documento"))
          || (group.key === "main" && fieldName === "cliente.nombres")
          || (group.key === "contact" && fieldName === "cliente.telefono")
          || (group.key === "access" && fieldName === "password")
          || (group.key === "address" && fieldName.startsWith("direccion."))
        )
      );
      if (firstInvalidStep >= 0) setFormStep(firstInvalidStep + 1);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    const datos = {};
    for (const column of activeFormColumns) {
      const value = values[column.name];
      if (value === "" && column.nullable) {
        datos[column.name] = null;
      } else if (value !== undefined && value !== "") {
        datos[column.name] = value;
      }
    }

    try {
      const payload = { datos };
      if (entity === "clientes" && !editingId) {
        payload.direccion = address;
      }
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
          for (const field of addressFields) {
            if (field.required && !address[field.name]?.trim()) {
              throw new Error(`Completa el campo ${field.label} de la dirección.`);
            }
          }
          payload.cliente = customer;
          payload.direccion = address;
        }
      }

      await guardarRegistroEntidad(entity, payload, editingId, customerId);
      closeForm();
      await showSuccessAlert(
        editingId ? "Cambios guardados" : "Registro creado",
        editingId ? "La información se actualizó correctamente." : "El registro se creó correctamente.",
      );
      await loadData(entity === "clientes" ? search.trim() : "");
    } catch (saveError) {
      await showErrorAlert("No se pudo guardar el registro", saveError.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleArchive = async (row) => {
    const id = row[metadata.clave];
    const isUser = entity === "usuarios";
    if (!await confirmAction({
      title: `¿${isUser ? "Deshabilitar" : "Desactivar"} este registro?`,
      text: "Podrás reactivarlo después desde la sección de registros desactivados.",
      confirmButtonText: isUser ? "Deshabilitar" : "Desactivar",
    })) return;

    setError("");
    setNotice("");
    try {
      await desactivarRegistroEntidad(entity, id, customerId);
      await showSuccessAlert(
        isUser ? "El usuario fue deshabilitado correctamente" : "Registro desactivado correctamente",
        isUser ? "" : "Puedes reactivarlo desde Registros desactivados.",
      );
      await loadData(entity === "clientes" ? search.trim() : "");
    } catch (archiveError) {
      await showErrorAlert("No se pudo desactivar el registro", archiveError.message);
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
    if (column.name === "numero_radicado") {
      return `SOL-${String(row[metadata.clave]).padStart(6, "0")}`;
    }
    if (entity === "solicitudes" && column.name === "mensaje") {
      const summary = requestSummary(row.mensaje);
      return (
        <details className="request-message-summary">
          <summary>
            <strong>{summary.plan || "Solicitud de servicio"}</strong>
            {summary.address && <span>{summary.address}</span>}
          </summary>
          <div className="request-message-details">
            {summary.document && <div><strong>Documento:</strong> {summary.document}</div>}
            {summary.address && <div><strong>Dirección:</strong> {summary.address}</div>}
            <div><strong>Autorización comercial:</strong> {summary.authorization}</div>
          </div>
        </details>
      );
    }
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
  const canCreateRecords = Boolean(metadata?.permisos?.crear) && !contextReadOnly;
  const canEditRecords = Boolean(metadata?.permisos?.editar) && !contextReadOnly;
  const canManageRecords = canCreateRecords || canEditRecords;
  const canOpenCustomer = entity === "clientes" && Boolean(metadata?.permisos?.leer) && !customerId;
  const hasRowActions = canManageRecords || canOpenCustomer || canDownloadDocument;
  const formEntityLabel = singularEntityNames[entity] || "registro";
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

  const renderEntityField = (column) => {
    let fieldColumn = column;
    if (entity === "ordenes" && editingId && column.name === "estado"
      && Array.isArray(metadata.permisos?.campos_edicion)) {
      const currentOrder = rows.find((row) =>
        String(row[metadata.clave]) === String(editingId)
      );
      if (currentOrder) {
        fieldColumn = {
          ...column,
          enum: technicianOrderStatuses(currentOrder.estado, Boolean(currentOrder.fecha_programada)),
        };
      }
    }
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
          (customerId
            && (column.name === "id_cliente"
              || (entity === "notificaciones" && column.name === "id_usuario")))
          || (entity === "ordenes"
            && editingId
            && Array.isArray(metadata.permisos?.campos_edicion)
            && ["CERRADA", "CANCELADA"].includes(
              rows.find((row) => String(row[metadata.clave]) === String(editingId))?.estado
            ))
        )}
        requiredOverride={entity === "clientes" && column.name === "correo" && !editingId ? true : undefined}
      />
    );
  };

  const renderCustomerField = (field) => (
    <label className="admin-entity-field" key={field.name}>
      <span>{field.label}{field.required ? " *" : ""}</span>
      {field.options ? (
        <select
          className="form-select"
          value={customer[field.name] || ""}
          onChange={(event) => handleCustomerFieldChange(field, event.target.value)}
          onBlur={() => {
            const validationError = validateFieldValue(customerFieldColumn(field), customer[field.name] || "", {
              entity: "clientes",
              values: customer,
              required: field.required,
            });
            setFieldErrors((current) => {
              const next = { ...current };
              if (validationError) next[`cliente.${field.name}`] = validationError;
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
            const validationError = validateFieldValue(customerFieldColumn(field), customer[field.name] || "", {
              entity: "clientes",
              values: customer,
              required: field.required,
            });
            setFieldErrors((current) => {
              const next = { ...current };
              if (validationError) next[`cliente.${field.name}`] = validationError;
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
  );

  const renderAddressField = (field) => (
    <label className="admin-entity-field" key={field.name}>
      <span>{field.label}{field.required ? " *" : ""}</span>
      <input
        className={`form-control${fieldErrors[`direccion.${field.name}`] ? " is-invalid" : ""}`}
        type="text"
        value={address[field.name] || ""}
        maxLength={field.maxLength}
        required={field.required}
        aria-invalid={Boolean(fieldErrors[`direccion.${field.name}`])}
        onChange={(event) => {
          const value = event.target.value;
          setAddress((current) => ({ ...current, [field.name]: value }));
          setFieldErrors((current) => {
            const next = { ...current };
            if (field.required && !value.trim()) {
              next[`direccion.${field.name}`] = `Completa el campo ${field.label}.`;
            } else {
              delete next[`direccion.${field.name}`];
            }
            return next;
          });
        }}
      />
      {fieldErrors[`direccion.${field.name}`] && (
        <small className="text-danger d-block" role="alert">{fieldErrors[`direccion.${field.name}`]}</small>
      )}
    </label>
  );

  if (loading && !metadata) return <p role="status">Cargando {entity}...</p>;

  return (
    <section className="admin-entity-page">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <div>
          <h2 className="mb-1">{metadata?.titulo || "Registros"}</h2>
          <p className="text-muted mb-0">Datos consultados desde la base de datos del sistema.</p>
        </div>
        {canCreateRecords && (
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

      {showForm && typeof document !== "undefined" && createPortal(
        <div
          className="admin-form-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) closeForm();
          }}
        >
          <section
            className="admin-form-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-form-title"
          >
            <form ref={formRef} onSubmit={handleSave}>
              <header className="admin-form-modal__header">
                <div>
                  <p className="admin-form-modal__eyebrow">{editingId ? "Edición" : "Nuevo registro"}</p>
                  <h3 id="admin-form-title">
                    {editingId ? `Editar ${formEntityLabel}` : `Crear ${formEntityLabel}`}
                  </h3>
                  {entity === "clientes" && !editingId && (
                    <p className="text-muted mb-0">
                      El número de cliente se asignará automáticamente al guardar.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="admin-form-modal__close"
                  aria-label="Cerrar formulario"
                  onClick={closeForm}
                  disabled={saving}
                >
                  ×
                </button>
              </header>
              {error && <p className="alert alert-danger mx-4 mt-3 mb-0" role="alert">{error}</p>}
              <div className="admin-form-modal__body">
                <Stepper
                  key={`${entity}-${editingId || "new"}`}
                  step={formStep}
                  onStepChange={setFormStep}
                  linear
                  accentColor="#e9650a"
                  backButtonText="Volver"
                  nextButtonText="Siguiente"
                  completeButtonText={saving ? "Guardando..." : "Guardar"}
                  backButtonProps={{ disabled: saving }}
                  nextButtonProps={{
                    disabled: saving,
                    onClick: (event) => {
                      if (!formRef.current?.reportValidity()) {
                        event.preventDefault();
                        return;
                      }
                      if (formStep === formSteps.length) {
                        event.preventDefault();
                        formRef.current?.requestSubmit();
                      }
                    },
                  }}
                >
                  {formSteps.map((group) => (
                    <Step key={group.key} title={group.title}>
                      {group.key === "access" && entity === "clientes" && !editingId && (
                        <p className="text-muted mb-3">
                          Se creará una cuenta de acceso activa para el cliente.
                        </p>
                      )}
                      {group.key === "identity" && includeClientProfile && (
                        <p className="text-muted mb-3">Datos de identificación del perfil cliente.</p>
                      )}
                      {group.key === "address" && includeAddressDetails && (
                        <p className="text-muted mb-3">La dirección se registrará en la tabla de direcciones.</p>
                      )}
                      <div className="admin-entity-fields">
                        {group.columns.map(renderEntityField)}
                        {group.customerFields.map(renderCustomerField)}
                        {group.includePassword && (
                          <label className="admin-entity-field admin-entity-field--wide">
                            <span>
                              {editingId
                                ? "Nueva contraseña (opcional, mínimo 8 caracteres)"
                                : "Contraseña (mínimo 8 caracteres)"}{editingId ? "" : " *"}
                            </span>
                            <input
                              className={`form-control${fieldErrors.password ? " is-invalid" : ""}`}
                              type="password"
                              autoComplete="new-password"
                              minLength={8}
                              required={!editingId}
                              value={password}
                              onChange={(event) => {
                                const nextPassword = event.target.value;
                                setPassword(nextPassword);
                                setFieldErrors((current) => {
                                  const next = { ...current };
                                  if (nextPassword.length < 8 && (nextPassword || !editingId)) {
                                    next.password = "La contraseña debe tener al menos 8 caracteres.";
                                  } else {
                                    delete next.password;
                                  }
                                  return next;
                                });
                              }}
                              aria-invalid={Boolean(fieldErrors.password)}
                            />
                            {fieldErrors.password && (
                              <small className="text-danger" role="alert">{fieldErrors.password}</small>
                            )}
                          </label>
                        )}
                        {group.includeAddress && addressFields.map(renderAddressField)}
                      </div>
                    </Step>
                  ))}
                </Stepper>
              </div>
              <footer className="admin-form-modal__footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={closeForm}
                  disabled={saving}
                >
                  Cancelar
                </button>
              </footer>
            </form>
          </section>
        </div>,
        document.body
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
              {hasRowActions && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={tableColumns.length + (hasRowActions ? 1 : 0)} className="text-center text-muted">
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
                {hasRowActions && (
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
                      {canOpenCustomer && !canEditRecords && (
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
                      )}
                      {canManageRecords && (
                        <>
                          {entity === "solicitudes" && !["CERRADA", "CANCELADA"].includes(row.estado) && (
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              title="Crear contrato"
                              aria-label={`Crear contrato para la solicitud ${row.id_solicitud}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleCreateContractFromRequest(row);
                              }}
                            >
                              <i className="bi bi-file-earmark-text" aria-hidden="true" />
                            </button>
                          )}
                          {entity === "tickets" && metadata.permisos?.gestion_ticket && (
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
                          {!(entity === "tickets" && metadata.permisos?.gestion_ticket) && (
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
                          )}
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
