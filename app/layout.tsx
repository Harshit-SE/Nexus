import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexus — AI with Real-Time Web Search",
  description:
    "A ReAct chat agent with live web search, persistent memory, and temporal reasoning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-zinc-950 text-zinc-100 font-sans">
        {children}
      </body>
    </html>
  );
}
