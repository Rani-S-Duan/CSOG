"use client";

import { useEffect, useRef, useState } from "react";

/** Scanner kamera (html5-qrcode) dalam bingkai neon. Memanggil onScan sekali lalu berhenti. */
export default function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const idRef = useRef(`qr-${Math.random().toString(36).slice(2)}`);
  const onScanRef = useRef(onScan);
  const [error, setError] = useState("");
  onScanRef.current = onScan;

  useEffect(() => {
    let cancelled = false;
    let started = false;
    let scanner: import("html5-qrcode").Html5Qrcode | null = null;
    let fired = false;

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;
      scanner = new Html5Qrcode(idRef.current);
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (text) => {
            if (fired) return;
            fired = true;
            onScanRef.current(text);
          },
          () => {}
        );
        started = true;
        if (cancelled) await scanner.stop();
      } catch {
        setError("Camera could not be opened. Allow camera access (requires HTTPS or localhost), or type the ID manually.");
      }
    })();

    return () => {
      cancelled = true;
      if (scanner && started) {
        scanner
          .stop()
          .then(() => scanner?.clear())
          .catch(() => {});
      }
    };
  }, []);

  return (
    <div className="space-y-2">
      <div className="scanner-frame scan-line mx-auto aspect-square w-full max-w-xs overflow-hidden bg-black">
        <div id={idRef.current} className="h-full w-full" />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="button" className="btn-neon w-full" onClick={onClose}>
        Close camera
      </button>
    </div>
  );
}
