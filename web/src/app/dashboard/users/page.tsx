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

  async function toggleActive(u: User) {
    await api(`/api/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !u.active }),
    });
    await load();
  }

  return (
    <Shell>
      <h2 className="text-3xl font-semibold">Personel tanımları</h2>
      <p className="mt-1 text-slate-600">Kullanıcı ekleme, rol ve aktif/pasif yönetimi</p>

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
          className="rounded-xl border border-slate-200 px-3 py-2"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="EMPLOYEE">Personel</option>
          <option value="ADMIN">Yönetici</option>
        </select>
        <button className="rounded-xl bg-slate-900 px-3 py-2 text-white">Ekle</button>
      </form>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b text-slate-500">
            <tr>
              <th className="py-2">Ad</th>
              <th>E-posta</th>
              <th>Rol</th>
              <th>Durum</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100">
                <td className="py-3 font-medium">{u.fullName}</td>
                <td>{u.email}</td>
                <td>{u.role === "ADMIN" ? "Yönetici" : "Personel"}</td>
                <td>{u.active ? "Aktif" : "Pasif"}</td>
                <td className="text-right">
                  <button className="text-sky-700 underline" onClick={() => toggleActive(u)}>
                    {u.active ? "Pasifleştir" : "Aktifleştir"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
