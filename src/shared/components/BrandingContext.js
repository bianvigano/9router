"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { APP_CONFIG } from "@/shared/constants/config";

const BrandingContext = createContext(null);

export function BrandingProvider({ children, initialDisplayName = "" }) {
  const [displayName, setDisplayName] = useState(initialDisplayName || "");

  // Fetch from settings on mount (client-side, so it overrides SSR default)
  useEffect(() => {
    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.displayName) setDisplayName(data.displayName);
      })
      .catch(() => {});
  }, []);

  // Listen for live updates from Profile page save
  useEffect(() => {
    const handler = (e) => {
      const name = e.detail?.displayName;
      if (name !== undefined) setDisplayName(name);
    };
    window.addEventListener("9router:settings-updated", handler);
    return () => window.removeEventListener("9router:settings-updated", handler);
  }, []);

  // Effective name: user-set displayName or fallback to APP_CONFIG.name
  const effectiveName = displayName?.trim() || APP_CONFIG.name;

  const updateName = useCallback((name) => setDisplayName(name || ""), []);

  return (
    <BrandingContext.Provider value={{ displayName, effectiveName, updateName }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    // Fallback if used outside provider
    return { displayName: "", effectiveName: APP_CONFIG.name, updateName: () => {} };
  }
  return ctx;
}
