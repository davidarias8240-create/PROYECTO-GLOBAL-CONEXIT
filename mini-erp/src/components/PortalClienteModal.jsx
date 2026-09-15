import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import ClientPortal from "../pages/interfazcliente";

function ClientLogin({ onLogin }) {
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const user = String(formData.get("user") || "").trim();
        const password = String(formData.get("password") || "").trim();

        if (!user || !password) {
            setError("Ingresa tu documento o celular y tu contraseña.");
            return;
        }

        setError("");
        onLogin();
    };

    return (
        <section className="client-login-card">
            <div className="client-login-brand"><img src={logo} alt="Global Conexit" /></div>
            <h1>Bienvenido a tu portal</h1>
            <p>Ingresa a tu Portal de Cliente Global Conexit</p>
            <form onSubmit={handleSubmit}>
                <label htmlFor="client-user-type">TIPO DE USUARIO</label>
                <select id="client-user-type" defaultValue="cliente">
                    <option value="cliente">Cliente</option>
                </select>
                <label htmlFor="client-document-type">TIPO DE DOCUMENTO</label>
                <select id="client-document-type" defaultValue="cc">
                    <option value="cc">Cédula de Ciudadanía (CC)</option>
                </select>
                <label htmlFor="client-user">NÚMERO DE DOCUMENTO</label>
                <input id="client-user" name="user" placeholder="1.234.567.890" autoComplete="username" />
                <label htmlFor="client-password">Contraseña</label>
                <div className="client-password-field"><input id="client-password" name="password" type={showPassword ? "text" : "password"} placeholder="••••••••••" autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? "◉" : "◌"}</button></div>
                {error && <p className="client-login-error" role="alert">{error}</p>}
                <button className="client-login-forgot" type="button">¿Olvidaste tu contraseña?</button>
                <button className="client-login-submit" type="submit">Ingresar al Portal</button>
            </form>
            <p className="client-login-register">¿No tienes una cuenta? <button type="button">Crear cuenta nueva</button></p>
        </section>
    );
}

function PortalClienteModal() {
    const navigate = useNavigate();
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    return (
        <div className="client-modal-backdrop" role="dialog" aria-modal="true" aria-label="Portal del cliente" onMouseDown={(event) => event.target === event.currentTarget && navigate(-1)}>
            <div className={`client-modal-shell ${isAuthenticated ? "client-modal-shell-portal" : "client-modal-shell-login"}`} onMouseDown={(event) => event.stopPropagation()}>
                <button className="client-modal-close" type="button" onClick={() => navigate(-1)} aria-label="Cerrar portal">
                    ×
                </button>
                {isAuthenticated ? <ClientPortal /> : <ClientLogin onLogin={() => setIsAuthenticated(true)} />}
            </div>
        </div>
    );
}

export default PortalClienteModal;
