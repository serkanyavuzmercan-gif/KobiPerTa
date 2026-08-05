"use client";

import { FormEvent, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

type Holiday = { id: string; date: string; name: string };
type User = { id: string; fullName: string };
type Leave = {
  id: string;
  date: string;
  type: string;
  note?: string;
  user: { id: string; fullName: string };
};

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [holidayForm, setHolidayForm] = useState({ date: "", name: "" });
  const [leaveForm, setLeaveForm] = useState({ userId: "", date: "", type: "ANNUAL", note: "" });
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const [h, l, u] = await Promise.all([
      api<Holiday[]>("/api/holidays"),
      api<Leave[]>("/api/leaves"),
      api<User[]>("/api/users"),
    ]);
    setHolidays(h);
    setLeaves(l);
    setUsers(u);
    if (!leaveForm.userId && u[0]) setLeaveForm((f) => ({ ...f, userId: u[0].id }));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addHoliday(e: FormEvent) {
    e.preventDefault();
    await api("/api/holidays", { method: "POST", body: JSON.stringify(holidayForm) });
    setHolidayForm({ date: "", name: "" });
    await load();
  }

  async function addLeave(e: FormEvent) {
    e.preventDefault();
    await api("/api/leaves", { method: "POST", body: JSON.stringify(leaveForm) });
    await load();
  }

  async function syncOfficial() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const result = await api<{
        year: number;
        fetched: number;
        created: number;
        updated: number;
      }>("/api/holidays/sync", {
        method: "POST",
        body: JSON.stringify({ year }),
      });
      setSyncMsg(
        `${result.year}: ${result.fetched} tatil bulundu · ${result.created} eklendi · ${result.updated} güncellendi`
      );
      await load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Senkron başarısız");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Shell>
      <h2 className="text-3xl font-semibold">Resmi tatil ve izinler</h2>
      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="text-lg font-medium">Resmi tatiller</h3>
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl bg-sky-50 p-3">
            <label className="text-sm">
              Yıl
              <input
                type="number"
                className="mt-1 block w-28 rounded-xl border border-slate-200 px-3 py-2"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              disabled={syncing}
              onClick={() => void syncOfficial()}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {syncing ? "Yükleniyor..." : "Türkiye resmi tatillerini yükle"}
            </button>
            {syncMsg && <p className="w-full text-sm text-slate-700">{syncMsg}</p>}
            <p className="w-full text-xs text-slate-500">
              Kaynak: date-holidays (TR) — sabit bayramlar ve Ramazan/Kurban günleri dahil.
            </p>
          </div>
          <form onSubmit={addHoliday} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="date"
              className="rounded-xl border border-slate-200 px-3 py-2"
              value={holidayForm.date}
              onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
              required
            />
            <input
              placeholder="Tatil adı"
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2"
              value={holidayForm.name}
              onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
              required
            />
            <button className="rounded-xl bg-slate-900 px-3 py-2 text-white">Ekle</button>
          </form>
          <ul className="mt-4 space-y-2 text-sm">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span>
                  {h.date} — {h.name}
                </span>
                <button
                  className="text-rose-600"
                  onClick={async () => {
                    await api(`/api/holidays/${h.id}`, { method: "DELETE" });
                    await load();
                  }}
                >
                  Sil
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-lg font-medium">Personel izinleri</h3>
          <form onSubmit={addLeave} className="mt-3 grid gap-2">
            <select
              className="rounded-xl border border-slate-200 px-3 py-2"
              value={leaveForm.userId}
              onChange={(e) => setLeaveForm({ ...leaveForm, userId: e.target.value })}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="date"
                className="rounded-xl border border-slate-200 px-3 py-2"
                value={leaveForm.date}
                onChange={(e) => setLeaveForm({ ...leaveForm, date: e.target.value })}
                required
              />
              <select
                className="rounded-xl border border-slate-200 px-3 py-2"
                value={leaveForm.type}
                onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value })}
              >
                <option value="ANNUAL">Yıllık</option>
                <option value="SICK">Hastalık</option>
                <option value="UNPAID">Ücretsiz</option>
                <option value="OTHER">Diğer</option>
              </select>
            </div>
            <button className="rounded-xl bg-slate-900 px-3 py-2 text-white">İzin ekle</button>
          </form>
          <ul className="mt-4 space-y-2 text-sm">
            {leaves.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <span>
                  {l.date} — {l.user.fullName} ({l.type})
                </span>
                <button
                  className="text-rose-600"
                  onClick={async () => {
                    await api(`/api/leaves/${l.id}`, { method: "DELETE" });
                    await load();
                  }}
                >
                  Sil
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Shell>
  );
}
