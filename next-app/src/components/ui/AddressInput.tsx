"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "./Input";
import { Spinner } from "./Spinner";
import { MapPin, Search, Map } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";

// Импортируем оба наших Server Action'а
import { getAddressSuggestions, YandexSuggestResult } from "@/actions/suggest";
import { getCoordinatesFromAddress } from "@/actions/geocoder";
import { Coordinates } from "@/types/map";
import { useRouteStore } from "@/store/useRouteStore";

interface AddressInputProps {
  placeholder?: string;
  onSelect: (coords: Coordinates, addressText: string) => void;
  defaultValue?: string;
  onMapPickerClick?: () => void; // Новый проп для активации выбора на карте
}

export function AddressInput({ placeholder = "Введите адрес...", onSelect, defaultValue = "", onMapPickerClick }: AddressInputProps) {
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<YandexSuggestResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { userLocation } = useRouteStore();
  const debouncedQuery = useDebounce(query, 300); // Уменьшили с 500ms до 300ms
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Обновляем query когда меняется defaultValue (для синхронизации с выбором на карте)
  useEffect(() => {
    setQuery(defaultValue);
  }, [defaultValue]);

  // 1. Эффект для поиска текстовых подсказок
  useEffect(() => {
    async function fetchSuggestions() {
      if (debouncedQuery.length < 2 || !isOpen) { // Уменьшили с 3 до 2 символов
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      const results = await getAddressSuggestions(debouncedQuery, userLocation);
      setSuggestions(results);
      setIsLoading(false);
    }

    fetchSuggestions();
  }, [debouncedQuery, isOpen, userLocation]);

  // Закрытие списка по клику снаружи
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 2. Обработчик клика по адресу (Вот здесь работает ТВОЙ геокодер!)
  const handleSelect = async (item: YandexSuggestResult) => {
    const fullAddress = `${item.title}, ${item.subtitle}`;
    
    // Закрываем список и показываем выбранный текст
    setQuery(fullAddress);
    setIsOpen(false);
    
    // Включаем лоадер, пока геокодер ищет координаты
    setIsLoading(true);
    
    try {
      // Идем в твой action geocoder.ts
      const coords = await getCoordinatesFromAddress(fullAddress);
      
      if (coords) {
        onSelect(coords, fullAddress);
      } else {
        console.error("Не удалось найти координаты для этого адреса");
        // Здесь в будущем можно показать Toast-уведомление с ошибкой
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => {
          if (query.length >= 2) setIsOpen(true); // Уменьшили с 3 до 2
        }}
        placeholder={placeholder}
        leftIcon={<Search size={20} className="text-slate-400" />}
        rightIcon={
          isLoading ? (
            <Spinner size={20} className="text-brand-500" />
          ) : onMapPickerClick ? (
            <button
              type="button"
              onClick={onMapPickerClick}
              className="p-1 hover:bg-brand-50 rounded-lg transition-colors text-slate-400 hover:text-brand-600"
              title="Выбрать на карте"
            >
              <Map size={20} />
            </button>
          ) : null
        }
      />

      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full mt-2 bg-white rounded-2xl shadow-float border border-slate-200 overflow-y-auto max-h-60 custom-scrollbar">
          {suggestions.map((item, index) => (
            <li
              key={index}
              onClick={() => handleSelect(item)}
              className="flex items-center gap-4 p-4 hover:bg-brand-50 cursor-pointer transition-colors border-b border-slate-100 last:border-0"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-600">
                <MapPin size={20} />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="font-bold text-slate-800 truncate">{item.title}</span>
                <span className="text-sm text-slate-500 truncate">{item.subtitle}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}