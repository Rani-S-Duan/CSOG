"use client";

import { useState } from "react";
import QrScanner from "./QrScanner";
import { parseScan } from "@/lib/links";

/** Input ID: scan kamera, atau ketik manual (bisa dimatikan dengan allowManual=false). */
export default function ScanOrType({
  placeholder,
  onId,
  buttonLabel = "Search",
  allowManual = true,
}: {
  placeholder: string;
  onId: (id: string) => void;
  buttonLabel?: string;
  allowManual?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const submit = (raw: string) => {
    const id = parseScan(raw);
    if (id) onId(id);
  };

  return (
    <div className="space-y-3">
      {open ? (
        <QrScanner
          onScan={(t) => {
            setOpen(false);
            setText(parseScan(t));
            submit(t);
          }}
          onClose={() => setOpen(false)}
        />
      ) : (
        <button type="button" className="btn-neon w-full" onClick={() => setOpen(true)}>
          Open camera & scan QR
        </button>
      )}
      {allowManual && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
        >
          <input
            className="input-neon"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            aria-label="ID from QR code"
          />
          <button type="submit" className="btn-neon shrink-0">
            {buttonLabel}
          </button>
        </form>
      )}
    </div>
  );
}
