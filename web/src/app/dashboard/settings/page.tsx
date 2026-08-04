"use client";

import { FormEvent, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

type Settings = {
  companyName: string;
  workStart: string;
  workEnd: string;
  breakMinutes: number;
  deductBreak: boolean;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  timezoneOffsetMinutes: number;
};

export default function SettingsPage() {
  const [form, setForm] = useState<Settings | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<Settings>("/api/settings").then(setForm);
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    await api("/api/settings", { method: "PUT", body: JSON.stringify(form) });
    setMsg("Ayarlar kaydedildi");
  }

  if (!form) {
    return (
      <Shell>
        <p>Yükleniyor...</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <h2 className="text-3xl font-semibold">Mesai & GPS ayarları</h2>
      <p className="mt-1 text-slate-600">
        Mesai aralığı, mola düşümü ve işyeri konum yarıçapı yönetici tarafından belirlenir.
      </p>
      <form onSubmit={save} className="mt-6 grid max-w-3xl gap-4 md:grid-cols-2">
        <label className="text-sm md:col-span-2">
          Şirket adı
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Mesai başlangıç
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={form.workStart}
            onChange={(e) => setForm({ ...form, workStart: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Mesai bitiş
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={form.workEnd}
            onChange={(e) => setForm({ ...form, workEnd: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Mola (dakika)
          <input
            type="number"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={form.breakMinutes}
            onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm md:mt-6">
          <input
            type="checkbox"
            checked={form.deductBreak}
            onChange={(e) => setForm({ ...form, deductBreak: e.target.checked })}
          />
          Toplam mesai hesabından mola düş
        </label>
        <label className="text-sm">
          Enlem
          <input
            type="number"
            step="any"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={form.latitude}
            onChange={(e) => setForm({ ...form, latitude: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          Boylam
          <input
            type="number"
            step="any"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={form.longitude}
            onChange={(e) => setForm({ ...form, longitude: Number(e.target.value) })}
          />
        </label>
        <label className="text-sm">
          GPS yarıçap (metre)
          <input
            type="number"
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
            value={form.radiusMeters}
            onChange={(e) => setForm({ ...form, radiusMeters: Number(e.target.value) })}
          />
        </label>
        <div className="md:col-span-2">
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-white">Kaydet</button>
          {msg && <span className="ml-3 text-sm text-emerald-700">{msg}</span>}
        </div>
      </form>
    </Shell>
  );
}
