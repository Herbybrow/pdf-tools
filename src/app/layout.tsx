import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/header/Header";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "NSSF PDF Tools",
  description: "NSSF's internal PDF toolkit — merge, split, compress, convert, edit, and secure PDFs.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className={`${inter.className} flex min-h-full flex-col font-sans`}>
        <LanguageProvider>
          <Header />
          <div className="flex flex-1 flex-col">{children}</div>
        </LanguageProvider>
      </body>
    </html>
  );
}
