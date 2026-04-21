import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { Navigation } from '@/components/layout/Navigation';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { PreferencesProvider } from '@/contexts/PreferencesContext';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { auth } from '@/lib/auth/config';
import { getDb } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import "../globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "Intelligent Trails",
  description: "Дипломный проект планировщика маршрутов",
  icons: {
    icon: '/logo.png',
  },
};

export default async function RootLayout({
  children,
  params
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  const messages = await getMessages();
  const session = await auth();
  const isAuthenticated = !!session?.user;

  // Получаем настройки пользователя из базы данных
  let distanceUnit: "km" | "mi" = "km";
  let mapLocale: "ru" | "en" = locale as "ru" | "en";

  if (session?.user?.id) {
    try {
      const db = await getDb();
      const usersCollection = db.collection("users");
      const dbUser = await usersCollection.findOne({ _id: new ObjectId(session.user.id) });

      if (dbUser?.preferences) {
        distanceUnit = (dbUser.preferences.distanceUnit as "km" | "mi") || "km";

        // Если включен раздельный язык карты, используем его
        if (dbUser.preferences.useCustomMapLocale && dbUser.preferences.mapLocale) {
          mapLocale = dbUser.preferences.mapLocale as "ru" | "en";
        }
      }
    } catch (error) {
      console.error("Error fetching user preferences:", error);
    }
  }

  return (
    <html lang={locale}>
      <body className={inter.className}>
        <SessionProvider>
          <NextIntlClientProvider messages={messages}>
            <PreferencesProvider
              distanceUnit={distanceUnit}
              locale={locale as "ru" | "en"}
              mapLocale={mapLocale}
            >
              <NavigationProvider>
                <Navigation locale={locale} isAuthenticated={isAuthenticated} />
                {children}
              </NavigationProvider>
            </PreferencesProvider>
          </NextIntlClientProvider>
        </SessionProvider>
      </body>
    </html>
  );
}