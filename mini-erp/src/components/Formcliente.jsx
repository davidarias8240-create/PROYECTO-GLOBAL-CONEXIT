import { useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { iniciarSesionCliente } from "../services/api";
import { sanitizeDocument, validateDocument } from "../utils/formValidation";

function Formcliente({ onClose }) {
    const navigate = useNavigate();
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [documentType, setDocumentType] = useState("CC");
    const [documentNumber, setDocumentNumber] = useState("");
    const [documentError, setDocumentError] = useState("");

    const handleSubmit = async (event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const password = String(formData.get("password") || "");
        const cleanedDocument = String(formData.get("documentNumber") || "").trim();

        const validation = !cleanedDocument
            ? "Ingresa tu número de documento."
            : validateDocument(cleanedDocument, documentType)
                ? ""
                : "El documento contiene caracteres no permitidos para el tipo seleccionado.";
        setDocumentError(validation);
        if (validation || !password || !documentType) {
            setError("Ingresa tu número de documento y contraseña.");
            return;
        }

        setError("");
        setIsSubmitting(true);

        try {
            await iniciarSesionCliente({
                tipo_documento: documentType,
                numero_documento: cleanedDocument,
                contrasena: password,
            });
            navigate("/cliente", { state: { welcome: true } });
        } catch (loginError) {
            setError(loginError.message);
        } finally {
            setIsSubmitting(false);
        }
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
                    <select
                        id="client-document-type"
                        name="documentType"
                        value={documentType}
                        onChange={(event) => {
                            const nextType = event.target.value;
                            const nextDocument = sanitizeDocument(documentNumber, nextType, 30);
                            setDocumentType(nextType);
                            setDocumentNumber(nextDocument);
                            setDocumentError(nextDocument && !validateDocument(nextDocument, nextType)
                                ? "El documento contiene caracteres no permitidos para el tipo seleccionado."
                                : "");
                        }}
                    >
                        <option value="CC">Cédula de Ciudadanía (CC)</option>
                        <option value="CE">Cédula de Extranjería (CE)</option>
                        <option value="NIT">NIT</option>
                        <option value="TI">Tarjeta de Identidad (TI)</option>
                        <option value="PASAPORTE">Pasaporte</option>
                        <option value="OTRO">Otro</option>
                    </select>
                    <label htmlFor="client-document-number">NÚMERO DE DOCUMENTO</label>
                    <input
                        id="client-document-number"
                        name="documentNumber"
                        placeholder="Ingresa tu documento"
                        autoComplete="username"
                        value={documentNumber}
                        maxLength={30}
                        aria-invalid={Boolean(documentError)}
                        onChange={(event) => {
                            const value = sanitizeDocument(event.target.value, documentType, 30);
                            setDocumentNumber(value);
                            setDocumentError(value && !validateDocument(value, documentType)
                                ? "El documento contiene caracteres no permitidos para el tipo seleccionado."
                                : "");
                        }}
                        onBlur={() => {
                            if (!documentNumber.trim()) setDocumentError("Este campo es obligatorio.");
                        }}
                    />
                    {documentError && <p className="client-login-error" role="alert">{documentError}</p>}
                    <label htmlFor="client-password">CONTRASEÑA</label>
                    <div className="client-password-field">
                        <input id="client-password" name="password" type={showPassword ? "text" : "password"} placeholder="••••••••••" autoComplete="current-password" />
                        <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>{showPassword ? "◉" : "◌"}</button>
                    </div>
                    {error && <p className="client-login-error" role="alert">{error}</p>}
                    <button className="client-login-forgot" type="button">¿Olvidaste tu contraseña?</button>
                    <button className="client-login-submit" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Validando..." : "Ingresar al Portal"}
                    </button>
                </form>
                <p className="client-login-register">¿No tienes una cuenta? <button type="button">Crear cuenta nueva</button></p>
            </section>
        </div>
    );
}

export default Formcliente;