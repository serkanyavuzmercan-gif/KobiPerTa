import ExcelJS, { type Worksheet } from "exceljs";
import type { AttendanceRecord, CompanySettings } from "@prisma/client";
import {
  DEFAULT_SALARY,
  OT_MULTIPLIER,
  computeDayPayroll,
  type DayPayroll,
} from "./payroll";
import { computeDayFromSessions, toLocalHm } from "./utils";

type UserLike = { id: string; fullName: string; email: string };

const TITLE = "Hidroteknik Personel Takip";

/** Excel serial time for HH.mm:ss display strings produced by payroll. */
function hmsToExcelTime(hms: string): number {
  const [hPart, rest] = hms.split(".");
  const [mPart, sPart] = (rest ?? "00:00").split(":");
  const h = Number(hPart) || 0;
  const m = Number(mPart) || 0;
  const s = Number(sPart) || 0;
  return (h * 3600 + m * 60 + s) / 86400;
}

const TIME_FMT = 'hh"."mm":"ss';

const COLORS = {
  navy: "FF0B3A5B",
  teal: "FF0D7377",
  tealSoft: "FFE6F4F5",
  headerText: "FFFFFFFF",
  zebra: "FFF3F8F9",
  salaryBg: "FFFFF3CD",
  border: "FFB8D4D8",
  muted: "FF5A6A75",
  amber: "FFB45309",
  totalBg: "FFD6EAF0",
};

function thinBorder() {
  const side: Partial<ExcelJS.Border> = {
    style: "thin",
    color: { argb: COLORS.border },
  };
  return { top: side, left: side, bottom: side, right: side };
}

function applySheetBanner(
  ws: Worksheet,
  month: string,
  subtitle: string,
  colCount: number
) {
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = TITLE;
  titleCell.font = { bold: true, size: 18, color: { argb: COLORS.headerText } };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.navy },
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 32;

  ws.mergeCells(2, 1, 2, colCount);
  const sub = ws.getCell(2, 1);
  sub.value = `${month}  ·  ${subtitle}`;
  sub.font = { bold: true, size: 11, color: { argb: COLORS.headerText } };
  sub.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLORS.teal },
  };
  sub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 22;
}

function styleHeaderRow(ws: Worksheet, rowNum: number, colCount: number) {
  const row = ws.getRow(rowNum);
  row.font = { bold: true, color: { argb: COLORS.headerText }, size: 10 };
  row.height = 20;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.teal },
    };
    cell.border = thinBorder();
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
}

function styleDataCell(
  cell: ExcelJS.Cell,
  rowIndex: number,
  opts?: { align?: "left" | "center" | "right"; warn?: boolean }
) {
  cell.border = thinBorder();
  cell.alignment = {
    vertical: "middle",
    horizontal: opts?.align ?? "center",
  };
  if (rowIndex % 2 === 0) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.zebra },
    };
  }
  if (opts?.warn) {
    cell.font = { color: { argb: COLORS.amber }, bold: true };
  }
}

export function buildMonthlyRows(
  users: UserLike[],
  records: AttendanceRecord[],
  settings: CompanySettings,
  leavesByUser: Map<string, number>,
  holidayDates: Set<string> = new Set()
) {
  return users.map((u) => {
    const userRecords = records.filter((r) => r.userId === u.id);
    const dates = [...new Set(userRecords.map((r) => r.workDate))].sort();
    let totalWorked = 0;
    let totalOvertime = 0;
    let incompleteDays = 0;
    let totalWeightedMinutes = 0;
    let autoCheckoutDays = 0;
    const days = dates.map((date) => {
      const dayRecs = userRecords.filter((r) => r.workDate === date);
      const calc = computeDayFromSessions(dayRecs, settings);
      const payroll = computeDayPayroll(date, dayRecs, settings, holidayDates);
      totalWorked += calc.worked;
      totalOvertime += calc.overtime;
      if (calc.incomplete) incompleteDays += 1;
      if (payroll?.autoCheckout) autoCheckoutDays += 1;
      if (payroll) totalWeightedMinutes += payroll.weightedMinutes;
      return {
        date,
        checkIn: calc.checkInHm,
        checkOut: calc.incomplete ? null : calc.checkOutHm,
        openCheckInHm: calc.openCheckIn
          ? toLocalHm(calc.openCheckIn.timestamp, settings.timezoneOffsetMinutes)
          : null,
        workedMinutes: calc.worked > 0 ? calc.worked : null,
        overtimeMinutes: calc.overtime,
        incomplete: calc.incomplete,
        pairCount: calc.pairs.length,
        pairs: calc.pairs.map((p) => ({
          checkIn: toLocalHm(p.checkIn.timestamp, settings.timezoneOffsetMinutes),
          checkOut: toLocalHm(p.checkOut.timestamp, settings.timezoneOffsetMinutes),
        })),
        payroll,
      };
    });

    return {
      user: u,
      totalWorkedMinutes: totalWorked,
      totalOvertimeMinutes: totalOvertime,
      totalWeightedMinutes,
      incompleteDays,
      autoCheckoutDays,
      leaveDays: leavesByUser.get(u.id) ?? 0,
      days,
    };
  });
}

