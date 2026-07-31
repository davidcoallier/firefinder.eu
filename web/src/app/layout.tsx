import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Firefinder - wildfire risk on the power grid",
  description:
    "Weekly wildfire risk forecasts along power-grid corridors.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
