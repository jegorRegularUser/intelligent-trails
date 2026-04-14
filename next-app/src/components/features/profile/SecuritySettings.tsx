import { useTranslations } from "next-intl";
import { Lock, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface SecuritySettingsProps {
  provider?: "local" | "yandex";
}

export const SecuritySettings = ({ provider = "local" }: SecuritySettingsProps) => {
  const t = useTranslations("Profile");

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t("security")}</h2>
        <p className="text-sm text-slate-500 mt-1">{t("securityDesc")}</p>
      </div>

      {provider === "yandex" ? (
        <div className="flex items-start gap-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800">
          <ShieldAlert className="shrink-0 mt-0.5" size={24} />
          <p className="text-sm leading-relaxed">
            {t("oauthWarning")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Input 
            type="password"
            placeholder={t("currentPassword")}
            leftIcon={<Lock size={20} />}
          />
          <Input 
            type="password"
            placeholder={t("newPassword")}
            leftIcon={<Lock size={20} />}
          />
          <div className="flex justify-end mt-2">
            <Button variant="outline">{t("updatePassword")}</Button>
          </div>
        </div>
      )}
    </Card>
  );
};