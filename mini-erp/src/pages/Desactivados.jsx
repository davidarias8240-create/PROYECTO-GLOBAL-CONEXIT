import { useCallback, useEffect, useState } from "react";
import {
  obtenerMetadatosEntidad,
  obtenerRegistrosEntidad,
  eliminarRegistroPermanentementeEntidad,
  reactivarRegistroEntidad,
} from "../services/api";
import { adminEntities } from "../config/adminEntities";
import { confirmAction, showErrorAlert, showSuccessAlert } from "../utils/alerts";

function humanize(name) {
  return name.replace(/^id_/, "ID ").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function Desactivados() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState("");
  const [deleting, setDeleting] = useState("");
  const [notice, setNotice] = useState("");

  const loadArchived = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.all(adminEntities
        .filter(({ key }) => key !== "auditoria")
        .map(async ({ key: entity }) => {
          const metadata = await obtenerMetadatosEntidad(entity);
          if (!metadata.archivable) return null;
          const response = await obtenerRegistrosEntidad(entity, true);
          return { entity, metadata, records: response.registros };
      }));
      setGroups(results.filter((group) => group && group.records.length > 0));
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
    if (!await confirmAction({
      title: "¿Reactivar este registro?",
      text: "El registro volverá a estar disponible en su listado.",
      confirmButtonText: "Reactivar",
    })) return;
    setRestoring(`${entity}:${id}`);
    setError("");
    setNotice("");
    try {
      await reactivarRegistroEntidad(entity, id);
      await showSuccessAlert("Registro reactivado", "El registro se reactivó correctamente.");
      await loadArchived();
    } catch (restoreError) {
      await showErrorAlert("No se pudo reactivar el registro", restoreError.message);
    } finally {
      setRestoring("");
    }
  };

  const handlePermanentDelete = async (entity, id) => {
    if (!await confirmAction({
      title: "¿Eliminar permanentemente este registro?",
      text: "Se eliminará el registro y no se podrá recuperar. Si otros datos dependen de él, la base de datos impedirá la operación.",
      confirmButtonText: "Eliminar permanentemente",
    })) return;
    setDeleting(`${entity}:${id}`);
    setError("");
    setNotice("");
    try {
      await eliminarRegistroPermanentementeEntidad(entity, id);
      await showSuccessAlert("Registro eliminado", "El registro se eliminó permanentemente.");
      await loadArchived();
    } catch (deleteError) {
      await showErrorAlert("No se pudo eliminar el registro", deleteError.message);
    } finally {
      setDeleting("");
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
                  {metadata.columnas
                    .filter((column) =>
                      !column.name.startsWith("id_")
                      || (column.name !== metadata.clave && column.relation)
                    )
                    .map((column) => <th key={column.name}>{humanize(column.name.replace(/^id_/, ""))}</th>)}
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
                      {metadata.columnas.filter((column) =>
                        !column.name.startsWith("id_")
                        || (column.name !== metadata.clave && column.relation)
                      ).map((column) => (
                        <td key={column.name}>
                          {column.relation
                            ? column.options?.find((option) => String(option.value) === String(record[column.name]))?.label || record[column.name] || "—"
                            : record[column.name] ?? "—"}
                        </td>
                      ))}
                      <td>{record.fecha_baja}</td>
                      <td>{record.estado_anterior || "—"}</td>
                      <td className="d-flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-success btn-sm"
                          disabled={restoring === restoreKey || deleting === restoreKey}
                          onClick={() => handleRestore(entity, id)}
                        >
                          {restoring === restoreKey ? "Reactivando..." : "Reactivar"}
                        </button>
                        {metadata.archivable && metadata.permisos?.archivar && (
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={restoring === restoreKey || deleting === restoreKey}
                            onClick={() => handlePermanentDelete(entity, id)}
                          >
                            {deleting === restoreKey ? "Eliminando..." : "Eliminar permanentemente"}
                          </button>
                        )}
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
