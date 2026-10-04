"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Lembar label QR untuk dicetak. ids[0] = karton, sisanya item.
 * Label karton menampilkan ID (untuk gudang). Label item hanya QR (berisi link) + nomor urut #01..#10;
 * ID unik item tampil di halaman hasil verifikasi, bukan di label.
 */
export default function QrSheet({ title, ids, qrValue }: { title: string; ids: string[]; qrValue?: (id: string) => string }) {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    Promise.all(
      ids.map(async (id) => [id, await QRCode.toDataURL(qrValue ? qrValue(id) : id, { width: 240, margin: 2, errorCorrectionLevel: "M" })] as const)
    ).then((pairs) => alive && setImages(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, qrValue?.("ITEM-0")]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-cyan-400">{title}</h3>
        <button type="button" className="btn-neon" onClick={() => window.print()}>
          Print labels
        </button>
      </div>
      <div className="print-area grid grid-cols-2 gap-3 bg-white p-3 sm:grid-cols-3 md:grid-cols-4">
        {ids.map((id, i) => {
          const isCarton = id.startsWith("KARTON-");
          return (
            <figure key={id} className="flex flex-col items-center border border-zinc-300 p-2 text-black">
              {images[id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[id]} alt={isCarton ? `QR ${id}` : `QR item ${i}`} className="h-28 w-28" />
              ) : (
                <div className="h-28 w-28 animate-pulse bg-zinc-200" />
              )}
              <figcaption className="mt-1 font-mono text-xs font-bold">
                {isCarton ? id : `#${String(i).padStart(2, "0")}`}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
