import { createHmac } from "crypto";
import { differenceInMinutes, format } from "date-fns";
import type { AttendanceRecord, CompanySettings } from "@prisma/client";

export function todayWorkDate(offsetMinutes: number): string {
  const now = new Date(Date.now() + offsetMinutes * 60_000);
  return now.toISOString().slice(0, 10);
}

export function parseHmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

export function currentMinutesOfDay(offsetMinutes: number): number {
  const now = new Date(Date.now() + offsetMinutes * 60_000);
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** QR payload rotates every 60 seconds */
export function buildQrToken(secret: string, at = Date.now()): string {
  const slot = Math.floor(at / 60_000);
  return createHmac("sha256", secret).update(String(slot)).digest("hex").slice(0, 24);
}

export function verifyQrToken(secret: string, token: string): boolean {
  const now = Date.now();
  return [0, -1, 1].some((delta) => buildQrToken(secret, now + delta * 60_000) === token);
}

export function dayPairs(records: AttendanceRecord[]) {
  const sorted = [...records].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );
  const checkIn = sorted.find((r) => r.type === "CHECK_IN") ?? null;
  const checkOut = sorted.find((r) => r.type === "CHECK_OUT") ?? null;
  return { checkIn, checkOut };
}

export function computeDayMinutes(
  checkIn: Date | null,
  checkOut: Date | null,
  settings: CompanySettings
): { worked: number; overtime: number; incomplete: boolean } {
  if (!checkIn || !checkOut) {
    return { worked: 0, overtime: 0, incomplete: Boolean(checkIn && !checkOut) };
  }

  let worked = Math.max(0, differenceInMinutes(checkOut, checkIn));
  if (settings.deductBreak) {
    worked = Math.max(0, worked - settings.breakMinutes);
  }

  const workEndMin = parseHmToMinutes(settings.workEnd);
  const outDate = new Date(
    checkOut.getTime() + settings.timezoneOffsetMinutes * 60_000
  );
  const outMin = outDate.getUTCHours() * 60 + outDate.getUTCMinutes();
  const overtime = Math.max(0, outMin - workEndMin);

  return { worked, overtime, incomplete: false };
}

export function monthKey(date = new Date()): string {
  return format(date, "yyyy-MM");
}

export function isDateInMonth(workDate: string, yearMonth: string): boolean {
  return workDate.startsWith(yearMonth);
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}s ${m}dk`;
}

export function parseWorkDateTime(workDate: string, hm: string, offsetMinutes: number): Date {
  // workDate YYYY-MM-DD, hm HH:mm in company local time → UTC Date
  const [y, mo, d] = workDate.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, h, mi) - offsetMinutes * 60_000;
  return new Date(utcMs);
}

export function toLocalHm(date: Date, offsetMinutes: number): string {
  const local = new Date(date.getTime() + offsetMinutes * 60_000);
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}
