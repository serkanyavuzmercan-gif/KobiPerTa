"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

type Row = {
  user: { id: string; fullName: string; email: string };
  workDate: string;
  checkIn: { id: string; hm: string } | null;
  checkOut: { id: string; hm: string } | null;
  status: string;
};

export default function DashboardPage() {
  const [workDate, setWorkDate] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<{
    userId: string;
    fullName: string;
    type: "CHECK_IN" | "CHECK_OUT";
    hm: string;
    recordId?: string;
  } | null>(null);

  async function load() {
    try {
      const data = await api<{ workDate: string; rows: Row[] }>("/api/attendance/today");
      setWorkDate(data.workDate);
      setRows(data.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveManual() {
    if (!edit) return;
    try {
      if (edit.recordId) {
        await api(`/api/attendance/${edit.recordId}`, {
          method: "PATCH",
          body: JSON.stringify({ timestampHm: edit.hm, note: "Yönetici saat düzeltmesi" }),
        });
      } else {
        await api("/api/attendance/manual", {
          method: "POST",
          body: JSON.stringify({
            userId: edit.userId,
            type: edit.type,
            workDate,
            timestampHm: edit.hm,
            note: "Yönetici düzeltmesi",
          }),
        });
      }
      setEdit(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Kayıt başarısız");
    }
  }

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-sky-700">Günlük durum</p>
          <h2 className="mt-1 text-3xl font-semibold">{workDate || "—"}</h2>
          <p className="mt-1 text-slate-600">Tüm şirket personeli giriş/çıkış görünümü</p>
        </div>
        <button onClick={load} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">
          Yenile
        </button>
      </div>
      {error && <p className="mt-4 text-rose-600">{error}</p>}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="py-2">Personel</th>
              <th>Giriş</th>
              <th>Çıkış</th>
              <th>Durum</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{r.user.fullName}</td>
                <td>{r.checkIn?.hm || "—"}</td>
                <td>{r.checkOut?.hm || "—"}</td>
                <td>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      r.status === "İŞTE"
                        ? "bg-emerald-100 text-emerald-800"
                        : r.status === "ÇIKIŞ"
                          ? "bg-slate-100 text-slate-700"
                          : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="space-x-2 text-right">
                  {!r.checkIn && (
                    <button
                      className="text-sky-700 underline"
                      onClick={() =>
                        setEdit({ userId: r.user.id, fullName: r.user.fullName, type: "CHECK_IN", hm: "08:00" })
                      }
                    >
                      Giriş ekle
                    </button>
                  )}
                  {r.checkIn && (
                    <button
                      className="text-sky-700 underline"
                      onClick={() =>
                        setEdit({
                          userId: r.user.id,
                          fullName: r.user.fullName,
                          type: "CHECK_IN",
                          hm: r.checkIn!.hm,
                          recordId: r.checkIn!.id,
                        })
                      }
                    >
                      Giriş düzelt
                    </button>
                  )}
                  {r.checkIn && !r.checkOut && (
                    <button
                      className="text-sky-700 underline"
                      onClick={() =>
                        setEdit({ userId: r.user.id, fullName: r.user.fullName, type: "CHECK_OUT", hm: "17:00" })
                      }
                    >
                      Eksik çıkış
                    </button>
                  )}
                  {r.checkOut && (
                    <button
                      className="text-sky-700 underline"
                      onClick={() =>
                        setEdit({
                          userId: r.user.id,
                          fullName: r.user.fullName,
                          type: "CHECK_OUT",
                          hm: r.checkOut!.hm,
                          recordId: r.checkOut!.id,
                        })
                      }
                    >
                      Çıkış düzelt
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">
              {edit.type === "CHECK_IN" ? "Giriş" : "Çıkış"} düzelt — {edit.fullName}
            </h3>
            <label className="mt-4 block text-sm">
              Saat (HH:mm)
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
                value={edit.hm}
                onChange={(e) => setEdit({ ...edit, hm: e.target.value })}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-xl px-3 py-2 text-sm" onClick={() => setEdit(null)}>
                Vazgeç
              </button>
              <button className="rounded-xl bg-sky-600 px-3 py-2 text-sm text-white" onClick={saveManual}>
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
