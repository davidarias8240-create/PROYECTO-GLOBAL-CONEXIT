import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";

function Formcliente({ onClose }) {
    const navigate = useNavigate();
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const documentNumber = String(formData.get("documentNumber") || "").trim();
        const password = String(formData.get("password") || "").trim();

        if (!documentNumber || !password) {
            setError("Ingresa tu número de documento y contraseña.");
            return;
        }

        navigate("/cliente");
    };

    return (
        <div className="client-login-overlay" role="dialog" aria-modal="true" aria-label="Ingreso al portal de clientes">
            <section className="client-login-card">
                <button className="client-login-close" type="button" onClick={onClose} aria-label="Cerrar formulario">×</button>
                <div className="client-login-brand"><img src={logo} alt="Global Conexit" /></div>
                <h1>Bienvenido de nuevo</h1>
                <p>Ingresa a tu Portal de Cliente Global Conexit</p>
                <form onSubmit={handleSubmit}>
                    <label htmlFor="client-document-type">TIPO DE DOCUMENTO</label>
                    <select id="client-document-type" name="documentType" defaultValue="cc">
                        <option value="cc">Cédula de Ciudadanía (CC)</option>
                    </select>
                    <label htmlFor="client-document-number">NÚMERO DE DOCUMENTO</label>
                    <input id="client-document-number" name="documentNumber" placeholder="1.234.567.890" autoComplete="username" />
                    <label htmlFor="client-password">CONTRASEÑA</label>
                    <div className="client-password-field">
                        <input id="client-password" name="password" type={showPassword ? "text" : "password"} placeholder="••••••••••" autoComplete="current-password" />
                        <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? "◉" : "◌"}</button>
                    </div>
                    {error && <p className="client-login-error" role="alert">{error}</p>}
                    <button className="client-login-forgot" type="button">¿Olvidaste tu contraseña?</button>
                    <button className="client-login-submit" type="submit">Ingresar al Portal</button>
                </form>
                <p className="client-login-register">¿No tienes una cuenta? <button type="button">Crear cuenta nueva</button></p>
            </section>
        </div>
    );
}

export default Formcliente;