import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.jsx";
import { AuthProvider } from "./state/AuthContext.jsx";
import { ToastProvider } from "./state/ToastContext.jsx";
import { ClassProvider } from "./state/ClassContext.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <ClassProvider>
            <App />
          </ClassProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
