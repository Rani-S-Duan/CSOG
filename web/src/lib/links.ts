/** QR item berisi link ke website resmi: https://domain/?item=ITEM-102-07. QR karton tetap ID biasa. */

export const siteBase = () =>
  (process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/+$/, "");

export const itemLink = (base: string, id: string) => `${base.replace(/\/+$/, "")}/?item=${id}`;

/** Nilai yang dicetak ke QR: item -> link, karton -> ID biasa. */
export const qrValueFor = (base: string) => (id: string) => (id.startsWith("ITEM-") ? itemLink(base, id) : id);

/** Hasil scan bisa berupa link (?item=ID) atau ID biasa. Kembalikan ID (huruf besar). */
export function parseScan(raw: string): string {
  const t = raw.trim();
  try {
    const u = new URL(t);
    const id = u.searchParams.get("item");
    if (id) return id.trim().toUpperCase();
  } catch {
    // bukan URL: anggap ID biasa
  }
  return t.toUpperCase();
}
