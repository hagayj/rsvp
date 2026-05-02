import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "הזמנה ליום הולדת 80 - עמיר ז'ביליק",
  description: "נשמח לראותכם בחגיגת יום ההולדת ה-80 של עמיר במוזיאון הטרקטור בשדה ורד",
  openGraph: {
    title: "הזמנה ליום הולדת 80 - עמיר ז'ביליק",
    description: "בואו לחגוג איתנו! יום ו', 5.6.2026 במוזיאון הטרקטור",
    images: [
      {
        url: "https://rsvp-app-sage.vercel.app/invitation_v2.jpg",
        width: 1200,
        height: 630,
        alt: "הזמנה ליום הולדת 80",
      },
    ],
    locale: "he_IL",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
