import { useCallback, useLayoutEffect, useState } from "react";

const THEME_STORAGE_KEY = "global-conexit-theme-v2";

function getSavedTheme() {
	try {
		return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
	} catch (error) {
		console.warn("No se pudo leer la preferencia de tema guardada.", error);
		return "light";
	}
}

export default function useTheme() {
	const [theme, setTheme] = useState(getSavedTheme);

	useLayoutEffect(() => {
		document.documentElement.dataset.theme = theme;
		try {
			window.localStorage.setItem(THEME_STORAGE_KEY, theme);
		} catch (error) {
			console.warn("No se pudo guardar la preferencia de tema.", error);
		}
	}, [theme]);

	const toggleTheme = useCallback(() => {
		setTheme((currentTheme) => currentTheme === "light" ? "dark" : "light");
	}, []);

	return [theme, toggleTheme];
}
