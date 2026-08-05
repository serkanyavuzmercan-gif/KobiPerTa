"use client";

import { FormEvent, useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { api } from "@/lib/api";

type User = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  active: boolean;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "EMPLOYEE",
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [pwTarget, setPwTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setUsers(await api<User[]>("/api/users"));
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify(form) });
      setForm({ fullName: "", email: "", password: "", role: "EMPLOYEE" });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Kayıt başarısız");
    }
  }

  async function patchUser(u: User, body: Record<string, unknown>) {
    try {
      await api(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Güncelleme başarısız");
    }
  }

  async function toggleActive(u: User) {
    await patchUser(u, { active: !u.active });
  }

  async function changeRole(u: User, role: string) {
    if (role === u.role) return;
    await patchUser(u, { role });
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (!pwTarget) return;
    setBusy(true);
    try {
      await api(`/api/users/${pwTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password: newPassword }),
      });
      setNotice(`${pwTarget.fullName} için yeni şifre kaydedildi.`);
      setPwTarget(null);
      setNewPassword("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Şifre güncellenemedi");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api(`/api/users/${deleteTarget.id}`, { method: "DELETE" });
      setNotice(`${deleteTarget.fullName} ve tüm mesai kayıtları silindi.`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Silme başarısız");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h2 className="text-3xl font-semibold">Personel tanımları</h2>
      <p className="mt-1 text-slate-600">
        Kullanıcı ekleme, şifre değiştirme, rol ve aktif/pasif yönetimi
      </p>

      {notice && (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span>{notice}</span>
          <button
            onClick={() => setNotice(null)}
            className="cursor-pointer text-emerald-700 underline"
          >
            Kapat
          </button>
        </div>
      )}

      <form onSubmit={createUser} className="mt-6 grid gap-3 rounded-2xl bg-slate-50 p-4 md:grid-cols-5">
        <input
          placeholder="Ad Soyad"
          className="rounded-xl border border-slate-200 px-3 py-2"
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
          required
        />
        <input
          placeholder="E-posta"
          type="email"
          className="rounded-xl border border-slate-200 px-3 py-2"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          placeholder="Şifre"
          type="password"
          className="rounded-xl border border-slate-200 px-3 py-2"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <select
          className="cursor-pointer rounded-xl border border-slate-200 px-3 py-2"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="EMPLOYEE">Personel</option>
          <option value="ADMIN">Yönetici</option>
        </select>
        <button className="cursor-pointer rounded-xl bg-slate-900 px-3 py-2 text-white">
          Ekle
        </button>
      </form>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="py-2">Ad</th>
              <th>E-posta</th>
              <th>Rol</th>
              <th>Durum</th>
              <th className="text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{u.fullName}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1"
                    value={u.role}
                    onChange={(e) => changeRole(u, e.target.value)}
                  >
                    <option value="EMPLOYEE">Personel</option>
                    <option value="ADMIN">Yönetici</option>
                  </select>
                </td>
                <td
                  className={`font-semibold ${u.active ? "text-emerald-600" : "text-red-600"}`}
                >
                  {u.active ? "Aktif" : "Pasif"}
                </td>
                <td className="py-3">
                  <div className="flex flex-wrap justify-end gap-3">
                    <button
                      className="cursor-pointer text-sky-700 underline hover:text-sky-900"
                      onClick={() => toggleActive(u)}
                    >
                      {u.active ? "Pasifleştir" : "Aktifleştir"}
                    </button>
                    <button
                      className="cursor-pointer text-slate-700 underline hover:text-slate-900"
                      onClick={() => {
                        setPwTarget(u);
                        setNewPassword("");
                      }}
                    >
                      Şifre değiştir
                    </button>
                    <button
                      className="cursor-pointer text-red-700 underline hover:text-red-900"
                      onClick={() => setDeleteTarget(u)}
                    >
                      Sil
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pwTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={savePassword}
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold">Şifre değiştir</h3>
            <p className="mt-1 text-sm text-slate-600">
              {pwTarget.fullName} ({pwTarget.email}) için yeni şifre belirleyin.
            </p>
            <input
              autoFocus
              type="password"
              placeholder="Yeni şifre (en az 6 karakter)"
              className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-2"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm"
                onClick={() => setPwTarget(null)}
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={busy || newPassword.length < 6}
                className="cursor-pointer rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Kaydediliyor..." : "Kaydet"}
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-700">Emin misiniz?</h3>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium text-slate-900">{deleteTarget.fullName}</span> kaydı
              silinecek. Personelin tüm giriş-çıkış ve izin kayıtları da kalıcı olarak silinir. Bu
              işlem geri alınamaz.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm"
                onClick={() => setDeleteTarget(null)}
              >
                Vazgeç
              </button>
              <button
                disabled={busy}
                className="cursor-pointer rounded-xl bg-red-600 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={confirmDelete}
              >
                {busy ? "Siliniyor..." : "Evet, sil"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
