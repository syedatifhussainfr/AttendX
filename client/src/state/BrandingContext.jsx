import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const fallbackBranding = {
  institutionName: "EIILM Kolkata",
  institutionCode: "EIILM",
  campusName: "",
  primaryLogoUrl: "/brand/eiilm.png",
  secondaryLogoUrl: "/brand/ekcle.png",
  faviconUrl: "/brand/eiilm.png",
  assets: { primary: null, secondary: null, favicon: null },
};
const BrandingContext = createContext(null);

function applyDocumentBranding(branding) {
  document.title = `AttendX · ${branding.institutionName}`;
  document.documentElement.style.setProperty(
    "--institution-logo",
    `url("${branding.primaryLogoUrl.replace(/["\\]/g, "")}")`,
  );
  let favicon = document.querySelector('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.href = branding.faviconUrl || branding.primaryLogoUrl;
}

export function BrandingProvider({ children }) {
  const [branding, setBrandingState] = useState(fallbackBranding);
  const [ready, setReady] = useState(false);
  const applyBranding = useCallback((next) => {
    const normalized = { ...fallbackBranding, ...next };
    setBrandingState(normalized);
    applyDocumentBranding(normalized);
    window.dispatchEvent(
      new CustomEvent("attendx:branding-updated", { detail: normalized }),
    );
    return normalized;
  }, []);
  const refreshBranding = useCallback(async () => {
    const response = await fetch("/api/branding", {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Institution branding could not be loaded.");
    return applyBranding(await response.json());
  }, [applyBranding]);
  useEffect(() => {
    refreshBranding()
      .catch(() => applyDocumentBranding(fallbackBranding))
      .finally(() => setReady(true));
  }, [refreshBranding]);
  const value = useMemo(
    () => ({ branding, ready, applyBranding, refreshBranding }),
    [branding, ready, applyBranding, refreshBranding],
  );
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export const useBranding = () => useContext(BrandingContext);
