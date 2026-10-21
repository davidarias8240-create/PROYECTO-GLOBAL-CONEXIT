import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import ToastMessage from "../components/ToastMessage";
import { verificarSesionAdmin } from "../services/api";

function DashboardLayout({ children }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [authorized, setAuthorized] = useState(false);
    const [welcomeMessage, setWelcomeMessage] = useState(
        () => location.state?.welcome ? "¡Bienvenido de nuevo a Global Conexit!" : ""
    );
    const dismissWelcome = useCallback(() => setWelcomeMessage(""), []);

    useEffect(() => {
        verificarSesionAdmin()
            .then(() => setAuthorized(true))
            .catch(() => navigate("/admin", { replace: true }));
    }, [navigate]);

    useEffect(() => {
        if (location.state?.welcome) {
            navigate(location.pathname, { replace: true, state: null });
        }
    }, [location.pathname, location.state, navigate]);

    if (!authorized) {
        return <p className="p-4" role="status">Validando sesión administrativa...</p>;
    }

    return (
        <div className="admin-shell d-flex">
            <ToastMessage message={welcomeMessage} onClose={dismissWelcome} />
            <Sidebar />
            <div className="admin-content flex-grow-1">
                <Navbar />
                <main className="p-4">{children}</main>
            </div>
        </div>
    );
}

export default DashboardLayout;