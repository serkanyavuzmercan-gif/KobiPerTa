"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api, getToken } from "@/lib/api";

type DayRow = {
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  workedLabel: string;
  overtimeMinutes: number;
  incomplete: boolean;
};

type Report = {
  month: string;
  note?: string;
  settings: { deductBreak: boolean; breakMinutes: number; workStart: string; workEnd: string };
  report: Array<{
    user: { id: string; fullName: string };
    totalWorkedLabel: string;
    totalOvertimeLabel: string;
    incompleteDays: number;
    leaveDays: number;
    days: DayRow[];
  }>;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function ReportsPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Report | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api<Report>(`/api/reports/monthly?month=${month}`).then(setData);
  }, [month]);

  async function downloadExcel() {
    setExporting(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/api/reports/monthly/excel?month=${month}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Excel indirilemedi");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `KobiPerTa-mesai-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Excel indirilemedi");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold">Aylık çalışma saati</h2>
          <p className="mt-1 text-slate-600">
            Giriş/çıkış saatleri (gün içinde birden fazla döngü olabilir), eksik çıkışlar ve Excel aktarım.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            className="rounded-xl border border-slate-200 px-3 py-2"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button
            type="button"
            disabled={exporting}
            onClick={() => void downloadExcel()}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {exporting ? "Hazırlanıyor..." : "Excel'e aktar"}
          </button>
        </div>
      </div>

      {data && (
        <>
          <p className="mt-4 text-sm text-slate-600">
            Mesai {data.settings.workStart}-{data.settings.workEnd}
            {data.settings.deductBreak
              ? ` · Mola düşümü: ${data.settings.breakMinutes} dk`
              : " · Mola düşülmüyor"}
          </p>
          {data.note && (
            <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">{data.note}</p>
          )}
        </>
      )}

      <div className="mt-6 space-y-3">
        {data?.report.map((r) => (
          <div key={r.user.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setOpen(open === r.user.id ? null : r.user.id)}
            >
              <div>
                <p className="font-semibold">{r.user.fullName}</p>
                <p className="text-sm text-slate-600">
                  Toplam {r.totalWorkedLabel} (tamamlanan günler)
                  {r.incompleteDays ? ` · Eksik çıkış: ${r.incompleteDays} gün` : ""}
                  {r.leaveDays ? ` · İzin: ${r.leaveDays}` : ""}
                </p>
              </div>
              <span className="text-slate-400">{open === r.user.id ? "▲" : "▼"}</span>
            </button>
            {open === r.user.id && (
              <table className="mt-4 w-full text-left text-sm">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1">Tarih</th>
                    <th>Giriş</th>
                    <th>Çıkış</th>
                    <th>Süre</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {r.days.map((d) => (
                    <tr
                      key={d.date}
                      className={`border-t border-slate-100 ${d.incomplete ? "bg-amber-50" : ""}`}
                    >
                      <td className="py-2">{d.date}</td>
                      <td>{d.checkIn || "—"}</td>
                      <td>{d.incomplete ? "" : d.checkOut || "—"}</td>
                      <td>{d.incomplete ? "" : d.workedLabel || "—"}</td>
                      <td className={d.incomplete ? "font-medium text-amber-800" : "text-slate-600"}>
                        {d.incomplete ? "Eksik çıkış — manuel düzeltme" : "Tamam"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </Shell>
  );
}
