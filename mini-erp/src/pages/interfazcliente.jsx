import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
	cerrarSesionCliente,
	obtenerPerfilCliente,
	obtenerPortalCliente,
	pagarFacturaSimulada,
	reportarFallaCliente,
} from "../services/api";
import ToastMessage from "../components/ToastMessage";

const menuItems = [
	{ id: "plan", icon: "▥", label: "Mi Plan" },
	{ id: "facturas", icon: "▤", label: "Mis Facturas", badge: true },
	{ id: "pago", icon: "▣", label: "Pagar Factura" },
	{ id: "paz", icon: "♢", label: "Paz y Salvo" },
	{ id: "soporte", icon: "⚒", label: "Soporte / Fallas" },
];

const moneyFormat = new Intl.NumberFormat("es-CO", {
	style: "currency",
	currency: "COP",
	maximumFractionDigits: 0,
});

function formatMoney(value) {
	return moneyFormat.format(Number(value) || 0);
}

function formatDate(value) {
	if (!value) return "Sin registros";
	const normalized = value.length === 10 ? `${value}T00:00:00` : value.replace(" ", "T");
	const date = new Date(normalized);
	if (Number.isNaN(date.getTime())) return "Sin registros";
	return new Intl.DateTimeFormat("es-CO", {
		dateStyle: "medium",
		...(value.length > 10 ? { timeStyle: "short" } : {}),
	}).format(date);
}

function facturaPendiente(factura) {
	return ["PENDIENTE", "VENCIDA"].includes(factura.estado) && Number(factura.saldo) > 0;
}

function estadoFactura(factura) {
	const estados = {
		PENDIENTE: { label: "Pendiente", className: "pending" },
		PAGADA: { label: "Pagada", className: "paid" },
		VENCIDA: { label: "Vencida", className: "overdue" },
		ANULADA: { label: "Anulada", className: "cancelled" },
	};
	return estados[factura.estado] || { label: factura.estado, className: "pending" };
}

function StatusPill({ children = "Cuenta de cliente" }) {
	return <span className="client-status"><i />{children}</span>;
}

function ClientSidebar({ currentView, setCurrentView, perfil, facturas }) {
	const navigate = useNavigate();
	const initials = perfil.nombres
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((name) => name[0])
		.join("")
		.toUpperCase();
	const facturasPendientes = facturas.filter(facturaPendiente).length;

	const handleLogout = async () => {
		try {
			await cerrarSesionCliente();
			navigate("/");
		} catch (error) {
			window.alert(error.message);
		}
	};

	return (
		<aside className="client-sidebar">
			<div className="client-profile">
				<span className="profile-avatar">{initials}</span>
				<div><strong>{perfil.nombres}</strong><small>{perfil.numero_documento}</small></div>
				<span className="profile-plan"><i />{perfil.estado_cliente}</span>
				<button
					className={`profile-account-action${currentView === "cuenta" ? " active" : ""}`}
					type="button"
					aria-current={currentView === "cuenta" ? "page" : undefined}
					onClick={() => setCurrentView("cuenta")}
				>
					<span className="nav-icon" aria-hidden="true">◉</span>
					<span>Mi cuenta</span>
				</button>
			</div>
			<nav className="client-nav" aria-label="Navegación del portal">
				{menuItems.map((item) => (
					<button
						className={currentView === item.id ? "active" : ""}
						key={item.id}
						type="button"
						onClick={() => setCurrentView(item.id)}
					>
						<span className="nav-icon">{item.icon}</span>
						{item.label}
						{item.badge && facturasPendientes > 0 && <b aria-label={`${facturasPendientes} facturas pendientes`} />}
					</button>
				))}
			</nav>
			<button className="client-logout" type="button" onClick={handleLogout}><span>⇥</span>Cerrar sesión</button>
		</aside>
	);
}

function ClientHeader({ title, subtitle }) {
	return <header className="client-header"><div><h1>{title}</h1><p>{subtitle}</p></div><StatusPill /></header>;
}

function Info({ label, value }) {
	return <div><small>{label}</small><strong>{value || "No registrado"}</strong></div>;
}

