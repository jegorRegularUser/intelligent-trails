"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { updatePasswordAction } from "@/actions/profile";
import { useToast } from "@/contexts/ToastContext";

interface SecuritySettingsProps {
  provider?: "local" | "yandex" | "google" | "github";
}

export const SecuritySettings = ({ provider = "local" }: SecuritySettingsProps) => {
  const t = useTranslations("Profile");
  const { showToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdatePassword = async () => {
    if (!currentPassword || !newPassword) {
      showToast(t("fillAllFields"), "error");
      return;
    }

    if (newPassword.length < 6) {
      showToast(t("passwordTooShort"), "error");
      return;
    }

    setIsUpdating(true);
    try {
      const result = await updatePasswordAction(currentPassword, newPassword);
      if (result.success) {
        showToast(t("passwordUpdated"), "success");
        setCurrentPassword("");
        setNewPassword("");
      }
    } catch (error: any) {
      if (error.message === "Current password is incorrect") {
        showToast(t("incorrectPassword"), "error");
      } else if (error.message === "Password change not available for OAuth users") {
        showToast(t("oauthPasswordError"), "error");
      } else {
        showToast(error.message || t("updateError"), "error");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t("security")}</h2>
        <p className="text-sm text-slate-500 mt-1">{t("securityDesc")}</p>
      </div>

      {provider !== "local" ? (
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
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={t("currentPassword")}
            leftIcon={<Lock size={20} />}
          />
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t("newPassword")}
            leftIcon={<Lock size={20} />}
          />
          <div className="flex justify-end mt-2">
            <Button
              variant="outline"
              onClick={handleUpdatePassword}
              disabled={isUpdating || !currentPassword || !newPassword}
            >
              {isUpdating ? t("updating") : t("updatePassword")}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
};