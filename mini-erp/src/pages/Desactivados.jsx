import { useCallback, useEffect, useState } from "react";
import {
  obtenerMetadatosEntidad,
  obtenerRegistrosEntidad,
  reactivarRegistroEntidad,
} from "../services/api";
import { adminEntities } from "../config/adminEntities";

function humanize(name) {
  return name.replace(/^id_/, "ID ").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Desactivados() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState("");
  const [notice, setNotice] = useState("");

  const loadArchived = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.all(adminEntities
        .filter(({ key }) => key !== "auditoria")
        .map(async ({ key: entity }) => {
        const [metadata, response] = await Promise.all([
          obtenerMetadatosEntidad(entity),
          obtenerRegistrosEntidad(entity, true),
        ]);
        return { entity, metadata, records: response.registros };
      }));
      setGroups(results.filter((group) => group.records.length > 0));
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadArchived();
  }, [loadArchived]);

  const handleRestore = async (entity, id) => {
    setRestoring(`${entity}:${id}`);
    setError("");
    setNotice("");
    try {
      await reactivarRegistroEntidad(entity, id);
      setNotice("Registro reactivado correctamente.");
      await loadArchived();
    } catch (restoreError) {
      setError(restoreError.message);
    } finally {
      setRestoring("");
    }
  };

  return (
    <section>
      <h2>Registros desactivados</h2>
      <p className="text-muted">Los datos se conservan; puedes devolverlos a su listado cuando lo necesites.</p>
      {notice && <p className="alert alert-success" role="status">{notice}</p>}
      {error && <p className="alert alert-danger" role="alert">{error}</p>}
      {loading ? (
        <p role="status">Cargando registros desactivados...</p>
      ) : groups.length === 0 ? (
        <div className="dashboard-card"><p className="mb-0">No hay registros desactivados.</p></div>
      ) : groups.map(({ entity, metadata, records }) => (
        <section className="mb-4" key={entity}>
          <h3 className="h5">{metadata.titulo}</h3>
          <div className="tabla-container admin-entity-table">
            <table className="table table-striped table-hover">
              <thead className="table-dark">
                <tr>
                  {metadata.columnas.map((column) => <th key={column.name}>{humanize(column.name)}</th>)}
                  <th>Fecha de baja</th>
                  <th>Estado anterior</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => {
                  const id = record[metadata.clave];
                  const restoreKey = `${entity}:${id}`;
                  return (
                    <tr key={restoreKey}>
                      {metadata.columnas.map((column) => (
                        <td key={column.name}>
                          {column.relation
                            ? column.options?.find((option) => String(option.value) === String(record[column.name]))?.label || record[column.name] || "—"
                            : record[column.name] ?? "—"}
                        </td>
                      ))}
                      <td>{record.fecha_baja}</td>
                      <td>{record.estado_anterior || "—"}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-success btn-sm"
                          disabled={restoring === restoreKey}
                          onClick={() => handleRestore(entity, id)}
                        >
                          {restoring === restoreKey ? "Reactivando..." : "Reactivar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </section>
  );
}

export default Desactivados;