function ProfileView({ perfil }) {
	return (
		<>
			<ClientHeader title="Mi cuenta" subtitle="Información personal y estado de tu cuenta" />
			<section className="dashboard-card equipment-card">
				<h3>Datos personales</h3>
				<div className="equipment-grid">
					<Info label="Nombre completo" value={perfil.nombres} />
					<Info label="Tipo de documento" value={perfil.tipo_documento} />
					<Info label="Número de documento" value={perfil.numero_documento} />
					<Info label="Correo electrónico" value={perfil.correo || "No registrado"} />
					<Info label="Teléfono" value={perfil.telefono || "No registrado"} />
					<Info label="Dirección" value={perfil.direcciones || "No registrada"} />
					<Info label="Número de cliente" value={perfil.numero_cliente} />
					<Info label="Rol" value={perfil.rol} />
					<Info label="Estado del cliente" value={perfil.estado_cliente} />
					<Info label="Estado de la cuenta" value={perfil.estado_usuario} />
					<Info label="Miembro desde" value={formatDate(perfil.fecha_creacion)} />
					<Info label="Último acceso" value={formatDate(perfil.ultimo_acceso)} />
				</div>
			</section>
		</>
	);
}

function NoContractNotice() {
	return <section className="dashboard-card no-contract-notice" role="status">
		<strong>Contrato inexistente o no se puede mostrar el contrato</strong>
		<p>Consulta con soporte si consideras que deberías tener un contrato asociado.</p>
	</section>;
}

function PlanView({ contrato }) {
	return (
		<>
			<ClientHeader title="Mi Plan" subtitle="Información de tu contrato y servicio registrado" />
			{!contrato ? <NoContractNotice /> : (
				<section className="plan-hero">
					<div className="plan-hero-top">
						<div>
							<span className="eyebrow-light">CONTRATO #{contrato.id_contrato}</span>
							<h2>{contrato.plan_nombre}</h2>
							<p>Estado: {contrato.estado}</p>
						</div>
						<StatusPill>{contrato.estado}</StatusPill>
					</div>
					<div className="plan-summary">
						<div><small>Velocidad del plan</small><strong>{contrato.velocidad}</strong></div>
						<div><small>Valor mensual registrado</small><strong>{formatMoney(contrato.precio)}</strong></div>
						<div><small>Inicio del contrato</small><strong>{formatDate(contrato.fecha_inicio)}</strong></div>
						<div><small>Fin del contrato</small><strong>{formatDate(contrato.fecha_fin)}</strong></div>
						<div className="plan-address"><small>Dirección del servicio</small><strong>{[contrato.direccion, contrato.ciudad, contrato.departamento].filter(Boolean).join(", ")}</strong></div>
					</div>
				</section>
			)}
		</>
	);
}

function InvoicesView({ facturas, resumen, setFacturaSeleccionada, setCurrentView }) {
	const [filtro, setFiltro] = useState("todas");
	const visibles = facturas.filter((factura) => {
		return filtro === "todas" || factura.estado === filtro;
	});

	return (
		<>
			<ClientHeader title="Mis Facturas" subtitle="Facturas reales asociadas a tus contratos" />
			<div className="invoice-metrics">
				<Info label="FACTURAS REGISTRADAS" value={facturas.length} />
				<Info label="PENDIENTE DE PAGO" value={formatMoney(resumen.pendiente)} />
				<Info label="PAGOS REGISTRADOS" value={formatMoney(resumen.pagado)} />
			</div>
			<section className="dashboard-card invoices-card">
				<div className="tabs" aria-label="Filtrar facturas">
					{[
						{ id: "todas", label: "Todas" },
						{ id: "PENDIENTE", label: "Pendientes" },
						{ id: "PAGADA", label: "Pagadas" },
						{ id: "VENCIDA", label: "Vencidas" },
						{ id: "ANULADA", label: "Anuladas" },
					].map((tab) => (
						<button
							className={filtro === tab.id ? "selected" : ""}
							key={tab.id}
							type="button"
							onClick={() => setFiltro(tab.id)}
						>
							{tab.label}
						</button>
					))}
				</div>
				<div className="invoice-head"><span>REFERENCIA</span><span>PERÍODO / VENCIMIENTO</span><span>VALOR / SALDO</span><span>ESTADO</span><span>ACCIÓN</span></div>
				{visibles.length === 0 ? (
					<p className="invoice-empty">{facturas.length ? "No hay facturas en este filtro." : "No hay facturas registradas para tus contratos."}</p>
				) : visibles.map((factura) => {
					const estado = estadoFactura(factura);
					return (
						<div className="invoice-row" key={factura.id_factura}>
							<strong>{factura.numero}</strong>
							<span>{formatDate(factura.periodo_inicio)} – {formatDate(factura.periodo_fin)}<small>Vence {formatDate(factura.fecha_vencimiento)}</small></span>
							<strong>{formatMoney(factura.total)}<small>Saldo: {formatMoney(factura.saldo)}</small></strong>
							<span className={`invoice-status ${estado.className}`}>{estado.label}</span>
							<span>{facturaPendiente(factura) && <button className="pay-button" type="button" onClick={() => { setFacturaSeleccionada(factura.id_factura); setCurrentView("pago"); }}>Pagar</button>}</span>
						</div>
					);
				})}
			</section>
		</>
	);
}

