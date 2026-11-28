import { useCallback, useEffect, useMemo, useState } from "react";
import {
  cambiarEstadoCicloFacturacion,
  guardarCicloFacturacion,
  obtenerCiclosFacturacion,
} from "../services/api";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatPreviewDate(date) {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function previewPeriods(diaInicio, monthValue) {
  if (!monthValue) return [];
  const [year, month] = monthValue.split("-").map(Number);
  if (!year || !month || diaInicio < 1 || diaInicio > 28) return [];

  return [0, 1, 2].map((offset) => {
    const monthIndex = month - 1 + offset;
    const startYear = year + Math.floor(monthIndex / 12);
    const startMonth = (monthIndex % 12) + 1;
    const start = new Date(Date.UTC(startYear, startMonth - 1, diaInicio));
    const end = diaInicio === 1
      ? new Date(Date.UTC(startYear, startMonth, 0))
      : new Date(Date.UTC(startYear, startMonth, diaInicio - 1));
    return `${formatPreviewDate(start)} - ${formatPreviewDate(end)}`;
  });
}

const emptyCycle = () => ({
  nombre: "",
  dia_inicio: "1",
  dias_vencimiento: "10",
  prorratear_primer_mes: true,
});

export default function CiclosAdmin() {
  const [cycles, setCycles] = useState([]);
  const [permissions, setPermissions] = useState({});
  const [values, setValues] = useState(emptyCycle);
  const [editingId, setEditingId] = useState(null);
  const [previewMonth, setPreviewMonth] = useState(currentMonth);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCycles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await obtenerCiclosFacturacion();
      setCycles(result.ciclos);
      setPermissions(result.permisos || {});
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCycles();
  }, [loadCycles]);

  const previews = useMemo(
    () => previewPeriods(Number(values.dia_inicio), previewMonth),
    [values.dia_inicio, previewMonth],
  );

  const startCreate = () => {
    setValues(emptyCycle());
    setEditingId(null);
    setPreviewMonth(currentMonth());
    setShowForm(true);
    setError("");
    setNotice("");
  };

  const startEdit = (cycle) => {
    setValues({
      nombre: cycle.nombre,
      dia_inicio: String(cycle.dia_inicio),
      dias_vencimiento: String(cycle.dias_vencimiento),
      prorratear_primer_mes: Number(cycle.prorratear_primer_mes) === 1,
    });
    setEditingId(cycle.id_ciclo);
    setPreviewMonth(currentMonth());
    setShowForm(true);
    setError("");
    setNotice("");
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await guardarCicloFacturacion({
        nombre: values.nombre.trim(),
        dia_inicio: Number(values.dia_inicio),
        dias_vencimiento: Number(values.dias_vencimiento),
        prorratear_primer_mes: values.prorratear_primer_mes,
      }, editingId);
      setShowForm(false);
      setNotice(editingId ? "La regla del ciclo se actualizó." : "La regla del ciclo se creó.");
      await loadCycles();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleState = async (cycle) => {
    const estado = cycle.estado === "ACTIVO" ? "INACTIVO" : "ACTIVO";
    setError("");
    setNotice("");
    try {
      await cambiarEstadoCicloFacturacion(cycle.id_ciclo, estado);
      setNotice(`El ciclo quedó ${estado.toLocaleLowerCase("es")}.`);
      await loadCycles();
    } catch (updateError) {
      setError(updateError.message);
    }
  };

  if (loading && cycles.length === 0) {
    return <p role="status">Cargando ciclos de facturación...</p>;
  }

  return (
    <section className="admin-entity-page">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
        <div>
          <h2 className="mb-1">Ciclos de facturación</h2>
          <p className="text-muted mb-0">
            Configura reglas recurrentes. Los períodos se generan al crear facturas.
          </p>
        </div>
        {permissions.crear && (
          <button type="button" className="btn btn-success" onClick={startCreate}>
            + Crear ciclo
          </button>
        )}
      </div>

      {notice && <p className="alert alert-success" role="status">{notice}</p>}
      {error && <p className="alert alert-danger" role="alert">{error}</p>}

      {showForm && (
        <form className="dashboard-card p-3 mb-4" onSubmit={handleSave}>
          <h3 className="h5">{editingId ? "Editar ciclo" : "Nueva regla de ciclo"}</h3>
          <div className="admin-entity-fields">
            <label className="admin-entity-field">
              <span>Nombre *</span>
              <input
                className="form-control"
                type="text"
                maxLength={100}
                value={values.nombre}
                onChange={(event) => setValues((current) => ({ ...current, nombre: event.target.value }))}
                required
              />
            </label>
            <label className="admin-entity-field">
              <span>Día de inicio (1 a 28) *</span>
              <input
                className="form-control"
                type="number"
                min="1"
                max="28"
                value={values.dia_inicio}
                onChange={(event) => setValues((current) => ({ ...current, dia_inicio: event.target.value }))}
                required
              />
            </label>
            <label className="admin-entity-field">
              <span>Días para vencimiento *</span>
              <input
                className="form-control"
                type="number"
                min="1"
                value={values.dias_vencimiento}
                onChange={(event) => setValues((current) => ({ ...current, dias_vencimiento: event.target.value }))}
                required
              />
            </label>
            <label className="admin-entity-field">
              <span>Prorratear el primer mes</span>
              <select
                className="form-select"
                value={values.prorratear_primer_mes ? "1" : "0"}
                onChange={(event) => setValues((current) => ({
                  ...current,
                  prorratear_primer_mes: event.target.value === "1",
                }))}
              >
                <option value="1">Sí</option>
                <option value="0">No</option>
              </select>
            </label>
            <label className="admin-entity-field">
              <span>Mes de previsualización</span>
              <input
                className="form-control"
                type="month"
                value={previewMonth}
                onChange={(event) => setPreviewMonth(event.target.value)}
              />
            </label>
          </div>
          <div className="mt-3">
            <strong>Próximos períodos</strong>
            <ul className="mb-0 mt-2">
              {previews.map((period) => <li key={period}>{period}</li>)}
            </ul>
          </div>
          <div className="d-flex gap-2 mt-3">
            <button type="submit" className="btn btn-success" disabled={saving}>
              {saving ? "Guardando..." : "Guardar regla"}
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => setShowForm(false)} disabled={saving}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="tabla-container admin-entity-table">
        <table className="table table-striped table-hover">
          <thead className="table-dark">
            <tr>
              <th>Nombre</th>
              <th>Día de inicio</th>
              <th>Vencimiento</th>
              <th>Prorrateo inicial</th>
              <th>Estado</th>
              <th>Períodos generados</th>
              {permissions.editar && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {cycles.length === 0 ? (
              <tr><td colSpan={permissions.editar ? 7 : 6} className="text-center text-muted">No hay ciclos configurados.</td></tr>
            ) : cycles.map((cycle) => (
              <tr key={cycle.id_ciclo}>
                <td>{cycle.nombre}</td>
                <td>{cycle.dia_inicio}</td>
                <td>{cycle.dias_vencimiento} días desde la emisión</td>
                <td>{Number(cycle.prorratear_primer_mes) ? "Sí" : "No"}</td>
                <td>{cycle.estado}</td>
                <td>{cycle.periodos_generados}</td>
                {permissions.editar && (
                  <td>
                    <div className="d-flex flex-wrap gap-2">
                      <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => startEdit(cycle)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${cycle.estado === "ACTIVO" ? "btn-outline-danger" : "btn-outline-success"}`}
                        onClick={() => toggleState(cycle)}
                      >
                        {cycle.estado === "ACTIVO" ? "Inactivar" : "Activar"}
                      </button>
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
