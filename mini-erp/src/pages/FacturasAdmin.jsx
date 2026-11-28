import { useCallback, useEffect, useMemo, useState } from "react";
import EntityAdmin from "./EntidadAdmin";
import {
  generarFacturasAdmin,
  obtenerCiclosFacturacion,
  obtenerMetadatosEntidad,
  previsualizarGeneracionFacturas,
} from "../services/api";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function fechaBogotaActual() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

function sumarDias(fecha, dias) {
  if (!fecha || !Number.isInteger(dias) || dias < 0) return "";
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const date = new Date(Date.UTC(anio, mes - 1, dia));
  date.setUTCDate(date.getUTCDate() + dias);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatoFecha(fecha) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(fecha || ""));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
}

function fechasCiclo(ciclo, mes) {
  if (!ciclo || !/^\d{4}-\d{2}$/.test(mes)) return null;
  const [anio, numeroMes] = mes.split("-").map(Number);
  const diaInicio = Number(ciclo.dia_inicio);
  if (diaInicio === 1) {
    const ultimoDia = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
    return {
      inicio: `${mes}-01`,
      fin: `${mes}-${String(ultimoDia).padStart(2, "0")}`,
    };
  }
  const siguiente = new Date(Date.UTC(anio, numeroMes, diaInicio - 1));
  return {
    inicio: `${mes}-${String(diaInicio).padStart(2, "0")}`,
    fin: `${siguiente.getUTCFullYear()}-${String(siguiente.getUTCMonth() + 1).padStart(2, "0")}-${String(siguiente.getUTCDate()).padStart(2, "0")}`,
  };
}