function PaymentView({ factura, onPay }) {
	const [metodo, setMetodo] = useState("TARJETA");
	const [mensaje, setMensaje] = useState("");
	const [error, setError] = useState("");
	const [pagando, setPagando] = useState(false);

	const simularPago = async (event) => {
		event.preventDefault();
		setError("");
		setMensaje("");
		setPagando(true);
		try {
			const result = await onPay({ id_factura: factura.id_factura, medio: metodo });
			setMensaje(`¡Pago simulado registrado! La factura ${result.factura.numero} quedó pagada.`);
			window.alert(`¡Pago simulado realizado! La factura ${result.factura.numero} quedó pagada y el cambio se guardó en el sistema. No se hizo ningún cobro real.`);
		} catch (paymentError) {
			setError(paymentError.message);
		} finally {
			setPagando(false);
		}
	};

	return (
		<>
			<ClientHeader title="Pagar Factura" subtitle="Consulta el saldo pendiente asociado a tu factura" />
			<section className="payment-layout">
				{!factura ? (
					<div className="dashboard-card"><h3>No tienes facturas pendientes</h3><p>No hay un saldo pendiente disponible para pago.</p></div>
				) : (
					<>
						<div className="payment-due">
							<div><small>Factura #{factura.numero}</small><strong>Período {formatDate(factura.periodo_inicio)} – {formatDate(factura.periodo_fin)}</strong><span>Vence {formatDate(factura.fecha_vencimiento)}</span></div>
							<b>{formatMoney(factura.saldo)}<small>Saldo pendiente · COP</small></b>
						</div>
						<form className="dashboard-card payment-card" onSubmit={simularPago}>
							<h3>Pago de demostración</h3>
							<div className="payment-summary">
								<Info label="Valor total" value={formatMoney(factura.total)} />
								<Info label="Pagos registrados" value={formatMoney(factura.total_pagado)} />
								<Info label="Saldo pendiente" value={formatMoney(factura.saldo)} />
							</div>
							<label className="simulation-label" htmlFor="payment-method">Método de pago
								<select id="payment-method" value={metodo} onChange={(event) => setMetodo(event.target.value)}>
									<option value="TARJETA">Tarjeta</option>
									<option value="PSE">PSE</option>
									<option value="TRANSFERENCIA">Transferencia</option>
								</select>
							</label>
							<p className="helper-text">Pago de demostración: no se solicitan datos bancarios. El pago se registra como simulado y actualiza el estado de la factura.</p>
							{error && <p className="form-feedback error" role="alert">{error}</p>}
							{mensaje && <p className="simulation-feedback" role="status">{mensaje}</p>}
							<button className="submit-button" type="submit" disabled={pagando || !facturaPendiente(factura)}>
								{pagando ? "Registrando pago..." : facturaPendiente(factura) ? `Pagar ${formatMoney(factura.saldo)}` : "Factura pagada"}
							</button>
						</form>
					</>
				)}
			</section>
		</>
	);
}

