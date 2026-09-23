import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  Database,
  DatabaseBackup,
  ClipboardCheck,
  FileClock,
  GraduationCap,
  LayoutDashboard,
  KeyRound,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  School,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../state/AuthContext.jsx";
import { Dialog } from "./Dialog.jsx";
import { useClass } from "../state/ClassContext.jsx";
const baseLinks = [
  ["/", "Overview", LayoutDashboard, "dashboard.view"],
  ["/history", "Attendance history", FileClock, "attendance.view"],
  ["/students", "Students", GraduationCap, "students.view"],
  ["/change-password", "Change password", KeyRound, null],
];
const adminLinks = [
  ["/classes", "Classes", School, "classes.view"],
  ["/users", "Users & staff", Users, "users.view"],
  ["/database", "Database", Database, "database.view"],
  ["/subjects", "Subjects", BookOpen, "subjects.view"],
  ["/timetable", "Timetable", CalendarDays, "timetable.view"],
  ["/audit", "Audit logs", ShieldCheck, "audit.view"],
  ["/backups", "Backup & restore", DatabaseBackup, "backups.view"],
  ["/settings", "Settings", Settings, "settings.view"],
];
const SIDEBAR_MIN = 214;
const SIDEBAR_MAX = 340;
const clampSidebarWidth = (value) =>
  Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Number(value) || 238));

