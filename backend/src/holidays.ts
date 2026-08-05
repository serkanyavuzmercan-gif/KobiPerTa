import Holidays from "date-holidays";

type HolidayDay = { date: string; name: string };

/** Convert instant to YYYY-MM-DD in Europe/Istanbul (UTC+3, no DST). */
function toTrDateString(d: Date): string {
  const local = new Date(d.getTime() + 180 * 60_000);
  return local.toISOString().slice(0, 10);
}

function addOneDay(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/** Expand date-holidays public entries into one row per calendar day. */
export function getTurkeyPublicHolidays(year: number): HolidayDay[] {
  const hd = new Holidays("TR");
  const list = hd.getHolidays(year).filter((h) => h.type === "public");
  const byDate = new Map<string, string>();

  for (const h of list) {
    const start = new Date(h.start);
    const end = new Date(h.end);
    let day = toTrDateString(start);
    const last = toTrDateString(new Date(end.getTime() - 1));
    while (day <= last) {
      if (!byDate.has(day)) byDate.set(day, h.name);
      day = addOneDay(day);
    }
  }

  return [...byDate.entries()]
    .map(([date, name]) => ({ date, name }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
