import { Navigate, Route, Routes } from "react-router-dom";
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

function Protected({ children, admin }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "ADMIN") return <Navigate to="/" replace />;
  return children;
}
export function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
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
  );
}
