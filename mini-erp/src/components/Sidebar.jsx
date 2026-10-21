import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { cerrarSesionCliente } from "../services/api";
import { adminEntities } from "../config/adminEntities";

const sidebarGroups = [
    { label: "Administración", icon: "administration", keys: ["roles", "usuarios", "auditoria"] },
    { label: "Clientes", icon: "clients", keys: ["clientes", "direcciones", "solicitudes", "tickets", "interacciones", "notificaciones"] },
    { label: "Servicios", icon: "services", keys: ["planes", "contratos", "periodos", "ordenes"] },
    { label: "Finanzas", icon: "finances", keys: ["facturas", "pagos", "ajustes"] },
];

const entityIcons = {
    roles: "shield",
    usuarios: "user",
    auditoria: "clipboard",
    clientes: "user",
    direcciones: "pin",
    solicitudes: "inbox",
    tickets: "ticket",
    interacciones: "message",
    notificaciones: "bell",
    planes: "layers",
    contratos: "document",
    periodos: "calendar",
    ordenes: "wrench",
    facturas: "receipt",
    pagos: "wallet",
    ajustes: "sliders",
};

const iconPaths = {
    dashboard: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
    administration: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4 1.6 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-2 .9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-2-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2.3l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 2-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 2 .9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2.3Z",
    clients: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-7.8a4 4 0 0 1 0 7.6m2 4.2a4 4 0 0 1 2 3.5V21",
    services: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
    finances: "M3 6h18v14H3zM7 6V4h10v2m-5 4v8m3-6a3 3 0 1 0-3 3 3 3 0 1 1-3 3",
    shield: "M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Zm-3-11 2 2 4-4",
    user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    clipboard: "M9 5H5v16h14V5h-4M9 3h6v4H9zM8 12h8m-8 4h8",
    users: "M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m6-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6-7.8a4 4 0 0 1 0 7.6m2 4.2a4 4 0 0 1 2 3.5V21",
    pin: "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    inbox: "M4 4h16l2 11h-6l-2 3h-4l-2-3H2L4 4Zm0 0 2 8h3l1 2h4l1-2h3l2-8",
    ticket: "M3 8V5h18v3a3 3 0 0 0 0 6v3H3v-3a3 3 0 0 0 0-6Zm9-2v2m0 3v2m0 3v2",
    message: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4",
    layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5m-18 4 9 5 9-5",
    document: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8m-8 4h8",
    calendar: "M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm3 10h3v3H8z",
    wrench: "m14.7 6.3 3-3a6 6 0 0 0-7.9 7.9L3 18a2 2 0 1 0 3 3l6.8-6.8a6 6 0 0 0 7.9-7.9l-3 3-3-3Z",
    receipt: "M4 2v20l3-2 3 2 2-2 3 2 2-2 3 2V2l-3 2-3-2-2 2-3-2-2 2-3-2Zm4 6h8m-8 4h8m-8 4h5",
    wallet: "M3 5h18v15H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h15m-4 9h5m-5 0a1 1 0 1 0 0 0",
    sliders: "M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 6h4",
    archive: "M3 4h18v4H3zM5 8v12h14V8m-9 4h4",
    history: "M3 12a9 9 0 1 0 2.6-6.4L3 8m0-5v5h5m4-1v5l3 2",
    chevron: "m9 18 6-6-6-6",
};

function SidebarIcon({ name, className = "" }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
        >
            <path d={iconPaths[name] ?? iconPaths.archive} />
        </svg>
    );
}

function Sidebar() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const groupedKeys = new Set(sidebarGroups.flatMap(({ keys }) => keys));
    const groups = [
        ...sidebarGroups.map(({ label, icon, keys }) => ({
            label,
            icon,
            entities: keys
                .map((key) => adminEntities.find((entity) => entity.key === key))
                .filter(Boolean),
        })),
        {
            label: "Otros",
            icon: "archive",
            entities: adminEntities.filter(({ key }) => !groupedKeys.has(key)),
        },
    ].filter(({ entities }) => entities.length > 0);
    const activeGroup = groups.find(({ entities }) =>
        entities.some(({ key }) => pathname === `/${key}`),
    )?.label;
    const [groupSelection, setGroupSelection] = useState(null);
    const expandedGroup = groupSelection?.pathname === pathname
        ? groupSelection.label
        : activeGroup;

    const handleLogout = async () => {
        try {
            await cerrarSesionCliente();
            navigate("/admin", { replace: true });
        } catch (error) {
            window.alert(error.message);
        }
    };

    return (
        <aside className="sidebar">
            <div className="sidebar-logo-wrap">
                <img src={logo} alt="Global Conexit" className="sidebar-logo" />
            </div>

            <nav className="sidebar-navigation" aria-label="Navegación administrativa">
                <NavLink className="nav-link sidebar-dashboard-link" to="/dashboard">
                    <SidebarIcon name="dashboard" className="sidebar-subcategory-icon" />
                    <span>Dashboard</span>
                </NavLink>
                {groups.map(({ label, icon, entities }) => (
                    <section className="sidebar-group" key={label}>
                        <button
                            className="sidebar-group-toggle"
                            type="button"
                            aria-expanded={expandedGroup === label}
                            aria-controls={`sidebar-group-${label}`}
                            onClick={() => setGroupSelection({
                                pathname,
                                label: expandedGroup === label ? null : label,
                            })}
                        >
                            <SidebarIcon name={icon} className="sidebar-category-icon" />
                            <span>{label}</span>
                            <SidebarIcon name="chevron" className={`sidebar-chevron${expandedGroup === label ? " expanded" : ""}`} />
                        </button>
                        <ul
                            className="nav nav-pills flex-column sidebar-subcategories"
                            id={`sidebar-group-${label}`}
                            hidden={expandedGroup !== label}
                        >
                            {entities.map(({ key, label: entityLabel }) => (
                                <li className="nav-item" key={key}>
                                    <NavLink className="nav-link" to={`/${key}`}>
                                        <SidebarIcon name={entityIcons[key] ?? "archive"} className="sidebar-subcategory-icon" />
                                        <span>{entityLabel}</span>
                                    </NavLink>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
                <section className="sidebar-group">
                    <ul className="nav nav-pills flex-column sidebar-subcategories">
                        <li className="nav-item">
                            <NavLink className="nav-link" to="/desactivados">
                                <SidebarIcon name="history" className="sidebar-subcategory-icon" />
                                <span>Desactivados</span>
                            </NavLink>
                        </li>
                    </ul>
                </section>
            </nav>
            <button type="button" className="admin-logout" onClick={handleLogout}>
                <span aria-hidden="true">⇥</span>Cerrar sesión
            </button>
        </aside>
    );
}

export default Sidebar;