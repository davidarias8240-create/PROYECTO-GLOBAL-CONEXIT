import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/login";
import Clientes from "./pages/clientes";
import Productos from "./pages/productos";
import Ventas from "./pages/ventas";
import Facturas from "./pages/facturas";
import Ordenes from "./pages/ordenes";
import Home from "./pages/home";
import DashboardLayout from "./layouts/DashboardLayout";
import ClientPortal from "./pages/interfazcliente";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Home />} />

                <Route path="/cliente" element={<ClientPortal />} />

                <Route path="/clientes" element={
                        <DashboardLayout>
                            <Clientes />
                        </DashboardLayout>
                    }/>

                <Route path="/admin" element={
                        <Login />
                    }/>

                <Route path="/productos" element={
                        <DashboardLayout>
                            <Productos />
                        </DashboardLayout>
                    }/>

                <Route path="/ventas" element={
                        <DashboardLayout>
                            <Ventas />
                        </DashboardLayout>
                    }/>
                <Route path="/facturas" element={
                        <DashboardLayout>
                            <Facturas />
                        </DashboardLayout>
                    }/>

                <Route path="/ordenes" element={
                        <DashboardLayout>
                            <Ordenes />
                        </DashboardLayout>
                    }/>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
