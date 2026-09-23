import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "../api.js";
import { useAuth } from "./AuthContext.jsx";
import { useToast } from "./ToastContext.jsx";

const ClassContext = createContext(null);

export function ClassProvider({ children }) {
  const { user, can } = useAuth();
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!user || !can("classes.view")) {
      setClasses([]);
      setSelectedId(null);
      setReady(true);
      return;
    }
    setReady(false);
    try {
      const { data } = await api.get("/admin/classes");
      const active = data.filter((item) => item.active);
      setClasses(data);
      const saved = Number(localStorage.getItem(`attendx_class_${user.id}`));
      const next =
        active.find((item) => item.id === saved) ||
        active.find((item) => item.code === "ANASUYA-BCA-AI-3B-UG") ||
        active[0] ||
        data[0] ||
        null;
      setSelectedId(next?.id || null);
    } catch {
      setClasses([]);
      setSelectedId(null);
      toast("Class workspaces could not be loaded. Please retry.", "error");
    } finally {
      setReady(true);
    }
  }, [user?.id, user?.permissions]);

  useEffect(() => {
    load();
  }, [load]);

  const selectClass = (id) => {
    const numericId = Number(id);
    setSelectedId(numericId);
    if (user)
      localStorage.setItem(`attendx_class_${user.id}`, String(numericId));
  };
  const selectedClass = classes.find((item) => item.id === selectedId) || null;
  const value = useMemo(
    () => ({
      classes,
      selectedClass,
      classId: selectedClass?.id || null,
      ready,
      selectClass,
      reloadClasses: load,
    }),
    [classes, selectedClass, ready, load],
  );
  return (
    <ClassContext.Provider value={value}>{children}</ClassContext.Provider>
  );
}

export const useClass = () => useContext(ClassContext);
