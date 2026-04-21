"use client";

import { Button } from "@/components/ui/Button";
import { MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

export function EmptyState() {
  const router = useRouter();
  const t = useTranslations("History");

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-24 h-24 mb-6 bg-slate-100 rounded-full flex items-center justify-center">
        <MapPin size={40} className="text-slate-400" />
      </div>
      <h3 className="text-xl font-bold text-slate-800 mb-2">
        {t("emptyTitle")}
      </h3>
      <p className="text-slate-600 mb-6 max-w-md">
        {t("emptyDescription")}
      </p>
      <Button
        variant="primary"
        size="lg"
        onClick={() => router.push("/")}
      >
        {t("createFirstRoute")}
      </Button>
    </div>
  );
}
