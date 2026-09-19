import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Database,
  DatabaseBackup,
  ClipboardCheck,
  Clock3,
  FileClock,
  GraduationCap,
  LayoutDashboard,
  KeyRound,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../state/AuthContext.jsx";
import { Dialog } from "./Dialog.jsx";
const baseLinks = [
  ["/", "Overview", LayoutDashboard],
  ["/history", "Attendance history", FileClock],
  ["/students", "Students", GraduationCap],
  ["/change-password", "Change password", KeyRound],
];
const adminLinks = [
  ["/subjects", "Subjects", BookOpen],
  ["/timetable", "Timetable", CalendarDays],
  ["/users", "Users & CR access", Users],
  ["/audit", "Audit logs", ShieldCheck],
  ["/database", "Database", Database],
  ["/backups", "Backup & restore", DatabaseBackup],
  ["/settings", "Settings", Settings],
];
export function Layout() {
  const { user, logout } = useAuth(),
    navigate = useNavigate(),
    [open, setOpen] = useState(false),
    [passwordPrompt, setPasswordPrompt] = useState(false),
    [skipPasswordPrompt, setSkipPasswordPrompt] = useState(false);
  const passwordPromptKey = `attendx_skip_password_prompt_${user.id}`;
  const doLogout = () => {
    logout();
    navigate("/login");
  };
  const handleNavigation = (event, to) => {
    setOpen(false);
    if (
      to === "/change-password" &&
      localStorage.getItem(passwordPromptKey) !== "true"
    ) {
      event.preventDefault();
      setSkipPasswordPrompt(false);
      setPasswordPrompt(true);
    }
  };
  const continueToPassword = () => {
    if (skipPasswordPrompt)
      localStorage.setItem(passwordPromptKey, "true");
    setPasswordPrompt(false);
    navigate("/change-password");
  };
  return (
    <div className="app-shell">
      <button className="mobile-menu" onClick={() => setOpen(true)}>
        <Menu />
      </button>
      <aside className={open ? "sidebar open" : "sidebar"}>
        <button className="sidebar-close" onClick={() => setOpen(false)}>
          <X />
        </button>
        <div className="brand">
          <img src="/brand/eiilm.png" />
          <div>
            <strong>AttendX</strong>
            <small>EIILM Kolkata</small>
          </div>
        </div>
        <nav>
          <p>Workspace</p>
          {baseLinks.map(([to, label, Icon]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={(event) => handleNavigation(event, to)}
            >
              <Icon />
              {label}
            </NavLink>
          ))}
          {user.role === "ADMIN" && (
            <>
              <p>Administration</p>
              {adminLinks.map(([to, label, Icon]) => (
                <NavLink key={to} to={to} onClick={() => setOpen(false)}>
                  <Icon />
                  {label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </div>
          <button onClick={doLogout} title="Sign out">
            <LogOut />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <small>SEMESTER I · 2026–27</small>
            <strong>
              <Clock3 /> Asia/Kolkata
            </strong>
          </div>
          <span className="role-pill">
            <ShieldCheck />
            {user.role}
          </span>
        </header>
        <Outlet />
      </main>
      <Dialog
        open={passwordPrompt}
        title="Open account security?"
        onClose={() => setPasswordPrompt(false)}
      >
        <div className="password-nav-prompt">
          <span className="prompt-security-icon"><KeyRound /></span>
          <div>
            <h3>Change your AttendX password</h3>
            <p>
              You’ll need your current password. After a successful change,
              AttendX revokes existing sessions and asks you to sign in again.
            </p>
          </div>
          <label className="remember-choice">
            <input
              type="checkbox"
              checked={skipPasswordPrompt}
              onChange={(event) => setSkipPasswordPrompt(event.target.checked)}
            />
            <span>
              Don’t show this confirmation again
              <small>You can still open Change password from the sidebar.</small>
            </span>
          </label>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setPasswordPrompt(false)}>
              Stay here
            </button>
            <button className="primary" onClick={continueToPassword}>
              Continue to security <KeyRound />
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
