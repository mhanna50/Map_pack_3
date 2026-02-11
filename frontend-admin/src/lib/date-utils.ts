export function formatDate(date?: string | null) {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(date?: string | null) {
  if (!date) return "—";
  const d = new Date(date);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff / 1000);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60 * 60 * 24 * 365, "year"],
    [60 * 60 * 24 * 30, "month"],
    [60 * 60 * 24, "day"],
    [60 * 60, "hour"],
    [60, "minute"],
    [1, "second"],
  ];
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [sec, unit] of units) {
    if (abs >= sec || unit === "second") {
      const value = Math.round(diff / sec);
      return rtf.format(value, unit);
    }
  }
  return "just now";
}
