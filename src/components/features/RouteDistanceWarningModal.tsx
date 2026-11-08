"use client";

import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { AlertTriangle, Navigation, X } from "lucide-react";
import { useTranslations } from "next-intl";

export interface RouteDistanceWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceed: () => void;
  distance: number; // в метрах
}

export function RouteDistanceWarningModal({
  isOpen,
  onClose,
  distance,
  onProceed,
}: RouteDistanceWarningModalProps) {
  const t = useTranslations("RouteDistanceWarning");

  // Форматируем расстояние в км
  const distanceKm = Math.round(distance / 1000);

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false}>
      <ModalHeader>
        <div className="flex items-start gap-4">
          <div className="p-3 bg-amber-100 rounded-2xl shrink-0">
            <AlertTriangle size={24} className="text-amber-600" />
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
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200">
          <p className="text-slate-700 text-sm leading-relaxed">
            {t("distanceInfo", { distance: distanceKm })}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <p className="text-slate-700 text-sm leading-relaxed">
            {t("description")}
          </p>

          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <span className="text-amber-600 mt-0.5">•</span>
              <span>{t("reason1")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-600 mt-0.5">•</span>
              <span>{t("reason2")}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-600 mt-0.5">•</span>
              <span>{t("reason3")}</span>
            </li>
          </ul>

          <p className="text-slate-600 text-sm mt-4">
            {t("recommendation")}
          </p>
        </div>
      </ModalBody>

      <ModalFooter className="flex-col sm:flex-row gap-3">
        <Button
          variant="outline"
          size="md"
          onClick={onClose}
          leftIcon={<X size={18} />}
          className="w-full sm:w-auto"
        >
          {t("cancelButton")}
        </Button>
        <Button
          variant="primary"
          size="md"
          onClick={onProceed}
          leftIcon={<Navigation size={18} />}
          className="w-full sm:w-auto"
        >
          {t("proceedButton")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
