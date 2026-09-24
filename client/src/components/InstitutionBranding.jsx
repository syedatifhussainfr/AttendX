import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  Clock3,
  ImagePlus,
  LoaderCircle,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { api, messageOf, setAdminElevation } from "../api.js";
import { useBranding } from "../state/BrandingContext.jsx";
import { useToast } from "../state/ToastContext.jsx";
import { Dialog } from "./Dialog.jsx";
import { ManualEntryInput } from "./ManualEntryInput.jsx";

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const SECURE_UPLOAD_MILLISECONDS = 10_000;
const fileSize = (bytes) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function readImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const dimensions = { width: image.naturalWidth, height: image.naturalHeight, url };
      resolve(dimensions);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected file is not a readable image."));
    };
    image.src = url;
  });
}

async function inspectLogo(file) {
  if (!file) return null;
  if (!/\.(png|jpe?g)$/i.test(file.name) || !["image/png", "image/jpeg"].includes(file.type))
    throw new Error("Choose a PNG, JPG, or JPEG image only.");
  if (file.size > MAX_LOGO_BYTES) throw new Error("Logo files must be 2 MB or smaller.");
  const dimensions = await readImage(file);
  if (
    dimensions.width < 32 ||
    dimensions.height < 32 ||
    dimensions.width > 4096 ||
    dimensions.height > 4096 ||
    dimensions.width * dimensions.height > 12_000_000
  ) {
    URL.revokeObjectURL(dimensions.url);
    throw new Error("Logo dimensions must be 32–4096 px per side and below 12 megapixels.");
  }
  return { file, ...dimensions };
}

