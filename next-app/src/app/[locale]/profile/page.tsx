import { getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/Avatar";
import { ProfileSettings } from "@/components/features/profile/ProfileSettings";
import { SecuritySettings } from "@/components/features/profile/SecuritySettings";
import { PreferencesSettings } from "@/components/features/profile/PreferencesSettings";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { ToastProvider } from "@/contexts/ToastContext";

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("Profile");

  // Получаем сессию пользователя
  const session = await auth();

  // Если не авторизован - редирект на страницу входа
  if (!session?.user) {
    redirect(`/${locale}/signin`);
  }

  // Определяем provider: если есть image (аватар от OAuth), значит OAuth, иначе local
  // Это упрощенная эвристика, но работает для большинства случаев
  const provider = session.user.image ? "google" : "local";

  // Получаем настройки пользователя из базы данных
  const { getDb } = await import("@/lib/db/mongodb");
  const { ObjectId } = await import("mongodb");
  const db = await getDb();
  const usersCollection = db.collection("users");
  const dbUser = await usersCollection.findOne({ _id: new ObjectId(session.user.id) });

  const user = {
    name: session.user.name || "Пользователь",
    email: session.user.email || "",
    provider: provider as "local" | "google" | "github" | "yandex",
    locale: locale as "ru" | "en",
    avatarUrl: session.user.image || null,
    distanceUnit: (dbUser?.preferences?.distanceUnit as "km" | "mi") || "km",
    useCustomMapLocale: dbUser?.preferences?.useCustomMapLocale || false,
    mapLocale: (dbUser?.preferences?.mapLocale as "ru" | "en") || (locale as "ru" | "en"),
  };

  return (
    <ToastProvider>
      <div className="min-h-screen bg-slate-50/50 py-12 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex flex-col gap-8">

          {/* Заголовок страницы */}
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {t("title")}
            </h1>
            <p className="text-slate-500 mt-2 text-base">
              {t("subtitle")}
            </p>
          </div>

          {/* Блок с Аватаром */}
          <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <Avatar src={user.avatarUrl} alt={user.name} />
            <div className="text-center sm:text-left">
              <h2 className="text-2xl font-bold text-slate-900">{user.name}</h2>
              <p className="text-slate-500">{user.email}</p>
            </div>
          </div>

          {/* Секции настроек */}
          <div className="flex flex-col gap-6">
            <ProfileSettings
              initialName={user.name}
              initialEmail={user.email}
            />
            <SecuritySettings
              provider={user.provider}
            />
            <PreferencesSettings
              currentLocale={user.locale}
              distanceUnit={user.distanceUnit}
              useCustomMapLocale={user.useCustomMapLocale}
              mapLocale={user.mapLocale}
            />
          </div>

        </div>
      </div>
    </ToastProvider>
  );
}