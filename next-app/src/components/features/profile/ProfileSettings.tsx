import { useTranslations } from "next-intl";
import { User, Mail, Save } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface ProfileSettingsProps {
  initialName?: string;
  initialEmail?: string;
}

export const ProfileSettings = ({ initialName = "", initialEmail = "" }: ProfileSettingsProps) => {
  const t = useTranslations("Profile");

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t("personalData")}</h2>
        <p className="text-sm text-slate-500 mt-1">{t("personalDataDesc")}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6">
        <Input 
          defaultValue={initialName}
          placeholder={t("namePlaceholder")}
          leftIcon={<User size={20} />}
        />
        <Input 
          defaultValue={initialEmail}
          type="email"
          disabled // Email обычно нельзя просто так менять
          placeholder="Email"
          leftIcon={<Mail size={20} />}
        />
      </div>

      <div className="flex justify-end">
        <Button leftIcon={<Save size={20} />}>
          {t("saveChanges")}
        </Button>
      </div>
    </Card>
  );
};