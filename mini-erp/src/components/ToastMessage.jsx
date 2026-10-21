import { useEffect } from "react";

function ToastMessage({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;

    const timeout = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(timeout);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="welcome-toast" role="status" aria-live="polite">
      <span className="welcome-toast-icon" aria-hidden="true">✓</span>
      <p>{message}</p>
      <button type="button" onClick={onClose} aria-label="Cerrar mensaje">×</button>
    </div>
  );
}

export default ToastMessage;
