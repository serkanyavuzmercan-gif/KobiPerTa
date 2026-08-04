import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KobiPerTa Yönetim",
  description: "Personel giriş-çıkış yönetim paneli",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
