"use client";

import { useEffect, useState, useCallback } from "react";

export default function DynamicBranding({ displayName: initialName = "", faviconEmoji: initialEmoji = "", faviconDataUrl: initialDataUrl = "" }) {
  const [state, setState] = useState(() => ({
    displayName: initialName || "",
    faviconEmoji: initialEmoji || "",
    faviconDataUrl: initialDataUrl || "",
  }));

  // Load from API settings on mount
  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        const newState = {
          displayName: data.displayName || initialName || "",
          faviconEmoji: data.faviconEmoji || initialEmoji || "",
          faviconDataUrl: data.faviconDataUrl || initialDataUrl || "",
        };
        setState(newState);
        return newState;
      }
    } catch {}
    return state;
  };

  useEffect(() => {
    // Load settings immediately
    loadSettings();
    
    // Also listen for updates from Profile page
    const handler = async (e) => {
      const { displayName, faviconEmoji, faviconDataUrl } = e.detail || {};
      
      const newState = { ...state };
      if (displayName !== undefined) newState.displayName = displayName;
      if (faviconEmoji !== undefined) newState.faviconEmoji = faviconEmoji;
      if (faviconDataUrl !== undefined) newState.faviconDataUrl = faviconDataUrl;
      
      setState(newState);
      
      // Also save to localStorage as backup
      try {
        localStorage.setItem("9router_branding", JSON.stringify(newState));
      } catch {}
    };
    
    window.addEventListener("9router:settings-updated", handler);
    return () => window.removeEventListener("9router:settings-updated", handler);
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
    const escapeXml = (str) => String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
    
    const makeFaviconSvg = (emoji) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" x="50%" text-anchor="middle" font-size="80" dominant-baseline="middle">${escapeXml(emoji)}</text></svg>`;
      return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
    };

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
    }
  }, [state]);

  return null;
}
