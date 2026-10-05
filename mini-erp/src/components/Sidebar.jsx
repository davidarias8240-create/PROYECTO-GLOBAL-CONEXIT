import { NavLink, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

function Sidebar() {
    const navigate = useNavigate();

    return (
        <aside className="sidebar">
            <div className="sidebar-logo-wrap">
                <img src={logo} alt="Mini ERP" className="sidebar-logo" />
            </div>

            <ul className="nav nav-pills flex-column gap-2">
                <li className="nav-item">
                    <NavLink className="nav-link" to="/clientes">Clientes</NavLink>
                </li>

                <li className="nav-item">
                    <NavLink className="nav-link" to="/productos">Productos</NavLink>
                </li>

                <li className="nav-item">
                    <NavLink className="nav-link" to="/ventas">Ventas</NavLink>
                </li>
                <li className="nav-item">
                    <NavLink className="nav-link" to="/facturas">Facturas</NavLink>
                </li>
                <li className="nav-item">
                    <NavLink className="nav-link" to="/ordenes">Ordenes</NavLink>
                </li>
            </ul>
            <button type="button" className="admin-logout" onClick={() => navigate("/")}>
                <span aria-hidden="true">⇥</span>Cerrar sesión
            </button>
        </aside>
    );
}

export default Sidebar;