import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./state/AuthContext.jsx";
import { Layout } from "./components/Layout.jsx";
import { Login } from "./pages/Login.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { AttendanceSessionPage } from "./pages/AttendanceSession.jsx";
import { History } from "./pages/History.jsx";
import { Students } from "./pages/Students.jsx";
import { Subjects } from "./pages/Subjects.jsx";
import { Timetable } from "./pages/Timetable.jsx";
import { UsersPage } from "./pages/Users.jsx";
import { Audit } from "./pages/Audit.jsx";
import { SettingsPage } from "./pages/Settings.jsx";
import { DatabasePage } from "./pages/Database.jsx";
import { ChangePassword } from "./pages/ChangePassword.jsx";
import { BackupsPage } from "./pages/Backups.jsx";

function Protected({ children, admin, allowPasswordChange = false }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword && !allowPasswordChange)
    return <Navigate to="/change-password" replace />;
  if (admin && user.role !== "ADMIN") return <Navigate to="/" replace />;
  return children;
}

function RouteProgress() {
  const { pathname } = useLocation();
  const [state, setState] = useState("idle");
  useEffect(() => {
    setState("loading");
    const finishing = setTimeout(() => setState("finishing"), 60);
    const finished = setTimeout(() => setState("idle"), 520);
    return () => {
      clearTimeout(finishing);
      clearTimeout(finished);
    };
  }, [pathname]);
  return (
    <div className={`route-progress ${state}`} aria-hidden="true">
      <i />
    </div>
  );
}

export function App() {
  const { user, ready } = useAuth();
  if (!ready)
    return <div className="auth-loading"><span>AttendX</span><small>Checking secure session…</small></div>;
  return (
    <>
      <RouteProgress />
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate
                to={user.mustChangePassword ? "/change-password" : "/"}
              />
            ) : (
              <Login />
            )
          }
        />
        <Route
          path="/change-password"
          element={
            <Protected allowPasswordChange>
              <ChangePassword />
            </Protected>
          }
        />
        <Route
          element={
            <Protected>
              <Layout />
            </Protected>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="attendance/:id" element={<AttendanceSessionPage />} />
          <Route path="history" element={<History />} />
          <Route path="students" element={<Students />} />
          <Route
            path="subjects"
            element={
              <Protected admin>
                <Subjects />
              </Protected>
            }
          />
          <Route
            path="timetable"
            element={
              <Protected admin>
                <Timetable />
              </Protected>
            }
          />
          <Route
            path="users"
            element={
              <Protected admin>
                <UsersPage />
              </Protected>
            }
          />
          <Route
            path="audit"
            element={
              <Protected admin>
                <Audit />
              </Protected>
            }
          />
          <Route
            path="database"
            element={
              <Protected admin>
                <DatabasePage />
              </Protected>
            }
          />
          <Route
            path="backups"
            element={
              <Protected admin>
                <BackupsPage />
              </Protected>
            }
          />
          <Route
            path="settings"
            element={
              <Protected admin>
                <SettingsPage />
              </Protected>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}
