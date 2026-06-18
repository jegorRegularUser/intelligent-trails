"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bookmark, LogIn, UserPlus } from "lucide-react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

interface LoginRequiredModalProps {
  isOpen: boolean;
  onClose: () => void;
  locale: string;
}

export function LoginRequiredModal({ isOpen, onClose, locale }: LoginRequiredModalProps) {
  const t = useTranslations("LoginRequiredModal");

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader>
        <div className="flex items-start gap-4">
          <div className="p-3 bg-brand-50 rounded-2xl shrink-0">
            <Bookmark size={24} className="text-brand-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800 mb-1">{t("title")}</h3>
            <p className="text-sm text-slate-500">{t("subtitle")}</p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <p className="text-slate-600 text-sm leading-relaxed">{t("description")}</p>
      </ModalBody>

      <ModalFooter className="flex-col gap-3 !justify-stretch">
        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <Link href={`/${locale}/signup`} className="flex-1 w-full">
            <Button variant="outline" size="md" leftIcon={<UserPlus size={18} />} className="w-full">
              {t("signUpButton")}
            </Button>
          </Link>
          <Link href={`/${locale}/signin`} className="flex-1 w-full">
            <Button variant="primary" size="md" leftIcon={<LogIn size={18} />} className="w-full">
              {t("signInButton")}
            </Button>
          </Link>
        </div>
        <Button variant="outline" size="md" onClick={onClose} className="w-full">
          {t("cancelButton")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}