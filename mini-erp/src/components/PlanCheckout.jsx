import { useState } from "react";
import { crearSolicitudPublica } from "../services/api";

function PlanCheckout({ plan, onClose }) {
	const [step, setStep] = useState("details");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError("");
		setIsSubmitting(true);
		const formData = new FormData(event.currentTarget);
		const formValues = Object.fromEntries(formData.entries());
		const newCustomer = {
			nombre: String(formValues.nombre).trim(),
			documento: `${formValues.tipoDocumento} ${String(formValues.documento).trim()}`,
			email: String(formValues.email).trim(),
			telefono: String(formValues.telefono).trim(),
			direccion: String(formValues.direccion).trim(),
			plan: plan.name,
			autorizacion_tratamiento: formValues.autorizacionTratamiento === "on",
		};

		try {
			const result = await crearSolicitudPublica(newCustomer);
			if (!result.success) throw new Error(result.message || "No fue posible registrar tus datos.");
			setStep("confirmation");
		} catch (submitError) {
			setError(submitError.message || "No pudimos conectarnos. Intenta de nuevo en unos minutos.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="plan-checkout-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
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
							<input name="nombre" autoComplete="name" placeholder="Ej. María García" required maxLength="150" />
						</label>
						<div className="checkout-fields-row">
							<label className="checkout-field">
								Tipo doc.
								<select name="tipoDocumento" defaultValue="CC">
									<option value="CC">CC</option><option value="CE">CE</option><option value="PA">Pasaporte</option><option value="NIT">NIT</option>
								</select>
							</label>
							<label className="checkout-field">
								N.º documento
								<input name="documento" autoComplete="off" required maxLength="50" />
							</label>
						</div>
						<label className="checkout-field">
							Correo electrónico
							<input name="email" type="email" autoComplete="email" placeholder="correo@ejemplo.com" required maxLength="150" />
						</label>
						<label className="checkout-field">
							Teléfono / celular
							<input name="telefono" type="tel" autoComplete="tel" placeholder="3001234567" required maxLength="50" />
						</label>
						<label className="checkout-field">
							Dirección de instalación
							<input name="direccion" autoComplete="street-address" placeholder="Calle 123 # 45-67, Bogotá" required maxLength="255" />
						</label>
						<label className="checkout-consent">
							<input name="autorizacionTratamiento" type="checkbox" required />
							<span>Autorizo el tratamiento de mis datos personales conforme a la Ley 1581 de 2012 para gestionar esta solicitud y contactarme sobre el servicio.</span>
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