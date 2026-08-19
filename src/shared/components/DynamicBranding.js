"use client";

import { useEffect, useState, useCallback } from "react";

const BRANDING_STORAGE_KEY = "9router_branding_v1";

function escapeXml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function makeFaviconSvg(emoji) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" x="50%" text-anchor="middle" font-size="80" dominant-baseline="middle">${escapeXml(emoji)}</text></svg>`;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

export default function DynamicBranding({ displayName: initialName = "", faviconEmoji: initialEmoji = "", faviconDataUrl: initialDataUrl = "" }) {
  // State with hydration support
  const [state, setState] = useState(() => {
    // Try to restore from localStorage first (survives reload)
    if (typeof window === "undefined") return {};
    
    try {
      const saved = localStorage.getItem(BRANDING_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.displayName && typeof parsed.displayName === "string") {
          return parsed;
        }
      }
    } catch {}
    
    // Fallback to server-provided props
    return {
      displayName: initialName || "",
      faviconEmoji: initialEmoji || "",
      faviconDataUrl: initialDataUrl || "",
    };
  });

  const saveToStorage = useCallback((newState) => {
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem(BRANDING_STORAGE_KEY, JSON.stringify(newState));
      }
    } catch {}
  }, []);

  // Apply title & favicon to DOM
  useEffect(() => {
    if (!document) return;
    const { displayName, faviconEmoji, faviconDataUrl } = state;

    // Update document title
    const baseTitle = "9Router - AI Infrastructure Management";
    if (displayName && typeof displayName === "string" && displayName.trim()) {
      document.title = `${displayName.trim()} | ${baseTitle}`;
    } else {
      document.title = baseTitle;
    }

    // Update favicon
    let iconHref = "";
    if (faviconDataUrl && typeof faviconDataUrl === "string" && faviconDataUrl.trim().startsWith("data:")) {
      iconHref = faviconDataUrl.trim();
    } else if (faviconEmoji && typeof faviconEmoji === "string" && faviconEmoji.trim()) {
      iconHref = makeFaviconSvg(faviconEmoji.trim());
    }

    if (iconHref) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = iconHref;
      link.type = iconHref.startsWith("data:image/svg") ? "image/svg+xml" : "";
      
      // Save to localStorage immediately after first load
      saveToStorage(state);
    }
  }, [state, saveToStorage]);

  // Listen for settings-updated events from Profile page
  useEffect(() => {
    const handler = (e) => {
      const newState = { ...state };
      const { displayName, faviconEmoji, faviconDataUrl } = e.detail || {};
      if (displayName !== undefined) newState.displayName = displayName;
      if (faviconEmoji !== undefined) newState.faviconEmoji = faviconEmoji;
      if (faviconDataUrl !== undefined) newState.faviconDataUrl = faviconDataUrl;
      
      setState(newState);
      saveToStorage(newState); // Persist to localStorage
    };
    window.addEventListener("9router:settings-updated", handler);
    return () => window.removeEventListener("9router:settings-updated", handler);
  }, [state, saveToStorage]);

  return null;
}
