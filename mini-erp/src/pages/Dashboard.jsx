import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { obtenerResumenDashboard } from "../services/api";

const currency = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
const number = new Intl.NumberFormat("es-CO");
const chartColors = ["#246bfd", "#24b5c4", "#7653e8", "#f59a23", "#ec5375"];
const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function percentChange(current, previous) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

function shortCurrency(value) {
  const amount = Number(value) || 0;
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toLocaleString("es-CO", { maximumFractionDigits: 0 })} mil`;
  }
  return currency.format(amount);
}

function dateLabel(value, options = { day: "numeric", month: "short" }) {
  if (!value) return "Por programar";
  const date = new Date(`${String(value).replace(" ", "T").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", options).format(date);
}

function StatCard({ title, value, detail, icon, tone }) {
  return (
    <article className="dashboard-stat-card">
      <div className={`dashboard-stat-icon ${tone}`} aria-hidden="true">{icon}</div>
      <div className="dashboard-stat-copy">
        <span>{title}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function TrendBadge({ value }) {
  if (value === null) return <span className="dashboard-trend neutral">Sin período anterior</span>;
  const isPositive = value >= 0;
  return (
    <span className={`dashboard-trend ${isPositive ? "positive" : "negative"}`}>
      {isPositive ? "+" : ""}{value.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%
    </span>
  );
}

function RevenueChart({ months }) {
  const width = 720;
  const height = 260;
  const padding = { top: 18, right: 14, bottom: 36, left: 70 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const values = months.flatMap(({ facturado, recaudado }) => [Number(facturado), Number(recaudado)]);
  const maximum = Math.max(1, ...values) * 1.12;
  const coordinates = (key) => months.map((item, index) => ({
    x: padding.left + (months.length <= 1 ? chartWidth / 2 : (index * chartWidth) / (months.length - 1)),
    y: padding.top + chartHeight - ((Number(item[key]) || 0) / maximum) * chartHeight,
    value: Number(item[key]) || 0,
  }));
  const linePath = (points) => points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
  const billed = coordinates("facturado");
  const received = coordinates("recaudado");

  return (
    <div className="dashboard-chart-wrap">
      <div className="dashboard-chart-legend">
        <span><i className="legend-dot billed" />Facturado</span>
        <span><i className="legend-dot received" />Recaudado</span>
      </div>
      {months.length === 0 ? (
        <p className="dashboard-empty">No hay información mensual para graficar.</p>
      ) : (
        <svg className="dashboard-revenue-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Facturación y recaudo por mes de los últimos doce meses">
          <defs>
            <linearGradient id="dashboard-chart-gradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#246bfd" />
              <stop offset="100%" stopColor="#246bfd" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3].map((step) => {
            const y = padding.top + (chartHeight * step) / 3;
            return (
              <g key={step}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="dashboard-chart-grid" />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" className="dashboard-chart-label">
                  {shortCurrency(maximum * (1 - step / 3))}
                </text>
              </g>
            );
          })}
          <path
            d={`${linePath(billed)} L ${billed.at(-1)?.x ?? padding.left} ${padding.top + chartHeight} L ${billed[0]?.x ?? padding.left} ${padding.top + chartHeight} Z`}
            className="dashboard-chart-area"
          />
          <path d={linePath(billed)} className="dashboard-chart-line billed-line" />
          <path d={linePath(received)} className="dashboard-chart-line received-line" />
          {received.map((point, index) => (
            <circle key={months[index].mes} cx={point.x} cy={point.y} r="3.5" className="dashboard-chart-point" tabIndex="0">
              <title>{`${months[index].mes}: ${currency.format(point.value)} recaudados`}</title>
            </circle>
          ))}
          {months.map((item, index) => {
            const x = padding.left + (months.length <= 1 ? chartWidth / 2 : (index * chartWidth) / (months.length - 1));
            const [, month] = item.mes.split("-");
            return (
              <text key={item.mes} x={x} y={height - 9} textAnchor="middle" className="dashboard-chart-label">
                {monthNames[Number(month) - 1]}
              </text>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function PlanDistribution({ plans }) {
  const total = plans.reduce((sum, plan) => sum + Number(plan.contratos), 0);
  let offset = 0;
  const gradient = plans.length
    ? plans.map((plan, index) => {
      const start = offset;
      offset += total ? (Number(plan.contratos) / total) * 100 : 0;
      return `${chartColors[index % chartColors.length]} ${start}% ${offset}%`;
    }).join(", ")
    : "#e8edf5 0% 100%";

  return (
    <div className="dashboard-plan-content">
      <div
        className="dashboard-donut"
        style={{ background: `conic-gradient(${gradient})` }}
        role="img"
        aria-label={`Distribución de ${number.format(total)} contratos activos por plan`}
      >
        <div><strong>{number.format(total)}</strong><span>contratos</span></div>
      </div>
      <ul className="dashboard-plan-legend">
        {plans.length === 0 ? (
          <li className="dashboard-empty">No hay contratos activos asociados a planes.</li>
        ) : plans.map((plan, index) => (
          <li key={plan.nombre}>
            <i style={{ backgroundColor: chartColors[index % chartColors.length] }} />
            <span className="dashboard-plan-name"><strong>{plan.nombre}</strong><small>{plan.velocidad}</small></span>
            <b>{number.format(plan.contratos)}</b>
            <em>{total ? `${((plan.contratos / total) * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })}%` : "0%"}</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DataTable({ columns, rows, emptyMessage, rowKey, className = "" }) {
  return (
    <div className={`dashboard-table-wrap ${className}`}>
      <table className="dashboard-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="dashboard-table-empty">{emptyMessage}</td></tr>
          ) : rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await obtenerResumenDashboard());
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = useMemo(() => {
    if (!data) return [];
    const summary = data.resumen;
    const openTickets = summary.tickets.ABIERTO + summary.tickets.EN_PROCESO + summary.tickets.PENDIENTE;
    return [
      { title: "Total de clientes", value: number.format(summary.clientes.total), detail: `${number.format(summary.clientes.activos)} activos`, icon: "◎", tone: "blue" },
      { title: "Contratos activos", value: number.format(summary.contratosActivos), detail: "Servicios en operación", icon: "✓", tone: "green" },
      {
        title: "Facturación del mes",
        value: shortCurrency(summary.facturadoMes),
        detail: <TrendBadge value={percentChange(summary.facturadoMes, summary.facturadoMesAnterior)} />,
        icon: "$",
        tone: "purple",
      },
      {
        title: "Pagos recibidos",
        value: shortCurrency(summary.recaudadoMes),
        detail: <TrendBadge value={percentChange(summary.recaudadoMes, summary.recaudadoMesAnterior)} />,
        icon: "↗",
        tone: "cyan",
      },
      { title: "Facturas vencidas", value: number.format(summary.facturasVencidas), detail: `${currency.format(summary.saldoVencido)} por cobrar`, icon: "!", tone: "orange" },
      { title: "Tickets sin cerrar", value: number.format(openTickets), detail: `${number.format(summary.tickets.ABIERTO)} abiertos`, icon: "?", tone: "pink" },
      { title: "Órdenes pendientes", value: number.format(summary.ordenesPendientes), detail: "Pendientes o programadas", icon: "⌁", tone: "amber" },
      { title: "Solicitudes nuevas", value: number.format(summary.solicitudesPendientes), detail: "Requieren seguimiento", icon: "＋", tone: "indigo" },
    ];
  }, [data]);

  const activityRows = data?.actividad || [];
  const orderRows = data?.ordenes || [];
  const overdueRows = data?.facturasVencidas || [];

  return (
    <section className="admin-dashboard">
      <header className="dashboard-heading">
        <div>
          <p className="dashboard-eyebrow">{new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
          <h1>Centro de control</h1>
          <p>Un resumen en tiempo real de la operación de Global Conexit.</p>
        </div>
        <div className="dashboard-heading-actions">
          <button type="button" className="dashboard-refresh" onClick={loadDashboard} disabled={loading}>
            <span aria-hidden="true">↻</span>{loading ? "Actualizando..." : "Actualizar"}
          </button>
          <Link className="dashboard-primary-action" to="/clientes">+ Gestionar clientes</Link>
        </div>
      </header>

      {error && (
        <div className="dashboard-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadDashboard}>Reintentar</button>
        </div>
      )}

      {loading && !data ? (
        <p className="dashboard-loading" role="status">Consultando los indicadores de la base de datos...</p>
      ) : data ? (
        <>
          <div className="dashboard-stat-grid">
            {stats.map((stat) => <StatCard key={stat.title} {...stat} />)}
          </div>

          <div className="dashboard-main-grid">
            <article className="dashboard-panel dashboard-revenue-panel">
              <div className="dashboard-panel-heading">
                <div><h2>Ingresos y recaudo</h2><p>Facturación emitida y pagos recibidos · últimos 12 meses</p></div>
                <Link to="/facturas">Ver facturación <span aria-hidden="true">›</span></Link>
              </div>
              <RevenueChart months={data.meses} />
            </article>
            <article className="dashboard-panel dashboard-collections-panel">
              <div className="dashboard-panel-heading">
                <div><h2>Cartera vencida</h2><p>Saldo de facturas con vencimiento superado</p></div>
                <Link to="/facturas">Gestionar <span aria-hidden="true">›</span></Link>
              </div>
              <div className="dashboard-collections-total">{currency.format(data.resumen.saldoVencido)}</div>
              <div className="dashboard-collections-caption">{number.format(data.resumen.facturasVencidas)} facturas requieren seguimiento</div>
              <div className="dashboard-collections-track"><span style={{ width: `${data.resumen.facturasVencidas ? 100 : 0}%` }} /></div>
              <p className="dashboard-collections-note">El detalle de facturas vencidas aparece al final del panel.</p>
            </article>
            <article className="dashboard-panel dashboard-plans-panel">
              <div className="dashboard-panel-heading">
                <div><h2>Planes contratados</h2><p>Distribución de contratos activos por plan</p></div>
                <Link to="/planes">Ver planes <span aria-hidden="true">›</span></Link>
              </div>
              <PlanDistribution plans={data.planes} />
            </article>
            <article className="dashboard-panel dashboard-support-panel">
              <div className="dashboard-panel-heading">
                <div><h2>Estado de soporte</h2><p>Tickets registrados por estado</p></div>
                <Link to="/tickets">Ir a soporte <span aria-hidden="true">›</span></Link>
              </div>
              <div className="dashboard-ticket-states">
                {[
                  ["ABIERTO", "Abiertos", "pink"],
                  ["EN_PROCESO", "En proceso", "blue"],
                  ["PENDIENTE", "Pendientes", "orange"],
                  ["CERRADO", "Cerrados", "green"],
                ].map(([key, label, tone]) => (
                  <div className={`dashboard-ticket-state ${tone}`} key={key}>
                    <strong>{number.format(data.resumen.tickets[key])}</strong><span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="dashboard-support-foot">
                <span>Solicitudes de servicio pendientes</span>
                <strong>{number.format(data.resumen.solicitudesPendientes)}</strong>
              </div>
            </article>
          </div>

          <div className="dashboard-lower-grid">
            <article className="dashboard-panel dashboard-activity-panel">
              <div className="dashboard-panel-heading">
                <div><h2>Actividad reciente</h2><p>Últimos movimientos del sistema</p></div>
                <Link to="/auditoria">Ver auditoría <span aria-hidden="true">›</span></Link>
              </div>
              <div className="dashboard-activity-list">
                {activityRows.length === 0 ? (
                  <p className="dashboard-empty">Aún no hay actividad registrada.</p>
                ) : activityRows.map((item) => (
                  <div className="dashboard-activity-item" key={item.id_auditoria}>
                    <span className="dashboard-activity-mark" aria-hidden="true">✓</span>
                    <div><strong>{item.accion} · {item.entidad}</strong><span>Registro #{item.id_entidad}{item.usuario ? ` · ${item.usuario}` : ""}</span></div>
                    <time dateTime={item.fecha}>{dateLabel(item.fecha, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                  </div>
                ))}
              </div>
            </article>
            <article className="dashboard-panel dashboard-orders-panel">
              <div className="dashboard-panel-heading">
                <div><h2>Órdenes próximas</h2><p>Agenda de servicio pendiente</p></div>
                <Link to="/ordenes">Ver todas <span aria-hidden="true">›</span></Link>
              </div>
              <DataTable
                columns={[
                  { key: "orden", label: "Orden", render: (row) => `OS-${row.id_orden}` },
                  { key: "cliente", label: "Cliente / tipo", render: (row) => <><strong>{row.cliente}</strong><small>{row.tipo}</small></> },
                  { key: "fecha", label: "Programación", render: (row) => dateLabel(row.fecha_programada, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) },
                  { key: "estado", label: "Estado", render: (row) => <span className={`dashboard-status status-${row.estado.toLowerCase()}`}>{row.estado.replaceAll("_", " ")}</span> },
                ]}
                rows={orderRows}
                rowKey={(row) => row.id_orden}
                emptyMessage="No hay órdenes próximas pendientes."
              />
            </article>
          </div>

          <article className="dashboard-panel dashboard-overdue-panel">
            <div className="dashboard-panel-heading">
              <div><h2>Facturas vencidas</h2><p>Cartera que requiere gestión prioritaria</p></div>
              <Link to="/facturas">Gestionar cartera <span aria-hidden="true">›</span></Link>
            </div>
            <DataTable
              columns={[
                { key: "numero", label: "Factura", render: (row) => <strong>{row.numero}</strong> },
                { key: "cliente", label: "Cliente", render: (row) => row.cliente },
                { key: "vencimiento", label: "Vencimiento", render: (row) => dateLabel(row.fecha_vencimiento, { day: "numeric", month: "short", year: "numeric" }) },
                { key: "saldo", label: "Saldo", render: (row) => <strong>{currency.format(row.saldo)}</strong> },
                { key: "estado", label: "Estado", render: () => <span className="dashboard-status status-vencida">Vencida</span> },
                { key: "accion", label: "Acción", render: (row) => <Link className="dashboard-manage-link" to="/facturas" aria-label={`Gestionar factura ${row.numero}`}>Gestionar</Link> },
              ]}
              rows={overdueRows}
              rowKey={(row) => row.id_factura}
              emptyMessage="No hay facturas vencidas. ¡La cartera está al día!"
            />
          </article>
          {loading && <p className="dashboard-refreshing" role="status">Actualizando indicadores...</p>}
        </>
      ) : null}
    </section>
  );
}

export default Dashboard;
