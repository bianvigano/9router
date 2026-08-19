"use client";

import { useEffect, useState } from "react";

function escapeXml(str) {
  return str
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
  const [state, setState] = useState({
    displayName: initialName,
    faviconEmoji: initialEmoji,
    faviconDataUrl: initialDataUrl,
  });

  // Listen for settings-updated events from Profile page
  useEffect(() => {
    const handler = (e) => {
      const { displayName, faviconEmoji, faviconDataUrl } = e.detail || {};
      setState({
        displayName: displayName ?? state.displayName,
        faviconEmoji: faviconEmoji ?? state.faviconEmoji,
        faviconDataUrl: faviconDataUrl ?? state.faviconDataUrl,
      });
    };
    window.addEventListener("9router:settings-updated", handler);
    return () => window.removeEventListener("9router:settings-updated", handler);
  }, [state]);

  // Apply title & favicon to DOM
  useEffect(() => {
    if (!document) return;
    const { displayName, faviconEmoji, faviconDataUrl } = state;

    // Update document title
    const baseTitle = "9Router - AI Infrastructure Management";
    if (displayName && typeof displayName === "string" && displayName.trim()) {
      document.title = `${displayName.trim()} | 9Router`;
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
    }
  }, [state]);

  return null;
}
