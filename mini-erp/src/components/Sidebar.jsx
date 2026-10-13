import { NavLink, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { cerrarSesionCliente } from "../services/api";
import { adminEntities } from "../config/adminEntities";

function Sidebar() {
    const navigate = useNavigate();

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

            <ul className="nav nav-pills flex-column gap-2">
                {adminEntities.map(({ key, label }) => (
                    <li className="nav-item" key={key}>
                        <NavLink className="nav-link" to={`/${key}`}>{label}</NavLink>
                    </li>
                ))}
                <li className="nav-item">
                    <NavLink className="nav-link" to="/desactivados">Desactivados</NavLink>
                </li>
            </ul>
            <button type="button" className="admin-logout" onClick={handleLogout}>
                <span aria-hidden="true">⇥</span>Cerrar sesión
            </button>
        </aside>
    );
}

export default Sidebar;