function FacturasAdmin({ customerId = null }) {
  const hoy = useMemo(fechaBogotaActual, []);
  const [ciclos, setCiclos] = useState([]);
  const [cicloId, setCicloId] = useState("");
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [fechaEmision, setFechaEmision] = useState(hoy);
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [vencimientoEditado, setVencimientoEditado] = useState(false);
  const [puedeGenerar, setPuedeGenerar] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [consultando, setConsultando] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [preview, setPreview] = useState(null);
  const [seleccionados, setSeleccionados] = useState([]);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([obtenerCiclosFacturacion(true), obtenerMetadatosEntidad("facturas")])
      .then(([ciclosResponse, metadata]) => {
        if (!active) return;
        const activos = ciclosResponse.ciclos || [];
        setCiclos(activos);
        setCicloId((current) =>
          activos.some((ciclo) => String(ciclo.id_ciclo) === String(current))
            ? current
            : String(activos[0]?.id_ciclo || "")
        );
        setPuedeGenerar(Boolean(metadata.permisos?.crear));
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      })
      .finally(() => {
        if (active) setCargando(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const cicloSeleccionado = useMemo(
    () => ciclos.find((ciclo) => String(ciclo.id_ciclo) === String(cicloId)),
    [cicloId, ciclos],
  );
  const vencimientoSugerido = useMemo(
    () => sumarDias(fechaEmision, Number(cicloSeleccionado?.dias_vencimiento || 0)),
    [cicloSeleccionado, fechaEmision],
  );
  const rangoCiclo = useMemo(
    () => fechasCiclo(cicloSeleccionado, mes),
    [cicloSeleccionado, mes],
  );
  const solicitud = useMemo(() => {
    if (!cicloId || !/^\d{4}-\d{2}$/.test(mes)) return null;
    const idCliente = customerId === null ? null : Number(customerId);
    if (idCliente !== null && (!Number.isInteger(idCliente) || idCliente < 1)) return null;
    const [anio, numeroMes] = mes.split("-").map(Number);
    if (!fechaEmision || !fechaVencimiento) return null;
    return {
      id_ciclo: Number(cicloId),
      ...(idCliente === null ? {} : { id_cliente: idCliente }),
      anio,
      mes: numeroMes,
      fecha_emision: fechaEmision,
      fecha_vencimiento: fechaVencimiento,
    };
  }, [cicloId, customerId, fechaEmision, fechaVencimiento, mes]);
  const claveSolicitud = solicitud ? JSON.stringify(solicitud) : "";
  const previewVigente = Boolean(preview && preview.clave === claveSolicitud);
  const elegibles = useMemo(
    () => (previewVigente ? preview.data.elegibles : []),
    [preview, previewVigente],
  );
  const omitidas = previewVigente ? preview.data.omitidas : [];
  const montoSeleccionado = useMemo(
    () => elegibles
      .filter((factura) => seleccionados.includes(String(factura.id_contrato)))
      .reduce((total, factura) => total + Number(factura.total), 0),
    [elegibles, seleccionados],
  );
  const haySeleccionCompleta = elegibles.length > 0
    && elegibles.every((factura) => seleccionados.includes(String(factura.id_contrato)));

  useEffect(() => {
    if (!vencimientoEditado && vencimientoSugerido) {
      setFechaVencimiento(vencimientoSugerido);
    }
  }, [vencimientoEditado, vencimientoSugerido]);

  const invalidarPreview = useCallback(() => {
    setPreview(null);
    setSeleccionados([]);
    setResultado(null);
    setError("");
  }, []);

  const datosSolicitud = () => {
    if (!solicitud) throw new Error("Completa el ciclo, mes/año y las fechas de emisión y vencimiento.");
    if (fechaVencimiento < fechaEmision) {
      throw new Error("El vencimiento no puede ser anterior a la fecha de emisión.");
    }
    return solicitud;
  };

  const guardarPreview = (data, input) => {
    setPreview({ data, clave: JSON.stringify(input) });
    setSeleccionados(data.elegibles.map((item) => String(item.id_contrato)));
  };

  const consultarPreview = async (event) => {
    event.preventDefault();
    setConsultando(true);
    setError("");
    setResultado(null);
    try {
      const input = datosSolicitud();
      const data = await previsualizarGeneracionFacturas(input);
      guardarPreview(data, input);
    } catch (previewError) {
      setError(previewError.message);
    } finally {
      setConsultando(false);
    }
  };

  const generarSeleccion = async (ids) => {
    if (!previewVigente) {
      setError("Vuelve a generar la vista previa antes de crear facturas.");
      return;
    }
    if (!ids.length) {
      setError("Selecciona al menos un contrato elegible.");
      return;
    }
    setGenerando(true);
    setError("");
    try {
      const input = datosSolicitud();
      const data = await generarFacturasAdmin(input, ids);
      setResultado(data);
      const nuevoPreview = await previsualizarGeneracionFacturas(input);
      guardarPreview(nuevoPreview, input);
    } catch (generationError) {
      setError(generationError.message);
    } finally {
      setGenerando(false);
    }
  };

  const cambiarSeleccion = (idContrato) => {
    setSeleccionados((current) => current.includes(idContrato)
      ? current.filter((id) => id !== idContrato)
      : [...current, idContrato]);
  };

  return (
    <>
      {puedeGenerar && (
        <section className="dashboard-card admin-entity-form mb-4">
          <div className="mb-3">
            <h2 className="h4 mb-1">
              {customerId === null ? "Generar facturas" : `Generar facturas del cliente #${customerId}`}
            </h2>
            <p className="text-muted mb-0">
              {customerId === null
                ? "Revisa el prorrateo y las facturas existentes antes de generar. El número se asigna automáticamente."
                : "La vista previa se limita a los contratos activos de este cliente. Revisa el prorrateo antes de generar; el número se asigna automáticamente."}
            </p>
          </div>
          {error && <p className="alert alert-danger" role="alert">{error}</p>}
          <form onSubmit={consultarPreview}>
            <div className="admin-entity-fields">
              <label className="admin-entity-field">
                <span>Ciclo activo *</span>
                <select
                  className="form-select"
                  value={cicloId}
                  onChange={(event) => {
                    setCicloId(event.target.value);
                    setVencimientoEditado(false);
                    invalidarPreview();
                  }}
                  required
                  disabled={cargando || ciclos.length === 0}
                >
                  <option value="">{cargando ? "Cargando ciclos..." : "Selecciona un ciclo"}</option>
                  {ciclos.map((ciclo) => (
                    <option key={ciclo.id_ciclo} value={ciclo.id_ciclo}>{ciclo.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="admin-entity-field">
                <span>Mes y año *</span>
                <input
                  className="form-control"
                  type="month"
                  value={mes}
                  onChange={(event) => {
                    setMes(event.target.value);
                    invalidarPreview();
                  }}
                  required
                />
              </label>
              <label className="admin-entity-field">
                <span>Fecha de emisión *</span>
                <input
                  className="form-control"
                  type="date"
                  value={fechaEmision}
                  onChange={(event) => {
                    setFechaEmision(event.target.value);
                    setVencimientoEditado(false);
                    invalidarPreview();
                  }}
                  required
                />
              </label>
              <label className="admin-entity-field">
                <span>Fecha de vencimiento *</span>
                <input
                  className="form-control"
                  type="date"
                  value={fechaVencimiento}
                  min={fechaEmision}
                  onChange={(event) => {
                    setFechaVencimiento(event.target.value);
                    setVencimientoEditado(true);
                    invalidarPreview();
                  }}
                  required
                />
              </label>
            </div>
            {rangoCiclo && (
              <p className="text-muted small mt-2 mb-1">
                Período del ciclo: <strong>{formatoFecha(rangoCiclo.inicio)} – {formatoFecha(rangoCiclo.fin)}</strong>.
                {Number(cicloSeleccionado?.prorratear_primer_mes) === 1
                  ? " El prorrateo usa la fecha de activación del contrato."
                  : " El ciclo no aplica prorrateo."}
              </p>
            )}
            {cicloSeleccionado && (
              <p className="text-muted small mb-3">
                Vencimiento sugerido: {formatoFecha(vencimientoSugerido)}
                {" "}({cicloSeleccionado.dias_vencimiento} días después de la emisión). Puedes ajustarlo.
              </p>
            )}
            <button
              type="submit"
              className="btn btn-outline-primary"
              disabled={consultando || generando || cargando || !cicloId || !mes || !fechaEmision || !fechaVencimiento}
            >
              {consultando ? "Calculando vista previa..." : "Vista previa"}
            </button>
          </form>

          {previewVigente && (
            <div className="mt-4">
              <div className="alert alert-info">
                <strong>{preview.data.ciclo.nombre}</strong>
                {" · "}
                {formatoFecha(preview.data.periodo.fecha_inicio)} – {formatoFecha(preview.data.periodo.fecha_fin)}
                {" · "}
                Emisión {formatoFecha(preview.data.fecha_emision)}
                {" · "}
                Vence {formatoFecha(preview.data.fecha_vencimiento)}
              </div>
              <div className="row g-3 mb-3">
                <div className="col-md-4">
                  <div className="border rounded p-3 h-100">
                    <small className="text-muted d-block">Contratos elegibles</small>
                    <strong>{preview.data.resumen.cantidad_elegibles}</strong>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="border rounded p-3 h-100">
                    <small className="text-muted d-block">Ya facturados (se omiten)</small>
                    <strong>{preview.data.resumen.cantidad_omitidas}</strong>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="border rounded p-3 h-100">
                    <small className="text-muted d-block">Monto estimado elegible</small>
                    <strong>{currency.format(Number(preview.data.resumen.monto_estimado))}</strong>
                  </div>
                </div>
              </div>

              <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
                <h3 className="h5 mb-0">Contratos que se pueden facturar</h3>
                <div className="d-flex align-items-center gap-3">
                  <label className="form-check mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={haySeleccionCompleta}
                      disabled={elegibles.length === 0 || generando}
                      onChange={() => setSeleccionados(haySeleccionCompleta
                        ? []
                        : elegibles.map((item) => String(item.id_contrato)))}
                    />
                    <span className="form-check-label">Seleccionar todos</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-success"
                    disabled={generando || seleccionados.length === 0}
                    onClick={() => generarSeleccion(seleccionados)}
                  >
                    {generando ? "Generando..." : `Generar seleccionadas (${seleccionados.length})`}
                  </button>
                </div>
              </div>
              {elegibles.length === 0 ? (
                <p className="text-muted">No hay contratos nuevos elegibles para este período.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm table-striped align-middle">
                    <thead>
                      <tr>
                        <th aria-label="Seleccionar" />
                        <th>Contrato / cliente</th>
                        <th>Activación</th>
                        <th>Rango cobrado</th>
                        <th>Días</th>
                        <th>Tipo</th>
                        <th className="text-end">Valor</th>
                        <th>Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {elegibles.map((factura) => {
                        const idContrato = String(factura.id_contrato);
                        return (
                          <tr key={idContrato}>
                            <td>
                              <input
                                className="form-check-input"
                                type="checkbox"
                                aria-label={`Seleccionar contrato ${idContrato}`}
                                checked={seleccionados.includes(idContrato)}
                                disabled={generando}
                                onChange={() => cambiarSeleccion(idContrato)}
                              />
                            </td>
                            <td>
                              <strong>Contrato #{idContrato}</strong>
                              <small className="d-block text-muted">{factura.nombre_cliente} · {factura.nombre_plan}</small>
                              <small className="d-block text-muted">{factura.descripcion}</small>
                            </td>
                            <td>{formatoFecha(factura.fecha_activacion)}</td>
                            <td>{formatoFecha(factura.fecha_servicio_inicio)} – {formatoFecha(factura.fecha_servicio_fin)}</td>
                            <td>{factura.dias_facturados} / {factura.dias_totales}</td>
                            <td>{Number(factura.es_prorrateada) ? "Prorrateada" : "Completa"}</td>
                            <td className="text-end">{currency.format(Number(factura.total))}</td>
                            <td>
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-success"
                                disabled={generando}
                                onClick={() => generarSeleccion([idContrato])}
                              >
                                Generar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan="6" className="text-end">Total seleccionado</th>
                        <th className="text-end">{currency.format(montoSeleccionado)}</th>
                        <th />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {omitidas.length > 0 && (
                <div className="mt-4">
                  <h3 className="h5">Omitidas: ya tienen factura para este período</h3>
                  <div className="table-responsive">
                    <table className="table table-sm align-middle">
                      <thead>
                        <tr><th>Contrato / cliente</th><th>Factura</th><th>Estado</th><th>Motivo</th></tr>
                      </thead>
                      <tbody>
                        {omitidas.map((factura) => (
                          <tr key={factura.id_contrato}>
                            <td>Contrato #{factura.id_contrato} · {factura.nombre_cliente}</td>
                            <td>{factura.numero}</td>
                            <td>{factura.estado_factura}</td>
                            <td>{factura.motivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {resultado && (
            <div className="mt-4" role="status">
              <h3 className="h5">Resultado de la generación</h3>
              <p className="mb-2">
                Creadas: {resultado.resumen.cantidad_creadas}
                {" · "}Omitidas: {resultado.resumen.cantidad_omitidas}
                {" · "}Errores: {resultado.resumen.cantidad_errores}
                {" · "}Monto generado: {currency.format(Number(resultado.monto_total))}
              </p>
              {resultado.creadas.length > 0 && (
                <ul>
                  {resultado.creadas.map((factura) => (
                    <li key={factura.id_factura}>
                      {factura.numero} · Contrato #{factura.id_contrato}
                      {" · "}{formatoFecha(factura.fecha_servicio_inicio)}–{formatoFecha(factura.fecha_servicio_fin)}
                      {" · "}{currency.format(Number(factura.total))}
                    </li>
                  ))}
                </ul>
              )}
              {resultado.omitidas.map((factura) => (
                <p className="text-muted mb-1" key={`omitida-${factura.id_contrato}`}>
                  Contrato #{factura.id_contrato}: omitido ({factura.numero}).
                </p>
              ))}
              {resultado.errores.map((item) => (
                <p className="text-danger mb-1" key={`error-${item.id_contrato}`}>
                  Contrato #{item.id_contrato}: {item.error}.
                </p>
              ))}
            </div>
          )}
        </section>
      )}
      {!puedeGenerar && !cargando && error && <p className="alert alert-danger" role="alert">{error}</p>}
      <EntityAdmin entity="facturas" customerId={customerId} />
    </>
  );
}

export default FacturasAdmin;
