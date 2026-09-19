import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, resumeSession, setAccessToken } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    localStorage.removeItem("attendx_token");
    localStorage.removeItem("attendx_user");
    let active = true;
    resumeSession()
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch(() => {
        setAccessToken(null);
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    const ended = () => {
      setAccessToken(null);
      setUser(null);
      setReady(true);
    };
    const refreshed = (event) => {
      if (event.detail) setUser(event.detail);
    };
    window.addEventListener("attendx:session-ended", ended);
    window.addEventListener("attendx:session-refreshed", refreshed);
    return () => {
      active = false;
      window.removeEventListener("attendx:session-ended", ended);
      window.removeEventListener("attendx:session-refreshed", refreshed);
    };
  }, []);

  const login = async (credentials) => {
    const { data } = await api.post("/auth/login", credentials, { skipAuthRefresh: true });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout", null, { skipAuthRefresh: true, skipAuthorization: true });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={useMemo(() => ({ user, ready, login, logout }), [user, ready])}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
