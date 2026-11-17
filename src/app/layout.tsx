import type { Metadata } from "next";
import { Golos_Text, Unbounded } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Navigation } from '@/components/layout/Navigation';
import { NavigationProvider } from '@/contexts/NavigationContext';
import { PreferencesProvider } from '@/contexts/PreferencesContext';
import { SessionProvider } from '@/components/providers/SessionProvider';
import { ToastProvider } from '@/contexts/ToastContext';
import { auth } from '@/lib/auth/config';
import { getDb } from '@/lib/db/mongodb';
import { ObjectId } from 'mongodb';
import "./globals.css";

// Golos Text — интерфейсный гротеск с полной кириллицей; Unbounded —
// дисплейная пара для крупных цифр тайминга и заголовков лендинга.
const golos = Golos_Text({
  subsets: ["latin", "cyrillic"],
  variable: "--font-golos",
  display: "swap",
});

const unbounded = Unbounded({
  subsets: ["latin", "cyrillic"],
  variable: "--font-unbounded",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const ru = locale !== "en";
  return {
    title: {
      default: "Intelligent Trails",
      template: "%s · Intelligent Trails",
    },
    description: ru
      ? "Генератор пешеходных прогулок: скажи, сколько у тебя времени и какое настроение — получи готовую петлю с честным таймингом."
      : "A walking route generator: tell it how much time you have and the mood — get a ready loop with honest timing.",
    icons: {
      icon: '/logo.png',
    },
  };
}

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
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
    <html lang={locale} className={`${golos.variable} ${unbounded.variable}`}>
      <body className="font-sans antialiased">
        <SessionProvider>
          <NextIntlClientProvider messages={messages}>
            <ToastProvider>
              <PreferencesProvider
                distanceUnit={distanceUnit}
                locale={locale as "ru" | "en"}
                mapLocale={mapLocale}
              >
                <NavigationProvider>
                  <Navigation isAuthenticated={isAuthenticated} />
                  {children}
                </NavigationProvider>
              </PreferencesProvider>
            </ToastProvider>
          </NextIntlClientProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
