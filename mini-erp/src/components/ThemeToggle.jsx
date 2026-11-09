function SunIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
		</svg>
	);
}

function MoonIcon() {
	return (
		<svg viewBox="0 0 24 24" aria-hidden="true">
			<path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z" />
		</svg>
	);
}

function ThemeToggle({ theme, onToggle }) {
	const nextTheme = theme === "light" ? "oscuro" : "claro";

	return (
		<button
			className="theme-toggle"
			type="button"
			onClick={onToggle}
			aria-label={`Cambiar a modo ${nextTheme}`}
			aria-pressed={theme === "dark"}
			title={`Cambiar a modo ${nextTheme}`}
		>
			{theme === "light" ? <SunIcon /> : <MoonIcon />}
		</button>
	);
}

export default ThemeToggle;
