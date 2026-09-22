import { useNavigate } from "react-router-dom";

function FormAdmin() {
    const navigate = useNavigate();

    const handleSubmit = (event) => {
        event.preventDefault();
        navigate("/clientes");
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
                        <input type="email" id="formEmail" placeholder="tu@correo.com" required />
                    </div>
                    <div className="admin-login-field">
                        <label htmlFor="formPassword">Contraseña</label>
                        <input type="password" id="formPassword" placeholder="Ingresa tu contraseña" required />
                    </div>
                    <button type="submit" className="admin-login-submit">Iniciar sesión <span aria-hidden="true">→</span></button>
                </form>
            </div>
        </main>
    );
}

export default FormAdmin;