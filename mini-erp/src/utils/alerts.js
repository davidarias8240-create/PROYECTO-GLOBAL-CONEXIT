import Swal from "sweetalert2";

function getThemeOptions() {
	const isDark = document.documentElement.dataset.theme === "dark";
	return {
		background: isDark ? "#25292c" : "#fffdfa",
		color: isDark ? "#f2efeb" : "#28231f",
		customClass: { popup: "gc-sweetalert-popup" },
	};
}

export function showSuccessAlert(title, text = "") {
	return Swal.fire({
		...getThemeOptions(),
		icon: "success",
		title,
		text,
		confirmButtonText: "Aceptar",
		confirmButtonColor: "#ef7410",
	});
}

export function showErrorAlert(title, text = "") {
	return Swal.fire({
		...getThemeOptions(),
		icon: "error",
		title,
		text,
		confirmButtonText: "Aceptar",
		confirmButtonColor: "#ef7410",
	});
}

export function showInfoAlert(title, text = "") {
	return Swal.fire({
		...getThemeOptions(),
		icon: "info",
		title,
		text,
		confirmButtonText: "Entendido",
		confirmButtonColor: "#ef7410",
	});
}

export async function confirmAction({
	title,
	text = "",
	confirmButtonText = "Confirmar",
	cancelButtonText = "Cancelar",
}) {
	const result = await Swal.fire({
		...getThemeOptions(),
		icon: "warning",
		title,
		text,
		showCancelButton: true,
		confirmButtonText,
		cancelButtonText,
		confirmButtonColor: "#ef7410",
		cancelButtonColor: "#77716c",
		reverseButtons: true,
		focusCancel: true,
	});
	return result.isConfirmed;
}
