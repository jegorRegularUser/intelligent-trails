"use client";

import { MapPin } from "lucide-react";
import { PlaceOfInterest } from "@/types/map";
import { Dropdown, DropdownOption } from "./Dropdown";

interface AlternativesSelectProps {
  alternatives: PlaceOfInterest[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function AlternativesSelect({ alternatives, selectedIndex, onSelect }: AlternativesSelectProps) {
  if (!alternatives || alternatives.length <= 1) return null;

  const options: DropdownOption<number>[] = alternatives.map((place, index) => ({
    value: index,
    label: place.name || `Вариант ${index + 1}`,
    description: place.address,
    icon: <MapPin size={14} className="text-brand-500" />,
  }));

  return (
    <div className="flex flex-col w-full">
      <Dropdown
        options={options}
        value={selectedIndex}
        onChange={onSelect}
        triggerClassName="text-left"
      />
      <p className="text-[10px] font-bold text-brand-500/80 uppercase tracking-wider mt-2">
        Вариант {selectedIndex + 1} из {alternatives.length}
      </p>
    </div>
  );
}
