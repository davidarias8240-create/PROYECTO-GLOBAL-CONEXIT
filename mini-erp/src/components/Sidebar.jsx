import { NavLink } from "react-router-dom";
import logo from "../assets/logo.png";

function Sidebar() {
    return (
        <div className="sidebar" style={{ width: "250px" }}>
            <div className="sidebar-logo-wrap">
                <img src={logo} alt="Mini ERP" className="sidebar-logo" />
            </div>

            <ul className="nav nav-pills flex-column gap-2">
                <li className="nav-item">
                    <NavLink className="nav-link text-white" to="/clientes">Clientes</NavLink>
                </li>

                <li className="nav-item">
                    <NavLink className="nav-link text-white" to="/productos">Productos</NavLink>
                </li>

                <li className="nav-item">
                    <NavLink className="nav-link text-white" to="/ventas">Ventas</NavLink>
                </li>
            </ul>
        </div>
    );
}

export default Sidebar;