import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export async function seed() {
  const settings = await prisma.companySettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    await prisma.companySettings.create({
      data: {
        id: 1,
        companyName: "KobiPerTa",
        workStart: "08:00",
        workEnd: "18:00",
        breakMinutes: 60,
        deductBreak: true,
        latitude: 41.0082,
        longitude: 28.9784,
        radiusMeters: 150,
        qrSecret: "kobiperta-qr-secret",
        timezoneOffsetMinutes: 180,
        passwordResetEmail: "admin@kobiperta.local",
      },
    });
  } else {
    const patch: { passwordResetEmail?: string; workEnd?: string } = {};
    if (!(settings as { passwordResetEmail?: string }).passwordResetEmail) {
      patch.passwordResetEmail = "admin@kobiperta.local";
    }
    // Align existing installs with 08:00–18:00 normal shift for payroll
    if (settings.workEnd === "17:00") {
      patch.workEnd = "18:00";
    }
    if (Object.keys(patch).length) {
      await prisma.companySettings.update({ where: { id: 1 }, data: patch });
    }
  }

  const adminEmail = "admin@kobiperta.local";
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        fullName: "Sistem Yöneticisi",
        role: "ADMIN",
        passwordHash: await bcrypt.hash("admin123", 10),
      },
    });
  }

  const empEmail = "personel@kobiperta.local";
  const emp = await prisma.user.findUnique({ where: { email: empEmail } });
  if (!emp) {
    await prisma.user.create({
      data: {
        email: empEmail,
        fullName: "Örnek Personel",
        role: "EMPLOYEE",
        passwordHash: await bcrypt.hash("personel123", 10),
      },
    });
  }
}
