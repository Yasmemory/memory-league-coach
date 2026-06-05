import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Memory Sports Analytics",
  description: "Practice logs, opponent scouting, analytics, and match plans for Memory League.",
  icons: {
    icon: "/memory-sports-analytics-logo.png",
    shortcut: "/memory-sports-analytics-logo.png",
    apple: "/memory-sports-analytics-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
