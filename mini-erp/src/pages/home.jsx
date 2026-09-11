import { useState } from "react";
import logo from "../assets/logo.png";

const plans = [
	{
		name: "Plan Básico",
		down: "100 Mbps",
		up: "50 Mbps",
		price: "$29.990",
		features: ["Router WiFi 6 incluido", "Soporte técnico 24/7", "Sin permanencia mínima", "Instalación gratis", "1 IP estática"],
	},
	{
		name: "Plan Familiar",
		down: "300 Mbps",
		up: "150 Mbps",
		price: "$49.990",
		featured: true,
		features: ["Router WiFi 6 Mesh incluido", "Soporte técnico 24/7", "Sin permanencia mínima", "Instalación gratis", "1 IP estática"],
	},
	{
		name: "Plan Gamer Pro",
		down: "700 Mbps",
		up: "350 Mbps",
		price: "$79.990",
		features: ["Router WiFi 6E Pro incluido", "Soporte prioritario 24/7", "Sin permanencia mínima", "Instalación gratis", "2 IP estáticas"],
	},
];

const portalItems = [
	["▣", "Ver y descargar facturas", "Accede a tu historial completo y descarga tus facturas en PDF al instante."],
	["▤", "Pago en línea seguro", "Paga con tarjeta, PSE o efectivo desde cualquier dispositivo, 24/7."],
	["⚒", "Reportar fallas técnicas", "Crea tickets, sigue el estado en tiempo real y chatea con un técnico."],
	["▥", "Estado del servicio", "Monitorea tu conexión, consumo y uptime en tiempo real desde el portal."],
];

