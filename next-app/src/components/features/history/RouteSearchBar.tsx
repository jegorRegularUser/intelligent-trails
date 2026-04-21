"use client";

import { Input } from "@/components/ui/Input";
import { Search, X } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useTranslations } from "next-intl";

interface RouteSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export function RouteSearchBar({ value, onChange }: RouteSearchBarProps) {
  const t = useTranslations("History");

  return (
    <Input
      type="text"
      placeholder={t("searchPlaceholder")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      leftIcon={<Search size={18} />}
      rightIcon={
        value ? (
          <IconButton
            icon={<X size={18} />}
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
          />
        ) : null
      }
      variant="filled"
    />
  );
}
