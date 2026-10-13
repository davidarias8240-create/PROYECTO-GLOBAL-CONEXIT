import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { iniciarSesionAdmin } from "../services/api";

function FormAdmin() {
    const navigate = useNavigate();
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setError("");
        setIsSubmitting(true);

        try {
            await iniciarSesionAdmin({
                correo: formData.get("correo"),
                contrasena: formData.get("contrasena"),
            });
            navigate("/usuarios");
        } catch (loginError) {
            setError(loginError.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="admin-login-page">
            <div className="admin-login-card">
                <div className="admin-login-brand">
                    <span className="admin-login-brand-mark" aria-hidden="true">GC</span>
                    <span>GLOBAL CONEXIT</span>
                </div>
                <div className="admin-login-heading">
                    <p className="admin-login-eyebrow">Portal administrativo</p>
                    <h1>Bienvenido de nuevo</h1>
                    <p>Ingresa tus datos para gestionar tu operación.</p>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="admin-login-field">
                        <label htmlFor="formEmail">Correo electrónico</label>
                        <input type="email" id="formEmail" name="correo" placeholder="tu@correo.com" autoComplete="username" required />
                    </div>
                    <div className="admin-login-field">
                        <label htmlFor="formPassword">Contraseña</label>
                        <input type="password" id="formPassword" name="contrasena" placeholder="Ingresa tu contraseña" autoComplete="current-password" required />
                    </div>
                    {error && <p className="text-danger" role="alert">{error}</p>}
                    <button type="submit" className="admin-login-submit" disabled={isSubmitting}>
                        {isSubmitting ? "Validando..." : "Iniciar sesión"} <span aria-hidden="true">→</span>
                    </button>
                </form>
                <button type="button" className="btn btn-outline-secondary w-100 mt-3" onClick={() => navigate("/")}>
                    Volver a la página principal
                </button>
            </div>
        </main>
    );
}

export default FormAdmin;