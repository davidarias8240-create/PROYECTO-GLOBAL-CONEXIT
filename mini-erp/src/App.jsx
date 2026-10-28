import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/login";
import Home from "./pages/home";
import DashboardLayout from "./layouts/DashboardLayout";
import ClientPortal from "./pages/interfazcliente";
import EntityAdmin from "./pages/EntidadAdmin";
import CustomerDetail from "./pages/CustomerDetail";
import Dashboard from "./pages/Dashboard";
import Desactivados from "./pages/Desactivados";
import { adminEntities } from "./config/adminEntities";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Home />} />

                <Route path="/cliente" element={<ClientPortal />} />

                <Route path="/admin" element={
                        <Login />
                    }/>
                <Route path="/dashboard" element={
                    <DashboardLayout>
                        <Dashboard />
                    </DashboardLayout>
                }/>
                <Route path="/desactivados" element={
                        <DashboardLayout>
                            <Desactivados />
                        </DashboardLayout>
                    }/>
                {adminEntities.map(({ key }) => (
                    <Route
                        key={key}
                        path={`/${key}`}
                        element={
                            <DashboardLayout>
                                <EntityAdmin entity={key} />
                            </DashboardLayout>
                        }
                    />
                ))}
                <Route
                    path="/clientes/:clienteId"
                    element={
                        <DashboardLayout>
                            <CustomerDetail />
                        </DashboardLayout>
                    }
                />
                <Route
                    path="/clientes/:clienteId/:entidad"
                    element={
                        <DashboardLayout>
                            <CustomerDetail />
                        </DashboardLayout>
                    }
                />
            </Routes>
        </BrowserRouter>
    );
}

export default App;
