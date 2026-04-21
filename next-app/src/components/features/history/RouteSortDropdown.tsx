"use client";

import { SortOption } from "@/types/history";
import { Dropdown, DropdownOption } from "@/components/ui/Dropdown";
import { useTranslations } from "next-intl";

interface RouteSortDropdownProps {
  value: SortOption;
  onChange: (value: SortOption) => void;
}

export function RouteSortDropdown({ value, onChange }: RouteSortDropdownProps) {
  const t = useTranslations("History");

  const sortOptions: DropdownOption<SortOption>[] = [
    { value: "date-desc", label: t("sortDateDesc") },
    { value: "date-asc", label: t("sortDateAsc") },
    { value: "name-asc", label: t("sortNameAsc") },
    { value: "name-desc", label: t("sortNameDesc") },
    { value: "distance-asc", label: t("sortDistanceAsc") },
    { value: "distance-desc", label: t("sortDistanceDesc") },
    { value: "duration-asc", label: t("sortDurationAsc") },
    { value: "duration-desc", label: t("sortDurationDesc") },
  ];

  return (
    <Dropdown
      options={sortOptions}
      value={value}
      onChange={onChange}
      className="w-full sm:w-64"
    />
  );
}
