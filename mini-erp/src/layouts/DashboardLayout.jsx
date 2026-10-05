import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

function DashboardLayout({ children }) {
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