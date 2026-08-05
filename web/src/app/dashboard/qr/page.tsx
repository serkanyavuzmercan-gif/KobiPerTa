"use client";

import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

type Qr = {
  dataUrl: string;
  token: string;
  slot: number;
  secondsRemaining: number;
  expiresInSeconds: number;
};

export default function QrPage() {
  const [qr, setQr] = useState<Qr | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api<Qr>("/api/qr");
      setQr(data);
      setSecondsLeft(data.secondsRemaining);
    } catch (e) {
      setError(e instanceof Error ? e.message : "QR alınamadı");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Countdown; when slot expires, fetch a new QR once
  useEffect(() => {
    const t = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === 1) {
          void load();
          return 60;
        }
        if (prev <= 0) return prev;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Shell>
      <h2 className="text-3xl font-semibold">İşyeri QR kodu</h2>
      <p className="mt-1 text-slate-600">
        Personel giriş/çıkış için bu kodu okutur. Kod her 60 saniyede bir yenilenir.
      </p>
      <div className="mt-8 flex flex-col items-start gap-4 rounded-3xl bg-slate-50 p-6">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={qr.slot}
            src={qr.dataUrl}
            alt="QR"
            className="h-72 w-72 rounded-2xl bg-white p-3 shadow"
          />
        ) : (
          <p>Yükleniyor...</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <p className="rounded-full bg-sky-100 px-3 py-1 text-sm font-medium text-sky-900">
            Yeni koda {secondsLeft} sn
          </p>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {loading ? "Yenileniyor..." : "Şimdi yenile"}
          </button>
        </div>
        {qr && (
          <p className="text-xs text-slate-500">
            Slot #{qr.slot} · aynı dakika içinde buton aynı kodu döndürebilir; süre bitince otomatik değişir.
          </p>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    </Shell>
  );
}
