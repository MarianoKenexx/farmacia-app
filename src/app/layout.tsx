import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { AuthProvider } from "@/context/AuthContext";
import { AlertsProvider } from "@/context/AlertsContext";
import { AlertToast } from "@/components/AlertToast";
import { BrandingProvider } from "@/context/BrandingContext";

export const metadata: Metadata = {
  title: "Farmacia - Sistema de Gestión",
  description: "Sistema de gestión de farmacia",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Farmacia",
  },
};

export const viewport: Viewport = {
  themeColor: "#10b981",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="bg-slate-950 text-white font-sans">
        <BrandingProvider>
        <AuthProvider>
          <AlertsProvider>
            <div className="flex h-screen overflow-hidden">
              <Sidebar />
              <main className="flex-1 overflow-auto bg-slate-950">
                {children}
              </main>
            </div>
            <AlertToast />
          </AlertsProvider>
        </AuthProvider>
        </BrandingProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
