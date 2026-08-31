import { useNavigate } from "react-router-dom";

export function FormLogin() {
  const navigate = useNavigate();

  const handleSubmit = (event) => {
    event.preventDefault();
    navigate("/clientes");
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ background: "#f2f4f7" }}>
      <div className="bg-white rounded-4 shadow-sm p-5" style={{ width: "min(100%, 360px)" }}>
        <h2 className="mb-4 fw-bold">Mini ERP</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-3 text-start">
            <label htmlFor="formEmail" className="form-label">Usuario</label>
            <input type="email" id="formEmail" className="form-control form-control-lg" placeholder="Usuario" required/>
          </div>

          <div className="mb-4 text-start">
            <label htmlFor="formPassword" className="form-label">Contraseña</label>
            <input type="password" id="formPassword" className="form-control form-control-lg" placeholder="Contraseña" required/>
          </div>

          <button type="submit" className="btn btn-primary w-100 py-2">Iniciar sesión</button>
        </form>
      </div>
    </div>
  );
}

export default FormLogin;