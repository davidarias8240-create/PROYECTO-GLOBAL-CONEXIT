import { useEffect, useRef, useState } from "react";
import SpeedTest from "@cloudflare/speedtest";
import logo from "../assets/logo.png";
import Formcliente from "../components/Formcliente";
import PlanCheckout from "../components/PlanCheckout";

const plans = [
	{
		name: "Plan Básico",
		down: "100 Mbps",
		up: "100 Mbps",
		price: "$55.900",
		features: ["Router WiFi 5-8 dispositivos conectados", "Soporte técnico 24/7", "Sin permanencia mínima", "Instalación gratis", "Fibra  Óptica"],
	},
	{
		name: "Plan Familiar",
		down: "200 Mbps",
		up: "200 Mbps",
		price: "$79.900",
		featured: true,
		features: ["Router WiFi 10-15 dispositivos conectados", "Soporte técnico 24/7", "Sin permanencia mínima", "Instalación gratis", "Fibra  Óptica"],
	},
	{
		name: "Plan Gamer - Empresarial",
		down: "500 Mbps",
		up: "500 Mbps",
		price: "$129.900",
		features: ["Router WiFi 20-30 dispositivos conectados", "Soporte prioritario 24/7", "Sin permanencia mínima", "Instalación gratis", "Fibra  Óptica"],
	},
];

const portalItems = [
	["▣", "Ver y descargar facturas", "Accede a tu historial y descarga tus facturas en PDF al instante."],
	["▤", "Pago en línea seguro", "Paga con tarjeta, PSE o efectivo desde cualquier dispositivo, 24/7."],
	["⚒", "Reportar fallas técnicas", "Crea tickets, sigue el estado en tiempo real y chatea con un técnico."],
	["▥", "Estado del servicio", "Monitorea tu conexión, consumo y Solicita cambio de tu plan."],
];

