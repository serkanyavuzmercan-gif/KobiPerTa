import type { AttendanceRecord, CompanySettings } from "@prisma/client";
import {
  daySessions,
  hmToDisplayHms,
  parseHmToMinutes,
  toLocalHm,
  toLocalHms,
} from "./utils";

export const OT_MULTIPLIER = 1.5;
export const DEFAULT_SALARY = 40_000;

export type PairPayroll = {
  checkIn: string;
  checkOut: string;
  /** Display: HH.mm:ss */
  checkInHms: string;
  /** Display: HH.mm:ss */
  checkOutHms: string;
  autoCheckout: boolean;
  normalMinutes: number;
  /** Minutes paid at 1.5x (weekday outside window, or all minutes on premium days) */
  otBaseMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  weightedMinutes: number;
  status: string;
};

export type DayPayroll = {
  date: string;
  dayType: "Hafta içi" | "Cumartesi" | "Pazar" | "Resmi tatil";
  isPremiumDay: boolean;
  autoCheckout: boolean;
  pairs: PairPayroll[];
  normalMinutes: number;
  otBaseMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  weightedMinutes: number;
};

function overlapMinutes(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

/** Split a work interval into normal (inside window) and OT (outside window). */
export function computePairMinutes(
  inHm: string,
  outHm: string,
  workStart: string,
  workEnd: string
): { worked: number; normalMinutes: number; overtimeMinutes: number } {
  const inMin = parseHmToMinutes(inHm);
  const outMin = parseHmToMinutes(outHm);
  if (outMin <= inMin) {
    return { worked: 0, normalMinutes: 0, overtimeMinutes: 0 };
  }
  const worked = outMin - inMin;
  const ws = parseHmToMinutes(workStart);
  const we = parseHmToMinutes(workEnd);
  const normalMinutes = overlapMinutes(inMin, outMin, ws, we);
  const overtimeMinutes = worked - normalMinutes;
  return { worked, normalMinutes, overtimeMinutes };
}

export function weekdayLabel(workDate: string): "Cumartesi" | "Pazar" | "Hafta içi" {
  const [y, m, d] = workDate.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 Sun .. 6 Sat
  if (dow === 6) return "Cumartesi";
  if (dow === 0) return "Pazar";
  return "Hafta içi";
}

export function isPremiumCalendarDay(workDate: string, holidayDates: Set<string>): boolean {
  if (holidayDates.has(workDate)) return true;
  const label = weekdayLabel(workDate);
  return label === "Cumartesi" || label === "Pazar";
}

export function dayTypeLabel(
  workDate: string,
  holidayDates: Set<string>
): DayPayroll["dayType"] {
  if (holidayDates.has(workDate)) return "Resmi tatil";
  return weekdayLabel(workDate);
}

export function weightedMinutes(
  normal: number,
  otBase: number,
  late: number,
  early: number
): number {
  return normal + OT_MULTIPLIER * otBase - OT_MULTIPLIER * (late + early);
}

/**
 * Build payroll for one work day from attendance records.
 * Open check-out is treated as workEnd (default 18:00).
 * Late/early applied once per weekday (first pair row carries the values).
 */
export function computeDayPayroll(
  workDate: string,
  records: AttendanceRecord[],
  settings: CompanySettings,
  holidayDates: Set<string>
): DayPayroll | null {
  const sessions = daySessions(records);
  const workStart = settings.workStart;
  const workEnd = settings.workEnd;
  const offset = settings.timezoneOffsetMinutes;

  type RawPair = {
    checkIn: string;
    checkOut: string;
    checkInHms: string;
    checkOutHms: string;
    autoCheckout: boolean;
  };
  const rawPairs: RawPair[] = sessions.pairs.map((p) => ({
    checkIn: toLocalHm(p.checkIn.timestamp, offset),
    checkOut: toLocalHm(p.checkOut.timestamp, offset),
    checkInHms: toLocalHms(p.checkIn.timestamp, offset),
    checkOutHms: toLocalHms(p.checkOut.timestamp, offset),
    autoCheckout: false,
  }));

  let autoCheckout = false;
  if (sessions.openCheckIn) {
    rawPairs.push({
      checkIn: toLocalHm(sessions.openCheckIn.timestamp, offset),
      checkOut: workEnd,
      checkInHms: toLocalHms(sessions.openCheckIn.timestamp, offset),
      checkOutHms: hmToDisplayHms(workEnd),
      autoCheckout: true,
    });
    autoCheckout = true;
  }

  if (rawPairs.length === 0) return null;

  const premium = isPremiumCalendarDay(workDate, holidayDates);
  const dayType = dayTypeLabel(workDate, holidayDates);

  let lateMinutes = 0;
  let earlyMinutes = 0;
  if (!premium) {
    const firstIn = parseHmToMinutes(rawPairs[0].checkIn);
    const lastOut = parseHmToMinutes(rawPairs[rawPairs.length - 1].checkOut);
    const ws = parseHmToMinutes(workStart);
    const we = parseHmToMinutes(workEnd);
    lateMinutes = Math.max(0, firstIn - ws);
    earlyMinutes = Math.max(0, we - lastOut);
  }

  const pairs: PairPayroll[] = rawPairs.map((p, idx) => {
    const split = computePairMinutes(p.checkIn, p.checkOut, workStart, workEnd);
    const normalMinutes = premium ? 0 : split.normalMinutes;
    const otBaseMinutes = premium ? split.worked : split.overtimeMinutes;
    const late = idx === 0 ? lateMinutes : 0;
    const early = idx === 0 ? earlyMinutes : 0;
    const w = weightedMinutes(normalMinutes, otBaseMinutes, late, early);
    let status = "Tamam";
    if (p.autoCheckout) status = `Eksik çıkış → ${workEnd} kabul edildi`;
    return {
      checkIn: p.checkIn,
      checkOut: p.checkOut,
      checkInHms: p.checkInHms,
      checkOutHms: p.checkOutHms,
      autoCheckout: p.autoCheckout,
      normalMinutes,
      otBaseMinutes,
      lateMinutes: late,
      earlyMinutes: early,
      weightedMinutes: w,
      status,
    };
  });

  return {
    date: workDate,
    dayType,
    isPremiumDay: premium,
    autoCheckout,
    pairs,
    normalMinutes: pairs.reduce((s, p) => s + p.normalMinutes, 0),
    otBaseMinutes: pairs.reduce((s, p) => s + p.otBaseMinutes, 0),
    lateMinutes,
    earlyMinutes,
    weightedMinutes: pairs.reduce((s, p) => s + p.weightedMinutes, 0),
  };
}
