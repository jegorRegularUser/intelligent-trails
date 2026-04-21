"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { User, Mail, Save } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { updateNameAction } from "@/actions/profile";
import { useToast } from "@/contexts/ToastContext";

interface ProfileSettingsProps {
  initialName?: string;
  initialEmail?: string;
}

export const ProfileSettings = ({ initialName = "", initialEmail = "" }: ProfileSettingsProps) => {
  const t = useTranslations("Profile");
  const { showToast } = useToast();
  const [name, setName] = useState(initialName);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name || name.trim() === initialName) {
      return;
    }

    setIsSaving(true);
    try {
      console.log('Updating name to:', name.trim());
      const result = await updateNameAction(name.trim());
      console.log('Update result:', result);

      if (result.success) {
        showToast(t("nameUpdated"), "success");
        // Обновляем локальное состояние, чтобы кнопка стала неактивной
        // Данные в сессии обновятся автоматически при следующем запросе
      } else {
        console.error('Update failed: success is false');
        showToast(t("updateError"), "error");
      }
    } catch (error: any) {
      console.error('Update error:', error);
      showToast(error.message || t("updateError"), "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t("personalData")}</h2>
        <p className="text-sm text-slate-500 mt-1">{t("personalDataDesc")}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("namePlaceholder")}
          leftIcon={<User size={20} />}
        />
        <Input
          value={initialEmail}
          type="email"
          disabled
          placeholder="Email"
          leftIcon={<Mail size={20} />}
        />
      </div>

      <div className="flex justify-end">
        <Button
          leftIcon={<Save size={20} />}
          onClick={handleSave}
          disabled={isSaving || !name || name.trim() === initialName}
        >
          {isSaving ? t("saving") : t("saveChanges")}
        </Button>
      </div>
    </Card>
  );
};