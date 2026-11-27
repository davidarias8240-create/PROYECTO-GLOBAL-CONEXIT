import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";

function Navbar({ theme, onThemeToggle, onMenuToggle, isMenuOpen }) {
    return (
        <nav className="navbar">
            <button
                className="admin-menu-toggle"
                type="button"
                aria-label={isMenuOpen ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
                aria-expanded={isMenuOpen}
                aria-controls="admin-navigation-sidebar"
                onClick={onMenuToggle}
            >
                <span />
                <span />
                <span />
            </button>
            <span className="navbar-brand">
                Panel Administrativo
            </span>
            <div className="navbar-actions">
                <NotificationBell />
                <ThemeToggle theme={theme} onToggle={onThemeToggle} />
            </div>
        </nav>
    );
}

export default Navbar;