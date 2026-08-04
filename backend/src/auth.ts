import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthUser = { id: string; role: string; fullName: string; email: string };

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const secret = () => process.env.JWT_SECRET || "kobiperta-dev-secret";

export function signToken(user: AuthUser): string {
  return jwt.sign(user, secret(), { expiresIn: "30d" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Oturum gerekli" });
  }
  try {
    req.user = jwt.verify(header.slice(7), secret()) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ error: "Geçersiz oturum" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Yönetici yetkisi gerekli" });
  }
  next();
}