function SupportView({ perfil, tickets, onReport }) {
	const [asunto, setAsunto] = useState("");
	const [descripcion, setDescripcion] = useState("");
	const [prioridad, setPrioridad] = useState("MEDIA");
	const [enviando, setEnviando] = useState(false);
	const [error, setError] = useState("");
	const [mensaje, setMensaje] = useState("");

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError("");
		setMensaje("");
		setEnviando(true);
		try {
			const result = await onReport({ asunto, descripcion, prioridad });
			setAsunto("");
			setDescripcion("");
			setPrioridad("MEDIA");
			setMensaje(`Reporte ${result.ticket.id_ticket} guardado correctamente.`);
		} catch (reportError) {
			setError(reportError.message);
		} finally {
			setEnviando(false);
		}
	};

	return (
		<>
			<ClientHeader title="Soporte / Fallas" subtitle="Envía reportes y consulta tus tickets" />
			<div className="support-grid">
				<form className="dashboard-card support-form" onSubmit={handleSubmit}>
					<h2>Reportar nueva falla</h2>
					<p>El reporte quedará asociado a tu cuenta y se guardará en el sistema.</p>
					<label>TIPO DE FALLA *
						<select value={asunto} onChange={(event) => setAsunto(event.target.value)} required>
							<option value="" disabled>Selecciona el tipo de falla...</option>
							<option value="Intermitencia de conexión">Intermitencia de conexión</option>
							<option value="Velocidad reducida">Velocidad reducida</option>
							<option value="Sin servicio">Sin servicio</option>
							<option value="Otro">Otro</option>
						</select>
					</label>
					<label>PRIORIDAD
						<select value={prioridad} onChange={(event) => setPrioridad(event.target.value)}>
							<option value="BAJA">Baja</option>
							<option value="MEDIA">Media</option>
							<option value="ALTA">Alta</option>
							<option value="URGENTE">Urgente</option>
						</select>
					</label>
					<label>DESCRIPCIÓN DEL PROBLEMA *
						<textarea value={descripcion} onChange={(event) => setDescripcion(event.target.value)} maxLength={5000} required placeholder="Describe detalladamente el problema..." />
					</label>
					<label>TELÉFONO DE CONTACTO<input value={perfil.telefono || "No registrado"} readOnly /></label>
					{error && <p className="form-feedback error" role="alert">{error}</p>}
					{mensaje && <p className="form-feedback" role="status">{mensaje}</p>}
					<button className="submit-button" type="submit" disabled={enviando}>{enviando ? "Enviando reporte..." : "Crear ticket de soporte"}</button>
				</form>
				<section className="dashboard-card tickets">
					<h2>Mis tickets</h2>
					{tickets.length === 0 ? <p>Aún no has enviado reportes.</p> : tickets.map((ticket) => (
						<article key={ticket.id_ticket}>
							<small>Ticket #{ticket.id_ticket} · {ticket.prioridad}</small>
							<strong>{ticket.asunto}</strong>
							<p>{ticket.descripcion}</p>
							<span>{ticket.estado.replace("_", " ")}</span>
							<time>{formatDate(ticket.fecha_creacion)}</time>
						</article>
					))}
				</section>
			</div>
		</>
	);
}

function CertificateView({ perfil, contrato, resumen }) {
	return (
		<>
			<ClientHeader title="Paz y Salvo" subtitle="Estado de tus obligaciones según facturas registradas" />
			{!contrato ? <NoContractNotice /> : (
				<section className="certificate dashboard-card">
					<div className="certificate-title"><h2>ESTADO DE CUENTA</h2><p>Global Conexit</p></div>
					<div className="certificate-data">
						<Info label="Nombre completo" value={perfil.nombres} />
						<Info label="Documento de identidad" value={`${perfil.tipo_documento} ${perfil.numero_documento}`} />
						<Info label="Contrato" value={`#${contrato.id_contrato}`} />
						<Info label="Servicio" value={contrato.plan_nombre} />
						<Info label="Dirección del servicio" value={[contrato.direccion, contrato.ciudad, contrato.departamento].filter(Boolean).join(", ")} />
						<Info label="Saldo pendiente" value={formatMoney(resumen.pendiente)} />
					</div>
					{resumen.paz_y_salvo ? (
						<>
							<p>Según las facturas registradas, no tienes saldos pendientes a la fecha de consulta ({formatDate(new Date().toISOString().slice(0, 10))}).</p>
							<div className="certificate-actions">
								<button
									className="submit-button"
									type="button"
									onClick={() => window.alert("¡Paz y salvo generado! Esta es una simulación y no crea ni descarga un certificado oficial.")}
								>
									Generar paz y salvo (simulación)
								</button>
							</div>
						</>
					) : (
						<p className="form-feedback error">No es posible emitir un paz y salvo: tienes facturas pendientes por {formatMoney(resumen.pendiente)}.</p>
					)}
					<small className="helper-text">Esta información refleja los registros actuales de facturación y no es un certificado descargable.</small>
				</section>
			)}
		</>
	);
}

