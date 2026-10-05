import { useState } from "react";
import { crearCliente } from "../services/api";

const whatsappNumber = "573059157061";

function PlanCheckout({ plan, onClose }) {
	const [step, setStep] = useState("details");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [customer, setCustomer] = useState(null);

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
		};

		try {
			const result = await crearCliente(newCustomer);
			if (!result.success) throw new Error(result.message || "No fue posible registrar tus datos.");
			setCustomer(newCustomer);
			setStep("payment");
		} catch (submitError) {
			setError(submitError.message || "No pudimos conectarnos. Intenta de nuevo en unos minutos.");
		} finally {
			setIsSubmitting(false);
		}
	};

	const paymentMessage = encodeURIComponent(
		`Hola, quiero continuar con la contratación del ${plan.name} (${plan.price}/mes). Mi nombre es ${customer?.nombre} y mi documento es ${customer?.documento}. Por favor envíenme un enlace seguro para realizar el pago y coordinar la instalación en ${customer?.direccion}.`
	);
	const paymentUrl = `https://wa.me/${whatsappNumber}?text=${paymentMessage}`;

	return (
		<div className="plan-checkout-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
			<section className="plan-checkout" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
				<header className="plan-checkout-header">
					<div>
						<h2 id="checkout-title">{step === "details" ? `Contratar ${plan.name}` : "Continúa con el pago"}</h2>
						<p>{plan.price}<span> /mes</span></p>
					</div>
					<button className="plan-checkout-close" type="button" onClick={onClose} aria-label="Cerrar">×</button>
				</header>

				{step === "details" ? (
					<form className="plan-checkout-body" onSubmit={handleSubmit}>
						<p className="plan-checkout-intro">Ingresa tus datos para continuar con el pago y programar tu instalación.</p>
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
						{error && <p className="checkout-error" role="alert">{error}</p>}
						<button className="checkout-submit" type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Registrando datos..." : "Continuar al pago"}
						</button>
						<p className="checkout-note">El pago se realiza en un enlace seguro enviado por nuestro equipo. No ingreses datos de tarjeta aquí.</p>
					</form>
				) : (
					<div className="plan-checkout-body checkout-payment-step">
						<div className="checkout-success-mark" aria-hidden="true">✓</div>
						<h3>Datos registrados</h3>
						<p>Ya tenemos la información de {customer.nombre}. Solicita por WhatsApp tu enlace seguro de pago para el {plan.name}.</p>
						<div className="checkout-summary"><span>Plan mensual</span><strong>{plan.price} /mes</strong><span>Instalación</span><strong>Gratis</strong></div>
						<a className="checkout-submit checkout-whatsapp" href={paymentUrl} target="_blank" rel="noreferrer">Solicitar enlace de pago <span aria-hidden="true">↗</span></a>
						<p className="checkout-note">El servicio se activa cuando el pago sea confirmado por el equipo de Global Conexit.</p>
					</div>
				)}
			</section>
		</div>
	);
}

export default PlanCheckout;