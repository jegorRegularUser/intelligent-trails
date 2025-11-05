import { useState, useCallback, useEffect, useRef } from 'react';

import { useYandexAPI } from './use-yandex-api';

import { Address } from '../types';

import { useToast } from '../components/ui/use-toast';

interface SuggestResult {
  title: string;
  subtitle?: string;
  fullAddress: string;
  coordinates?: { lat: number; lng: number } | null;
  value: string; // Для точного соответствия API
}

export const useGeosuggest = () => {
  const [suggestions, setSuggestions] = useState<SuggestResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastRequestedQuery = useRef<string | null>(null); // Для отслеживания изменений запроса

  const { ymaps, isLoaded } = useYandexAPI();
  const { toast } = useToast();

  const performSuggest = useCallback(
    async (query: string): Promise<SuggestResult[]> => {
      console.log('performSuggest called:', { query, isLoaded, ymaps: !!ymaps }); // Debug: вызов performSuggest

      if (!isLoaded || !ymaps || !query || query.length < 2) {
        console.log('Early return: conditions not met'); // Debug: ранний возврат
        setSuggestions([]);
        setError(null);
        return [];
      }

      // Проверяем, изменился ли запрос с последнего
      if (lastRequestedQuery.current === query) {
        console.log('Query unchanged, skipping request'); // Debug: запрос не изменился
        return suggestions; // Возвращаем текущие suggestions
      }

      console.log('Starting main suggest execution for query:', query); // Debug: начало основного выполнения
      setIsLoading(true);
      setError(null);
      setSuggestions([]);
      lastRequestedQuery.current = query;

      try {
        console.log('Before ymaps.suggest'); // Debug: перед API вызовом
        const result = await ymaps.suggest(query, {
          results: 5,
          provider: 'yandex#map',
        });
        console.log('ymaps.suggest result:', result, 123); // Основной лог результата

        // Обрабатываем result как массив напрямую (основной случай)
        let suggestResults: any[] = [];
        if (Array.isArray(result)) {
          suggestResults = result;
        } else if (result && result.metaData && Array.isArray(result.metaData.suggestions)) {
          // Fallback для старой структуры
          suggestResults = result.metaData.suggestions;
        } else {
          suggestResults = [];
        }

        console.log('Parsed suggestResults:', suggestResults); // Debug: распарсенные данные

        // Фильтруем и форматируем для реальной структуры (type: 'geo', displayName, value, hl, global)
        const formattedSuggestions: SuggestResult[] = suggestResults
          .filter((suggestion: any) =>
            suggestion.type === 'geo' &&
            suggestion.value &&
            suggestion.displayName
          )
          .slice(0, 5)
          .map((suggestion: any) => {
            const global = suggestion.global || {};
            const title = suggestion.displayName || suggestion.value || '';
            const subtitle = global.city || global.region || global.country || 
                             (suggestion.hl && suggestion.hl[0] ? suggestion.hl[0].text : '');

            const fullAddress = subtitle ? `${title}, ${subtitle}` : title;

            // Координаты из global.coordinates
            let coordinates: { lat: number; lng: number } | null = null;
            if (global.coordinates) {
              try {
                const [lat, lng] = global.coordinates.split(',').map(Number);
                if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
                  coordinates = { lat, lng };
                }
              } catch (e) {
                console.warn('Invalid coordinates format:', global.coordinates);
              }
            }

            return {
              title,
              subtitle: subtitle || undefined,
              fullAddress,
              value: suggestion.value || title,
              coordinates,
            };
          })
          .filter((item): item is SuggestResult => !!item.title);

        setSuggestions(formattedSuggestions);
        console.log('Formatted suggestions:', formattedSuggestions); // Debug: финальные suggestions

        if (formattedSuggestions.length === 0 && query.length >= 3) {
          toast({
            title: 'Не найдено',
            description: `Адреса "${query}" не найдены в выбранном регионе`,
            variant: 'default',
          });
        }

        return formattedSuggestions;
      } catch (err: any) {
        console.error('Ymaps.suggest error:', err);
        const errorMessage = err.message || 'Ошибка поиска адресов';
        setError(errorMessage);
        toast({
          title: 'Ошибка поиска',
          description: 'Не удалось найти адреса. Проверьте подключение или попробуйте другой запрос.',
          variant: 'destructive',
        });
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [isLoaded, ymaps, toast, suggestions] // suggestions добавлено для проверки изменений
  );

  const suggest = useCallback(
    async (query: string): Promise<SuggestResult[]> => {
      console.log('suggest called:', { query, isDebounced: true }); // Debug: внешний вызов suggest

      // Debounce: очищаем предыдущий таймер и ставим новый
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      return new Promise<SuggestResult[]>((resolve) => {
        debounceRef.current = setTimeout(async () => {
          console.log('Debounce timeout fired, performing suggest for:', query); // Debug: debounce сработал
          const results = await performSuggest(query);
          resolve(results);
        }, 800); // Debounce 300ms для комфортного поиска
      });
    },
    [performSuggest]
  );

  const selectSuggestion = useCallback((suggestion: SuggestResult): SuggestResult => {
    setSuggestions([]);
    setIsLoading(false);
    setError(null);
    lastRequestedQuery.current = null; // Сбрасываем последний запрос
    return suggestion;
  }, []);

  const clearSuggestions = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    setSuggestions([]);
    setIsLoading(false);
    setError(null);
    lastRequestedQuery.current = null;
  }, []);

  const suggestOnFocus = useCallback(
    (currentValue: string) => {
      if (currentValue && currentValue.length >= 2 && suggestions.length === 0 && !isLoading) {
        suggest(currentValue);
      }
    },
    [suggest, suggestions.length, isLoading]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      lastRequestedQuery.current = null;
    };
  }, []);

  // Debug: состояние хука при рендере
  console.log('useGeosuggest render:', { isLoaded, ymaps: !!ymaps, suggestions: suggestions.length });

  return {
    suggestions,
    isLoading,
    error,
    suggest,
    selectSuggestion,
    clearSuggestions,
    suggestOnFocus,
    isReady: isLoaded && !!ymaps,
  };
};
