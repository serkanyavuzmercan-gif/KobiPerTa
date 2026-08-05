import "dotenv/config";
import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "./prisma";
import { requireAuth, requireAdmin, signToken } from "./auth";
import { seed } from "./seed";
import { getTurkeyPublicHolidays } from "./holidays";
import { buildMonthlyExcelBuffer, buildMonthlyRows } from "./reportExcel";
import {
  buildQrToken,
  currentMinutesOfDay,
  daySessions,
  formatDuration,
  haversineMeters,
  parseHmToMinutes,
  parseWorkDateTime,
  qrSecondsRemaining,
  qrSlot,
  toLocalHm,
  todayWorkDate,
  verifyQrToken,
} from "./utils";

const app = express();
app.use(cors());
app.use(express.json());

async function getSettings() {
  const s = await prisma.companySettings.findUnique({ where: { id: 1 } });
  if (!s) throw new Error("Ayarlar bulunamadı");
  return s;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "KobiPerTa API" });
});

app.post("/api/auth/login", async (req, res) => {
  const body = z
    .object({ email: z.string().email(), password: z.string().min(1) })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Geçersiz giriş" });

  const user = await prisma.user.findUnique({ where: { email: body.data.email } });
  if (!user || !user.active) return res.status(401).json({ error: "E-posta veya şifre hatalı" });
  const ok = await bcrypt.compare(body.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "E-posta veya şifre hatalı" });

  const auth = { id: user.id, role: user.role, fullName: user.fullName, email: user.email };
  res.json({ token: signToken(auth), user: auth });
});

/** Public: şifremi unuttum için yönetici mail adresi */
app.get("/api/auth/forgot-password", async (_req, res) => {
  const s = await getSettings();
  res.json({
    supportEmail: s.passwordResetEmail,
    message: "Şifre sıfırlama talebinizi bu adrese iletin.",
  });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const body = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Geçerli bir e-posta girin" });

  const s = await getSettings();
  const user = await prisma.user.findUnique({ where: { email: body.data.email } });
  // Güvenlik: kullanıcı yoksa da aynı mesaj
  res.json({
    supportEmail: s.passwordResetEmail,
    userFound: Boolean(user && user.active),
    message: user && user.active
      ? `Şifre talebiniz için ${s.passwordResetEmail} adresine yazın.`
      : `Şifre talebiniz için ${s.passwordResetEmail} adresine yazın.`,
  });
});

app.get("/api/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, fullName: true, role: true, active: true },
  });
  res.json(user);
});

// --- Users (admin) ---
app.get("/api/users", requireAuth, requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { fullName: "asc" },
    select: { id: true, email: true, fullName: true, role: true, active: true, createdAt: true },
  });
  res.json(users);
});

