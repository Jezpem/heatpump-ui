import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Heat Engine",
  description: "AI-driven whole-house heating control",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} min-h-screen bg-background text-foreground`}>
        <Nav />
        <main className="container mx-auto px-4 py-6 max-w-6xl">{children}</main>
      </body>
    </html>
  );
}