function ClientPortal() {
	const location = useLocation();
	const navigate = useNavigate();
	const [currentView, setCurrentView] = useState("plan");
	const [perfil, setPerfil] = useState(null);
	const [portal, setPortal] = useState(null);
	const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [welcomeMessage, setWelcomeMessage] = useState(
		() => location.state?.welcome ? "¡Bienvenido de nuevo a Global Conexit!" : ""
	);
	const facturaPendienteSeleccionada = useMemo(
		() => portal?.facturas.find((factura) => String(factura.id_factura) === String(facturaSeleccionada))
			|| portal?.facturas.find(facturaPendiente)
			|| null,
		[portal, facturaSeleccionada]
	);

	useEffect(() => {
		Promise.all([obtenerPerfilCliente(), obtenerPortalCliente()])
			.then(([perfilCliente, datosPortal]) => {
				setPerfil(perfilCliente);
				setPortal(datosPortal);
			})
			.catch((profileError) => setError(profileError.message))
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		if (location.state?.welcome) {
			navigate(location.pathname, { replace: true, state: null });
		}
	}, [location.pathname, location.state, navigate]);

	const handleReport = async (report) => {
		const result = await reportarFallaCliente(report);
		setPortal((current) => ({ ...current, tickets: [result.ticket, ...current.tickets] }));
		return result;
	};

	const handlePayment = async (payment) => {
		const result = await pagarFacturaSimulada(payment);
		setPortal((current) => {
			const facturas = current.facturas.map((factura) => (
				String(factura.id_factura) === String(result.factura.id_factura)
					? { ...factura, ...result.factura, total_pagado: Number(factura.total_pagado) + Number(result.pago.valor) }
					: factura
			));
			const resumen = facturas.reduce((totals, factura) => {
				if (factura.estado !== "ANULADA") {
					totals.pendiente += Number(factura.saldo);
					totals.pagado += Number(factura.total_pagado);
				}
				return totals;
			}, { pendiente: 0, pagado: 0 });
			return {
				...current,
				facturas,
				resumen: {
					...resumen,
					paz_y_salvo: current.contrato !== null && resumen.pendiente <= 0,
				},
			};
		});
		return result;
	};

	if (loading) {
		return <main className="client-main"><p role="status">Cargando información de tu cuenta...</p></main>;
	}

	if (error) {
		return <main className="client-main"><section className="dashboard-card"><h1>No se pudo abrir el portal</h1><p role="alert">{error}</p><button className="submit-button" onClick={() => window.location.assign("/")}>Volver al inicio</button></section></main>;
	}

	const contenido = {
		plan: <PlanView contrato={portal.contrato} />,
		cuenta: <ProfileView perfil={perfil} />,
		facturas: <InvoicesView facturas={portal.facturas} resumen={portal.resumen} setFacturaSeleccionada={setFacturaSeleccionada} setCurrentView={setCurrentView} />,
		pago: <PaymentView factura={facturaPendienteSeleccionada} onPay={handlePayment} />,
		paz: <CertificateView perfil={perfil} contrato={portal.contrato} resumen={portal.resumen} />,
		soporte: <SupportView perfil={perfil} tickets={portal.tickets} onReport={handleReport} />,
	};

	return (
		<div className="client-portal">
			<ToastMessage message={welcomeMessage} onClose={() => setWelcomeMessage("")} />
			<ClientSidebar currentView={currentView} setCurrentView={setCurrentView} perfil={perfil} facturas={portal.facturas} />
			<main className="client-main">{contenido[currentView]}</main>
		</div>
	);
}

export default ClientPortal;