app.post("/api/users", requireAuth, requireAdmin, async (req, res) => {
  const body = z
    .object({
      email: z.string().email(),
      fullName: z.string().min(2),
      password: z.string().min(6),
      role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Geçersiz veri", details: body.error.flatten() });

  const exists = await prisma.user.findUnique({ where: { email: body.data.email } });
  if (exists) return res.status(409).json({ error: "Bu e-posta zaten kayıtlı" });

  const user = await prisma.user.create({
    data: {
      email: body.data.email,
      fullName: body.data.fullName,
      role: body.data.role,
      passwordHash: await bcrypt.hash(body.data.password, 10),
    },
    select: { id: true, email: true, fullName: true, role: true, active: true },
  });
  res.status(201).json(user);
});

app.patch("/api/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const body = z
    .object({
      fullName: z.string().min(2).optional(),
      role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
      active: z.boolean().optional(),
      password: z.string().min(6).optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Geçersiz veri" });

  const data: Record<string, unknown> = { ...body.data };
  if (body.data.password) {
    data.passwordHash = await bcrypt.hash(body.data.password, 10);
    delete data.password;
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data,
    select: { id: true, email: true, fullName: true, role: true, active: true },
  });
  res.json(user);
});

// --- Settings ---
app.get("/api/settings", requireAuth, async (_req, res) => {
  const s = await getSettings();
  res.json({
    companyName: s.companyName,
    workStart: s.workStart,
    workEnd: s.workEnd,
    breakMinutes: s.breakMinutes,
    deductBreak: s.deductBreak,
    latitude: s.latitude,
    longitude: s.longitude,
    radiusMeters: s.radiusMeters,
    timezoneOffsetMinutes: s.timezoneOffsetMinutes,
    passwordResetEmail: s.passwordResetEmail,
  });
});

app.put("/api/settings", requireAuth, requireAdmin, async (req, res) => {
  const body = z
    .object({
      companyName: z.string().min(1).optional(),
      workStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      workEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      breakMinutes: z.number().int().min(0).max(240).optional(),
      deductBreak: z.boolean().optional(),
      latitude: z.number().optional(),
      longitude: z.number().optional(),
      radiusMeters: z.number().int().min(20).max(5000).optional(),
      timezoneOffsetMinutes: z.number().int().optional(),
      passwordResetEmail: z.string().email().optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Geçersiz ayar" });

  const s = await prisma.companySettings.update({ where: { id: 1 }, data: body.data });
  res.json(s);
});

app.get("/api/qr", requireAuth, requireAdmin, async (_req, res) => {
  const s = await getSettings();
  const now = Date.now();
  const token = buildQrToken(s.qrSecret, now);
  const slot = qrSlot(now);
  const secondsRemaining = qrSecondsRemaining(now);
  const payload = JSON.stringify({ app: "KobiPerTa", token, slot });
  const dataUrl = await QRCode.toDataURL(payload, { width: 360, margin: 2 });
  res.json({
    token,
    slot,
    payload,
    dataUrl,
    expiresInSeconds: 60,
    secondsRemaining,
    expiresAt: new Date((slot + 1) * 60_000).toISOString(),
  });
});

// --- Attendance ---
app.post("/api/attendance/punch", requireAuth, async (req, res) => {
  const body = z
    .object({
      type: z.enum(["CHECK_IN", "CHECK_OUT"]),
      latitude: z.number(),
      longitude: z.number(),
      mode: z.enum(["gps", "qr"]).optional(),
      qrToken: z.string().min(8).optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Eksik veya hatalı veri" });

  const settings = await getSettings();
  const mode = body.data.mode ?? (body.data.qrToken ? "qr" : "gps");

  if (mode === "qr") {
    if (!body.data.qrToken || !verifyQrToken(settings.qrSecret, body.data.qrToken)) {
      return res.status(400).json({ error: "QR kod geçersiz veya süresi dolmuş" });
    }
  }

  const distance = haversineMeters(
    body.data.latitude,
    body.data.longitude,
    settings.latitude,
    settings.longitude
  );
  if (distance > settings.radiusMeters) {
    return res.status(400).json({
      error: `İşyeri dışında görünüyorsunuz (${Math.round(distance)} m). İzin verilen yarıçap: ${settings.radiusMeters} m`,
    });
  }

  const workDate = todayWorkDate(settings.timezoneOffsetMinutes);
  const nowMin = currentMinutesOfDay(settings.timezoneOffsetMinutes);
  const workEndMin = parseHmToMinutes(settings.workEnd);

  const existing = await prisma.attendanceRecord.findMany({
    where: { userId: req.user!.id, workDate },
    orderBy: { timestamp: "asc" },
  });
  const session = daySessions(existing);

  // QR: en az 5 dk ara (çift okutma koruması)
  if (mode === "qr" && session.lastRecord) {
    const gapMs = Date.now() - session.lastRecord.timestamp.getTime();
    const minGapMs = 5 * 60_000;
    if (gapMs < minGapMs) {
      const waitSec = Math.ceil((minGapMs - gapMs) / 1000);
      return res.status(400).json({
        error: `QR ile peş peşe işlem için en az 5 dakika bekleyin. Kalan: ${waitSec} sn`,
      });
    }
  }

  if (body.data.type === "CHECK_IN") {
    if (session.isOpen) {
      return res.status(400).json({ error: "Zaten açık bir giriş var. Önce çıkış yapın." });
    }
    if (nowMin > workEndMin) {
      return res.status(400).json({ error: "Mesai bitişinden sonra giriş yapılamaz. Yarın tekrar deneyin." });
    }
  } else {
    if (!session.isOpen) {
      return res.status(400).json({ error: "Önce giriş yapmalısınız" });
    }
  }

  const record = await prisma.attendanceRecord.create({
    data: {
      userId: req.user!.id,
      type: body.data.type,
      workDate,
      timestamp: new Date(),
      latitude: body.data.latitude,
      longitude: body.data.longitude,
      note: mode === "qr" ? "QR + GPS" : "GPS",
    },
  });

  res.status(201).json(record);
});

/** Company-wide attendance list (all employees can see) */
app.get("/api/attendance/today", requireAuth, async (_req, res) => {
  const settings = await getSettings();
  const workDate = todayWorkDate(settings.timezoneOffsetMinutes);
  const users = await prisma.user.findMany({
    where: { active: true, role: "EMPLOYEE" },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, email: true },
  });
  const records = await prisma.attendanceRecord.findMany({ where: { workDate } });

  const rows = users.map((u) => {
    const session = daySessions(records.filter((r) => r.userId === u.id));
    return {
      user: u,
      workDate,
      checkIn: session.checkIn
        ? {
            id: session.checkIn.id,
            at: session.checkIn.timestamp,
            hm: toLocalHm(session.checkIn.timestamp, settings.timezoneOffsetMinutes),
          }
        : null,
      checkOut: session.checkOut
        ? {
            id: session.checkOut.id,
            at: session.checkOut.timestamp,
            hm: toLocalHm(session.checkOut.timestamp, settings.timezoneOffsetMinutes),
          }
        : null,
      pairCount: session.pairs.length,
      status: !session.firstCheckIn ? "YOK" : session.isOpen ? "İŞTE" : "ÇIKIŞ",
    };
  });

  res.json({ workDate, rows });
});

app.get("/api/attendance", requireAuth, async (req, res) => {
  const settings = await getSettings();
  const workDate = typeof req.query.date === "string" ? req.query.date : todayWorkDate(settings.timezoneOffsetMinutes);
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;

  const records = await prisma.attendanceRecord.findMany({
    where: { workDate, ...(userId ? { userId } : {}) },
    include: { user: { select: { id: true, fullName: true, email: true } } },
    orderBy: [{ userId: "asc" }, { timestamp: "asc" }],
  });
  res.json(records);
});

app.patch("/api/attendance/:id", requireAuth, requireAdmin, async (req, res) => {
  const body = z
    .object({
      timestampHm: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      note: z.string().optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Geçersiz veri" });

  const current = await prisma.attendanceRecord.findUnique({ where: { id: req.params.id } });
  if (!current) return res.status(404).json({ error: "Kayıt bulunamadı" });

  const settings = await getSettings();
  const workDate = body.data.workDate ?? current.workDate;
  const hm = body.data.timestampHm ?? toLocalHm(current.timestamp, settings.timezoneOffsetMinutes);

  const updated = await prisma.attendanceRecord.update({
    where: { id: current.id },
    data: {
      workDate,
      timestamp: parseWorkDateTime(workDate, hm, settings.timezoneOffsetMinutes),
      note: body.data.note ?? current.note,
      editedBy: req.user!.id,
    },
  });
  res.json(updated);
});

app.post("/api/attendance/manual", requireAuth, requireAdmin, async (req, res) => {
  const body = z
    .object({
      userId: z.string(),
      type: z.enum(["CHECK_IN", "CHECK_OUT"]),
      workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      timestampHm: z.string().regex(/^\d{2}:\d{2}$/),
      note: z.string().optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Geçersiz veri" });

  const settings = await getSettings();
  const existing = await prisma.attendanceRecord.findMany({
    where: { userId: body.data.userId, workDate: body.data.workDate },
  });
  const session = daySessions(existing);
  if (body.data.type === "CHECK_IN" && session.isOpen) {
    return res.status(400).json({ error: "Açık giriş varken yeni giriş eklenemez; önce çıkış ekleyin" });
  }
  if (body.data.type === "CHECK_OUT" && !session.isOpen) {
    return res.status(400).json({ error: "Çıkış için önce giriş kaydı olmalı" });
  }

  const record = await prisma.attendanceRecord.create({
    data: {
      userId: body.data.userId,
      type: body.data.type,
      workDate: body.data.workDate,
      timestamp: parseWorkDateTime(body.data.workDate, body.data.timestampHm, settings.timezoneOffsetMinutes),
      note: body.data.note ?? "Yönetici düzeltmesi",
      editedBy: req.user!.id,
    },
  });
  res.status(201).json(record);
});

// --- Holidays & Leaves ---
app.get("/api/holidays", requireAuth, async (_req, res) => {
  res.json(await prisma.holiday.findMany({ orderBy: { date: "asc" } }));
});

app.post("/api/holidays", requireAuth, requireAdmin, async (req, res) => {
  const body = z.object({ date: z.string(), name: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Geçersiz tatil" });
  const h = await prisma.holiday.create({ data: body.data });
  res.status(201).json(h);
});

/** Import Turkey public holidays for a year via date-holidays (upsert by date). */
app.post("/api/holidays/sync", requireAuth, requireAdmin, async (req, res) => {
  const yearRaw = req.body?.year ?? req.query.year;
  const year = Number(yearRaw ?? new Date().getFullYear());
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: "Geçersiz yıl" });
  }

  const days = getTurkeyPublicHolidays(year);
  let created = 0;
  let updated = 0;
  for (const day of days) {
    const existing = await prisma.holiday.findUnique({ where: { date: day.date } });
    if (!existing) {
      await prisma.holiday.create({ data: day });
      created += 1;
    } else if (existing.name !== day.name) {
      await prisma.holiday.update({ where: { date: day.date }, data: { name: day.name } });
      updated += 1;
    }
  }

  const holidays = await prisma.holiday.findMany({
    where: { date: { startsWith: String(year) } },
    orderBy: { date: "asc" },
  });

  res.json({
    year,
    source: "date-holidays",
    country: "TR",
    fetched: days.length,
    created,
    updated,
    holidays,
  });
});

app.delete("/api/holidays/:id", requireAuth, requireAdmin, async (req, res) => {
  await prisma.holiday.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

app.get("/api/leaves", requireAuth, async (req, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
  res.json(
    await prisma.leave.findMany({
      where: userId ? { userId } : undefined,
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { date: "desc" },
    })
  );
});

app.post("/api/leaves", requireAuth, requireAdmin, async (req, res) => {
  const body = z
    .object({
      userId: z.string(),
      date: z.string(),
      type: z.enum(["ANNUAL", "SICK", "UNPAID", "OTHER"]).default("ANNUAL"),
      note: z.string().optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Geçersiz izin" });
  const leave = await prisma.leave.create({ data: body.data });
  res.status(201).json(leave);
});

app.delete("/api/leaves/:id", requireAuth, requireAdmin, async (req, res) => {
  await prisma.leave.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// --- Monthly report ---
app.get("/api/reports/monthly", requireAuth, async (req, res) => {
  const settings = await getSettings();
  const yearMonth =
    typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : todayWorkDate(settings.timezoneOffsetMinutes).slice(0, 7);

  const users = await prisma.user.findMany({
    where: { active: true, role: "EMPLOYEE" },
    orderBy: { fullName: "asc" },
  });
  const records = await prisma.attendanceRecord.findMany({
    where: { workDate: { startsWith: yearMonth } },
  });
  const holidays = await prisma.holiday.findMany({ where: { date: { startsWith: yearMonth } } });
  const leaves = await prisma.leave.findMany({ where: { date: { startsWith: yearMonth } } });
  const leaveMap = new Map<string, number>();
  for (const l of leaves) {
    leaveMap.set(l.userId, (leaveMap.get(l.userId) ?? 0) + 1);
  }

  const holidayDates = new Set(holidays.map((h) => h.date));
  const report = buildMonthlyRows(users, records, settings, leaveMap, holidayDates).map(
    (r) => ({
      ...r,
      totalWorkedLabel: formatDuration(r.totalWorkedMinutes),
      totalOvertimeLabel: formatDuration(r.totalOvertimeMinutes),
      days: r.days.map((d) => ({
        ...d,
        workedLabel:
          d.incomplete || d.workedMinutes == null ? "" : formatDuration(d.workedMinutes),
        overtimeMinutes: d.overtimeMinutes ?? 0,
      })),
    })
  );

  res.json({
    month: yearMonth,
    settings: {
      deductBreak: settings.deductBreak,
      breakMinutes: settings.breakMinutes,
      workStart: settings.workStart,
      workEnd: settings.workEnd,
    },
    note:
      "Eksik çıkış Excel/ücret hesabında mesai bitişi (varsayılan 18:00) kabul edilir. Hafta içi 08:00–18:00 normal; dışı ve HS/tatil x1.5. Geç/erken x1.5 düşülür.",
    holidays,
    report,
  });
});

app.get("/api/reports/monthly/excel", requireAuth, requireAdmin, async (req, res) => {
  const settings = await getSettings();
  const yearMonth =
    typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : todayWorkDate(settings.timezoneOffsetMinutes).slice(0, 7);

  const users = await prisma.user.findMany({
    where: { active: true, role: "EMPLOYEE" },
    orderBy: { fullName: "asc" },
  });
  const records = await prisma.attendanceRecord.findMany({
    where: { workDate: { startsWith: yearMonth } },
  });
  const holidays = await prisma.holiday.findMany({
    where: { date: { startsWith: yearMonth } },
  });
  const holidayDates = new Set(holidays.map((h) => h.date));
  const leaves = await prisma.leave.findMany({ where: { date: { startsWith: yearMonth } } });
  const leaveMap = new Map<string, number>();
  for (const l of leaves) {
    leaveMap.set(l.userId, (leaveMap.get(l.userId) ?? 0) + 1);
  }

  const report = buildMonthlyRows(users, records, settings, leaveMap, holidayDates);
  const buffer = await buildMonthlyExcelBuffer(yearMonth, settings, report);

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="KobiPerTa-mesai-${yearMonth}.xlsx"`
  );
  res.send(buffer);
});

const port = Number(process.env.PORT || 4000);

async function main() {
  await seed();
  app.listen(port, () => {
    console.log(`KobiPerTa API http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
