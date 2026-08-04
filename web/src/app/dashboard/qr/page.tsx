"use client";

import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

type Qr = { dataUrl: string; expiresInSeconds: number; token: string };

export default function QrPage() {
  const [qr, setQr] = useState<Qr | null>(null);

  async function load() {
    setQr(await api<Qr>("/api/qr"));
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, []);

  return (
    <Shell>
      <h2 className="text-3xl font-semibold">İşyeri QR kodu</h2>
      <p className="mt-1 text-slate-600">
        Personel giriş/çıkış için bu kodu okutur. Kod yaklaşık her 60 saniyede yenilenir.
      </p>
      <div className="mt-8 flex flex-col items-start gap-4 rounded-3xl bg-slate-50 p-6">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr.dataUrl} alt="QR" className="h-72 w-72 rounded-2xl bg-white p-3 shadow" />
        ) : (
          <p>Yükleniyor...</p>
        )}
        <button onClick={load} className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">
          Şimdi yenile
        </button>
      </div>
    </Shell>
  );
}
