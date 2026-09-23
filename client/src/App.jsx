import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./state/AuthContext.jsx";
import { Layout } from "./components/Layout.jsx";
import { Login } from "./pages/Login.jsx";
import { AdminPlusGate } from "./components/AdminPlusGate.jsx";
import { getPendingRequestCount } from "./api.js";

const lazyNamed = (loader, name) =>
  lazy(() => loader().then((module) => ({ default: module[name] })));
const Dashboard = lazyNamed(() => import("./pages/Dashboard.jsx"), "Dashboard");
const AttendanceSessionPage = lazyNamed(
  () => import("./pages/AttendanceSession.jsx"),
  "AttendanceSessionPage",
);
const History = lazyNamed(() => import("./pages/History.jsx"), "History");
const Students = lazyNamed(() => import("./pages/Students.jsx"), "Students");
const StudentProfile = lazyNamed(
  () => import("./pages/StudentProfile.jsx"),
  "StudentProfile",
);
const Subjects = lazyNamed(() => import("./pages/Subjects.jsx"), "Subjects");
const Timetable = lazyNamed(() => import("./pages/Timetable.jsx"), "Timetable");
const UsersPage = lazyNamed(() => import("./pages/Users.jsx"), "UsersPage");
const Audit = lazyNamed(() => import("./pages/Audit.jsx"), "Audit");
const SettingsPage = lazyNamed(
  () => import("./pages/Settings.jsx"),
  "SettingsPage",
);
const DatabasePage = lazyNamed(
  () => import("./pages/Database.jsx"),
  "DatabasePage",
);
const ChangePassword = lazyNamed(
  () => import("./pages/ChangePassword.jsx"),
  "ChangePassword",
);
const BackupsPage = lazyNamed(
  () => import("./pages/Backups.jsx"),
  "BackupsPage",
);
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
  const { pathname } = useLocation();
  return (
    <Suspense
      fallback={
        <div className="route-loading">
          <i />
          <span>Loading view…</span>
        </div>
      }
    >
      <RouteReadySignal pathname={pathname}>{children}</RouteReadySignal>
    </Suspense>
  );
}

function RouteReadySignal({ children, pathname }) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("attendx:view-ready", { detail: { pathname } }),
    );
  }, [pathname]);
  return children;
}

function RouteProgress() {
  const { pathname } = useLocation();
  const [state, setState] = useState("idle");
  const [pending, setPending] = useState(getPendingRequestCount());
  const [viewReady, setViewReady] = useState(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    const onPending = (event) => setPending(event.detail?.pending || 0);
    const onReady = (event) => {
      if (event.detail?.pathname === pathname) setViewReady(true);
    };
    window.addEventListener("attendx:api-pending", onPending);
    window.addEventListener("attendx:view-ready", onReady);
    return () => {
      window.removeEventListener("attendx:api-pending", onPending);
      window.removeEventListener("attendx:view-ready", onReady);
    };
  }, [pathname]);

  useEffect(() => {
    startedAt.current = Date.now();
    setState("loading");
    setViewReady(pathname === "/login");
    setPending(getPendingRequestCount());
  }, [pathname]);

  useEffect(() => {
    if (state !== "loading" || !viewReady || pending > 0) return undefined;
    const minimumDelay = Math.max(0, 140 - (Date.now() - startedAt.current));
    const finishing = window.setTimeout(
      () => setState("finishing"),
      minimumDelay,
    );
    return () => window.clearTimeout(finishing);
  }, [pending, state, viewReady]);

  useEffect(() => {
    if (state !== "finishing") return undefined;
    const finished = window.setTimeout(() => setState("idle"), 430);
    return () => window.clearTimeout(finished);
  }, [state]);
  return (
    <div className={`route-progress ${state}`} aria-hidden="true">
      <i />
    </div>
  );
}

export function App() {
  const { user, ready } = useAuth();
  if (!ready)
    return (
      <div className="auth-loading">
        <span>AttendX</span>
        <small>Checking secure session…</small>
      </div>
    );
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
              <Deferred>
                <ChangePassword />
              </Deferred>
            </Protected>
          }
        />
        <Route
          path="/logout"
          element={
            <Protected allowPasswordChange>
              <Deferred>
                <LogoutPage />
              </Deferred>
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
          <Route
            index
            element={
              <Deferred>
                <Dashboard />
              </Deferred>
            }
          />
          <Route
            path="attendance/:id"
            element={
              <Deferred>
                <AttendanceSessionPage />
              </Deferred>
            }
          />
          <Route
            path="history"
            element={
              <Deferred>
                <History />
              </Deferred>
            }
          />
          <Route
            path="students"
            element={
              <Deferred>
                <Students />
              </Deferred>
            }
          />
          <Route
            path="students/:id"
            element={
              <Deferred>
                <StudentProfile />
              </Deferred>
            }
          />
          <Route
            path="subjects"
            element={
              <Protected permission="subjects.view">
                <Deferred>
                  <Subjects />
                </Deferred>
              </Protected>
            }
          />
          <Route
            path="timetable"
            element={
              <Protected permission="timetable.view">
                <Deferred>
                  <Timetable />
                </Deferred>
              </Protected>
            }
          />
          <Route
            path="users"
            element={
              <Protected permission="users.view">
                <AdminPlusGate adminPlus={false} area="Users & CR access">
                  <Deferred>
                    <UsersPage />
                  </Deferred>
                </AdminPlusGate>
              </Protected>
            }
          />
          <Route
            path="audit"
            element={
              <Protected permission="audit.view">
                <Deferred>
                  <Audit />
                </Deferred>
              </Protected>
            }
          />
          <Route
            path="database"
            element={
              <Protected permission="database.view">
                <AdminPlusGate area="Database console">
                  <Deferred>
                    <DatabasePage />
                  </Deferred>
                </AdminPlusGate>
              </Protected>
            }
          />
          <Route
            path="backups"
            element={
              <Protected permission="backups.view">
                <AdminPlusGate area="Backup & restore">
                  <Deferred>
                    <BackupsPage />
                  </Deferred>
                </AdminPlusGate>
              </Protected>
            }
          />
          <Route
            path="settings"
            element={
              <Protected permission="settings.view">
                <Deferred>
                  <SettingsPage />
                </Deferred>
              </Protected>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}
