import { useCallback, useEffect, useMemo, useState } from "react";
import {
  desactivarRegistroEntidad,
  guardarRegistroEntidad,
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

function EntityField({ column, value, onChange, disabled = false }) {
  const label = humanize(column.name);
  const required = !column.nullable && column.default === null && !column.generated;
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

    return (
      <label className="admin-entity-field">
        <span>{label}{required ? " *" : ""}</span>
        <select
          className="form-select"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          disabled={disabled}
        >
          <option value="">Selecciona...</option>
          {options.map((option) => (
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

function EntityAdmin({ entity }) {
  const [metadata, setMetadata] = useState(null);
  const [rows, setRows] = useState([]);
  const [values, setValues] = useState({});
  const [customer, setCustomer] = useState({});
  const [password, setPassword] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [meta, records] = await Promise.all([
        obtenerMetadatosEntidad(entity),
        obtenerRegistrosEntidad(entity),
      ]);
      setMetadata(meta);
      setRows(records.registros);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => {
    setMetadata(null);
    setRows([]);
    setShowForm(false);
    loadData();
  }, [loadData]);

  const formColumns = useMemo(
    () => (metadata?.columnas || []).filter((column) =>
      column.name !== metadata.clave
      && !column.generated
      && column.name !== "contrasena_hash"
    ),
    [metadata]
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
    const query = search.trim().toLocaleLowerCase("es");
    if (!query) return rows;
    return rows.filter((row) =>
      Object.values(row).some((value) =>
        String(value ?? "").toLocaleLowerCase("es").includes(query)
      )
    );
  }, [rows, search]);

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setValues({});
    setCustomer({});
    setPassword("");
  };

  const startCreate = () => {
    setNotice("");
    setValues(Object.fromEntries(formColumns.map((column) => [
      column.name,
      defaultFieldValue(column),
    ])));
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

      await guardarRegistroEntidad(entity, payload, editingId);
      closeForm();
      setNotice(editingId ? "Cambios guardados." : "Registro creado.");
      await loadData();
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
      await desactivarRegistroEntidad(entity, id);
      setNotice("Registro desactivado. Puedes reactivarlo desde Desactivados.");
      await loadData();
    } catch (archiveError) {
      setError(archiveError.message);
    }
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
        {!metadata?.soloLectura && (
          <button type="button" className="btn btn-success" onClick={startCreate}>
            + Crear {entity === "usuarios" ? "usuario" : "registro"}
          </button>
        )}
      </div>

      {notice && <p className="alert alert-success" role="status">{notice}</p>}
      {error && <p className="alert alert-danger" role="alert">{error}</p>}

      {showForm && (
        <form className="dashboard-card admin-entity-form mb-4" onSubmit={handleSave}>
          <div className="d-flex justify-content-between align-items-center gap-2 mb-3">
            <h3 className="h5 mb-0">{editingId ? "Editar registro" : "Crear registro"}</h3>
            <button type="button" className="btn-close" aria-label="Cerrar" onClick={closeForm} />
          </div>
          <div className="admin-entity-fields">
            {formColumns.map((column) => (
              <EntityField
                key={column.name}
                column={column}
                value={values[column.name] ?? ""}
                onChange={(value) => setValues((current) => ({ ...current, [column.name]: value }))}
              />
            ))}
            {entity === "usuarios" && (
              <label className="admin-entity-field">
                <span>{editingId ? "Nueva contraseña (opcional, mínimo 8 caracteres)" : "Contraseña (mínimo 8 caracteres)"}{editingId ? "" : " *"}</span>
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
          {isClientRole && !editingId && (
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
            placeholder="Buscar..."
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
              {(metadata?.columnas || []).map((column) => <th key={column.name}>{humanize(column.name)}</th>)}
              {!metadata?.soloLectura && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={(metadata?.columnas.length || 0) + (metadata?.soloLectura ? 0 : 1)} className="text-center text-muted">
                  No hay registros para mostrar.
                </td>
              </tr>
            ) : visibleRows.map((row) => (
              <tr key={row[metadata.clave]}>
                {metadata.columnas.map((column) => (
                  <td key={column.name}>{renderCell(column, row)}</td>
                ))}
                {!metadata.soloLectura && (
                  <td>
                    <div className="d-flex gap-2">
                      <button type="button" className="btn btn-warning btn-sm" onClick={() => startEdit(row)}>Editar</button>
                      {metadata.archivable && (
                        <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => handleArchive(row)}>
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