export function InstitutionBranding({ canManage }) {
  const { branding, applyBranding } = useBranding();
  const toast = useToast();
  const [profile, setProfile] = useState({
    institutionName: branding.institutionName,
    institutionCode: branding.institutionCode || "",
    campusName: branding.campusName || "",
  });
  const [primary, setPrimary] = useState(null);
  const [secondary, setSecondary] = useState(null);
  const [favicon, setFavicon] = useState(null);
  const [removeSecondary, setRemoveSecondary] = useState(false);
  const [removeFavicon, setRemoveFavicon] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, label: "", eta: 0 });
  const controllerRef = useRef(null);

  useEffect(() => {
    if (busy || confirmOpen) return;
    setProfile({
      institutionName: branding.institutionName,
      institutionCode: branding.institutionCode || "",
      campusName: branding.campusName || "",
    });
  }, [branding, busy, confirmOpen]);
  useEffect(() => () => primary?.url && URL.revokeObjectURL(primary.url), [primary?.url]);
  useEffect(() => () => secondary?.url && URL.revokeObjectURL(secondary.url), [secondary?.url]);
  useEffect(() => () => favicon?.url && URL.revokeObjectURL(favicon.url), [favicon?.url]);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const chooseLogo = (slot) => async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const inspected = await inspectLogo(file);
      const setter =
        slot === "primary" ? setPrimary : slot === "secondary" ? setSecondary : setFavicon;
      setter((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return inspected;
      });
      if (slot === "secondary") setRemoveSecondary(false);
      if (slot === "favicon") setRemoveFavicon(false);
    } catch (error) {
      toast(error.message, "error");
    }
  };

  const primaryPreview = primary?.url || branding.primaryLogoUrl;
  const secondaryPreview = removeSecondary
    ? null
    : secondary?.url || branding.secondaryLogoUrl;
  const faviconPreview = removeFavicon
    ? primaryPreview
    : favicon?.url ||
      (branding.assets.favicon ? branding.faviconUrl : primaryPreview);
  const changes = useMemo(
    () =>
      [
        profile.institutionName !== branding.institutionName && "institution name",
        profile.institutionCode !== (branding.institutionCode || "") && "institution code",
        profile.campusName !== (branding.campusName || "") && "campus",
        primary && "primary logo + favicon",
        secondary && "secondary logo",
        removeSecondary && "secondary logo removal",
        favicon && "dedicated favicon",
        removeFavicon && "favicon reset to primary logo",
      ].filter(Boolean),
    [profile, branding, primary, secondary, favicon, removeSecondary, removeFavicon],
  );

  const cancelUpload = () => controllerRef.current?.abort();
  const save = async (event) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const controller = new AbortController();
    controllerRef.current = controller;
    setBusy(true);
    try {
      setProgress({ percent: 3, label: "Confirming Admin++ authority", eta: 10 });
      const { data: elevation } = await api.post("/auth/elevate", {
        password: fields.get("password"),
      });
      setAdminElevation(elevation.elevationToken, elevation.expiresInSeconds);
      const payload = new FormData();
      Object.entries(profile).forEach(([key, value]) => payload.append(key, value));
      payload.append("confirmation", fields.get("confirmation"));
      payload.append("removeSecondary", String(removeSecondary));
      payload.append("removeFavicon", String(removeFavicon));
      if (primary) payload.append("primaryLogo", primary.file, primary.file.name);
      if (secondary) payload.append("secondaryLogo", secondary.file, secondary.file.name);
      if (favicon) payload.append("favicon", favicon.file, favicon.file.name);
      const startedAt = Date.now();
      let uploadedRatio = 0;
      const stageFor = (elapsed) =>
        elapsed < 2_000
          ? "Uploading encrypted form data"
          : elapsed < 4_500
            ? "Checking file signatures and structure"
            : elapsed < 7_000
              ? "Verifying dimensions and safety limits"
              : "Preparing atomic database apply";
      const ticker = window.setInterval(() => {
        const elapsed = Math.min(Date.now() - startedAt, SECURE_UPLOAD_MILLISECONDS);
        const timeRatio = elapsed / SECURE_UPLOAD_MILLISECONDS;
        setProgress({
          percent: Math.min(94, Math.max(8 + Math.round(timeRatio * 84), Math.round(uploadedRatio * 45))),
          label: stageFor(elapsed),
          eta: Math.max(0, Math.ceil((SECURE_UPLOAD_MILLISECONDS - elapsed) / 1000)),
        });
      }, 150);
      let response;
      try {
        response = await api.put("/branding", payload, {
          signal: controller.signal,
          onUploadProgress: (upload) => {
            if (upload.total) uploadedRatio = upload.loaded / upload.total;
          },
        });
      } finally {
        window.clearInterval(ticker);
      }
      const { data } = response;
      setProgress({ percent: 96, label: "Applying verified branding everywhere", eta: 0 });
      applyBranding(data);
      if (primary?.url) URL.revokeObjectURL(primary.url);
      if (secondary?.url) URL.revokeObjectURL(secondary.url);
      if (favicon?.url) URL.revokeObjectURL(favicon.url);
      setPrimary(null);
      setSecondary(null);
      setFavicon(null);
      setRemoveSecondary(false);
      setRemoveFavicon(false);
      setConfirmOpen(false);
      setProgress({ percent: 100, label: "Branding updated", eta: 0 });
      toast("Institution identity updated across AttendX.");
    } catch (error) {
      if (error.name === "CanceledError" || error.name === "AbortError")
        toast("Branding upload cancelled safely.");
      else toast(messageOf(error), "error");
    } finally {
      controllerRef.current = null;
      setBusy(false);
      setProgress({ percent: 0, label: "", eta: 0 });
    }
  };

  return (
    <section className="panel institution-branding-panel">
      <div className="settings-heading">
        <Building2 />
        <div>
          <span className="eyebrow">ADMIN++ · LIVE IDENTITY</span>
          <h2>Institution branding</h2>
          <p>One protected identity shared by navigation, login, security pages, favicon and exports.</p>
        </div>
      </div>
      <div className="branding-workspace">
        <div className="branding-preview" style={{ "--preview-logo": `url("${primaryPreview}")` }}>
          <div className="branding-preview-top">
            <span className="branding-preview-primary"><img src={primaryPreview} alt="Primary logo preview" /></span>
            {secondaryPreview && (
              <span className="branding-preview-secondary"><img src={secondaryPreview} alt="Secondary logo preview" /></span>
            )}
          </div>
          <div>
            <small>LIVE PREVIEW</small>
            <strong>{profile.institutionName || "Institution name"}</strong>
            <span>{[profile.institutionCode, profile.campusName].filter(Boolean).join(" · ") || "AttendX academic operations"}</span>
          </div>
        </div>
        <div className="branding-controls">
          <div className="branding-fields">
            <label>Institution name<input value={profile.institutionName} maxLength="120" disabled={!canManage} onChange={(e) => setProfile((v) => ({ ...v, institutionName: e.target.value }))} required /></label>
            <label>Institution code<input value={profile.institutionCode} maxLength="30" disabled={!canManage} onChange={(e) => setProfile((v) => ({ ...v, institutionCode: e.target.value }))} placeholder="Optional short code" /></label>
            <label className="full">Campus / location<input value={profile.campusName} maxLength="100" disabled={!canManage} onChange={(e) => setProfile((v) => ({ ...v, campusName: e.target.value }))} placeholder="Optional campus or city" /></label>
          </div>
          <div className="branding-logo-grid">
            <article>
              <header><span><ShieldCheck /></span><div><strong>Primary logo</strong><small>Required · app icon and favicon</small></div></header>
              <img src={primaryPreview} alt="Current primary logo" />
              <div><b>{primary?.file.name || branding.assets.primary?.name || "Bundled primary logo"}</b><small>{primary ? `${fileSize(primary.file.size)} · ${primary.width}×${primary.height}` : "PNG/JPEG · max 2 MB"}</small></div>
              {canManage && <label className="branding-file-button"><ImagePlus /> {primary ? "Choose another" : "Replace logo"}<input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={chooseLogo("primary")} /></label>}
            </article>
            <article className={!secondaryPreview ? "optional-empty" : ""}>
              <header><span><ImagePlus /></span><div><strong>Secondary logo</strong><small>Optional · partner mark</small></div></header>
              {secondaryPreview ? <img src={secondaryPreview} alt="Current secondary logo" /> : <span className="branding-empty-mark">Optional</span>}
              <div><b>{secondary?.file.name || branding.assets.secondary?.name || (secondaryPreview ? "Bundled secondary logo" : "Not displayed")}</b><small>{secondary ? `${fileSize(secondary.file.size)} · ${secondary.width}×${secondary.height}` : "Hidden automatically when unset"}</small></div>
              {canManage && <div className="branding-file-actions"><label className="branding-file-button"><UploadCloud /> {secondaryPreview ? "Replace" : "Add logo"}<input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={chooseLogo("secondary")} /></label>{secondaryPreview && <button type="button" className="branding-remove" onClick={() => { if (secondary?.url) URL.revokeObjectURL(secondary.url); setSecondary(null); setRemoveSecondary(true); }}><Trash2 /> Remove</button>}</div>}
            </article>
            <article className="branding-favicon-card">
              <header><span><ImagePlus /></span><div><strong>Favicon override</strong><small>Advanced · browser tab icon only</small></div></header>
              <span className="branding-favicon-preview"><img src={faviconPreview} alt="Selected favicon preview" /></span>
              <div><b>{favicon?.file.name || branding.assets.favicon?.name || "Using primary logo"}</b><small>{favicon ? `${fileSize(favicon.file.size)} · ${favicon.width}×${favicon.height}` : "Optional · primary logo remains the fallback"}</small></div>
              {canManage && <div className="branding-file-actions"><label className="branding-file-button"><UploadCloud /> {branding.assets.favicon || favicon ? "Replace favicon" : "Add favicon"}<input type="file" accept=".png,.jpg,.jpeg,image/png,image/jpeg" onChange={chooseLogo("favicon")} /></label>{(branding.assets.favicon || favicon) && !removeFavicon && <button type="button" className="branding-remove" onClick={() => { if (favicon?.url) URL.revokeObjectURL(favicon.url); setFavicon(null); setRemoveFavicon(true); }}><Trash2 /> Use primary</button>}</div>}
            </article>
          </div>
          <div className="branding-safety-note"><Check /><span><b>Strict upload policy</b> PNG/JPEG only · signature and dimension verification · 2 MB per file · 12 MP ceiling · rate limited</span></div>
          {canManage && <button type="button" className="primary branding-review" disabled={!changes.length || !profile.institutionName.trim()} onClick={() => setConfirmOpen(true)}><ShieldCheck /> Review {changes.length || ""} change{changes.length === 1 ? "" : "s"}</button>}
        </div>
      </div>
      <Dialog open={confirmOpen} title="Confirm institution identity" onClose={() => !busy && setConfirmOpen(false)}>
        <form className="form-stack branding-confirm-form" onSubmit={save}>
          <div className="branding-confirm-summary"><ShieldCheck /><div><strong>Admin++ protected change</strong><p>{changes.length ? changes.join(" · ") : "No pending changes"}</p></div></div>
          {!busy ? <>
            <label>Type <code>UPDATE BRANDING</code><ManualEntryInput id="branding-update-confirmation" name="confirmation" type="text" expected="UPDATE BRANDING" pattern="UPDATE BRANDING" required /></label>
            <label>Your Admin++ password<ManualEntryInput id="branding-update-password" name="password" required /></label>
            <small className="branding-confirm-note">Upload begins only after confirmation. AttendX verifies the password, uploads through the protected route, validates the real file content, then holds a cancellable 10-second server commit window before applying all changes atomically.</small>
          </> : <div className="branding-upload-progress" aria-live="polite"><span><LoaderCircle /></span><div><strong>{progress.label}</strong><small>{progress.eta ? `Secure apply in about ${progress.eta}s` : "Final server verification"}</small><div className="branding-upload-stages"><b className={progress.percent >= 8 ? "done" : "active"}>Upload</b><b className={progress.percent >= 28 ? "done" : ""}>Signature</b><b className={progress.percent >= 50 ? "done" : ""}>Dimensions</b><b className={progress.percent >= 78 ? "done" : ""}>Apply</b></div><i><b style={{ width: `${progress.percent}%` }} /></i><em>{progress.percent}%</em></div></div>}
          <div className="dialog-actions">
            <button type="button" className="secondary" onClick={busy ? cancelUpload : () => setConfirmOpen(false)}>{busy ? <><X /> Cancel upload</> : "Go back"}</button>
            {!busy && <button className="primary"><UploadCloud /> Verify and upload</button>}
          </div>
        </form>
      </Dialog>
    </section>
  );
}
