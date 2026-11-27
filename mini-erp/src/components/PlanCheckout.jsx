import { useState } from "react";
import { crearSolicitudPublica } from "../services/api";
import ToastMessage from "./ToastMessage";
import { sanitizePhone, validateEmail } from "../utils/formValidation";

function sanitizeIdentityDocument(value) {
	return value.replace(/\D/g, "").slice(0, 20);
}

function PlanCheckout({ plan, onClose }) {
	const [step, setStep] = useState("details");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [fieldErrors, setFieldErrors] = useState({});

	const validateField = (name, value) => {
		const trimmed = value.trim();
		if (!trimmed) return "Este campo es obligatorio.";
		if (name === "nombre" && !/^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u.test(trimmed)) {
			return "Ingresa un nombre válido, sin números.";
		}
		if (name === "documento" && !/^\d{1,20}$/.test(trimmed)) {
			return "Ingresa un documento compuesto solo por números, de máximo 20 dígitos.";
		}
		if (name === "email" && !validateEmail(trimmed)) return "Ingresa un correo válido.";
		if (name === "telefono" && !/^\d{10}$/.test(trimmed)) return "El celular debe tener exactamente 10 dígitos.";
		return "";
	};

	const handleFieldChange = (event) => {
		const { name } = event.target;
		let value = event.target.value;
		if (name === "telefono") value = sanitizePhone(value);
		if (name === "documento") value = sanitizeIdentityDocument(value);
		event.target.value = value;
		const validation = validateField(name, value);
		setFieldErrors((current) => ({ ...current, [name]: validation }));
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError("");
		const formData = new FormData(event.currentTarget);
		const formValues = Object.fromEntries(formData.entries());
		const documentType = String(formValues.tipoDocumento);
		const errors = {};
		for (const name of ["nombre", "documento", "email", "telefono", "direccion"]) {
			const validation = validateField(name, String(formValues[name] || ""));
			if (validation) errors[name] = validation;
		}
		if (!["CC", "CE", "PA", "NIT"].includes(documentType)) {
			errors.tipoDocumento = "Selecciona un tipo de documento válido.";
		}
		setFieldErrors(errors);
		if (Object.keys(errors).length) return;
		setIsSubmitting(true);
		const newCustomer = {
			nombre: String(formValues.nombre).trim(),
			documento: `${formValues.tipoDocumento} ${String(formValues.documento).trim()}`,
			email: String(formValues.email).trim(),
			telefono: String(formValues.telefono).trim(),
			direccion: String(formValues.direccion).trim(),
			plan: plan.name,
			id_plan: plan.id,
			autorizacion_tratamiento: formValues.autorizacionTratamiento === "on",
			autorizacion_comercial: formValues.autorizacionComercial === "on",
		};

		try {
			const result = await crearSolicitudPublica(newCustomer);
			if (!result.success) throw new Error(result.message || "No fue posible registrar tus datos.");
			setSuccessMessage("Solicitud Recibida correctamente");
			setStep("confirmation");
		} catch (submitError) {
			setError(submitError.message || "No pudimos conectarnos. Intenta de nuevo en unos minutos.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="plan-checkout-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<ToastMessage message={successMessage} onClose={() => setSuccessMessage("")} />
			<section className="plan-checkout" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
				<header className="plan-checkout-header">
					<div>
						<h2 id="checkout-title">{step === "details" ? `Contizar ${plan.name}` : "Solicitud enviada"}</h2>
						{step === "details" && <p>{plan.price}<span> /mes</span></p>}
					</div>
					<button className="plan-checkout-close" type="button" onClick={onClose} aria-label="Cerrar">×</button>
				</header>

				{step === "details" ? (
					<form className="plan-checkout-body" onSubmit={handleSubmit}>
						<p className="plan-checkout-intro">Ingresa tus datos para enviar tu solicitud. Nuestros representantes te contactarán para continuar con el trámite y ayudarte a elegir el plan que mejor se ajuste a tus necesidades.</p>
						<label className="checkout-field">
							Nombre completo
							<input name="nombre" autoComplete="name" placeholder="Ej. María García" required maxLength="150" onChange={handleFieldChange} onBlur={handleFieldChange} aria-invalid={Boolean(fieldErrors.nombre)} />
							{fieldErrors.nombre && <small className="checkout-error" role="alert">{fieldErrors.nombre}</small>}
						</label>
						<div className="checkout-fields-row">
							<label className="checkout-field">
								Tipo doc.
								<select
									name="tipoDocumento"
									defaultValue="CC"
									onChange={(event) => {
										const document = event.currentTarget.form.elements.documento;
										const value = sanitizeIdentityDocument(document.value);
										document.value = value;
										const validation = validateField("documento", value);
										setFieldErrors((current) => ({ ...current, documento: validation }));
									}}
								>
									<option value="CC">CC</option><option value="CE">CE</option><option value="PA">Pasaporte</option><option value="NIT">NIT</option>
								</select>
								{fieldErrors.tipoDocumento && <small className="checkout-error" role="alert">{fieldErrors.tipoDocumento}</small>}
							</label>
							<label className="checkout-field">
								N.º documento
								<input name="documento" autoComplete="off" inputMode="numeric" pattern="[0-9]{1,20}" required maxLength="20" onChange={handleFieldChange} onBlur={handleFieldChange} aria-invalid={Boolean(fieldErrors.documento)} />
								{fieldErrors.documento && <small className="checkout-error" role="alert">{fieldErrors.documento}</small>}
							</label>
						</div>
						<label className="checkout-field">
							Correo electrónico
							<input name="email" type="email" autoComplete="email" placeholder="correo@ejemplo.com" required maxLength="150" onChange={handleFieldChange} onBlur={handleFieldChange} aria-invalid={Boolean(fieldErrors.email)} />
							{fieldErrors.email && <small className="checkout-error" role="alert">{fieldErrors.email}</small>}
						</label>
						<label className="checkout-field">
							Teléfono / celular
							<input name="telefono" type="tel" inputMode="numeric" autoComplete="tel" placeholder="3001234567" required maxLength="10" onChange={handleFieldChange} onBlur={handleFieldChange} aria-invalid={Boolean(fieldErrors.telefono)} />
							{fieldErrors.telefono && <small className="checkout-error" role="alert">{fieldErrors.telefono}</small>}
						</label>
						<label className="checkout-field">
							Dirección de instalación
							<input name="direccion" autoComplete="street-address" placeholder="Calle 123 # 45-67, Bogotá" required maxLength="255" onChange={handleFieldChange} onBlur={handleFieldChange} aria-invalid={Boolean(fieldErrors.direccion)} />
							{fieldErrors.direccion && <small className="checkout-error" role="alert">{fieldErrors.direccion}</small>}
						</label>
						<label className="checkout-consent">
							<input name="autorizacionTratamiento" type="checkbox" required />
							<span>Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 para gestionar esta solicitud y contactarme sobre el servicio.</span>
						</label>
						<label className="checkout-consent checkout-consent-commercial">
							<input name="autorizacionComercial" type="checkbox" />
							<span>
								<strong>Autorización opcional para fines comerciales.</strong>{" "}
								Autorizo a Global Conexit a tratar mis datos para enviarme información comercial y publicitaria sobre sus productos, planes, ofertas y promociones por correo, teléfono o WhatsApp. Esta autorización es voluntaria, no condiciona mi solicitud y puedo revocarla a través de los canales de atención.
							</span>
						</label>
						{error && <p className="checkout-error" role="alert">{error}</p>}
						<button className="checkout-submit" type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Enviando solicitud..." : "Enviar solicitud"}
						</button>
						<p className="checkout-note">Te contactaremos en un plazo de hasta 5 días hábiles.</p>
					</form>
				) : (
					<div className="plan-checkout-body checkout-confirmation-step">
						<div className="checkout-success-mark" aria-hidden="true">✓</div>
						<h3>Solicitud recibida</h3>
						<p>Tu solicitud ya fue enviada a nuestros representantes. En un plazo de hasta 5 días hábiles se pondrán en contacto contigo para continuar con el trámite de adquisición del servicio y ayudarte a elegir el plan que mejor se ajuste a tus necesidades.</p>
						<div className="checkout-summary"><span>Plan solicitado</span><strong>{plan.name}</strong></div>
					</div>
				)}
			</section>
		</div>
	);
}

export default PlanCheckout;