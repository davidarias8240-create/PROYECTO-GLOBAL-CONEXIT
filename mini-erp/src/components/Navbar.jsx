import { useNavigate } from "react-router-dom";

function Navbar() {
    const navigate = useNavigate();

    const handleLogout = () => {
        navigate("/");
    };

    return (
        <nav className="navbar">
            <span className="navbar-brand">
                Panel Administrativo
            </span>

            <button type="button" className="logout-btn" onClick={handleLogout}>
                Cerrar sesión
            </button>
        </nav>
    );
}

export default Navbar;