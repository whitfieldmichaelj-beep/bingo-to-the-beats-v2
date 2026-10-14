import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
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
  title: {
    default: "Bingo to the Beats",
    template: "%s | Bingo to the Beats",
  },
  description: "Where Bingo Meets The Beats",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <ClerkProvider>
          <a className="bttb-skip-link" href="#main-content">Skip to content</a>
          <Header />

          <div id="main-content" tabIndex={-1} className="bttb-page-content">{children}</div>

          <Footer />
        </ClerkProvider>
      </body>
    </html>
  );
}
