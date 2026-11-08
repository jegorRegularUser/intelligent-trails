"use client";

import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AlertCircle, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { PLACE_CATEGORIES } from "@/constants/categories";

export interface RouteErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  errorMessage: string;
  onRetry: () => void;
  onRemovePoint: () => void;
  categoryName?: string;
}

export function RouteErrorModal({
  isOpen,
  onClose,
  errorMessage,
  onRetry,
  onRemovePoint,
  categoryName,
}: RouteErrorModalProps) {
  const t = useTranslations("RouteErrorModal");
  const tBuilder = useTranslations("BuilderSidebar");

  // Форматируем название категории с использованием переводов
  const getFormattedCategoryName = (categoryId?: string): string | undefined => {
    if (!categoryId) return undefined;

    // Проверяем, есть ли это в списке категорий
    if (categoryId in PLACE_CATEGORIES) {
      // Используем перевод из BuilderSidebar
      const translationKey = `cat${categoryId.charAt(0).toUpperCase() + categoryId.slice(1)}`;
      return tBuilder(translationKey as any);
    }

    // Fallback: возвращаем с заглавной буквы
    return categoryId.charAt(0).toUpperCase() + categoryId.slice(1);
  };

  const formattedCategoryName = getFormattedCategoryName(categoryName);

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false}>
      <ModalHeader>
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-100 rounded-2xl shrink-0">
            <AlertCircle size={24} className="text-red-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-800 mb-1">
              {t("title")}
            </h3>
            <p className="text-sm text-slate-500">
              {t("subtitle")}
            </p>
          </div>
        </div>
      </ModalHeader>

      <ModalBody>
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
          <p className="text-slate-700 text-sm leading-relaxed">
            {errorMessage}
          </p>
          {formattedCategoryName && (
            <p className="text-slate-500 text-xs mt-2">
              {t("categoryLabel")}: <span className="font-bold">{formattedCategoryName}</span>
            </p>
          )}
        </div>

        <p className="text-slate-600 text-sm mt-4 leading-relaxed">
          {t("description")}
        </p>
      </ModalBody>

      <ModalFooter className="flex-col sm:flex-row gap-3">
        <Button
          variant="outline"
          size="md"
          onClick={onRemovePoint}
          leftIcon={<Trash2 size={18} />}
          className="w-full sm:w-auto"
        >
          {t("removeButton")}
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={onRetry}
          leftIcon={<RefreshCw size={18} />}
          className="w-full sm:w-auto"
        >
          {t("retryButton")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
