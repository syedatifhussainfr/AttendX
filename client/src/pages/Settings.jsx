import { useEffect, useState } from "react";
import { Clock3, Save, ShieldCheck, TimerReset } from "lucide-react";
import { api, messageOf } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";
import { useAuth } from "../state/AuthContext.jsx";
export function SettingsPage() {
  const [data, setData] = useState(null),
    [saving, setSaving] = useState(false),
    [lateBusy, setLateBusy] = useState(false),
    toast = useToast(),
    { can } = useAuth();
  useEffect(() => {
    api
      .get("/admin/settings")
      .then((r) => setData(r.data))
      .catch((e) => toast(messageOf(e), "error"));
  }, []);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const payload = {
        ...f,
        lateThresholdMinutes: Number(f.lateThresholdMinutes),
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
              disabled={!can("settings.manage")}
              required
            />
            <small>
              Used only when Late Mode is enabled. The value is copied into
              each newly opened session.
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
    </div>
  );
}
