import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import ToastMessage from "../components/ToastMessage";
import useTheme from "../hooks/useTheme";
import { verificarSesionAdmin } from "../services/api";

function DashboardLayout({ children }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [authorized, setAuthorized] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [theme, toggleTheme] = useTheme();
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
        if (!isSidebarOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        const closeOnEscape = (event) => {
            if (event.key === "Escape") setIsSidebarOpen(false);
        };
        document.body.style.overflow = "hidden";
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [isSidebarOpen]);

    useEffect(() => {
        if (location.state?.welcome) {
            navigate(location.pathname, { replace: true, state: null });
        }
    }, [location.pathname, location.state, navigate]);

    if (!authorized) {
        return <p className="p-4" role="status">Validando sesión administrativa...</p>;
    }

    return (
        <div className="admin-shell d-flex" data-theme={theme}>
            <ToastMessage message={welcomeMessage} onClose={dismissWelcome} />
            <button
                className={`sidebar-backdrop${isSidebarOpen ? " is-visible" : ""}`}
                type="button"
                aria-label="Cerrar menú de navegación"
                aria-hidden={!isSidebarOpen}
                tabIndex={isSidebarOpen ? 0 : -1}
                onClick={() => setIsSidebarOpen(false)}
            />
            <Sidebar isOpen={isSidebarOpen} onNavigate={() => setIsSidebarOpen(false)} />
            <div className="admin-content flex-grow-1">
                <Navbar
                    theme={theme}
                    onThemeToggle={toggleTheme}
                    onMenuToggle={() => setIsSidebarOpen((open) => !open)}
                    isMenuOpen={isSidebarOpen}
                />
                <main className="p-4">{children}</main>
            </div>
        </div>
    );
}

export default DashboardLayout;