"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getStoredUser } from "@/lib/api";
import { useEffect } from "react";

const links = [
  { href: "/dashboard", label: "Bugün" },
  { href: "/dashboard/users", label: "Personel" },
  { href: "/dashboard/settings", label: "Mesai & GPS" },
  { href: "/dashboard/qr", label: "QR Kod" },
  { href: "/dashboard/reports", label: "Aylık Rapor" },
  { href: "/dashboard/holidays", label: "Tatil / İzin" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const u = getStoredUser();
    if (!u || u.role !== "ADMIN") {
      router.replace("/");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#dbeafe,transparent_40%),radial-gradient(circle_at_bottom_right,#e2e8f0,transparent_45%),#f8fafc] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 md:px-8">
        <aside className="hidden w-60 shrink-0 flex-col rounded-3xl bg-slate-900 p-5 text-white md:flex">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.2em] text-sky-300">
              KOBİPERTA - YÖNETİCİ
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Personel</h1>
            <p className="mt-1 text-sm font-semibold text-slate-200">
              Giriş-Çıkış ve Mesai Hesaplama
            </p>
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {links.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`rounded-xl px-3 py-2 text-sm transition ${
                    active ? "bg-sky-500 text-white" : "text-slate-200 hover:bg-white/10"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <button
            onClick={() => {
              clearSession();
              router.replace("/");
            }}
            className="mt-4 rounded-xl border border-white/20 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
          >
            Çıkış
          </button>
        </aside>
        <main className="flex-1 rounded-3xl border border-white/60 bg-white/80 p-5 shadow-sm backdrop-blur md:p-8">
          <div className="mb-4 flex flex-wrap gap-2 md:hidden">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-full bg-slate-100 px-3 py-1 text-xs">
                {l.label}
              </Link>
            ))}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
