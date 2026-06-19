import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/components/WalletProvider";
import Navbar from "@/components/Navbar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FlowGuard | B2B Escrow",
  description: "Secure, milestone-based escrow settlement protocol on Stellar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-zinc-950 text-zinc-300 min-h-screen selection:bg-violet-500/30 selection:text-violet-200`}>
        <WalletProvider>
          <div className="relative flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">
              <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
                {children}
              </div>
            </main>
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
