"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

type Report = {
  month: string;
  settings: { deductBreak: boolean; breakMinutes: number; workStart: string; workEnd: string };
  report: Array<{
    user: { id: string; fullName: string };
    totalWorkedLabel: string;
    totalOvertimeLabel: string;
    incompleteDays: number;
    leaveDays: number;
    days: Array<{
      date: string;
      checkIn: string | null;
      checkOut: string | null;
      workedLabel: string;
      overtimeMinutes: number;
      incomplete: boolean;
    }>;
  }>;
};

export default function ReportsPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Report | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api<Report>(`/api/reports/monthly?month=${month}`).then(setData);
  }, [month]);

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-3xl font-semibold">Aylık çalışma saati</h2>
          <p className="mt-1 text-slate-600">
            Fazla mesai dahil. Mola düşümü yönetici ayarına göre uygulanır.
          </p>
        </div>
        <input
          type="month"
          className="rounded-xl border border-slate-200 px-3 py-2"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
      </div>

      {data && (
        <p className="mt-4 text-sm text-slate-600">
          Mesai {data.settings.workStart}-{data.settings.workEnd}
          {data.settings.deductBreak
            ? ` · Mola düşümü: ${data.settings.breakMinutes} dk`
            : " · Mola düşülmüyor"}
        </p>
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
                  Toplam {r.totalWorkedLabel} · Fazla mesai {r.totalOvertimeLabel}
                  {r.incompleteDays ? ` · Eksik çıkış: ${r.incompleteDays}` : ""}
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
                    <th>FM (dk)</th>
                  </tr>
                </thead>
                <tbody>
                  {r.days.map((d) => (
                    <tr key={d.date} className="border-t border-slate-100">
                      <td className="py-2">{d.date}</td>
                      <td>{d.checkIn || "—"}</td>
                      <td>{d.checkOut || "—"}</td>
                      <td>{d.incomplete ? "Eksik" : d.workedLabel}</td>
                      <td>{d.overtimeMinutes}</td>
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
