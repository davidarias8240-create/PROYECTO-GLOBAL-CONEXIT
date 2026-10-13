import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { verificarSesionAdmin } from "../services/api";

function DashboardLayout({ children }) {
    const navigate = useNavigate();
    const [authorized, setAuthorized] = useState(false);

    useEffect(() => {
        verificarSesionAdmin()
            .then(() => setAuthorized(true))
            .catch(() => navigate("/admin", { replace: true }));
    }, [navigate]);

    if (!authorized) {
        return <p className="p-4" role="status">Validando sesión administrativa...</p>;
    }

    return (
        <div className="admin-shell d-flex">
            <Sidebar />
            <div className="admin-content flex-grow-1">
                <Navbar />
                <main className="p-4">{children}</main>
            </div>
        </div>
    );
}

export default DashboardLayout;