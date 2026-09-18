import { createContext, useContext, useMemo, useState } from "react";
import { api } from "../api.js";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("attendx_user") || "null");
      if (
        stored &&
        typeof stored.name === "string" &&
        ["ADMIN", "CR"].includes(stored.role)
      ) {
        return stored;
      }
    } catch {
      // Ignore stale or malformed data left by another localhost application.
    }
    localStorage.removeItem("attendx_token");
    localStorage.removeItem("attendx_user");
    return null;
  });
  const login = async (credentials) => {
    const { data } = await api.post("/auth/login", credentials);
    localStorage.setItem("attendx_token", data.token);
    localStorage.setItem("attendx_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };
  const logout = () => {
    localStorage.removeItem("attendx_token");
    localStorage.removeItem("attendx_user");
    setUser(null);
  };
  return (
    <AuthContext.Provider
      value={useMemo(() => ({ user, login, logout }), [user])}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
