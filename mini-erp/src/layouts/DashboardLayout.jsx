import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import ToastMessage from "../components/ToastMessage";
import useTheme from "../hooks/useTheme";
import { verificarSesionAdmin } from "../services/api";

function moduloDeRuta(pathname) {
    const partes = pathname.split("/").filter(Boolean);
    if (partes[0] === "clientes" && /^\d+$/.test(partes[1] || "")) {
        return partes[2] || "clientes";
    }
    return partes[0] || "";
}

function rutaPermitida(pathname, permisos) {
    const modulo = moduloDeRuta(pathname);
    if (modulo === "dashboard") return permisos.dashboard;
    if (modulo === "desactivados") return permisos.desactivados;
    return Boolean(permisos.entidades[modulo]?.leer);
}

function rutaInicial(permisos) {
    if (permisos.dashboard) return "/dashboard";
    if (permisos.rol === "TECNICO" && permisos.entidades.ordenes?.leer) return "/ordenes";
    return Object.entries(permisos.entidades).find(([, policy]) => policy.leer)?.[0]
        ? `/${Object.entries(permisos.entidades).find(([, policy]) => policy.leer)[0]}`
        : "/admin";
}

function DashboardLayout({ children }) {
    const navigate = useNavigate();
    const location = useLocation();
    const [permisos, setPermisos] = useState(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [theme, toggleTheme] = useTheme();
    const [welcomeMessage, setWelcomeMessage] = useState(
        () => location.state?.welcome ? "¡Bienvenido de nuevo a Global Conexit!" : ""
    );
    const dismissWelcome = useCallback(() => setWelcomeMessage(""), []);

    useEffect(() => {
        verificarSesionAdmin()
            .then((response) => setPermisos(response.permisos))
            .catch(() => navigate("/admin", { replace: true }));
    }, [navigate]);

    const authorized = Boolean(permisos);
    const allowed = authorized && rutaPermitida(location.pathname, permisos);

    useEffect(() => {
        if (authorized && !allowed) {
            navigate(rutaInicial(permisos), { replace: true });
        }
    }, [authorized, allowed, navigate, permisos]);

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

    if (!allowed) {
        return <main className="p-4"><section className="alert alert-warning" role="alert">
            No tienes permiso para acceder a este módulo.
        </section></main>;
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
            <Sidebar
                permisos={permisos}
                isOpen={isSidebarOpen}
                onNavigate={() => setIsSidebarOpen(false)}
            />
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