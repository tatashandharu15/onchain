export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const idrFmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export const fmtUsd = (v: number | null) => (v === null ? "—" : usdFmt.format(v));
export const fmtIdr = (v: number | null) => (v === null ? "—" : idrFmt.format(v));

export function fmtAmount(v: number) {
  if (v === 0) return "0";
  if (v < 0.0001) return "<0.0001";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: v < 1 ? 6 : 4 }).format(v);
}
