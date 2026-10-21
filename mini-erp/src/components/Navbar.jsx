import NotificationBell from "./NotificationBell";

function Navbar() {
    return (
        <nav className="navbar">
            <span className="navbar-brand">
                Panel Administrativo
            </span>
            <NotificationBell />
        </nav>
    );
}

export default Navbar;