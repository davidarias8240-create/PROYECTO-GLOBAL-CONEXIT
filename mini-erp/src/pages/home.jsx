import { useCallback, useEffect, useRef, useState } from "react";
import SpeedTest from "@cloudflare/speedtest";
import logo from "../assets/logo.png";
import Formcliente from "../components/Formcliente";
import PlanCheckout from "../components/PlanCheckout";
import ThemeToggle from "../components/ThemeToggle";
import useTheme from "../hooks/useTheme";
import { obtenerPlanesPublicos, obtenerTotalClientesActivos } from "../services/api";

function AnimatedStat({ value, prefix = "", suffix = "", decimals = 0 }) {
	const [count, setCount] = useState(() =>
		window.matchMedia("(prefers-reduced-motion: reduce)").matches ? value : 0
	);
	const [isAnimating, setIsAnimating] = useState(false);
	const statRef = useRef(null);

	useEffect(() => {
		const element = statRef.current;
		if (!element) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

		let frameId;
		const animate = () => {
			setIsAnimating(true);
			let startTime;
			const duration = 1800;
			const update = (timestamp) => {
				if (startTime === undefined) startTime = timestamp;
				const progress = Math.min((timestamp - startTime) / duration, 1);
				const easedProgress = 1 - (1 - progress) ** 4;
				setCount(value * easedProgress);

				if (progress < 1) {
					frameId = window.requestAnimationFrame(update);
				} else {
					setCount(value);
					setIsAnimating(false);
				}
			};

			frameId = window.requestAnimationFrame(update);
		};

		if (typeof IntersectionObserver === "undefined") {
			animate();
			return () => window.cancelAnimationFrame(frameId);
		}

		const observer = new IntersectionObserver(([entry]) => {
			if (!entry.isIntersecting) return;
			observer.disconnect();
			animate();
		}, { threshold: 0.5 });

		observer.observe(element);
		return () => {
			observer.disconnect();
			window.cancelAnimationFrame(frameId);
		};
	}, [value]);

	return (
		<strong ref={statRef} className={isAnimating ? "is-counting" : ""}>
			{prefix}{count.toFixed(decimals)}{suffix}
		</strong>
	);
}

const fixedPlanFeatures = [
	[
		"Router WiFi 5-8 dispositivos conectados",
		"Soporte técnico 24/7",
		"Sin permanencia mínima",
		"Instalación gratis",
		"Fibra Óptica",
	],
	[
		"Router WiFi 10-15 dispositivos conectados",
		"Soporte técnico 24/7",
		"Sin permanencia mínima",
		"Instalación gratis",
		"Fibra Óptica",
	],
	[
		"Router WiFi 20-30 dispositivos conectados",
		"Soporte prioritario 24/7",
		"Sin permanencia mínima",
		"Instalación gratis",
		"Fibra Óptica",
	],
];

const portalItems = [
	["▣", "Ver y descargar facturas", "Consulta y descarga tus facturas en PDF cuando lo necesites."],
	["▤", "Pago en línea seguro", "Paga fácil con tarjeta, PSE o efectivo, desde cualquier lugar."],
	["⚒", "Reportar fallas técnicas", "Reporta fallas y consulta tus tickets con soporte técnico."],
	["▥", "Estado del servicio", "Revisa tu conexión y consumo, o solicita un cambio de plan."],
];