export function Layout() {
  const { user, logout, can } = useAuth(),
    { classes, selectedClass, selectClass } = useClass(),
    navigate = useNavigate(),
    [open, setOpen] = useState(false),
    [passwordPrompt, setPasswordPrompt] = useState(false),
    [skipPasswordPrompt, setSkipPasswordPrompt] = useState(false),
    [logoutPrompt, setLogoutPrompt] = useState(false),
    [loggingOut, setLoggingOut] = useState(false),
    [sidebarVisible, setSidebarVisible] = useState(
      () => localStorage.getItem("attendx_sidebar_visible") !== "false",
    ),
    [sidebarWidth, setSidebarWidth] = useState(() =>
      clampSidebarWidth(localStorage.getItem("attendx_sidebar_width")),
    );
  const passwordPromptKey = `attendx_skip_password_prompt_${user.id}`;
  const doLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
      setLogoutPrompt(false);
    }
  };
  const requestLogout = () => {
    if (passwordPrompt) return;
    setOpen(false);
    setLogoutPrompt(true);
  };
  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add("mobile-nav-open");
    return () => document.body.classList.remove("mobile-nav-open");
  }, [open]);
  useEffect(() => () => document.body.classList.remove("sidebar-resizing"), []);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const closeDrawer = (event) => {
      if (event.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeDrawer);
    return () => desktop.removeEventListener("change", closeDrawer);
  }, []);
  const handleNavigation = (event, to) => {
    setOpen(false);
    if (
      to === "/change-password" &&
      localStorage.getItem(passwordPromptKey) !== "true"
    ) {
      event.preventDefault();
      setLogoutPrompt(false);
      setSkipPasswordPrompt(false);
      setPasswordPrompt(true);
    }
  };
  const continueToPassword = () => {
    if (skipPasswordPrompt) localStorage.setItem(passwordPromptKey, "true");
    setPasswordPrompt(false);
    navigate("/change-password");
  };
  const toggleSidebar = () => {
    setSidebarVisible((visible) => {
      localStorage.setItem("attendx_sidebar_visible", String(!visible));
      return !visible;
    });
  };
  const updateSidebarWidth = (value) => {
    const next = clampSidebarWidth(value);
    setSidebarWidth(next);
    localStorage.setItem("attendx_sidebar_width", String(next));
  };
  const beginResize = (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("sidebar-resizing");
  };
  const resizeSidebar = (event) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateSidebarWidth(event.clientX - 16);
  };
  const finishResize = (event) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.classList.remove("sidebar-resizing");
  };
  const resizeWithKeyboard = (event) => {
    if (event.key === "ArrowLeft") updateSidebarWidth(sidebarWidth - 10);
    else if (event.key === "ArrowRight") updateSidebarWidth(sidebarWidth + 10);
    else if (event.key === "Home") updateSidebarWidth(SIDEBAR_MIN);
    else if (event.key === "End") updateSidebarWidth(SIDEBAR_MAX);
    else return;
    event.preventDefault();
  };
  return (
    <div
      className={`app-shell ${sidebarVisible ? "" : "sidebar-collapsed"}`}
      style={{ "--sidebar-width": `${sidebarWidth}px` }}
    >
      <button
        className="mobile-menu"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
      >
        <Menu />
      </button>
      {open && (
        <button
          className="mobile-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        className={open ? "sidebar open" : "sidebar"}
        aria-label="Primary navigation"
      >
        <button
          className="sidebar-close"
          onClick={() => setOpen(false)}
          aria-label="Close navigation"
        >
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
          {baseLinks
            .filter(([, , , permission]) => !permission || can(permission))
            .map(([to, label, Icon]) => (
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
          {adminLinks.some(([, , , permission]) => can(permission)) && (
            <>
              <p>Administration</p>
              {adminLinks
                .filter(([, , , permission]) => can(permission))
                .map(([to, label, Icon]) => (
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
          <button
            onClick={requestLogout}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut />
          </button>
        </div>
        <div
          className="sidebar-resizer"
          role="separator"
          aria-label="Resize navigation sidebar"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          aria-valuenow={sidebarWidth}
          title={`Sidebar width: ${sidebarWidth}px`}
          tabIndex={0}
          onPointerDown={beginResize}
          onPointerMove={resizeSidebar}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onKeyDown={resizeWithKeyboard}
        />
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="desktop-sidebar-toggle"
              onClick={toggleSidebar}
              aria-expanded={sidebarVisible}
              aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
              title={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
            >
              {sidebarVisible ? <PanelLeftClose /> : <PanelLeftOpen />}
            </button>
            <label className="class-switcher">
              <span className="class-switcher-content">
                <small>
                  <i /> Active class
                </small>
                <span className="class-switcher-row">
                  <select
                    value={selectedClass?.id || ""}
                    onChange={(event) => selectClass(event.target.value)}
                    aria-label="Choose active class"
                  >
                    {!classes.length && <option value="">No assigned class</option>}
                    {classes
                      .filter((item) => item.active)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.displayName}
                        </option>
                      ))}
                  </select>
                </span>
                <span className="class-switcher-meta">
                  {selectedClass ? (
                    [
                      selectedClass.course,
                      selectedClass.specialization,
                      selectedClass.semester && `Semester ${selectedClass.semester}`,
                      selectedClass.academicYear,
                    ]
                      .filter(Boolean)
                      .map((item, index) => (
                        <b key={`${item}-${index}`}>{item}</b>
                      ))
                  ) : (
                    <b>Assignment required</b>
                  )}
                </span>
              </span>
            </label>
          </div>
          <span className="role-pill">
            <ShieldCheck />
            {user.adminPlus ? "ADMIN++" : user.role}
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
          <span className="prompt-security-icon">
            <KeyRound />
          </span>
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
              <small>
                You can still open Change password from the sidebar.
              </small>
            </span>
          </label>
          <div className="dialog-actions">
            <button
              className="secondary"
              onClick={() => setPasswordPrompt(false)}
            >
              Stay here
            </button>
            <button className="primary" onClick={continueToPassword}>
              Continue to security <KeyRound />
            </button>
          </div>
        </div>
      </Dialog>
      <Dialog
        open={logoutPrompt}
        title="Sign out of AttendX?"
        onClose={() => !loggingOut && setLogoutPrompt(false)}
      >
        <div className="logout-confirmation">
          <span className="logout-confirmation-icon">
            <LogOut />
          </span>
          <div>
            <h3>End this session</h3>
            <p>
              You’ll need to enter your email and password to access AttendX
              again on this browser.
            </p>
          </div>
          <div className="dialog-actions">
            <button
              className="secondary"
              onClick={() => setLogoutPrompt(false)}
              disabled={loggingOut}
            >
              Stay signed in
            </button>
            <button
              className="danger logout-confirm-button"
              onClick={doLogout}
              disabled={loggingOut}
            >
              {loggingOut ? "Signing out…" : "Sign out"}
              <LogOut />
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