function Home() {
	const speedTestRef = useRef(null);
	const [showClientLogin, setShowClientLogin] = useState(false);
	const [selectedPlan, setSelectedPlan] = useState(null);
	const [speedTest, setSpeedTest] = useState({ status: "ready", progress: 0, download: 0, upload: 0, latency: 0, error: "" });

	useEffect(() => {
		const test = new SpeedTest({
			autoStart: false,
			measurements: [
				{ type: "latency", numPackets: 8 },
				{ type: "download", bytes: 1e5, count: 1, bypassMinDuration: true },
				{ type: "latency", numPackets: 8 },
				{ type: "download", bytes: 1e6, count: 4 },
				{ type: "upload", bytes: 1e6, count: 4 },
				{ type: "download", bytes: 1e7, count: 3 },
				{ type: "upload", bytes: 1e7, count: 3 },
			],
		});
		speedTestRef.current = test;

		const readResult = (results, getter) => {
			try {
				const value = results[getter]();
				return Number.isFinite(value) ? value : 0;
			} catch {
				return 0;
			}
		};
		const updateResults = (results) => setSpeedTest((current) => ({
			...current,
			download: Math.round(readResult(results, "getDownloadBandwidth") / 100000) / 10,
			upload: Math.round(readResult(results, "getUploadBandwidth") / 100000) / 10,
			latency: Math.round(readResult(results, "getUnloadedLatency")),
		}));

		test.onRunningChange = (running) => setSpeedTest((current) => ({ ...current, status: running ? "running" : current.status }));
		test.onResultsChange = ({ type }) => {
			const progressByType = { latency: 25, download: 65, upload: 90 };
			updateResults(test.results);
			setSpeedTest((current) => ({ ...current, progress: Math.max(current.progress, progressByType[type] || current.progress) }));
		};
		test.onFinish = (results) => {
			updateResults(results);
			setSpeedTest((current) => ({ ...current, status: "finished", progress: 100 }));
		};
		test.onError = (error) => setSpeedTest((current) => ({ ...current, status: "error", error: String(error) }));

		return () => {
			test.pause();
			speedTestRef.current = null;
		};
	}, []);

	const startSpeedTest = () => {
		const test = speedTestRef.current;
		if (!test || speedTest.status === "running") return;
		if (test.isFinished) test.restart();
		setSpeedTest({ status: "running", progress: 8, download: 0, upload: 0, latency: 0, error: "" });
		test.play();
	};

	const isTesting = speedTest.status === "running";
	const gaugeValue = speedTest.download || speedTest.upload || 0;
	const gaugeAngle = Math.min(90, Math.max(-90, -90 + (gaugeValue / 700) * 180));

	return (
		<div className="landing-page">
			{showClientLogin && <Formcliente onClose={() => setShowClientLogin(false)} />}
			{selectedPlan && <PlanCheckout plan={selectedPlan} onClose={() => setSelectedPlan(null)} />}
			<style>{`
				.landing-page { --ink:#181817; --orange:#ef7410; --gold:#ffb91f; --cream:#f5efdf; --paper:#fffdfa; --muted:#766e67; min-height:100vh; color:var(--ink); background:var(--cream); font-family:"Inter", Arial, sans-serif; }
				.landing-page * { box-sizing:border-box; }
				.landing-page h1, .landing-page h2, .landing-page h3, .landing-page h4, .landing-page h5 { font-family:"Exo 2", "Inter", sans-serif; }
				.landing-page .hero-stats strong, .landing-page .price, .landing-page .popular, .landing-page .gauge-value, .landing-page .meter-stats strong { font-family:"Exo 2", "Inter", sans-serif; font-variant-numeric:tabular-nums; }
				.landing-nav { height:74px; display:flex; align-items:center; gap:34px; padding:0 max(22px, calc((100% - 1165px) / 2)); background:#fffefa; position:sticky; top:0; z-index:5; border-bottom:1px solid #eee8db; }
				.landing-logo { width:172px; height:58px; object-fit:contain; filter:brightness(0); flex:0 0 auto; }
				.landing-links { display:flex; align-items:center; gap:30px; margin-left:18px; }
				.landing-links a { position:relative; padding:27px 0 24px; color:#595550; text-decoration:none; font-size:14px; font-weight:600; transition:color .28s ease; }
				.landing-links a::after { content:""; position:absolute; right:0; bottom:16px; left:0; height:3px; border-radius:3px; background:linear-gradient(90deg, var(--orange), var(--gold)); transform:scaleX(0); transform-origin:center; transition:transform .48s ease; }
				.landing-links a:hover, .landing-links a:focus-visible { color:#050505; }
				.landing-links a:hover::after, .landing-links a:focus-visible::after { transform:scaleX(1); }
				.portal-button, .primary-button { border:0; border-radius:24px; background:var(--ink); color:white; font-weight:700; cursor:pointer; padding:12px 24px; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; }
				.portal-button { margin-left:auto; font-family:"Inter", Arial, sans-serif; letter-spacing:.01em; white-space:nowrap; }
				.hero { min-height:620px; position:relative; overflow:hidden; background:radial-gradient(circle at 17% 75%, #fff8df 0, transparent 28%), radial-gradient(circle at 83% 30%, #e5e9e5 0, transparent 37%), #fffefa; }
				.hero-inner { max-width:1165px; min-height:620px; margin:auto; padding:58px 0 55px; position:relative; z-index:1; }
				.hero-layout { min-height:507px; display:grid; grid-template-columns:minmax(0, .92fr) minmax(390px, 1.08fr); align-items:center; gap:62px; }
				.hero-copy { max-width:650px; }
				.hero-visual { position:relative; min-height:430px; mask-image:linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%), linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%); mask-composite:intersect; -webkit-mask-image:linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%), linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%); -webkit-mask-composite:source-in; }
				.hero-visual img { display:block; width:100%; height:100%; min-height:430px; object-fit:cover; }
				.hero h1, .section-title { font-size:clamp(48px, 6vw, 78px); line-height:.96; letter-spacing:-3px; margin:0 0 25px; font-weight:900; }
				.accent { color:var(--orange); }
				.hero p { color:#6d6660; font-size:19px; line-height:1.65; max-width:640px; margin:0 0 34px; }
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
				.meter { background:#fcfaf4; border:1px solid #e5ded0; border-radius:22px; padding:28px 30px 24px; text-align:center; box-shadow:0 12px 20px #21160a12; }
				.meter-label { color:#a5998b; font-weight:700; font-size:12px; letter-spacing:.06em; }
				.gauge { width:250px; height:142px; margin:17px auto 7px; position:relative; }
				.gauge svg { display:block; width:100%; height:100%; overflow:visible; }
				.gauge-track, .gauge-progress { fill:none; stroke-width:15; stroke-linecap:round; }
				.gauge-track { stroke:#e1d8c9; }
				.gauge-progress { stroke:var(--orange); stroke-dasharray:var(--gauge-progress) 1; transition:stroke-dasharray .5s ease; }
				.gauge-needle { position:absolute; left:50%; bottom:13px; width:5px; height:83px; border-radius:5px; background:var(--ink); transform-origin:50% 100%; transition:transform .5s ease; }
				.gauge-center { position:absolute; left:50%; bottom:7px; width:14px; height:14px; border-radius:50%; background:var(--ink); transform:translateX(-50%); }
				.gauge-value { position:absolute; left:0; right:0; bottom:22px; font-size:25px; font-weight:800; }
				.gauge-value small { color:#a5998b; font-size:10px; letter-spacing:.08em; }
				.meter-stats { display:flex; justify-content:space-around; color:#a2988d; font-size:12px; }
				.meter-stats strong { display:block; color:var(--orange); font-size:15px; margin-top:7px; }
				.speed-status { min-height:18px; margin:8px 0 0; color:#8d8174; font-size:12px; }
				.speed-status.error { color:#c24d32; }
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
				.whatsapp { position:fixed; z-index:8; right:24px; bottom:20px; width:54px; height:54px; display:grid; place-items:center; border-radius:50%; background:linear-gradient(180deg, #25d366 0%, #1ebf5c 100%); color:white; box-shadow:0 8px 22px rgba(37, 211, 102, 0.45); text-decoration:none; transition:transform .2s ease, box-shadow .2s ease; }
				.whatsapp:hover { transform:translateY(-2px); box-shadow:0 10px 28px rgba(37, 211, 102, 0.55); }
				.whatsapp svg { display:block; width:32px; height:32px; }
				.admin-access { position:fixed; left:12px; bottom:12px; z-index:9; padding:9px 14px; border-radius:8px; color:white; background:var(--ink); font-size:12px; font-weight:700; text-decoration:none; opacity:0; pointer-events:auto; transition:opacity .2s ease, transform .2s ease; transform:translateY(4px); }
				.admin-access:hover, .admin-access:focus-visible { opacity:1; transform:translateY(0); outline:2px solid var(--gold); outline-offset:3px; }
				@media (max-width:800px) { .landing-nav { gap:12px; padding:0 18px; } .landing-logo { width:136px; height:52px; } .landing-links { display:none; } .portal-button { padding:11px 16px; font-size:13px; } .hero-inner { padding:48px 22px 55px; } .hero-layout { grid-template-columns:1fr; gap:34px; } .hero h1 { font-size:52px; } .hero-visual { min-height:300px; } .hero-visual img { min-height:300px; } .plans, .diagnostic-grid, .portal-cards, .footer-grid { grid-template-columns:1fr; } .plan.featured { transform:none; } .diagnostic-grid { gap:35px; } .diagnostic-copy .section-title { font-size:38px; } .portal-banner { margin:35px 0 0; padding:30px 24px; flex-direction:column; align-items:flex-start; } .footer-bottom { flex-direction:column; } }
			`}</style>

			<header className="landing-nav">
				<img className="landing-logo" src={logo} alt="Global Conexit" />
				<nav className="landing-links"><a href="#inicio">Inicio</a><a href="#planes">Planes</a><a href="#portal">Nosotros</a><a href="#soporte">Soporte</a></nav>
				<button className="portal-button" type="button" onClick={() => setShowClientLogin(true)}>♟&nbsp; Mi Portal / Ingresar</button>
			</header>

			<main>
				<section className="hero" id="inicio"><div className="hero-inner"><div className="hero-layout"><div className="hero-copy">
					<h1>Navega a la<br /><span className="accent">velocidad</span><br />de la <span className="accent">luz</span></h1>
					<p>Fibra óptica con estabilidad garantizada del <strong>99,9%</strong>, latencia ultra-baja y velocidades simétricas que transforman tu experiencia digital: hogar, oficina o gaming.</p>
					<div className="hero-stats"><div><strong>+350</strong><span>Clientes activos</span></div><div><strong>99.9%</strong><span>Navegación garantizada</span></div><div><strong>24/7</strong><span>Soporte técnico</span></div></div>
				</div><div className="hero-visual"><img src="/subfondo.jpeg" alt="Router de fibra óptica conectado a una red de alta velocidad" /></div></div></div></section>

				<section className="section" id="planes"><div className="section-heading"><span className="eyebrow">Planes de Internet</span><h2 className="section-title">Elige tu velocidad</h2><p className="section-subtitle">Fibra óptica simétrica, sin costos ocultos y sin letra pequeña.</p></div>
					<div className="plans">{plans.map((plan) => <article className={`plan${plan.featured ? " featured" : ""}`} key={plan.name}>{plan.featured && <span className="popular">⚡ MÁS POPULAR</span>}<h3>{plan.name}</h3><div className="speed"><span>↓ {plan.down}</span><span>↑ {plan.up}</span></div><p className="price">{plan.price}<small>/mes</small></p><ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><button className="primary-button" type="button" onClick={() => setSelectedPlan(plan)}>Contratar ahora →</button></article>)}</div>
				</section>

				<section className="section diagnostic"><div className="diagnostic-grid"><div><div className="meter"><span className="meter-label">VELOCIDAD DE DESCARGA</span><div className="gauge" style={{ "--gauge-progress": Math.min(gaugeValue / 700, 1) }}><svg viewBox="0 0 250 142" aria-hidden="true"><path className="gauge-track" pathLength="1" d="M 20 120 A 105 105 0 0 1 230 120" /><path className="gauge-progress" pathLength="1" d="M 20 120 A 105 105 0 0 1 230 120" /></svg><span className="gauge-needle" style={{ transform: `rotate(${gaugeAngle}deg)` }} /><span className="gauge-center" /><span className="gauge-value">{gaugeValue || 0}<br /><small>MBPS</small></span></div><div className="meter-stats"><div>↓ Descarga<strong>{speedTest.download || "—"} Mbps</strong></div><div>↑ Subida<strong>{speedTest.upload || "—"} Mbps</strong></div><div>Latencia<strong>{speedTest.latency || "—"} ms</strong></div></div><p className={`speed-status${speedTest.status === "error" ? " error" : ""}`}>{speedTest.error || (isTesting ? `Analizando tu conexión... ${speedTest.progress}%` : speedTest.status === "finished" ? "Medición completada con Cloudflare" : "Presiona el botón para comenzar")}</p></div><button className="primary-button" style={{ display:"flex", margin:"24px auto 0" }} onClick={startSpeedTest} disabled={isTesting}>{isTesting ? "Midiendo conexión..." : speedTest.status === "finished" ? "↻ Repetir test" : "⚡ Test de velocidad"}</button></div><div className="diagnostic-copy"><span className="eyebrow">Diagnóstico en tiempo real</span><h2 className="section-title">¿Qué tan rápida<br /><span className="accent">es tu red</span> hoy?</h2><p className="section-subtitle">Con nuestra herramienta integrada mide tu velocidad de descarga, subida y latencia desde el portal, sin instalar nada.</p><div className="benefit"><span className="benefit-icon">🎮</span><div><strong>Gaming sin lag</strong><span>Latencia menor a 5 ms para una experiencia impecable.</span></div></div><div className="benefit"><span className="benefit-icon">📺</span><div><strong>Streaming en 4K</strong><span>Velocidad para múltiples streams en alta definición.</span></div></div><div className="benefit"><span className="benefit-icon">🏠</span><div><strong>Todos tus dispositivos</strong><span>Wi-Fi 6 para hasta 50 dispositivos sin perder rendimiento.</span></div></div></div></div></section>

				<section className="section portal-section" id="portal"><div className="section-heading"><span className="eyebrow">Portal de Clientes</span><h2 className="section-title">Gestiona tu servicio<br /><span className="accent">desde donde estés</span></h2><p className="section-subtitle">Control total de tu plan, facturas y soporte, en un solo lugar, disponible 24/7.</p></div><div className="portal-cards">{portalItems.map(([icon, title, text]) => <article className="portal-card" key={title}><div className="portal-icon">{icon}</div><h3>{title}</h3><p>{text}</p><button type="button" onClick={() => setShowClientLogin(true)}>Acceder&nbsp; ›</button></article>)}</div></section>
			</main>

			<footer className="footer" id="soporte"><div className="footer-grid"><div><img className="footer-logo" src={logo} alt="Global Conexit" /><p>Conectando vidas con fibra óptica de última generación. Velocidad, estabilidad y confianza en cada megabyte.</p></div><div><h3>Servicios</h3><a href="#planes">Planes de Internet</a><a href="#soporte">Internet Empresarial</a><a href="#soporte">Soporte Técnico</a></div><div><h3>Empresa</h3><a href="#portal">Quiénes somos</a><a href="#portal">Nuestro equipo</a><a href="#portal">Trabaja con nosotros</a><a href="#portal">Noticias</a></div><div><h3>Contacto</h3><p>☎ +57 305-915-7061<br />Atención 8:00 a.m - 5:00 p.m</p><p>✉ soporte@globalconexit.com<br />Soporte técnico</p><p>⌖ Cra. 15 #93-75, Argelia Ant</p></div></div><div className="footer-bottom"><span>© 2026 Global Conexit S.A.S. NIT 900.123.456-7. Todos los derechos reservados.</span><span>Política de privacidad - Términos de uso - Cookies</span></div></footer>
			<a className="whatsapp" href="https://wa.me/576018000000" aria-label="Contactar por WhatsApp" target="_blank" rel="noreferrer">
				<svg viewBox="0 0 448 512" aria-hidden="true" focusable="false">
					<path fill="currentColor" d="M380.9 97.1C339 55.1 283.2 32 223.9 32 101.5 32 1.9 131.5 1.9 254c0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.4 0 222-99.6 222-222 0-59.3-23.1-115.1-65-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.4-28.2-98.3 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.1 184.7-186.6 184.7zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18s-8.8-2.8-12.5 2.8-14.3 18-17.6 21.7-6.5 4.2-12 1.4c-32.7-16.3-54.1-29.1-75.5-65.9-5.7-9.8 5.7-9.1 16.3-30.4 1.8-3.7.9-6.9-.5-9.7s-12.5-30.1-17.1-41.2c-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2s-9.7 1.4-14.8 6.9c-5.1 5.6-19.4 19-19.4 46.3s19.9 53.7 22.6 57.4c2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4s-5.1-3.7-10.6-6.5z"/>
				</svg>
			</a>
			<a className="admin-access" href="/admin" aria-label="Acceso administrativo">Acceso administrativo</a>
		</div>
	);
}

export default Home;