function Home() {
	const landingPageRef = useRef(null);
	const speedTestRef = useRef(null);
	const speedTestSectionRef = useRef(null);
	const speedTestStartedRef = useRef(false);
	const [theme, toggleTheme] = useTheme();
	const [showClientLogin, setShowClientLogin] = useState(false);
	const [selectedPlan, setSelectedPlan] = useState(null);
	const [plansState, setPlansState] = useState({ status: "loading", items: [], error: "" });
	const [plansReload, setPlansReload] = useState(0);
	const [activeClientsState, setActiveClientsState] = useState({ status: "loading", value: null, error: "" });
	const [speedTest, setSpeedTest] = useState({ status: "ready", progress: 0, download: 0, upload: 0, latency: 0, error: "" });

	useEffect(() => {
		let isCurrent = true;

		obtenerTotalClientesActivos()
			.then((response) => {
				if (!Number.isInteger(response.clientes_activos) || response.clientes_activos < 0) {
					throw new Error("La respuesta del total de clientes no tiene el formato esperado.");
				}
				if (isCurrent) {
					setActiveClientsState({ status: "ready", value: response.clientes_activos, error: "" });
				}
			})
			.catch((error) => {
				if (isCurrent) {
					setActiveClientsState({
						status: "error",
						value: null,
						error: error.message || "No se pudo cargar el total de clientes activos.",
					});
				}
			});

		return () => {
			isCurrent = false;
		};
	}, []);

	useEffect(() => {
		let isCurrent = true;

		obtenerPlanesPublicos()
			.then((response) => {
				if (!Array.isArray(response.planes)) {
					throw new Error("La respuesta de planes no tiene el formato esperado.");
				}

				const items = response.planes.map((plan, index) => ({
					id: plan.id_plan,
					name: plan.nombre,
					down: plan.velocidad,
					up: plan.velocidad,
					price: `$${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(Number(plan.precio))}`,
					features: fixedPlanFeatures[index] || fixedPlanFeatures[fixedPlanFeatures.length - 1],
					featured: index === 1,
				}));

				if (isCurrent) {
					setPlansState({ status: items.length ? "ready" : "empty", items, error: "" });
				}
			})
			.catch((error) => {
				if (isCurrent) {
					setPlansState({
						status: "error",
						items: [],
						error: error.message || "No se pudieron cargar los planes.",
					});
				}
			});

		return () => {
			isCurrent = false;
		};
	}, [plansReload]);

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

	const startSpeedTest = useCallback((automatic = false) => {
		const test = speedTestRef.current;
		if (!test || speedTest.status === "running") return;
		if (automatic && speedTestStartedRef.current) return;
		speedTestStartedRef.current = true;
		if (test.isFinished) test.restart();
		setSpeedTest({ status: "running", progress: 8, download: 0, upload: 0, latency: 0, error: "" });
		test.play();
	}, [speedTest.status]);

	useEffect(() => {
		const section = speedTestSectionRef.current;
		if (!section || typeof IntersectionObserver === "undefined") return;

		const observer = new IntersectionObserver(([entry]) => {
			if (!entry.isIntersecting) return;
			observer.disconnect();
			if (!speedTestStartedRef.current) startSpeedTest(true);
		}, { threshold: 0.15 });

		observer.observe(section);
		return () => observer.disconnect();
	}, [startSpeedTest]);

	useEffect(() => {
		const root = landingPageRef.current;
		if (!root) return undefined;
		const elements = root.querySelectorAll(
			".hero-copy, .hero-visual, .section-heading, .plan, .meter, .diagnostic-copy, .benefit, .portal-card, .footer-grid > div"
		);
		elements.forEach((element) => {
			element.classList.add("scroll-reveal");
			const siblingIndex = Array.from(element.parentElement.children).indexOf(element);
			element.style.setProperty("--reveal-delay", `${Math.min(siblingIndex * 90, 360)}ms`);
		});

		if (typeof IntersectionObserver === "undefined") {
			elements.forEach((element) => element.classList.add("is-visible"));
			return undefined;
		}

		const observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				entry.target.classList.add("is-visible");
				observer.unobserve(entry.target);
			});
		}, { threshold: 0.12, rootMargin: "0px 0px -35px 0px" });

		elements.forEach((element) => observer.observe(element));
		return () => observer.disconnect();
	}, [plansState.items.length]);

	const isTesting = speedTest.status === "running";
	const gaugeValue = speedTest.download || speedTest.upload || 0;
	const gaugeAngle = Math.min(90, Math.max(-90, -90 + (gaugeValue / 700) * 180));

	return (
		<div className="landing-page" data-theme={theme} ref={landingPageRef}>
			{showClientLogin && <Formcliente onClose={() => setShowClientLogin(false)} />}
			{selectedPlan && <PlanCheckout plan={selectedPlan} onClose={() => setSelectedPlan(null)} />}
			<style>{`
				.landing-page { --ink:var(--gc-ink); --orange:#ef7410; --gold:#ffb91f; --cream:var(--gc-page-bg); --paper:var(--gc-paper); --muted:var(--gc-muted); min-height:100vh; color:var(--gc-text); background:var(--gc-page-bg); font-family:"Inter", Arial, sans-serif; overflow-x:clip; transition:background-color .35s ease, color .35s ease; }
				.landing-page * { box-sizing:border-box; }
				.landing-page h1, .landing-page h2, .landing-page h3, .landing-page h4, .landing-page h5 { font-family:"Exo 2", "Inter", sans-serif; }
				.landing-page .hero-stats strong, .landing-page .price, .landing-page .popular, .landing-page .gauge-value, .landing-page .meter-stats strong { font-family:"Exo 2", "Inter", sans-serif; font-variant-numeric:tabular-nums; }
				.scroll-reveal { opacity:0; translate:0 28px; filter:blur(5px); transition:opacity .75s ease var(--reveal-delay, 0ms), translate .75s cubic-bezier(.2,.7,.2,1) var(--reveal-delay, 0ms), filter .75s ease var(--reveal-delay, 0ms); }
				.scroll-reveal.is-visible { opacity:1; translate:0 0; filter:blur(0); }
				.landing-page .hero-stats strong { transition:filter .45s ease; }
				.landing-page .hero-stats strong.is-counting { filter:blur(1.5px); }
				.landing-nav { height:88px; display:flex; align-items:center; gap:40px; padding:0 max(22px, calc((100% - 1165px) / 2)); background:rgba(255,254,250,.94); backdrop-filter:blur(16px); position:sticky; top:0; z-index:5; border-bottom:1px solid #eee8db; box-shadow:0 8px 26px #21160a08; }
				.landing-logo { width:205px; height:70px; object-fit:contain; filter:brightness(0); flex:0 0 auto; }
				.landing-logo { transition:transform .35s ease, filter .35s ease; }
				.landing-logo:hover { transform:scale(1.045); filter:brightness(0) drop-shadow(0 5px 5px #ef741044); }
				.landing-links { display:flex; align-items:center; gap:36px; margin-left:18px; }
				.landing-links a { position:relative; padding:34px 0 30px; color:#595550; text-decoration:none; font-size:17px; font-weight:600; transition:color .28s ease; }
				.landing-links a::after { content:""; position:absolute; right:0; bottom:18px; left:0; height:3px; border-radius:3px; background:linear-gradient(90deg, var(--orange), var(--gold)); transform:scaleX(0); transform-origin:center; transition:transform .48s ease; }
				.landing-links a:hover, .landing-links a:focus-visible { color:#050505; }
				.landing-links a:hover::after, .landing-links a:focus-visible::after { transform:scaleX(1); }
				.portal-button, .primary-button { position:relative; isolation:isolate; overflow:hidden; border:0; border-radius:24px; background:var(--ink); color:white; font-weight:700; cursor:pointer; padding:12px 24px; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; transition:transform .25s ease, box-shadow .25s ease, background .25s ease; }
				.portal-button::after, .primary-button::after { content:""; position:absolute; z-index:-1; top:-80%; bottom:-80%; left:-45%; width:30%; background:linear-gradient(90deg, transparent, #ffffff50, transparent); transform:translateX(-220%) rotate(18deg); transition:transform .7s ease; }
				.portal-button:hover, .portal-button:focus-visible, .primary-button:hover, .primary-button:focus-visible { transform:translateY(-3px); box-shadow:0 12px 26px #ef741044; }
				.portal-button:hover::after, .portal-button:focus-visible::after, .primary-button:hover::after, .primary-button:focus-visible::after { transform:translateX(680%) rotate(18deg); }
				.portal-button { margin-left:auto; font-family:"Inter", Arial, sans-serif; letter-spacing:.01em; white-space:nowrap; }
				.hero { min-height:620px; position:relative; isolation:isolate; overflow:hidden; background:radial-gradient(ellipse at 17% 75%, #fff8df 0, transparent 28%), radial-gradient(ellipse at 83% 30%, #e5e9e5 0, transparent 37%), #fffefa; }
				.hero::before { content:""; position:absolute; inset:0; z-index:-1; pointer-events:none; opacity:.52; background-image:linear-gradient(#ef741014 1px, transparent 1px),linear-gradient(90deg,#ef741014 1px,transparent 1px),radial-gradient(circle at 72% 48%,#ffb91f29 0,transparent 22%); background-size:48px 48px,48px 48px,auto; mask-image:linear-gradient(90deg,transparent,#000 48%,#000); }
				.hero::after { content:""; position:absolute; z-index:0; top:0; left:-35%; width:28%; height:100%; pointer-events:none; background:linear-gradient(90deg,transparent,#ffb91f12,transparent); transform:skewX(-18deg); animation:hero-signal-sweep 9s ease-in-out infinite; }
				@keyframes hero-signal-sweep { 0%,35% { left:-35%; opacity:0; } 45% { opacity:1; } 75%,100% { left:120%; opacity:0; } }
				.hero-inner { max-width:1165px; min-height:620px; margin:auto; padding:58px 0 55px; position:relative; z-index:1; }
				.hero-layout { min-height:507px; display:grid; grid-template-columns:minmax(0, .92fr) minmax(390px, 1.08fr); align-items:center; gap:62px; }
				.hero-copy { max-width:650px; }
				.hero-visual { position:relative; min-height:430px; mask-image:linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%), linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%); mask-composite:intersect; -webkit-mask-image:linear-gradient(90deg, transparent 0%, #000 12%, #000 88%, transparent 100%), linear-gradient(180deg, transparent 0%, #000 10%, #000 90%, transparent 100%); -webkit-mask-composite:source-in; }
				.hero-visual img { display:block; width:100%; height:100%; min-height:430px; object-fit:cover; transition:transform .8s cubic-bezier(.2,.7,.2,1), filter .8s ease; animation:visual-float 7s ease-in-out infinite; }
				.hero-visual:hover img { transform:scale(1.045); filter:saturate(1.12) contrast(1.04); }
				@keyframes visual-float { 0%,100% { translate:0 0; } 50% { translate:0 -9px; } }
				.hero h1, .section-title { font-size:clamp(48px, 6vw, 78px); line-height:.96; letter-spacing:-3px; margin:0 0 25px; font-weight:900; }
				.accent { color:var(--orange); }
				.hero p { color:#6d6660; font-size:19px; line-height:1.65; max-width:640px; margin:0 0 34px; }
				.hero-stats { display:flex; gap:48px; margin-top:28px; }
				.hero-stats strong { display:block; font-size:28px; }
				.hero-stats span { color:#9a8f84; font-size:13px; }
				.hero-stat-error { display:block; margin-top:3px; color:#b43c27; font-size:11px; }
				.section { position:relative; isolation:isolate; padding:72px 20px; background-color:var(--cream); background-image:linear-gradient(#ef741008 1px,transparent 1px),linear-gradient(90deg,#ef741008 1px,transparent 1px),radial-gradient(#ded5c4 1px, transparent 1px); background-size:44px 44px,44px 44px,22px 22px; }
				.section::after { content:""; position:absolute; z-index:-1; top:12%; right:-95px; width:230px; aspect-ratio:1; border:1px solid #ef741019; border-radius:50%; box-shadow:0 0 0 22px #ef741008,0 0 0 46px #ef741006; pointer-events:none; }
				.section-heading { text-align:center; max-width:720px; margin:0 auto 48px; }
				.eyebrow { display:inline-block; color:var(--orange); background:#fff0dd; border:1px solid #f6cf9d; border-radius:22px; padding:8px 16px; font-size:13px; font-weight:700; }
				.section-title { font-size:44px; letter-spacing:-1px; margin:20px 0 12px; }
				.section-subtitle { color:#706960; font-size:17px; margin:0; }
				.plans { max-width:1165px; margin:auto; padding-top:28px; display:grid; grid-template-columns:repeat(3, 1fr); gap:14px; align-items:stretch; }
				.plan { position:relative; background:#fff; border:1px solid transparent; border-radius:22px; padding:30px 27px 27px; min-height:480px; box-shadow:0 12px 20px #21160a0d; display:flex; flex-direction:column; transition:transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .35s ease, border-color .35s ease; }
				.plan::before { content:""; position:absolute; inset:0; border-radius:inherit; clip-path:inset(0 round 22px); pointer-events:none; opacity:0; background:radial-gradient(circle at 100% 0,#ffb91f22,transparent 34%); transition:opacity .35s ease; }
				.plan:hover::before, .plan:focus-within::before { opacity:1; }
				.plan.featured { background:var(--ink); color:white; transform:translateY(-12px); }
				.plan:not(.featured):hover, .plan:not(.featured):focus-within { transform:translateY(-8px); border-color:#f6cf9d; box-shadow:0 22px 38px #21160a1c; }
				.plan.featured:hover, .plan.featured:focus-within { transform:translateY(-16px); box-shadow:0 24px 42px #21160a35; }
				.plan .primary-button { transition:filter .2s ease, transform .2s ease; }
				.plan:hover .primary-button, .plan:focus-within .primary-button { filter:brightness(1.08); transform:translateY(-2px); }
				@media (prefers-reduced-motion: reduce) { .plan, .plan .primary-button { transition:none; } .plan:not(.featured):hover, .plan:not(.featured):focus-within, .plan.featured:hover, .plan.featured:focus-within, .plan:hover .primary-button, .plan:focus-within .primary-button { transform:none; } }
				.popular { position:absolute; top:-13px; left:50%; transform:translateX(-50%); background:linear-gradient(90deg, var(--gold), var(--orange)); color:white; border-radius:20px; padding:5px 20px; font-size:11px; font-weight:800; white-space:nowrap; }
				.plan h3 { font-size:18px; margin:0 0 12px; }
				.speed { display:flex; gap:8px; font-size:12px; margin-bottom:18px; }
				.speed span { padding:6px 10px; border-radius:15px; background:#fff1e5; color:var(--orange); }
				.featured .speed span { background:#493d14; color:var(--gold); }
				.price { color:var(--orange); font-size:clamp(30px, 3vw, 36px); font-weight:900; letter-spacing:-1.5px; line-height:1.1; margin:0 0 22px; }
				.price small { font-size:.45em; letter-spacing:0; white-space:nowrap; }
				.featured .price { color:var(--gold); }
				.plan ul { border-top:1px solid #eee6dc; padding:18px 0 0; margin:0 0 22px; list-style:none; flex:1; }
				.plan li { font-size:14px; margin:12px 0; color:#4e4945; }
				.featured li { color:#e7e1d8; }
				.plan li:before { content:"✓"; display:inline-grid; place-items:center; width:18px; height:18px; margin-right:9px; border-radius:50%; background:#fff0e4; color:var(--orange); font-size:11px; }
				.featured li:before { background:#574914; color:var(--gold); }
				.plan .primary-button { width:100%; border-radius:11px; }
				.featured .primary-button { background:linear-gradient(90deg, var(--gold), var(--orange)); color:var(--ink); }
				.plans-message { grid-column:1 / -1; margin:0; text-align:center; color:var(--muted); }
				.plans-retry { display:block; margin:14px auto 0; }
				.diagnostic { background:#fff; }
				.diagnostic-grid { max-width:975px; margin:auto; display:grid; grid-template-columns:1fr 1.25fr; gap:80px; align-items:center; }
				.meter { position:relative; overflow:hidden; background:radial-gradient(circle at 50% 0,#ffb91f14,transparent 44%),#fcfaf4; border:1px solid #e5ded0; border-radius:22px; padding:28px 30px 24px; text-align:center; box-shadow:0 12px 20px #21160a12; transition:transform .35s ease, box-shadow .35s ease, border-color .35s ease; }
				.meter::after { content:""; position:absolute; top:-45%; left:0; width:100%; height:24%; pointer-events:none; background:linear-gradient(180deg,transparent,#ffb91f10,transparent); animation:meter-scan 6s ease-in-out infinite; }
				@keyframes meter-scan { 0%,15% { transform:translateY(-120%); } 75%,100% { transform:translateY(620%); } }
				.meter:hover { transform:translateY(-5px); border-color:#ef741066; box-shadow:0 20px 36px #21160a18,0 0 0 4px #ef74100c; }
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
				.benefit { display:flex; gap:14px; padding:16px 18px; margin-top:14px; background:#fcfaf5; border:1px solid #e7dfd2; border-radius:13px; transition:transform .3s ease, border-color .3s ease, box-shadow .3s ease, background .3s ease; }
				.benefit:hover { transform:translateX(7px); border-color:#ef741077; background:#fffaf0; box-shadow:0 10px 24px #21160a0e; }
				.benefit-icon { display:inline-block; font-size:22px; transition:transform .35s cubic-bezier(.2,.8,.2,1); }
				.benefit:hover .benefit-icon { transform:scale(1.22) rotate(-8deg); }
				.benefit strong, .benefit span { display:block; }
				.benefit span { color:#766e67; font-size:14px; margin-top:4px; }
				.portal-section { padding-bottom:65px; }
				.portal-cards { max-width:1165px; margin:auto; display:grid; grid-template-columns:repeat(4, 1fr); gap:20px; align-items:stretch; }
				.portal-card { position:relative; isolation:isolate; overflow:hidden; width:100%; min-height:0; padding:28px; border:1px solid #ef74100a; border-radius:24px; background:linear-gradient(145deg,#fff,#fffdfa); box-shadow:0 9px 17px #21160a0b; display:flex; flex-direction:column; align-items:flex-start; text-align:left; font:inherit; cursor:pointer; transition:transform .32s cubic-bezier(.2,.7,.2,1), box-shadow .32s ease, border-color .32s ease; }
				.portal-card::before { content:""; position:absolute; inset:auto -40% -75% auto; z-index:-1; width:190px; aspect-ratio:1; border-radius:50%; background:radial-gradient(circle,#ffb91f32,transparent 70%); opacity:0; transition:opacity .35s ease, transform .55s ease; }
				.portal-card:hover { transform:translateY(-8px) scale(1.015); border-color:#ef741044; box-shadow:0 22px 42px #21160a18; }
				.portal-card:hover::before, .portal-card:focus-visible::before { opacity:1; transform:scale(1.45); }
				.portal-card:focus-visible { outline:3px solid var(--orange); outline-offset:4px; }
				.portal-icon { display:grid; place-items:center; width:64px; height:64px; flex:0 0 64px; margin-bottom:22px; background:#fff3e8; border-radius:18px; color:var(--orange); font-size:25px; transition:transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s ease; }
				.portal-card:hover .portal-icon { transform:rotate(-8deg) scale(1.1); box-shadow:0 8px 18px #ef74102b; }
				.portal-card-title { display:block; font-size:16px; font-weight:500; margin:0 0 8px; }
				.portal-card-copy { display:block; color:#746c65; font-size:16px; line-height:1.55; transition:color .25s ease; }
				.portal-card:hover .portal-card-copy { color:#51463d; }
				.portal-banner { max-width:1165px; margin:46px auto 0; padding:42px; border-radius:23px; color:white; background:var(--ink); display:flex; align-items:center; justify-content:space-between; gap:25px; }
				.portal-banner h2 { margin:15px 0 8px; font-size:29px; }
				.portal-banner p { color:#b9ada1; margin:0 0 22px; }
				.portal-banner .eyebrow { background:#514315; border:0; color:var(--gold); }
				.banner-buttons { display:flex; gap:10px; }
				.secondary-button { background:#30302e; color:white; }
				.footer { background:var(--ink); color:#c5b7a9; padding:70px max(28px, calc((100% - 1165px) / 2)) 35px; border-top:3px solid var(--cream); }
				.footer-grid { display:grid; grid-template-columns:1.3fr 1fr 1fr 1.2fr; gap:55px; }
				.footer-grid > div { transition:transform .3s ease; }
				.footer-grid > div:hover { transform:translateY(-5px); }
				.footer a { transition:color .2s ease, transform .2s ease; }
				.footer a:hover { color:var(--gold); transform:translateX(4px); }
				.footer-logo { width:130px; filter:brightness(0) invert(1); margin-bottom:25px; }
				.footer h3 { color:white; font-size:16px; margin:8px 0 25px; }
				.footer p, .footer a { color:#aa9d92; line-height:1.6; font-size:15px; text-decoration:none; display:block; margin:0 0 13px; }
				.footer-bottom { border-top:1px solid #32312f; margin-top:55px; padding-top:24px; display:flex; justify-content:space-between; gap:20px; font-size:14px; }
				.whatsapp { position:fixed; z-index:8; right:24px; bottom:20px; width:54px; height:54px; display:grid; place-items:center; border-radius:50%; background:linear-gradient(180deg, #25d366 0%, #1ebf5c 100%); color:white; box-shadow:0 8px 22px rgba(37, 211, 102, 0.45); text-decoration:none; transition:transform .2s ease, box-shadow .2s ease; }
				.whatsapp:hover { transform:translateY(-2px); box-shadow:0 10px 28px rgba(37, 211, 102, 0.55); }
				.whatsapp svg { display:block; width:32px; height:32px; }
				.admin-access { position:fixed; left:12px; bottom:12px; z-index:9; padding:9px 14px; border-radius:8px; color:white; background:var(--ink); font-size:12px; font-weight:700; text-decoration:none; opacity:0; pointer-events:auto; transition:opacity .2s ease, transform .2s ease; transform:translateY(4px); }
				.admin-access:hover, .admin-access:focus-visible { opacity:1; transform:translateY(0); outline:2px solid var(--gold); outline-offset:3px; }
				@media (prefers-reduced-motion: reduce) { .scroll-reveal, .scroll-reveal.is-visible { opacity:1; translate:none; filter:none; transition:none; } .hero::after, .hero-visual img, .meter::after { animation:none; } .hero-visual img, .plan, .plan .primary-button, .portal-button, .primary-button, .meter, .benefit, .benefit-icon, .portal-card, .portal-icon, .portal-card::before, .footer-grid > div, .footer a, .landing-logo { transition:none; } .hero-visual:hover img, .plan:not(.featured):hover, .plan:not(.featured):focus-within, .plan.featured:hover, .plan.featured:focus-within, .plan:hover .primary-button, .plan:focus-within .primary-button, .portal-card:hover, .benefit:hover, .footer-grid > div:hover, .footer a:hover { transform:none; translate:none; } }
				@media (max-width:800px) { .landing-nav { height:78px; gap:12px; padding:0 18px; } .landing-logo { width:158px; height:60px; } .landing-links { display:none; } .portal-button { padding:11px 16px; font-size:13px; } .hero-inner { padding:48px 22px 55px; } .hero-layout { grid-template-columns:1fr; gap:34px; } .hero h1 { font-size:52px; } .hero-visual { min-height:300px; } .hero-visual img { min-height:300px; } .plans, .diagnostic-grid, .portal-cards, .footer-grid { grid-template-columns:1fr; } .plan.featured { transform:none; } .diagnostic-grid { gap:35px; } .diagnostic-copy .section-title { font-size:38px; } .portal-banner { margin:35px 0 0; padding:30px 24px; flex-direction:column; align-items:flex-start; } .footer-bottom { flex-direction:column; } }
				.landing-nav, .hero, .section, .footer { transition:background-color .35s ease, border-color .35s ease, color .35s ease; }
				.landing-links a, .hero h1, .hero p, .hero-stats strong, .hero-stats span, .section-title, .section-subtitle, .eyebrow, .plan h3, .plan li, .meter-label, .gauge-value, .meter-stats, .speed-status, .benefit strong, .benefit span, .portal-card-title, .portal-card-copy, .footer p, .footer a, .footer h3 { transition:color .3s ease; }
				.plan { transition:background-color .35s ease, color .35s ease, transform .35s cubic-bezier(.2,.7,.2,1), box-shadow .35s ease, border-color .35s ease; }
				.meter { transition:background-color .35s ease, color .35s ease, border-color .35s ease, transform .35s ease, box-shadow .35s ease; }
				.benefit { transition:background-color .3s ease, color .3s ease, border-color .3s ease, transform .3s ease, box-shadow .3s ease; }
				.portal-card { transition:background-color .32s ease, color .32s ease, border-color .32s ease, transform .32s cubic-bezier(.2,.7,.2,1), box-shadow .32s ease; }
				.landing-page[data-theme="dark"] { color:var(--gc-text); background:var(--gc-page-bg); }
				.landing-page[data-theme="dark"] .landing-nav { background:rgba(37,41,44,.94); border-bottom-color:var(--gc-border); box-shadow:0 8px 26px #00000030; }
				.landing-page[data-theme="dark"] .landing-logo { filter:brightness(0) invert(1); }
				.landing-page[data-theme="dark"] .landing-logo:hover { filter:brightness(0) invert(1) drop-shadow(0 5px 5px #ef741066); }
				.landing-page[data-theme="dark"] .landing-links a { color:#c8c2bc; }
				.landing-page[data-theme="dark"] .landing-links a:hover, .landing-page[data-theme="dark"] .landing-links a:focus-visible { color:#fff; }
				.landing-page[data-theme="dark"] .theme-toggle { background:#303538; border-color:#4b5052; color:#ffc05a; }
				.landing-page[data-theme="dark"] .hero { background:radial-gradient(ellipse at 17% 75%,#ef74101c 0,transparent 30%),radial-gradient(ellipse at 83% 30%,#ffffff0a 0,transparent 38%),#23272a; }
				.landing-page[data-theme="dark"] .hero::before { opacity:.42; background-image:linear-gradient(#ef74101c 1px,transparent 1px),linear-gradient(90deg,#ef74101c 1px,transparent 1px),radial-gradient(circle at 72% 48%,#ffb91f20 0,transparent 22%); }
				.landing-page[data-theme="dark"] .hero p, .landing-page[data-theme="dark"] .section-subtitle { color:#c0b9b2; }
				.landing-page[data-theme="dark"] .hero-stats span, .landing-page[data-theme="dark"] .meter-label, .landing-page[data-theme="dark"] .gauge-value small, .landing-page[data-theme="dark"] .meter-stats, .landing-page[data-theme="dark"] .speed-status { color:#aaa39c; }
				.landing-page[data-theme="dark"] .section { background-color:var(--gc-page-bg); background-image:linear-gradient(#ef741012 1px,transparent 1px),linear-gradient(90deg,#ef741012 1px,transparent 1px),radial-gradient(rgba(255,255,255,.045) 1px,transparent 1px); }
				.landing-page[data-theme="dark"] .section::after { border-color:#ef741026; box-shadow:0 0 0 22px #ef74100c,0 0 0 46px #ef741008; }
				.landing-page[data-theme="dark"] .eyebrow { background:#3a2b20; border-color:#674122; }
				.landing-page[data-theme="dark"] .plan { background:var(--gc-surface); border-color:var(--gc-border); box-shadow:0 12px 24px #00000026; }
				.landing-page[data-theme="dark"] .plan.featured { background:#191c1e; border-color:#4a3a2a; color:#f7f3ef; box-shadow:0 16px 34px #00000040,0 0 24px #ef741014; }
				.landing-page[data-theme="dark"] .plan:not(.featured):hover, .landing-page[data-theme="dark"] .plan:not(.featured):focus-within { border-color:#ef741077; box-shadow:0 22px 38px #00000040; }
				.landing-page[data-theme="dark"] .plan ul { border-color:#45494b; }
				.landing-page[data-theme="dark"] .plan li { color:#d0cbc5; }
				.landing-page[data-theme="dark"] .featured li { color:#e7e1d8; }
				.landing-page[data-theme="dark"] .speed span { background:#3b2b20; }
				.landing-page[data-theme="dark"] .featured .speed span { background:#493d14; }
				.landing-page[data-theme="dark"] .plans-message { color:var(--gc-muted); }
				.landing-page[data-theme="dark"] .diagnostic { background-color:#222629; }
				.landing-page[data-theme="dark"] .meter { background:radial-gradient(circle at 50% 0,#ffb91f12,transparent 44%),#292e31; border-color:var(--gc-border); box-shadow:0 12px 24px #00000030; }
				.landing-page[data-theme="dark"] .gauge-track { stroke:#52575a; }
				.landing-page[data-theme="dark"] .gauge-needle, .landing-page[data-theme="dark"] .gauge-center { background:#f2efeb; }
				.landing-page[data-theme="dark"] .benefit { background:#292e31; border-color:#43484a; }
				.landing-page[data-theme="dark"] .benefit:hover { background:#332b24; border-color:#ef741077; }
				.landing-page[data-theme="dark"] .portal-card { background:linear-gradient(145deg,#2b3033,#25292c); border-color:#414649; box-shadow:0 9px 20px #00000024; color:#f2efeb; }
				.landing-page[data-theme="dark"] .portal-card-copy { color:#c0b9b2; }
				.landing-page[data-theme="dark"] .portal-card:hover .portal-card-copy { color:#f2efeb; }
				.landing-page[data-theme="dark"] .portal-icon { background:#3a2b20; }
				.landing-page[data-theme="dark"] .portal-banner { background:#191c1e; box-shadow:0 0 32px #ef741012; }
				.landing-page[data-theme="dark"] .footer { background:#191c1e; border-top-color:#34393b; }
				.landing-page[data-theme="dark"] .footer-bottom { border-top-color:#414649; }
				.landing-page[data-theme="dark"] .admin-access { background:#191c1e; }
				@media (max-width:800px) { .landing-nav { gap:8px; padding:0 12px; } .landing-logo { width:clamp(108px, 33vw, 150px); height:58px; } .portal-button { padding:10px 11px; font-size:12px; } }
				@media (max-width:380px) { .landing-nav { gap:6px; padding:0 10px; } .landing-logo { width:clamp(92px, 28vw, 108px); } .portal-button { padding:9px 8px; font-size:11px; } }
				@media (prefers-reduced-motion: reduce) { .theme-toggle, .theme-toggle svg, .landing-nav, .hero, .section, .footer, .landing-links a, .hero h1, .hero p, .hero-stats strong, .hero-stats span, .section-title, .section-subtitle, .eyebrow, .plan, .plan h3, .plan li, .meter, .meter-label, .gauge-value, .meter-stats, .speed-status, .benefit, .benefit strong, .benefit span, .portal-card, .portal-card-title, .portal-card-copy, .footer p, .footer a, .footer h3 { transition:none; } }
			`}</style>

			<header className="landing-nav">
				<img className="landing-logo" src={logo} alt="Global Conexit" />
				<nav className="landing-links"><a href="#inicio">Inicio</a><a href="#planes">Planes</a><a href="#portal">Nosotros</a><a href="#soporte">Soporte</a></nav>
				<button className="portal-button" type="button" onClick={() => setShowClientLogin(true)}>♟&nbsp; Mi Portal / Ingresar</button>
				<ThemeToggle theme={theme} onToggle={toggleTheme} />
			</header>

			<main>
				<section className="hero" id="inicio"><div className="hero-inner"><div className="hero-layout"><div className="hero-copy">
					<h1>Navega a la<br /><span className="accent">velocidad</span><br />de la <span className="accent">luz</span></h1>
					<p>Fibra óptica con estabilidad garantizada del <strong>99,9%</strong>, latencia ultra-baja y velocidades simétricas que transforman tu experiencia digital: hogar, oficina o gaming.</p>
					<div className="hero-stats"><div>{activeClientsState.status === "ready" ? <AnimatedStat value={activeClientsState.value} prefix="+" /> : <strong aria-label={activeClientsState.status === "loading" ? "Cargando clientes activos" : activeClientsState.error}>{activeClientsState.status === "loading" ? "..." : "—"}</strong>}<span>Clientes activos</span>{activeClientsState.status === "error" && <small className="hero-stat-error" role="status" title={activeClientsState.error}>No se pudo cargar el dato</small>}</div><div><AnimatedStat value={99.9} suffix="%" decimals={1} /><span>Navegación garantizada</span></div><div><AnimatedStat value={24} suffix="/7" /><span>Soporte técnico</span></div></div>
				</div><div className="hero-visual"><img src="/subfondo.jpeg" alt="Router de fibra óptica conectado a una red de alta velocidad" /></div></div></div></section>

				<section className="section" id="planes"><div className="section-heading"><span className="eyebrow">Planes de Internet</span><h2 className="section-title">Elige tu velocidad</h2><p className="section-subtitle">Fibra óptica simétrica, sin costos ocultos y sin letra pequeña.</p></div>
					<div className="plans">
						{plansState.status === "loading" && <p className="plans-message" role="status">Cargando planes...</p>}
						{plansState.status === "empty" && <p className="plans-message">En este momento no hay planes disponibles.</p>}
						{plansState.status === "error" && <div className="plans-message" role="alert"><p>{plansState.error}</p><button className="primary-button plans-retry" type="button" onClick={() => { setPlansState({ status: "loading", items: [], error: "" }); setPlansReload((attempt) => attempt + 1); }}>Reintentar</button></div>}
						{plansState.items.map((plan) => <article className={`plan${plan.featured ? " featured" : ""}`} key={plan.id}>{plan.featured && <span className="popular">⚡ MÁS POPULAR</span>}<h3>{plan.name}</h3><div className="speed"><span>↓ {plan.down}</span><span>↑ {plan.up}</span></div><p className="price">{plan.price}<small>/mes</small></p><ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul><button className="primary-button" type="button" onClick={() => setSelectedPlan(plan)}>Cotizar ahora →</button></article>)}
					</div>
				</section>

				<section className="section diagnostic" ref={speedTestSectionRef}><div className="diagnostic-grid"><div><div className="meter"><span className="meter-label">VELOCIDAD DE DESCARGA</span><div className="gauge" style={{ "--gauge-progress": Math.min(gaugeValue / 700, 1) }}><svg viewBox="0 0 250 142" aria-hidden="true"><path className="gauge-track" pathLength="1" d="M 20 120 A 105 105 0 0 1 230 120" /><path className="gauge-progress" pathLength="1" d="M 20 120 A 105 105 0 0 1 230 120" /></svg><span className="gauge-needle" style={{ transform: `rotate(${gaugeAngle}deg)` }} /><span className="gauge-center" /><span className="gauge-value">{gaugeValue || 0}<br /><small>MBPS</small></span></div><div className="meter-stats"><div>↓ Descarga<strong>{speedTest.download || "—"} Mbps</strong></div><div>↑ Subida<strong>{speedTest.upload || "—"} Mbps</strong></div><div>Latencia<strong>{speedTest.latency || "—"} ms</strong></div></div><p className={`speed-status${speedTest.status === "error" ? " error" : ""}`}>{speedTest.error || (isTesting ? `Analizando tu conexión... ${speedTest.progress}%` : speedTest.status === "finished" ? "Medición completada con Cloudflare" : "El test se iniciará al llegar a esta sección")}</p></div><button className="primary-button" style={{ display:"flex", margin:"24px auto 0" }} onClick={() => startSpeedTest()} disabled={isTesting}>{isTesting ? "Midiendo conexión..." : speedTest.status === "finished" ? "↻ Repetir test" : "⚡ Test de velocidad"}</button></div><div className="diagnostic-copy"><span className="eyebrow">Diagnóstico en tiempo real</span><h2 className="section-title">¿Qué tan rápida<br /><span className="accent">es tu red</span> hoy?</h2><p className="section-subtitle">Con nuestra herramienta integrada mide tu velocidad de descarga, subida y latencia desde el portal, sin instalar nada.</p><div className="benefit"><span className="benefit-icon">🎮</span><div><strong>Gaming sin lag</strong><span>Latencia menor a 5 ms para una experiencia impecable.</span></div></div><div className="benefit"><span className="benefit-icon">📺</span><div><strong>Streaming en 4K</strong><span>Velocidad para múltiples streams en alta definición.</span></div></div><div className="benefit"><span className="benefit-icon">🏠</span><div><strong>Todos tus dispositivos</strong><span>Wi-Fi 6 para hasta 50 dispositivos sin perder rendimiento.</span></div></div></div></div></section>

				<section className="section portal-section" id="portal"><div className="section-heading"><span className="eyebrow">Portal de Clientes</span><h2 className="section-title">Gestiona tu servicio<br /><span className="accent">desde donde estés</span></h2><p className="section-subtitle">Control total de tu plan, facturas y soporte, en un solo lugar, disponible 24/7.</p></div><div className="portal-cards">{portalItems.map(([icon, title, text]) => <button className="portal-card" key={title} type="button" onClick={() => setShowClientLogin(true)}><span className="portal-icon" aria-hidden="true">{icon}</span><span className="portal-card-title">{title}</span><span className="portal-card-copy">{text}</span></button>)}</div></section>
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
