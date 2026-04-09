import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import "../globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Intelligent Trails",
  description: "Дипломный проект планировщика маршрутов",
};

export default async function RootLayout({
  children,
  params // Убрали синхронную деструктуризацию отсюда
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>; // Теперь говорим TS, что это Promise
}>) {
  // Распаковываем params через await (Новое правило Next.js 15)
  const { locale } = await params;
  
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}