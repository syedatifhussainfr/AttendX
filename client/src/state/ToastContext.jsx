import { createContext, useContext, useState } from "react";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
const ToastContext = createContext(null);
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const toast = (message, kind = "success") => {
    const id = crypto.randomUUID();
    setItems((v) => [...v, { id, message, kind }]);
    setTimeout(() => setItems((v) => v.filter((x) => x.id !== id)), 3500);
  };
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack">
        {items.map((item) => (
          <div className={`toast ${item.kind}`} key={item.id}>
            {item.kind === "error" ? <CircleAlert /> : <CheckCircle2 />}
            <span>{item.message}</span>
            <button
              onClick={() => setItems((v) => v.filter((x) => x.id !== item.id))}
            >
              <X />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
