import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Avillo – AI Tools for Real Estate",
  description: "Trusted AI assistant for top real estate agents. Turn listings into offers faster.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full bg-[#050814]">
      <body
        className={`
          ${geistSans.variable}
          ${geistMono.variable}
          antialiased
          min-h-screen
          w-full
          bg-[#050814]
          text-white
          overflow-x-hidden
          relative
        `}
      >
        {/* Soft vignette + gradient glow behind the whole app */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10"
        >
          <div className="absolute inset-0 bg-[#050814]" />
          <div className="absolute -top-40 left-[-10%] h-80 w-80 rounded-full bg-[radial-gradient(circle,_rgba(56,189,248,0.27),transparent_60%)] blur-3xl opacity-80" />
          <div className="absolute top-1/2 right-[-10%] h-96 w-96 rounded-full bg-[radial-gradient(circle,_rgba(129,140,248,0.25),transparent_60%)] blur-3xl opacity-70" />
          <div className="absolute bottom-[-20%] left-1/2 h-80 w-[28rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,_rgba(15,118,110,0.35),transparent_65%)] blur-3xl opacity-60" />
        </div>

        {/* Subtle noise overlay for “designed” feel */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 opacity-[0.17] mix-blend-soft-light noise-texture"
        />

        {/* Global provider (NextAuth SessionProvider wrapper) */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}