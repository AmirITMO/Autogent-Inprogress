import type { Metadata } from "next";
import { Golos_Text, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist не поддерживает кириллицу — русский текст рендерился системным шрифтом.
// Golos Text даёт полноценную кириллицу и более тёплый, крупный на вид рисунок букв.
const golosText = Golos_Text({
  variable: "--font-golos-text",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Autogent Platform",
  description: "CRM, трекер задач и бухгалтерия команды Autogent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${golosText.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
