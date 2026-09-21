import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./state/AuthContext.jsx";
import { Layout } from "./components/Layout.jsx";
import { Login } from "./pages/Login.jsx";

const lazyNamed = (loader, name) =>
  lazy(() => loader().then((module) => ({ default: module[name] })));
const Dashboard = lazyNamed(() => import("./pages/Dashboard.jsx"), "Dashboard");
const AttendanceSessionPage = lazyNamed(
  () => import("./pages/AttendanceSession.jsx"),
  "AttendanceSessionPage",
);
const History = lazyNamed(() => import("./pages/History.jsx"), "History");
const Students = lazyNamed(() => import("./pages/Students.jsx"), "Students");
const Subjects = lazyNamed(() => import("./pages/Subjects.jsx"), "Subjects");
const Timetable = lazyNamed(() => import("./pages/Timetable.jsx"), "Timetable");
const UsersPage = lazyNamed(() => import("./pages/Users.jsx"), "UsersPage");
const Audit = lazyNamed(() => import("./pages/Audit.jsx"), "Audit");
const SettingsPage = lazyNamed(() => import("./pages/Settings.jsx"), "SettingsPage");
const DatabasePage = lazyNamed(() => import("./pages/Database.jsx"), "DatabasePage");
const ChangePassword = lazyNamed(
  () => import("./pages/ChangePassword.jsx"),
  "ChangePassword",
);
const BackupsPage = lazyNamed(() => import("./pages/Backups.jsx"), "BackupsPage");
const LogoutPage = lazyNamed(() => import("./pages/Logout.jsx"), "LogoutPage");

function Protected({ children, permission, allowPasswordChange = false }) {
  const { user, can } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword && !allowPasswordChange)
    return <Navigate to="/change-password" replace />;
  if (permission && !can(permission)) return <Navigate to="/" replace />;
  return children;
}

function Deferred({ children }) {
  return (
    <Suspense
      fallback={<div className="route-loading"><i /><span>Loading view…</span></div>}
    >
      {children}
    </Suspense>
  );
}

function RouteProgress() {
  const { pathname } = useLocation();
  const [state, setState] = useState("idle");
  useEffect(() => {
    setState("loading");
    const finishing = setTimeout(() => setState("finishing"), 40);
    const finished = setTimeout(() => setState("idle"), 240);
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
              <Deferred><ChangePassword /></Deferred>
            </Protected>
          }
        />
        <Route
          path="/logout"
          element={
            <Protected allowPasswordChange>
              <Deferred><LogoutPage /></Deferred>
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
          <Route index element={<Deferred><Dashboard /></Deferred>} />
          <Route path="attendance/:id" element={<Deferred><AttendanceSessionPage /></Deferred>} />
          <Route path="history" element={<Deferred><History /></Deferred>} />
          <Route path="students" element={<Deferred><Students /></Deferred>} />
          <Route
            path="subjects"
            element={
              <Protected permission="subjects.view">
                <Deferred><Subjects /></Deferred>
              </Protected>
            }
          />
          <Route
            path="timetable"
            element={
              <Protected permission="timetable.view">
                <Deferred><Timetable /></Deferred>
              </Protected>
            }
          />
          <Route
            path="users"
            element={
              <Protected permission="users.view">
                <Deferred><UsersPage /></Deferred>
              </Protected>
            }
          />
          <Route
            path="audit"
            element={
              <Protected permission="audit.view">
                <Deferred><Audit /></Deferred>
              </Protected>
            }
          />
          <Route
            path="database"
            element={
              <Protected permission="database.view">
                <Deferred><DatabasePage /></Deferred>
              </Protected>
            }
          />
          <Route
            path="backups"
            element={
              <Protected permission="backups.view">
                <Deferred><BackupsPage /></Deferred>
              </Protected>
            }
          />
          <Route
            path="settings"
            element={
              <Protected permission="settings.view">
                <Deferred><SettingsPage /></Deferred>
              </Protected>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}
