import { useEffect, useState } from "react";
import { Save, TimerReset } from "lucide-react";
import { api, messageOf } from "../api.js";
import { useToast } from "../state/ToastContext.jsx";
export function SettingsPage() {
  const [data, setData] = useState(null),
    [saving, setSaving] = useState(false),
    toast = useToast();
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
      setData((await api.put("/admin/settings", payload)).data);
      toast("System settings saved.");
    } catch (x) {
      toast(messageOf(x), "error");
    } finally {
      setSaving(false);
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
        <section className="panel">
          <div className="settings-heading">
            <TimerReset />
            <div>
              <h2>Attendance rules</h2>
              <p>The threshold is snapshotted on every new session.</p>
            </div>
          </div>
          <label>
            Late threshold (minutes)
            <input
              name="lateThresholdMinutes"
              type="number"
              min="1"
              max="120"
              defaultValue={data.lateThresholdMinutes}
              required
            />
            <small>
              At exactly this many minutes after the start, marks become LATE
              with zero credit.
            </small>
          </label>
          <label className="check">
            <input
              name="crCanCorrectRecent"
              type="checkbox"
              defaultChecked={data.crCanCorrectRecent}
            />
            <span>Allow CR correction during active sessions</span>
          </label>
        </section>
        <section className="panel">
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
              required
            />
          </label>
          <label>
            Class / section
            <input name="className" defaultValue={data.className} required />
          </label>
          <label>
            Academic session
            <input
              name="academicSession"
              defaultValue={data.academicSession}
              required
            />
          </label>
          <label>
            Timezone
            <select name="timezone" defaultValue={data.timezone}>
              <option>Asia/Kolkata</option>
            </select>
          </label>
        </section>
        <div className="settings-save">
          <button className="primary" disabled={saving}>
            <Save />
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
