const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("kp_token");
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem("kp_token", token);
  localStorage.setItem("kp_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("kp_token");
  localStorage.removeItem("kp_user");
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("kp_user");
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export async function api<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "İstek başarısız");
  return data as T;
}
