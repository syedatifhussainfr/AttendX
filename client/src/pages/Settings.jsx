import { useEffect, useState } from "react";
import {
  Building2,
  Clock3,
  KeyRound,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, messageOf, setAdminElevation } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
import { useClass } from "../state/ClassContext.jsx";
export function SettingsPage() {
  const [data, setData] = useState(null),
    [saving, setSaving] = useState(false),
    [lateBusy, setLateBusy] = useState(false),
    [creditBusy, setCreditBusy] = useState(false),
    [policy, setPolicy] = useState(null),
    [policyBusy, setPolicyBusy] = useState(false),
    toast = useToast(),
    { can } = useAuth(),
    navigate = useNavigate(),
    { selectedClass } = useClass();
  useEffect(() => {
    api
      .get("/admin/settings")
      .then((r) => setData(r.data))
      .catch((e) => toast(messageOf(e), "error"));
  }, []);
  useEffect(() => {
    const lockPolicy = () => setPolicy(null);
    window.addEventListener("attendx:admin-elevation-ended", lockPolicy);
    return () =>
      window.removeEventListener("attendx:admin-elevation-ended", lockPolicy);
  }, []);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const payload = {
        ...f,
        lateThresholdMinutes: data.lateModeEnabled
          ? Number(f.lateThresholdMinutes)
          : Number(data.lateThresholdMinutes),
        crCanCorrectRecent: f.crCanCorrectRecent === "on",
        attendanceTargetPercentage: Number(f.attendanceTargetPercentage),
      };
      const response = await api.put("/admin/settings", payload);
      setData((current) => ({ ...current, ...response.data }));
      toast("System settings saved.");
    } catch (x) {
      toast(messageOf(x), "error");
    } finally {
      setSaving(false);
    }
  };
  const unlockPolicy = async (event) => {
    event.preventDefault();
    setPolicyBusy(true);
    try {
      const password = new FormData(event.currentTarget).get("password");
      const { data: elevation } = await api.post("/auth/elevate", { password });
      setAdminElevation(elevation.elevationToken, elevation.expiresInSeconds);
      setPolicy((await api.get("/admin/settings/permissions")).data);
      toast("Permission policy unlocked for five minutes.");
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setPolicyBusy(false);
    }
  };
  const setPermission = (role, area, permission, enabled) =>
    setPolicy((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [role]: {
          ...current.permissions[role],
          [area]: {
            ...current.permissions[role][area],
            [permission]: enabled,
          },
        },
      },
    }));
  const savePolicy = async () => {
    setPolicyBusy(true);
    try {
      const { data: saved } = await api.put("/admin/settings/permissions", {
        policy,
      });
      setPolicy(saved.policy);
      toast(
        saved.repairs.length
          ? `Permissions saved with ${saved.repairs.length} secure repair(s).`
          : "Permission policy saved and applied immediately.",
      );
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setPolicyBusy(false);
    }
  };
  const toggleLateMode = async () => {
    setLateBusy(true);
    try {
      const enabled = !data.lateModeEnabled;
      const response = await api.put("/admin/settings/late-mode", { enabled });
      setData((current) => ({
        ...current,
        lateModeEnabled: response.data.lateModeEnabled,
      }));
      toast(
        enabled
          ? "Late Mode enabled for newly opened sessions."
          : "Late Mode disabled. New sessions will record every appearance as Present.",
      );
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setLateBusy(false);
    }
  };
  const setLateCredit = async (credit) => {
    setCreditBusy(true);
    try {
      const response = await api.put("/admin/settings/late-credit", { credit });
      setData((current) => ({
        ...current,
        lateAttendanceCredit: response.data.lateAttendanceCredit,
      }));
      toast(
        credit === 1
          ? "Late marks now receive full attendance credit."
          : credit === 0.5
            ? "Late marks now receive half attendance credit."
            : "Late marks are recorded without attendance credit.",
      );
    } catch (error) {
      toast(messageOf(error), "error");
    } finally {
      setCreditBusy(false);
    }
  };
  if (!data)
    return (
      <div className="page">
        <div className="skeleton hero-skeleton" />
      </div>
    );
  return (
    <div className="page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">SYSTEM CONFIGURATION</span>
          <h1>Settings</h1>
          <p>Attendance rules and institutional metadata.</p>
        </div>
      </div>
      <form className="settings-layout" onSubmit={save}>
        <section className="panel settings-panel">
          <div className="settings-heading">
            <TimerReset />
            <div>
              <h2>Attendance rules</h2>
              <p>The threshold is snapshotted on every new session.</p>
            </div>
          </div>
          <div
            className={`late-mode-control ${data.lateModeEnabled ? "enabled" : "disabled"}`}
          >
            <span className="late-mode-icon">
              <Clock3 />
            </span>
            <div>
              <span className="late-mode-title">
                <strong>Late Mode</strong>
                <small>
                  <ShieldCheck /> Admin++ only
                </small>
              </span>
              <p>
                {data.lateModeEnabled
                  ? "New sessions classify arrivals after the threshold as Late."
                  : "New sessions treat every marked arrival as Present."}
              </p>
            </div>
            <button
              type="button"
              className="late-mode-switch"
              role="switch"
              aria-checked={data.lateModeEnabled}
              aria-label="Toggle Late Mode"
              disabled={!can("settings.manageLateMode") || lateBusy}
              onClick={toggleLateMode}
            >
              <i />
              <span>{data.lateModeEnabled ? "On" : "Off"}</span>
            </button>
          </div>
          {data.lateModeEnabled && (
            <details className="late-mode-advanced">
              <summary>
                <span>
                  <strong>Advanced Late credit</strong>
                  <small>Choose how much one Late record contributes.</small>
                </span>
                <b>
                  {Number(data.lateAttendanceCredit) === 1
                    ? "Full credit"
                    : Number(data.lateAttendanceCredit) === 0.5
                      ? "Half credit"
                      : "No credit"}
                </b>
              </summary>
              <div className="late-credit-panel">
                <div>
                  <strong>Late attendance deduction</strong>
                  <p>
                    The status remains Late in registers and audit logs. Only
                    its contribution to attendance percentage changes.
                  </p>
                </div>
                <div
                  className="late-credit-options"
                  role="group"
                  aria-label="Late attendance credit"
                >
                  {[
                    [1, "1", "No deduction"],
                    [0.5, "½", "Half credit"],
                    [0, "0", "No credit"],
                  ].map(([value, label, description]) => (
                    <button
                      key={value}
                      type="button"
                      className={
                        Number(data.lateAttendanceCredit) === value
                          ? "active"
                          : ""
                      }
                      aria-pressed={Number(data.lateAttendanceCredit) === value}
                      disabled={!can("settings.manageLateMode") || creditBusy}
                      onClick={() => setLateCredit(value)}
                    >
                      <b>{label}</b>
                      <span>{description}</span>
                    </button>
                  ))}
                </div>
                <small className="late-credit-note">
                  Admin++ only · The selected value is copied into each newly
                  opened session, so historical reports never change later.
                </small>
              </div>
            </details>
          )}
          <label>
            Late threshold (minutes)
            <input
              name="lateThresholdMinutes"
              type="number"
              min="1"
              max="120"
              defaultValue={data.lateThresholdMinutes}
              disabled={!can("settings.manage") || !data.lateModeEnabled}
              required
            />
            <small>
              {data.lateModeEnabled
                ? "Copied into each newly opened session."
                : "Disabled because Late Mode is off."}
            </small>
          </label>
          <label className="check">
            <input
              name="crCanCorrectRecent"
              type="checkbox"
              defaultChecked={data.crCanCorrectRecent}
              disabled={!can("settings.manage")}
            />
            <span>Allow CR correction during active sessions</span>
          </label>
          <label>
            Attendance target (%)
            <input
              name="attendanceTargetPercentage"
              type="number"
              min="1"
              max="100"
              defaultValue={data.attendanceTargetPercentage ?? 75}
              disabled={!can("settings.manage")}
              required
            />
            <small>Used for student risk labels and recovery guidance.</small>
          </label>
        </section>
        <section className="panel settings-panel">
          <div className="settings-heading">
            <Building2 />
            <div>
              <h2>Institution profile</h2>
              <p>Global identity shared by every class workspace.</p>
            </div>
          </div>
          <label>
            Institution name
            <input
              name="institutionName"
              defaultValue={data.institutionName}
              disabled={!can("settings.manage")}
              required
            />
          </label>
          <label>
            Institution code
            <input
              name="institutionCode"
              defaultValue={data.institutionCode || ""}
              disabled={!can("settings.manage")}
              placeholder="Optional short code"
            />
          </label>
          <label>
            Campus / location
            <input
              name="campusName"
              defaultValue={data.campusName || ""}
              disabled={!can("settings.manage")}
              placeholder="Optional campus name"
            />
          </label>
          <label>
            Timezone
            <select
              name="timezone"
              defaultValue={data.timezone}
              disabled={!can("settings.manage")}
            >
              <option>Asia/Kolkata</option>
            </select>
          </label>
          <div className="settings-class-handoff">
            <div>
              <span className="eyebrow">ACTIVE CLASS</span>
              <strong>{selectedClass?.displayName || "No class selected"}</strong>
              <small>
                {selectedClass
                  ? [
                      selectedClass.course,
                      selectedClass.specialization,
                      selectedClass.semester && `Semester ${selectedClass.semester}`,
                      selectedClass.academicYear,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "Assign a class before continuing."}
              </small>
            </div>
            {can("classes.view") && (
              <button
                type="button"
                className="secondary"
                onClick={() => navigate("/classes")}
              >
                Manage classes
              </button>
            )}
          </div>
        </section>
        <div className="settings-save">
          {can("settings.manage") && (
            <button className="primary" disabled={saving}>
              <Save />
              {saving ? "Saving…" : "Save settings"}
            </button>
          )}
        </div>
      </form>
      {can("settings.managePermissions") && (
        <section className="panel permission-policy-panel">
          <div className="settings-heading">
            <SlidersHorizontal />
            <div>
              <span className="eyebrow">CONFIG.YML</span>
              <h2>Permission policy</h2>
              <p>
                Configure CR, FACULTY, and ADMIN access. ADMIN++ is
                CLI-controlled and permanently retains every capability.
              </p>
            </div>
          </div>
          {!policy ? (
            <form className="permission-unlock" onSubmit={unlockPolicy}>
              <span>
                <KeyRound />
              </span>
              <div>
                <strong>Protected configuration</strong>
                <small>Confirm your Admin++ password to edit config.yml.</small>
              </div>
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Admin++ password"
                required
              />
              <button className="primary" disabled={policyBusy}>
                {policyBusy ? "Verifying…" : "Unlock policy"}
              </button>
            </form>
          ) : (
            <>
              <div className="permission-matrix-wrap">
                <table className="permission-matrix">
                  <thead>
                    <tr>
                      <th>Capability</th>
                      <th>CR</th>
                      <th>FACULTY</th>
                      <th>ADMIN</th>
                      <th>ADMIN++</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(policy.permissions.ADMIN_PLUS).flatMap(
                      ([area, permissions]) => [
                        <tr className="permission-area" key={`${area}-heading`}>
                          <td colSpan="5">{area.replace(/([A-Z])/g, " $1")}</td>
                        </tr>,
                        ...Object.keys(permissions).map((permission) => (
                          <tr key={`${area}.${permission}`}>
                            <td>{permission.replace(/([A-Z])/g, " $1")}</td>
                            {["CR", "FACULTY", "ADMIN", "ADMIN_PLUS"].map((role) => (
                              <td key={role}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(
                                    policy.permissions[role]?.[area]?.[
                                      permission
                                    ],
                                  )}
                                  disabled={role === "ADMIN_PLUS" || policyBusy}
                                  aria-label={`${role} ${area}.${permission}`}
                                  onChange={(event) =>
                                    setPermission(
                                      role,
                                      area,
                                      permission,
                                      event.target.checked,
                                    )
                                  }
                                />
                              </td>
                            ))}
                          </tr>
                        )),
                      ],
                    )}
                  </tbody>
                </table>
              </div>
              <div className="permission-policy-actions">
                <span>
                  <ShieldCheck /> Protected boundaries and dependencies are
                  enforced on save.
                </span>
                <button
                  className="primary"
                  type="button"
                  disabled={policyBusy}
                  onClick={savePolicy}
                >
                  <Save /> {policyBusy ? "Saving…" : "Save permission policy"}
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