function Home() {
	const [address, setAddress] = useState("");
	const [message, setMessage] = useState("");

	function checkCoverage(event) {
		event.preventDefault();
		setMessage(address.trim() ? "Estamos validando la cobertura en tu zona." : "Ingresa una dirección para validar cobertura.");
	}

	return (
		<div className="landing-page">
			<style>{`
				.landing-page { --ink:#181817; --orange:#ef7410; --gold:#ffb91f; --cream:#f5efdf; --paper:#fffdfa; --muted:#766e67; min-height:100vh; color:var(--ink); background:var(--cream); font-family:Arial, Helvetica, sans-serif; }
				.landing-page * { box-sizing:border-box; }
				.landing-nav { height:66px; display:flex; align-items:center; justify-content:space-between; gap:28px; padding:0 max(28px, calc((100% - 1165px) / 2)); background:#fffefa; position:sticky; top:0; z-index:5; border-bottom:1px solid #eee8db; }
				.landing-logo { width:88px; height:32px; object-fit:contain; filter:brightness(0); }
				.landing-links { display:flex; gap:30px; margin-left:auto; margin-right:auto; }
				.landing-links a { color:#595550; text-decoration:none; font-size:14px; }
				.portal-button, .primary-button { border:0; border-radius:24px; background:var(--ink); color:white; font-weight:700; cursor:pointer; padding:12px 24px; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; }
				.hero { min-height:620px; position:relative; overflow:hidden; background:radial-gradient(circle at 17% 75%, #fff8df 0, transparent 28%), radial-gradient(circle at 83% 30%, #e5e9e5 0, transparent 37%), #fffefa; }
				.hero:after { content:""; position:absolute; right:-4%; top:0; width:54%; height:100%; opacity:.45; background:linear-gradient(125deg, transparent 10%, #d5d9d4 40%, #eef1ed 63%, transparent 64%), radial-gradient(ellipse at 72% 60%, #d5dcd9 0 10%, transparent 11%); filter:blur(3px); }
				.hero-inner { max-width:1165px; min-height:620px; margin:auto; padding:72px 0 55px; position:relative; z-index:1; }
				.hero-copy { max-width:650px; }
				.hero h1, .section-title { font-size:clamp(48px, 6vw, 78px); line-height:.96; letter-spacing:-3px; margin:0 0 25px; font-weight:900; }
				.accent { color:var(--orange); }
				.hero p { color:#6d6660; font-size:19px; line-height:1.65; max-width:640px; margin:0 0 34px; }
				.coverage-form { width:min(635px, 100%); display:flex; padding:6px; background:white; border:1px solid #ddd8cf; border-radius:16px; box-shadow:0 5px 10px #00000012; }
				.coverage-form input { min-width:0; flex:1; border:0; outline:0; padding:0 15px; color:#777; font-size:14px; }
				.coverage-form button { border:0; border-radius:12px; background:var(--orange); color:white; font-weight:700; padding:14px 24px; cursor:pointer; }
				.coverage-message { color:var(--orange); font-size:13px; min-height:18px; margin:8px 0 0 12px; }
				.hero-stats { display:flex; gap:48px; margin-top:28px; }
				.hero-stats strong { display:block; font-size:28px; }
				.hero-stats span { color:#9a8f84; font-size:13px; }
				.section { padding:72px 20px; background-image:radial-gradient(#ded5c4 1px, transparent 1px); background-size:22px 22px; }
				.section-heading { text-align:center; max-width:720px; margin:0 auto 48px; }
				.eyebrow { display:inline-block; color:var(--orange); background:#fff0dd; border:1px solid #f6cf9d; border-radius:22px; padding:8px 16px; font-size:13px; font-weight:700; }
				.section-title { font-size:44px; letter-spacing:-1px; margin:20px 0 12px; }
				.section-subtitle { color:#706960; font-size:17px; margin:0; }
				.plans { max-width:1165px; margin:auto; display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; align-items:stretch; }
				.plan { position:relative; background:#fff; border-radius:22px; padding:30px 27px 27px; min-height:480px; box-shadow:0 12px 20px #21160a0d; display:flex; flex-direction:column; }
				.plan.featured { background:var(--ink); color:white; transform:translateY(-12px); }
				.popular { position:absolute; top:-13px; left:50%; transform:translateX(-50%); background:linear-gradient(90deg, var(--gold), var(--orange)); color:white; border-radius:20px; padding:5px 20px; font-size:11px; font-weight:800; white-space:nowrap; }
				.plan h3 { font-size:18px; margin:0 0 12px; }
				.speed { display:flex; gap:8px; font-size:12px; margin-bottom:18px; }
				.speed span { padding:6px 10px; border-radius:15px; background:#fff1e5; color:var(--orange); }
				.featured .speed span { background:#493d14; color:var(--gold); }
				.price { color:var(--orange); font-size:46px; font-weight:900; letter-spacing:-2px; margin:0 0 22px; }
				.featured .price { color:var(--gold); }
				.plan ul { border-top:1px solid #eee6dc; padding:18px 0 0; margin:0 0 22px; list-style:none; flex:1; }
				.plan li { font-size:14px; margin:12px 0; color:#4e4945; }
				.featured li { color:#e7e1d8; border-color:#3c3c39; }
				.plan li:before { content:"✓"; display:inline-grid; place-items:center; width:18px; height:18px; margin-right:9px; border-radius:50%; background:#fff0e4; color:var(--orange); font-size:11px; }
				.featured li:before { background:#574914; color:var(--gold); }
				.plan .primary-button { width:100%; border-radius:11px; }
				.featured .primary-button { background:linear-gradient(90deg, var(--gold), var(--orange)); color:var(--ink); }
				.diagnostic { background:#fff; }
				.diagnostic-grid { max-width:975px; margin:auto; display:grid; grid-template-columns:1fr 1.25fr; gap:80px; align-items:center; }
				.meter { background:#fcfaf4; border:1px solid #e5ded0; border-radius:22px; padding:34px 30px 28px; text-align:center; box-shadow:0 12px 20px #21160a12; }
				.meter-label { color:#a5998b; font-weight:700; font-size:12px; letter-spacing:.06em; }
				.gauge { width:220px; height:112px; margin:25px auto 15px; border:10px solid #e1d8c9; border-bottom:0; border-radius:220px 220px 0 0; position:relative; }
				.gauge:after { content:""; width:8px; height:105px; position:absolute; background:var(--ink); left:50%; bottom:-4px; transform-origin:bottom; transform:rotate(42deg); border-radius:5px; }
				.gauge-value { position:absolute; left:0; right:0; bottom:-9px; font-size:25px; font-weight:800; }
				.meter-stats { display:flex; justify-content:space-around; color:#a2988d; font-size:12px; }
				.meter-stats strong { display:block; color:var(--orange); font-size:15px; margin-top:7px; }
				.diagnostic-copy .section-title { text-align:left; }
				.benefit { display:flex; gap:14px; padding:16px 18px; margin-top:14px; background:#fcfaf5; border:1px solid #e7dfd2; border-radius:13px; }
				.benefit-icon { font-size:22px; }
				.benefit strong, .benefit span { display:block; }
				.benefit span { color:#766e67; font-size:14px; margin-top:4px; }
				.portal-section { padding-bottom:65px; }
				.portal-cards { max-width:1165px; margin:auto; display:grid; grid-template-columns:repeat(4, 1fr); gap:20px; }
				.portal-card { background:white; padding:23px; border-radius:20px; min-height:225px; box-shadow:0 9px 17px #21160a0b; }
				.portal-icon { display:grid; place-items:center; width:52px; height:52px; margin-bottom:18px; background:#fff3e8; border-radius:15px; color:var(--orange); font-size:25px; }
				.portal-card h3 { font-size:14px; margin:0 0 8px; }
				.portal-card p { color:#746c65; font-size:14px; line-height:1.55; margin:0 0 14px; }
				.portal-card a { color:var(--orange); font-size:13px; font-weight:700; text-decoration:none; }
				.portal-banner { max-width:1165px; margin:46px auto 0; padding:42px; border-radius:23px; color:white; background:var(--ink); display:flex; align-items:center; justify-content:space-between; gap:25px; }
				.portal-banner h2 { margin:15px 0 8px; font-size:29px; }
				.portal-banner p { color:#b9ada1; margin:0 0 22px; }
				.portal-banner .eyebrow { background:#514315; border:0; color:var(--gold); }
				.banner-buttons { display:flex; gap:10px; }
				.secondary-button { background:#30302e; color:white; }
				.footer { background:var(--ink); color:#c5b7a9; padding:70px max(28px, calc((100% - 1165px) / 2)) 35px; border-top:3px solid var(--cream); }
				.footer-grid { display:grid; grid-template-columns:1.3fr 1fr 1fr 1.2fr; gap:55px; }
				.footer-logo { width:130px; filter:brightness(0) invert(1); margin-bottom:25px; }
				.footer h3 { color:white; font-size:16px; margin:8px 0 25px; }
				.footer p, .footer a { color:#aa9d92; line-height:1.6; font-size:15px; text-decoration:none; display:block; margin:0 0 13px; }
				.footer-bottom { border-top:1px solid #32312f; margin-top:55px; padding-top:24px; display:flex; justify-content:space-between; gap:20px; font-size:14px; }
				.whatsapp { position:fixed; z-index:8; right:24px; bottom:20px; width:54px; height:54px; display:grid; place-items:center; border-radius:50%; background:#20d267; color:white; font-size:28px; box-shadow:0 5px 20px #20d26766; text-decoration:none; }
				@media (max-width:800px) { .landing-nav { padding:0 18px; } .landing-links { display:none; } .hero-inner { padding:60px 22px; } .hero h1 { font-size:52px; } .hero:after { opacity:.18; width:100%; } .plans, .diagnostic-grid, .portal-cards, .footer-grid { grid-template-columns:1fr; } .plan.featured { transform:none; } .diagnostic-grid { gap:35px; } .diagnostic-copy .section-title { font-size:38px; } .portal-banner { margin:35px 0 0; padding:30px 24px; flex-direction:column; align-items:flex-start; } .footer-bottom { flex-direction:column; } }
			`}</style>

			<header className="landing-nav">
				<img className="landing-logo" src={logo} alt="Global Conexit" />
				<nav className="landing-links"><a href="#planes">Planes</a><a href="#cobertura">Cobertura</a><a href="#portal">Nosotros</a><a href="#soporte">Soporte</a></nav>
				<a className="portal-button" href="/login">♟&nbsp; Mi Portal / Ingresar</a>
			</header>

			<main>
				<section className="hero" id="cobertura"><div className="hero-inner"><div className="hero-copy">
					<h1>Navega a la<br /><span className="accent">velocidad</span><br />de la <span className="accent">luz</span></h1>
					<p>Fibra óptica con estabilidad garantizada del <strong>99,9%</strong>, latencia ultra-baja y velocidades simétricas que transforman tu experiencia digital: hogar, oficina o gaming.</p>
					<form className="coverage-form" onSubmit={checkCoverage}><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Ingresa tu dirección para validar cobertura..." /><button type="submit">Verificar Cobertura</button></form>
					<div className="coverage-message">{message}</div>
					<div className="hero-stats"><div><strong>+50.000</strong><span>Clientes activos</span></div><div><strong>99.9%</strong><span>Uptime garantizado</span></div><div><strong>24/7</strong><span>Soporte técnico</span></div></div>
				</div></div></section>

				<section className="section" id="planes"><div className="section-heading"><span className="eyebrow">Planes de Internet</span><h2 className="section-title">Elige tu velocidad</h2><p className="section-subtitle">Fibra óptica simétrica, sin costos ocultos y sin letra pequeña.</p></div>
					<div className="plans">{plans.map((plan) => <article className={`plan${plan.featured ? " featured" : ""}`} key={plan.name}>{plan.featured && <span className="popular">⚡ MÁS POPULAR</span>}<h3>{plan.name}</h3><div className="speed"><span>↓ {plan.down}</span><span>↑ {plan.up}</span></div><p className="price">{plan.price}<small>/mes</small></p><ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><a className="primary-button" href="#portal">Contratar ahora →</a></article>)}</div>
				</section>

				<section className="section diagnostic"><div className="diagnostic-grid"><div><div className="meter"><span className="meter-label">VELOCIDAD DE DESCARGA</span><div className="gauge"><span className="gauge-value">0<br /><small>MBPS</small></span></div><div className="meter-stats"><div>↓ Descarga<strong>0 Mbps</strong></div><div>↑ Subida<strong>—</strong></div><div>Latencia<strong>—</strong></div></div></div><button className="primary-button" style={{ display:"flex", margin:"24px auto 0" }}>⚡ Test de Velocidad</button></div><div className="diagnostic-copy"><span className="eyebrow">Diagnóstico en tiempo real</span><h2 className="section-title">¿Qué tan rápida<br /><span className="accent">es tu red</span> hoy?</h2><p className="section-subtitle">Con nuestra herramienta integrada mide tu velocidad de descarga, subida y latencia desde el portal, sin instalar nada.</p><div className="benefit"><span className="benefit-icon">🎮</span><div><strong>Gaming sin lag</strong><span>Latencia menor a 5 ms para una experiencia impecable.</span></div></div><div className="benefit"><span className="benefit-icon">📺</span><div><strong>Streaming en 4K</strong><span>Velocidad para múltiples streams en alta definición.</span></div></div><div className="benefit"><span className="benefit-icon">🏠</span><div><strong>Todos tus dispositivos</strong><span>Wi-Fi 6 para hasta 50 dispositivos sin perder rendimiento.</span></div></div></div></div></section>

				<section className="section portal-section" id="portal"><div className="section-heading"><span className="eyebrow">Portal de Clientes</span><h2 className="section-title">Gestiona tu servicio<br /><span className="accent">desde donde estés</span></h2><p className="section-subtitle">Control total de tu plan, facturas y soporte, en un solo lugar, disponible 24/7.</p></div><div className="portal-cards">{portalItems.map(([icon, title, text]) => <article className="portal-card" key={title}><div className="portal-icon">{icon}</div><h3>{title}</h3><p>{text}</p><a href="/login">Acceder&nbsp; ›</a></article>)}</div><div className="portal-banner"><div><span className="eyebrow">Tu portal, siempre disponible</span><h2>Un clic y tienes el control</h2><p>Ingresa con tu número de celular y contraseña para acceder a todas las funcionalidades de tu cuenta.</p><div className="banner-buttons"><a className="primary-button" href="/login">Ingresar al Portal →</a><a className="primary-button secondary-button" href="/login">Registrarme</a></div></div><div className="portal-preview">Plan Familiar 300 Mbps<br /><strong>296 Mbps</strong>&nbsp;&nbsp; <strong>143 Mbps</strong></div></div></section>
			</main>

			<footer className="footer" id="soporte"><div className="footer-grid"><div><img className="footer-logo" src={logo} alt="Global Conexit" /><p>Conectando vidas con fibra óptica de última generación. Velocidad, estabilidad y confianza en cada megabyte.</p></div><div><h3>Servicios</h3><a href="#planes">Planes de Internet</a><a href="#cobertura">Verificar Cobertura</a><a href="#soporte">Internet Empresarial</a><a href="#soporte">Soporte Técnico</a></div><div><h3>Empresa</h3><a href="#portal">Quiénes somos</a><a href="#portal">Nuestro equipo</a><a href="#portal">Trabaja con nosotros</a><a href="#portal">Noticias</a></div><div><h3>Contacto</h3><p>☎ +57 601 800 9000<br />Línea nacional gratuita</p><p>✉ soporte@globalconexit.com<br />Soporte técnico</p><p>⌖ Cra. 15 #93-75, Bogotá</p></div></div><div className="footer-bottom"><span>© 2026 Global Conexit S.A.S. NIT 900.123.456-7. Todos los derechos reservados.</span><span>Política de privacidad - Términos de uso - Cookies</span></div></footer>
			<a className="whatsapp" href="https://wa.me/576018000000" aria-label="Contactar por WhatsApp">◔</a>
		</div>
	);
}

export default Home;
