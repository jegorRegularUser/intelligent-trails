import { getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/Avatar";
import { ProfileSettings } from "@/components/features/profile/ProfileSettings";
import { SecuritySettings } from "@/components/features/profile/SecuritySettings";
import { PreferencesSettings } from "@/components/features/profile/PreferencesSettings";

// В будущем здесь будет получение сессии юзера из БД (например, getServerSession)
const MOCK_USER = {
  name: "Иван Иванов",
  email: "ivan@example.com",
  provider: "local" as const, // Попробуй поменять на "local" при тесте
  locale: "ru" as const,
  avatarUrl: null,
};

export default async function ProfilePage({ params }: { params: { locale: string } }) {
  // В серверных компонентах next-intl используется getTranslations
  const t = await getTranslations("Profile");

  return (
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

        {/* Блок с Аватаром (можно вынести в отдельный компонент, если разрастется) */}
        <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-white rounded-3xl border border-slate-200 shadow-sm">
          <Avatar src={MOCK_USER.avatarUrl} alt={MOCK_USER.name} />
          <div className="text-center sm:text-left">
            <h2 className="text-2xl font-bold text-slate-900">{MOCK_USER.name}</h2>
            <p className="text-slate-500">{MOCK_USER.email}</p>
          </div>
        </div>

        {/* Секции настроек */}
        <div className="flex flex-col gap-6">
          <ProfileSettings 
            initialName={MOCK_USER.name} 
            initialEmail={MOCK_USER.email} 
          />
          <SecuritySettings 
            provider={MOCK_USER.provider} 
          />
          <PreferencesSettings 
            currentLocale={MOCK_USER.locale} 
          />
        </div>
        
      </div>
    </div>
  );
}