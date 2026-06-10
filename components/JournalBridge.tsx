"use client";

import { useEffect, useRef } from "react";

interface Props {
  userId: string;
}

/**
 * JournalBridge
 *
 * Injects the full vanilla-JS journal HTML into the page as a self-contained
 * unit. This preserves 100% of V1 functionality immediately while React
 * components are built incrementally to replace each view.
 *
 * The journal HTML file is served from /public/journal.html and fetched
 * client-side so Next.js never tries to SSR it (it uses localStorage,
 * browser globals, etc.).
 *
 * Migration path: once a view is fully ported to React, remove it from
 * journal.html and add the React component above this bridge. When all views
 * are ported, delete this file.
 */
export default function JournalBridge({ userId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    fetch("/journal.html")
      .then((r) => r.text())
      .then((html) => {
        // Strip the outer <html>/<head>/<body> wrappers — we only want the
        // content inside <body> and the <style>/<script> tags.
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        // Inject styles
        doc.querySelectorAll("style").forEach((style) => {
          const clone = document.createElement("style");
          clone.textContent = style.textContent;
          document.head.appendChild(clone);
        });

        // Inject external script tags (chart.js CDN)
        const loadScripts = async () => {
          const scripts = Array.from(doc.querySelectorAll("script"));
          for (const s of scripts) {
            if (s.src) {
              await new Promise<void>((resolve) => {
                const el = document.createElement("script");
                el.src = s.src;
                el.onload = () => resolve();
                el.onerror = () => resolve();
                document.head.appendChild(el);
              });
            }
          }
          // Now inject inline scripts
          for (const s of scripts) {
            if (!s.src && s.textContent) {
              const el = document.createElement("script");
              el.textContent = s.textContent;
              document.body.appendChild(el);
            }
          }
        };

        // Inject body content
        container.innerHTML = doc.body.innerHTML;
        loadScripts();
      })
      .catch((err) => {
        console.error("JournalBridge failed to load journal.html", err);
        if (container) {
          container.innerHTML = `
            <div style="padding:40px;text-align:center;color:var(--mut)">
              <p style="font-size:15px">Journal failed to load.</p>
              <p style="font-size:12px;margin-top:8px">Check that /public/journal.html exists.</p>
            </div>
          `;
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      id="journal-root"
      style={{ minHeight: "calc(100vh - 41px)" }}
    />
  );
}
