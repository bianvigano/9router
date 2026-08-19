"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { APP_CONFIG } from "@/shared/constants/config";

const BrandingContext = createContext(null);

export function BrandingProvider({ children }) {
  const [displayName, setDisplayName] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // Load displayName from settings on mount
  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data?.displayName && typeof data.displayName === "string") {
          setDisplayName(data.displayName.trim());
        }
      }
    } catch (err) {
      console.warn("[Branding] Failed to load settings:", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Try to load immediately, also poll after initial page load in case auth just completed
    loadSettings();
    
    const timeout = setTimeout(loadSettings, 500);
    return () => clearTimeout(timeout);
  }, []);

  // Listen for live updates from Profile page save
  useEffect(() => {
    const handler = (e) => {
      const name = e.detail?.displayName;
      if (name !== undefined) setDisplayName(name);
      setIsLoading(false);
    };
    window.addEventListener("9router:settings-updated", handler);
    return () => window.removeEventListener("9router:settings-updated", handler);
  }, []);

  // Effective name: user-set displayName or fallback to APP_CONFIG.name
  const effectiveName = isLoading ? "9Router Proxy" : (displayName?.trim() || APP_CONFIG.name);

  const updateName = useCallback((name) => setDisplayName(name || ""), []);

  return (
    <BrandingContext.Provider value={{ displayName, isLoading, effectiveName, updateName }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) {
    // Fallback if used outside provider
    return { displayName: "", isLoading: false, effectiveName: APP_CONFIG.name, updateName: () => {} };
  }
  return ctx;
}
