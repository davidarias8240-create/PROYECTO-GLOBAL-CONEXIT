import { useCallback, useEffect, useRef, useState } from "react";
import { obtenerNotificacionesAuditoria } from "../services/api";
import { adminEntities } from "../config/adminEntities";

const actionLabels = {
  CREAR: "Nuevo registro",
  EDITAR: "Registro actualizado",
  DESACTIVAR: "Registro desactivado",
  REACTIVAR: "Registro reactivado",
};

const auditedEntities = {
  rol: "roles",
  usuario: "usuarios",
  cliente: "clientes",
  direccion: "direcciones",
  plan: "planes",
  contrato: "contratos",
  periodo_facturacion: "periodos",
  factura: "facturas",
  pago: "pagos",
  ajuste_factura: "ajustes",
  ticket: "tickets",
  interaccion: "interacciones",
  orden_servicio: "ordenes",
  notificacion: "notificaciones",
  solicitud_servicio: "solicitudes",
};

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value.replace(" ", "T")));
}

function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState("");
  const lastId = useRef(null);

  const loadNotifications = useCallback(async () => {
    try {
      const response = await obtenerNotificacionesAuditoria();
      const items = response.notificaciones;
      const newestId = items.reduce((max, item) => Math.max(max, Number(item.id_auditoria)), 0);
      const previousId = lastId.current;

      if (previousId !== null && newestId > previousId) {
        const newItems = items.filter((item) => Number(item.id_auditoria) > previousId).length;
        setUnreadCount((count) => count + newItems);
      }
      lastId.current = Math.max(previousId ?? newestId, newestId);
      setNotifications(items);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 15000);
    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  const toggleNotifications = () => {
    setIsOpen((open) => {
      if (!open) setUnreadCount(0);
      return !open;
    });
  };

  return (
    <div className="notification-bell">
      <button
        className="notification-bell-button"
        type="button"
        aria-label={`Notificaciones${unreadCount ? `, ${unreadCount} nuevas` : ""}`}
        aria-expanded={isOpen}
        onClick={toggleNotifications}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4" />
        </svg>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {isOpen && (
        <section className="notification-popover" aria-label="Actividad reciente">
          <div className="notification-popover-heading">
            <strong>Actividad reciente</strong>
            <span>{notifications.length}</span>
          </div>
          {error ? (
            <p className="notification-empty" role="alert">{error}</p>
          ) : notifications.length === 0 ? (
            <p className="notification-empty">No hay movimientos registrados.</p>
          ) : (
            <ul>
              {notifications.map((item) => {
                const entityKey = auditedEntities[item.entidad] || item.entidad;
                const entity = adminEntities.find(({ key }) => key === entityKey);
                return (
                  <li key={item.id_auditoria}>
                    <span className="notification-dot" aria-hidden="true" />
                    <div>
                      <strong>{actionLabels[item.accion] || item.accion}</strong>
                      <p>{entity?.label || item.entidad} · #{item.id_entidad}</p>
                      <time dateTime={item.fecha}>{formatDate(item.fecha)}</time>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export default NotificationBell;