/** Row block a user occupies on the Mesai sheet, used for cross-sheet sums. */
type UserRowRange = { firstRow: number; lastRow: number };

function buildMesaiSheet(
  wb: ExcelJS.Workbook,
  month: string,
  settings: CompanySettings,
  report: ReturnType<typeof buildMonthlyRows>
): Map<string, UserRowRange> {
  const ws = wb.addWorksheet("Mesai");
  const headers = [
    "Personel",
    "Tarih",
    "Gün Tipi",
    "Giriş",
    "Çıkış",
    "Normal Dk",
    "1,5 Baz Dk",
    "Geç Dk",
    "Erken Dk",
    "Ağırlıklı Dk",
    "Durum",
  ];
  const colCount = headers.length;

  applySheetBanner(ws, month, "Mesai puantajı (giriş / çıkış)", colCount);

  const headerRow = 4;
  headers.forEach((h, i) => {
    ws.getCell(headerRow, i + 1).value = h;
  });
  styleHeaderRow(ws, headerRow, colCount);
  ws.views = [{ state: "frozen", ySplit: headerRow }];

  const widths = [24, 12, 14, 12, 12, 11, 11, 10, 10, 12, 30];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  // Parameter block: every minute formula below references these cells.
  ws.getColumn(13).width = 20;
  ws.getColumn(14).width = 12;
  const paramLabels: [number, string, number | string, string?][] = [
    [1, "Mesai başlangıç", hmsToExcelTime(`${settings.workStart.replace(":", ".")}:00`), TIME_FMT],
    [2, "Mesai bitiş", hmsToExcelTime(`${settings.workEnd.replace(":", ".")}:00`), TIME_FMT],
    [3, "Fazla mesai çarpanı", OT_MULTIPLIER, "0.00"],
  ];
  paramLabels.forEach(([row, label, value, fmt]) => {
    const labelCell = ws.getCell(row, 13);
    labelCell.value = label;
    labelCell.font = { bold: true, color: { argb: COLORS.headerText } };
    labelCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.teal },
    };
    labelCell.border = thinBorder();
    labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    const valueCell = ws.getCell(row, 14);
    valueCell.value = value;
    if (fmt) valueCell.numFmt = fmt;
    valueCell.font = { bold: true };
    valueCell.border = thinBorder();
    valueCell.alignment = { vertical: "middle", horizontal: "center" };
    valueCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.salaryBg },
    };
  });
  const paramNote = ws.getCell(4, 13);
  paramNote.value = "Bu değerler tüm dakika formüllerinde kullanılır.";
  paramNote.font = { italic: true, size: 9, color: { argb: COLORS.muted } };

  const WS = "$N$1";
  const WE = "$N$2";
  const MULT = "$N$3";

  let excelRow = headerRow + 1;
  const firstDataRow = excelRow;
  const ranges = new Map<string, UserRowRange>();

  for (const r of report) {
    const userFirstRow = excelRow;

    for (const d of r.days) {
      const payroll: DayPayroll | null = d.payroll;
      if (!payroll || payroll.pairs.length === 0) continue;

      const dayFirstRow = excelRow;
      const dayLastRow = excelRow + payroll.pairs.length - 1;

      for (const p of payroll.pairs) {
        const row = excelRow;
        const isDayFirstRow = row === dayFirstRow;
        const worked = `MAX(0,(E${row}-D${row}))*1440`;
        const inside = `MAX(0,(MIN(E${row},${WE})-MAX(D${row},${WS})))*1440`;

        const values: ExcelJS.CellValue[] = [
          r.user.fullName,
          payroll.date,
          payroll.dayType,
          hmsToExcelTime(p.checkInHms),
          hmsToExcelTime(p.checkOutHms),
          { formula: `ROUND(IF($C${row}="Hafta içi",${inside},0),0)` },
          {
            formula: `ROUND(IF($C${row}="Hafta içi",${worked}-F${row},${worked}),0)`,
          },
          isDayFirstRow
            ? {
                formula: `ROUND(IF($C${row}="Hafta içi",MAX(0,(D${row}-${WS}))*1440,0),0)`,
              }
            : 0,
          isDayFirstRow
            ? {
                formula: `ROUND(IF($C${row}="Hafta içi",MAX(0,(${WE}-E${dayLastRow}))*1440,0),0)`,
              }
            : 0,
          {
            formula: `ROUND(F${row}+${MULT}*G${row}-${MULT}*(H${row}+I${row}),2)`,
          },
          p.status,
        ];

        values.forEach((v, i) => {
          const cell = ws.getCell(row, i + 1);
          cell.value = v;
          styleDataCell(cell, row, {
            align: i === 0 || i === 10 ? "left" : "center",
            warn: i === 10 && p.autoCheckout,
          });
        });
        ws.getCell(row, 4).numFmt = TIME_FMT;
        ws.getCell(row, 5).numFmt = TIME_FMT;
        ws.getCell(row, 10).numFmt = "0.00";
        excelRow += 1;
      }
    }

    if (excelRow > userFirstRow) {
      ranges.set(r.user.id, { firstRow: userFirstRow, lastRow: excelRow - 1 });
    }
  }

  const lastDataRow = excelRow - 1;
  if (lastDataRow >= firstDataRow) {
    const totalRow = excelRow;
    ws.getCell(totalRow, 1).value = "TOPLAM";
    for (let c = 1; c <= colCount; c++) {
      const cell = ws.getCell(totalRow, c);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.totalBg },
      };
      cell.border = thinBorder();
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
    ws.getCell(totalRow, 1).alignment = { vertical: "middle", horizontal: "left" };
    for (const col of ["F", "G", "H", "I", "J"]) {
      const colIndex = col.charCodeAt(0) - 64;
      ws.getCell(totalRow, colIndex).value = {
        formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})`,
      };
      ws.getCell(totalRow, colIndex).numFmt = col === "J" ? "0.00" : "0";
    }
  }

  ws.getCell(3, 1).value =
    "Saatler saat.dakika:saniye biçimindedir (örnek: 08.30:15). Giriş/çıkış saatlerini değiştirdiğinizde dakika ve ücret sütunları otomatik güncellenir.";
  ws.getCell(3, 1).font = { italic: true, size: 9, color: { argb: COLORS.muted } };
  ws.mergeCells(3, 1, 3, colCount);

  return ranges;
}

function buildUcretSheet(
  wb: ExcelJS.Workbook,
  month: string,
  report: ReturnType<typeof buildMonthlyRows>,
  mesaiRanges: Map<string, UserRowRange>
) {
  const ws = wb.addWorksheet("Ücret");
  const headers = [
    "Personel",
    "Maaş (TL)",
    "Dakika Ücreti",
    "Ağırlıklı Dk",
    "Mesai Ücreti (TL)",
    "Otomatik 18:00 Gün",
    "İzin Gün",
  ];
  const colCount = headers.length;

  applySheetBanner(ws, month, "Personel bazlı mesai ücreti", colCount);

  ws.mergeCells(3, 1, 3, colCount);
  const note = ws.getCell(3, 1);
  note.value =
    "Sarı Maaş sütununu her personel için ayrı ayrı değiştirebilirsiniz. Dakika ücreti = Maaş / 30 / 10 / 60. Ağırlıklı dakikalar Mesai sekmesinden formülle gelir.";
  note.font = { italic: true, size: 9, color: { argb: COLORS.muted } };
  note.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const headerRow = 5;
  headers.forEach((h, i) => {
    ws.getCell(headerRow, i + 1).value = h;
  });
  styleHeaderRow(ws, headerRow, colCount);
  ws.views = [{ state: "frozen", ySplit: headerRow }];

  const widths = [28, 16, 15, 14, 20, 18, 12];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  let excelRow = headerRow + 1;
  const firstDataRow = excelRow;

  report.forEach((r) => {
    const range = mesaiRanges.get(r.user.id);
    const weighted: ExcelJS.CellValue = range
      ? { formula: `ROUND(SUM(Mesai!J${range.firstRow}:J${range.lastRow}),2)` }
      : 0;
    const values: ExcelJS.CellValue[] = [
      r.user.fullName,
      DEFAULT_SALARY,
      { formula: `B${excelRow}/30/10/60` },
      weighted,
      { formula: `D${excelRow}*C${excelRow}` },
      r.autoCheckoutDays,
      r.leaveDays,
    ];
    values.forEach((v, i) => {
      const cell = ws.getCell(excelRow, i + 1);
      cell.value = v;
      styleDataCell(cell, excelRow, { align: i === 0 ? "left" : "center" });
    });
    const salaryCell = ws.getCell(excelRow, 2);
    salaryCell.numFmt = "#,##0.00";
    salaryCell.font = { bold: true };
    salaryCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.salaryBg },
    };
    ws.getCell(excelRow, 3).numFmt = "0.0000";
    ws.getCell(excelRow, 4).numFmt = "0.00";
    ws.getCell(excelRow, 5).numFmt = '#,##0.00" TL"';
    excelRow += 1;
  });

  const lastDataRow = excelRow - 1;
  if (lastDataRow >= firstDataRow) {
    const totalRow = excelRow;
    for (let c = 1; c <= colCount; c++) {
      const cell = ws.getCell(totalRow, c);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.totalBg },
      };
      cell.border = thinBorder();
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    }
    ws.getCell(totalRow, 1).value = "TOPLAM";
    ws.getCell(totalRow, 1).alignment = { vertical: "middle", horizontal: "left" };
    ws.getCell(totalRow, 4).value = {
      formula: `SUM(D${firstDataRow}:D${lastDataRow})`,
    };
    ws.getCell(totalRow, 4).numFmt = "0.00";
    ws.getCell(totalRow, 5).value = {
      formula: `SUM(E${firstDataRow}:E${lastDataRow})`,
    };
    ws.getCell(totalRow, 5).numFmt = '#,##0.00" TL"';
  }
}

function buildBilgiSheet(
  wb: ExcelJS.Workbook,
  month: string,
  settings: CompanySettings
) {
  const ws = wb.addWorksheet("Bilgi");
  const colCount = 2;
  applySheetBanner(ws, month, "Hesaplama kuralları ve açıklamalar", colCount);

  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 95;

  const rows: [string, string][] = [
    [
      "Normal mesai",
      `${settings.workStart} – ${settings.workEnd} arasındaki çalışma dakikaları normal (x1) kabul edilir.`,
    ],
    [
      "Fazla mesai",
      `Bu saatlerin dışında kalan çalışma dakikaları ${OT_MULTIPLIER} çarpanı ile hesaplanır.`,
    ],
    [
      "Geç kalma",
      "Hafta içinde günün ilk girişi mesai başlangıcından sonraysa, gecikme dakikaları x1,5 olarak ücretten düşülür.",
    ],
    [
      "Erken çıkış",
      "Hafta içinde günün son çıkışı mesai bitişinden önceyse, erken çıkış dakikaları x1,5 olarak ücretten düşülür.",
    ],
    [
      "Cumartesi / Pazar / tatil",
      "Bu günlerde çalışılırsa tüm çalışma dakikaları x1,5 kabul edilir; geç/erken cezası uygulanmaz.",
    ],
    [
      "Çoklu giriş-çıkış",
      "Aynı günde birden fazla giriş-çıkış çifti varsa her çift ayrı hesaplanır ve dakikalar toplanır.",
    ],
    [
      "Eksik çıkış",
      `Çıkış unutulursa çıkış saati ${settings.workEnd} kabul edilir ve ücrete dahil edilir.`,
    ],
    [
      "Dakika ücreti",
      "Maaş / 30 / 10 / 60  (Ücret sekmesindeki sarı Maaş hücresinden hesaplanır).",
    ],
    [
      "Mesai ücreti",
      "Ağırlıklı dakika x dakika ücreti. Ağırlıklı dk = normal + 1,5x(fazla) - 1,5x(geç+erken).",
    ],
    [
      "Saat biçimi",
      "Mesai sekmesinde giriş/çıkış saat.dakika:saniye şeklinde gösterilir (örnek: 08.30:15).",
    ],
    [
      "Canlı hesaplama",
      "Mesai sekmesinde giriş/çıkış saatlerini değiştirdiğinizde normal, 1,5 baz, geç, erken ve ağırlıklı dakikalar formülle yeniden hesaplanır; Ücret sekmesi de otomatik güncellenir.",
    ],
    [
      "Mesai saatleri",
      "Mesai sekmesindeki N1 (başlangıç), N2 (bitiş) ve N3 (çarpan) hücreleri tüm dakika formüllerinde kullanılır.",
    ],
    [
      "Maaş değiştirme",
      "Ücret sekmesinde her personelin kendi sarı Maaş (TL) hücresi vardır; farklı maaşlar için ilgili satırı değiştirin.",
    ],
  ];

  const startRow = 4;
  rows.forEach(([label, text], idx) => {
    const row = startRow + idx;
    const labelCell = ws.getCell(row, 1);
    const textCell = ws.getCell(row, 2);
    labelCell.value = label;
    textCell.value = text;
    labelCell.font = { bold: true, color: { argb: COLORS.headerText } };
    labelCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: idx % 2 === 0 ? COLORS.navy : COLORS.teal },
    };
    labelCell.border = thinBorder();
    labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    textCell.border = thinBorder();
    textCell.alignment = { vertical: "middle", wrapText: true };
    if (idx % 2 === 0) {
      textCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.zebra },
      };
    }
    ws.getRow(row).height = 28;
  });
}

export async function buildMonthlyExcelBuffer(
  month: string,
  settings: CompanySettings,
  report: ReturnType<typeof buildMonthlyRows>
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = TITLE;
  wb.created = new Date();
  wb.title = TITLE;

  const mesaiRanges = buildMesaiSheet(wb, month, settings, report);
  buildUcretSheet(wb, month, report, mesaiRanges);
  buildBilgiSheet(wb, month, settings);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
