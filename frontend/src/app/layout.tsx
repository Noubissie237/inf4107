import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { AuthProvider } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Portail des résultats (démo)",
  description: "Plateforme fictive utilisée pour le TP INF4107.",
  // Fictitious platform published on the Internet: keep it out of search engines
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="flex min-h-screen flex-col bg-page text-ink antialiased">
        <AuthProvider>
          <SiteHeader />
          <div className="flex-1">{children}</div>
        </AuthProvider>
        <footer className="border-t border-line bg-surface px-4 py-5 text-center text-sm text-muted">
          Plateforme fictive utilisée pour le TP INF4107. Toutes les données sont des données de
          démonstration.
        </footer>
      </body>
    </html>
  );
}
