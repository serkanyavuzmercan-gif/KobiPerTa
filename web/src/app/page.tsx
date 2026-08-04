"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api, setSession, type AuthUser } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@kobiperta.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api<{ token: string; user: AuthUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (data.user.role !== "ADMIN") {
        setError("Bu panel yalnızca yöneticiler içindir");
        return;
      }
      setSession(data.token, data.user);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş başarısız");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#0ea5e9aa,transparent_35%),radial-gradient(circle_at_80%_70%,#334155,transparent_40%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 md:flex-row md:items-center md:gap-16">
        <div className="mb-10 md:mb-0 md:flex-1">
          <p className="text-sm uppercase tracking-[0.35em] text-sky-300">KobiPerTa</p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight md:text-5xl">
            Personel giriş ve çıkış yönetimi
          </h1>
          <p className="mt-4 max-w-lg text-slate-300">
            GPS ve QR doğrulamalı mesai takibi, aylık saat hesabı ve şirket geneli görünürlük.
          </p>
        </div>
        <form
          onSubmit={onSubmit}
          className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-6 backdrop-blur"
        >
          <h2 className="text-xl font-medium">Yönetici girişi</h2>
          <label className="mt-5 block text-sm text-slate-300">
            E-posta
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-white outline-none ring-sky-400 focus:ring"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="mt-4 block text-sm text-slate-300">
            Şifre
            <input
              type="password"
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-white outline-none ring-sky-400 focus:ring"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
          <button
            disabled={loading}
            className="mt-6 w-full rounded-xl bg-sky-500 px-4 py-2.5 font-medium text-white hover:bg-sky-400 disabled:opacity-60"
          >
            {loading ? "Giriş yapılıyor..." : "Giriş yap"}
          </button>
        </form>
      </div>
    </div>
  );
}
