import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";

function Navbar({ theme, onThemeToggle }) {
    return (
        <nav className="navbar">
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