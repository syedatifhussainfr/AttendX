import { useEffect, useState } from "react";
import { Clock3, KeyRound, Save, ShieldCheck, SlidersHorizontal, TimerReset } from "lucide-react";
import { api, messageOf, setAdminElevation } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
export function SettingsPage() {
  const [data, setData] = useState(null),
    [saving, setSaving] = useState(false),
    [lateBusy, setLateBusy] = useState(false),
    [policy, setPolicy] = useState(null),
    [policyBusy, setPolicyBusy] = useState(false),
    toast = useToast(),
    { can } = useAuth();
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
          <div className={`late-mode-control ${data.lateModeEnabled ? "enabled" : "disabled"}`}>
            <span className="late-mode-icon"><Clock3 /></span>
            <div>
              <span className="late-mode-title">
                <strong>Late Mode</strong>
                <small><ShieldCheck /> Admin++ only</small>
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
        </section>
        <section className="panel settings-panel">
          <div className="settings-heading">
            <div>
              <h2>College & class</h2>
              <p>Shown throughout the workspace and reports.</p>
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
            Class / section
            <input name="className" defaultValue={data.className} disabled={!can("settings.manage")} required />
          </label>
          <label>
            Academic session
            <input
              name="academicSession"
              defaultValue={data.academicSession}
              disabled={!can("settings.manage")}
              required
            />
          </label>
          <label>
            Timezone
            <select name="timezone" defaultValue={data.timezone} disabled={!can("settings.manage")}>
              <option>Asia/Kolkata</option>
            </select>
          </label>
        </section>
        <div className="settings-save">
          {can("settings.manage") && <button className="primary" disabled={saving}>
            <Save />
            {saving ? "Saving…" : "Save settings"}
          </button>}
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
                Configure ADMIN and CR access. ADMIN++ is CLI-controlled and
                permanently retains every capability.
              </p>
            </div>
          </div>
          {!policy ? (
            <form className="permission-unlock" onSubmit={unlockPolicy}>
              <span><KeyRound /></span>
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
                    <tr><th>Capability</th><th>CR</th><th>ADMIN</th><th>ADMIN++</th></tr>
                  </thead>
                  <tbody>
                    {Object.entries(policy.permissions.ADMIN_PLUS).flatMap(
                      ([area, permissions]) => [
                        <tr className="permission-area" key={`${area}-heading`}>
                          <td colSpan="4">{area.replace(/([A-Z])/g, " $1")}</td>
                        </tr>,
                        ...Object.keys(permissions).map((permission) => (
                          <tr key={`${area}.${permission}`}>
                            <td>{permission.replace(/([A-Z])/g, " $1")}</td>
                            {['CR', 'ADMIN', 'ADMIN_PLUS'].map((role) => (
                              <td key={role}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(policy.permissions[role]?.[area]?.[permission])}
                                  disabled={role === 'ADMIN_PLUS' || policyBusy}
                                  aria-label={`${role} ${area}.${permission}`}
                                  onChange={(event) => setPermission(role, area, permission, event.target.checked)}
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
                <span><ShieldCheck /> Protected boundaries and dependencies are enforced on save.</span>
                <button className="primary" type="button" disabled={policyBusy} onClick={savePolicy}>
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
