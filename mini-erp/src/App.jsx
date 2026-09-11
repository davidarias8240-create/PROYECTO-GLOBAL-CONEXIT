import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/login";
import Clientes from "./pages/clientes";
import Productos from "./pages/productos";
import Ventas from "./pages/ventas";
import Home from "./pages/home";
import DashboardLayout from "./layouts/DashboardLayout";

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/" element={<Home />} />

                <Route path="/clientes" element={
                        <DashboardLayout>
                            <Clientes />
                        </DashboardLayout>
                    }/>

                <Route path="/login" element={
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
            </Routes>
        </BrowserRouter>
    );
}

export default App;
