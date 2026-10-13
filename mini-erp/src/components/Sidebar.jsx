import { NavLink, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { cerrarSesionCliente } from "../services/api";
import { adminEntities } from "../config/adminEntities";

const sidebarGroups = [
    { label: "Administración", keys: ["roles", "usuarios", "auditoria"] },
    { label: "Clientes", keys: ["clientes", "direcciones", "solicitudes", "tickets", "interacciones", "notificaciones"] },
    { label: "Servicios", keys: ["planes", "contratos", "periodos", "ordenes"] },
    { label: "Finanzas", keys: ["facturas", "pagos", "ajustes"] },
];

function Sidebar() {
    const navigate = useNavigate();
    const groupedKeys = new Set(sidebarGroups.flatMap(({ keys }) => keys));
    const groups = [
        ...sidebarGroups.map(({ label, keys }) => ({
            label,
            entities: keys
                .map((key) => adminEntities.find((entity) => entity.key === key))
                .filter(Boolean),
        })),
        {
            label: "Otros",
            entities: adminEntities.filter(({ key }) => !groupedKeys.has(key)),
        },
    ].filter(({ entities }) => entities.length > 0);

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
                <img src={logo} alt="Mini ERP" className="sidebar-logo" />
            </div>

            <nav className="sidebar-navigation" aria-label="Navegación administrativa">
                {groups.map(({ label, entities }) => (
                    <section className="sidebar-group" key={label}>
                        <h2 className="sidebar-group-title">{label}</h2>
                        <ul className="nav nav-pills flex-column">
                            {entities.map(({ key, label: entityLabel }) => (
                                <li className="nav-item" key={key}>
                                    <NavLink className="nav-link" to={`/${key}`}>{entityLabel}</NavLink>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
                <section className="sidebar-group">
                    <h2 className="sidebar-group-title">Registros</h2>
                    <ul className="nav nav-pills flex-column">
                        <li className="nav-item">
                            <NavLink className="nav-link" to="/desactivados">Desactivados</NavLink>
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