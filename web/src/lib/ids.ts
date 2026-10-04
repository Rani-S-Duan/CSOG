/** ID QR: teks sederhana, mis. KARTON-101 / ITEM-101-07. */
export const normalizeId = (raw: string) => raw.trim().toUpperCase();

export const isCartonId = (id: string) => id.startsWith("KARTON-");
export const isItemId = (id: string) => id.startsWith("ITEM-");

/** KARTON-101 -> ["ITEM-101-01", ... "ITEM-101-10"] */
export function genItemCodes(cartonCode: string): string[] {
  const suffix = cartonCode.replace(/^KARTON-/, "");
  return Array.from({ length: 10 }, (_, i) => `ITEM-${suffix}-${String(i + 1).padStart(2, "0")}`);
}
