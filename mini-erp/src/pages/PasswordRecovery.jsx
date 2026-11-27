import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    restablecerContrasena,
    solicitarRecuperacionContrasena,
    validarTokenRecuperacion,
} from "../services/api";

const RECOVERY_ROLES = {
    cliente: {
        apiRole: "cliente",
        accountLabel: "cliente",
        returnPath: "/",
        returnState: { openClientLogin: true },
    },
    administrador: {
        apiRole: "administrador",
        accountLabel: "administrador",
        returnPath: "/admin",
        returnState: null,
    },
};

function PasswordRecovery() {
    const { rol } = useParams();
    const navigate = useNavigate();
    const recoveryRole = RECOVERY_ROLES[rol];
    const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
    const [tokenStatus, setTokenStatus] = useState(token ? "checking" : "none");
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const handleTokenFragment = () => {
            const nextToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
            if (window.location.hash) {
                window.history.replaceState(
                    window.history.state,
                    "",
                    `${window.location.pathname}${window.location.search}`
                );
            }
            setToken(nextToken);
            setTokenStatus(nextToken ? "checking" : "none");
            setError("");
        };
        window.addEventListener("hashchange", handleTokenFragment);
        if (window.location.hash) {
            window.history.replaceState(
                window.history.state,
                "",
                `${window.location.pathname}${window.location.search}`
            );
        }
        return () => window.removeEventListener("hashchange", handleTokenFragment);
    }, []);

    useEffect(() => {
        if (!token || !recoveryRole) return undefined;
        let isCurrent = true;
        validarTokenRecuperacion(recoveryRole.apiRole, token)
            .then(() => {
                if (isCurrent) setTokenStatus("valid");
            })
            .catch((validationError) => {
                if (isCurrent) {
                    setError(validationError.message || "El enlace no es válido o ya venció.");
                    setTokenStatus("invalid");
                }
            });
        return () => {
            isCurrent = false;
        };
    }, [recoveryRole, token]);

    const handleRequestSubmit = async (event) => {
        event.preventDefault();
        setError("");
        setMessage("");
        setIsSubmitting(true);
        try {
            const result = await solicitarRecuperacionContrasena(recoveryRole.apiRole, email.trim());
            setMessage(result.message);
        } catch (requestError) {
            setError(requestError.message || "No fue posible procesar la solicitud.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePasswordSubmit = async (event) => {
        event.preventDefault();
        setError("");
        setMessage("");
        const formData = new FormData(event.currentTarget);
        const password = String(formData.get("contrasena") || "");
        const confirmation = String(formData.get("confirmar_contrasena") || "");
        if (password.length < 8 || new TextEncoder().encode(password).length > 72) {
            setError("La contraseña debe tener entre 8 y 72 bytes.");
            return;
        }
        if (password !== confirmation) {
            setError("Las contraseñas no coinciden.");
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await restablecerContrasena(
                recoveryRole.apiRole,
                token,
                password,
                confirmation
            );
            setMessage(result.message);
            setTokenStatus("completed");
        } catch (resetError) {
            setError(resetError.message || "No fue posible cambiar la contraseña.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!recoveryRole) {
        return (
            <main className="admin-login-page">
                <section className="admin-login-card">
                    <h1>Enlace no válido</h1>
                    <button className="admin-login-submit" type="button" onClick={() => navigate("/")}>
                        Volver al inicio
                    </button>
                </section>
            </main>
        );
    }

    const isResetFlow = Boolean(token);
    const showPasswordForm = isResetFlow && tokenStatus === "valid";
    const isCompleted = tokenStatus === "completed";

    return (
        <main className="admin-login-page">
            <section className="admin-login-card password-recovery-card">
                <div className="admin-login-brand">
                    <span className="admin-login-brand-mark" aria-hidden="true">GC</span>
                    <span>GLOBAL CONEXIT</span>
                </div>
                <div className="admin-login-heading">
                    <p className="admin-login-eyebrow">
                        {recoveryRole.accountLabel === "cliente" ? "Portal de cliente" : "Portal administrativo"}
                    </p>
                    <h1>
                        {isCompleted
                            ? "Contraseña actualizada"
                            : showPasswordForm
                                ? "Crea una contraseña nueva"
                                : isResetFlow
                                    ? "Verificando enlace"
                                    : "Recupera tu contraseña"}
                    </h1>
                    <p>
                        {isCompleted
                            ? "Ya puedes iniciar sesión con tu nueva contraseña."
                            : showPasswordForm
                                ? "Elige una contraseña segura para tu cuenta."
                                : isResetFlow
                                    ? "Estamos comprobando que el enlace sea válido."
                                    : "Te enviaremos instrucciones al correo registrado si la cuenta puede recuperarse."}
                    </p>
                </div>

                {isCompleted ? (
                    <p className="password-recovery-message" role="status">{message}</p>
                ) : showPasswordForm ? (
                    <form onSubmit={handlePasswordSubmit}>
                        <div className="admin-login-field">
                            <label htmlFor="recovery-password">Nueva contraseña</label>
                            <input
                                id="recovery-password"
                                name="contrasena"
                                type="password"
                                autoComplete="new-password"
                                minLength={8}
                                maxLength={72}
                                required
                            />
                        </div>
                        <div className="admin-login-field">
                            <label htmlFor="recovery-password-confirmation">Confirma la nueva contraseña</label>
                            <input
                                id="recovery-password-confirmation"
                                name="confirmar_contrasena"
                                type="password"
                                autoComplete="new-password"
                                minLength={8}
                                maxLength={72}
                                required
                            />
                        </div>
                        {error && <p className="password-recovery-error" role="alert">{error}</p>}
                        <button className="admin-login-submit" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Guardando..." : "Guardar contraseña"}
                        </button>
                    </form>
                ) : isResetFlow ? (
                    <div aria-live="polite">
                        {tokenStatus === "checking" && <p>Verificando el enlace...</p>}
                        {tokenStatus === "invalid" && (
                            <>
                                <p className="password-recovery-error" role="alert">
                                    {error || "El enlace no es válido o ya venció. Solicita uno nuevo."}
                                </p>
                                <button
                                    className="admin-login-submit"
                                    type="button"
                                    onClick={() => {
                                        setToken("");
                                        setTokenStatus("none");
                                        setError("");
                                        navigate(`/recuperar-contrasena/${rol}`, { replace: true });
                                    }}
                                >
                                    Solicitar otro enlace
                                </button>
                            </>
                        )}
                    </div>
                ) : (
                    <form onSubmit={handleRequestSubmit}>
                        <div className="admin-login-field">
                            <label htmlFor="recovery-email">Correo electrónico</label>
                            <input
                                id="recovery-email"
                                name="correo"
                                type="email"
                                autoComplete="email"
                                maxLength={150}
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                required
                            />
                        </div>
                        {error && <p className="password-recovery-error" role="alert">{error}</p>}
                        {message && <p className="password-recovery-message" role="status">{message}</p>}
                        <button className="admin-login-submit" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Enviando..." : "Enviar enlace de recuperación"}
                        </button>
                    </form>
                )}

                {(isCompleted || !isResetFlow || tokenStatus === "invalid") && (
                    <button
                        type="button"
                        className="password-recovery-back"
                        onClick={() => navigate(recoveryRole.returnPath, { state: recoveryRole.returnState })}
                    >
                        Volver al inicio de sesión
                    </button>
                )}
            </section>
        </main>
    );
}

export default PasswordRecovery;
