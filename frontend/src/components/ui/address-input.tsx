import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, MapPin, AlertCircle, ChevronRight } from 'lucide-react';
import { Badge } from '../ui/badge';
import { cn } from '@/lib/utils';
import { useGeosuggest } from '../../hooks/use-geosuggest';
import { Address } from '../../types';

interface AddressInputProps {
  value: string;
  onChange: (value: string, address?: Address) => void;
  placeholder?: string;
  error?: boolean;
  className?: string;
  coordinates?: { lat: number; lng: number } | undefined;
  label?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

const AddressInput: React.FC<AddressInputProps> = ({
  value,
  onChange,
  placeholder = 'Введите адрес',
  error = false,
  className,
  coordinates,
  label,
  disabled = false,
  autoFocus = false,
}) => {
  const [inputValue, setInputValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  
  const { 
    suggestions, 
    isLoading, 
    error: suggestError, 
    suggest, 
    selectSuggestion, 
    clearSuggestions,
    suggestOnFocus 
  } = useGeosuggest();

  // Синхронизация с внешним value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Фокус на инпут при autoFocus
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Обработка клика вне компонента
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        if (inputValue.length < 2) {
          clearSuggestions();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [clearSuggestions, inputValue.length]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    
    // Обновляем родительский компонент
    onChange(newValue, undefined);
    
    // Управляем показа suggestions
    if (newValue.length >= 2) {
      setShowSuggestions(true);
      suggest(newValue);
    } else {
      setShowSuggestions(false);
      clearSuggestions();
    }
  }, [onChange, suggest, clearSuggestions]);

  const handleSuggestionClick = useCallback((suggestion: any) => {
    const selected = selectSuggestion(suggestion);
    setInputValue(selected.title);
    
    // Передаем данные в родительский компонент
    onChange(selected.title, {
      title: selected.title,
      fullAddress: selected.fullAddress,
      coordinates: selected.coordinates || { lat: 0, lng: 0 },
    });
    
    setShowSuggestions(false);
    clearSuggestions();
    
    // Фокус остается на инпуте
    inputRef.current?.focus();
  }, [selectSuggestion, onChange, clearSuggestions]);

  const handleClear = useCallback(() => {
    setInputValue('');
    setShowSuggestions(false);
    onChange('', undefined);
    clearSuggestions();
    inputRef.current?.focus();
  }, [onChange, clearSuggestions]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setShowSuggestions(false);
      clearSuggestions();
      inputRef.current?.blur();
    } else if (e.key === 'ArrowDown' && showSuggestions && suggestions.length > 0) {
      e.preventDefault();
      // TODO: Добавить навигацию по списку клавишами
    } else if (e.key === 'Enter' && showSuggestions && suggestions.length > 0 && !isLoading) {
      e.preventDefault();
      const firstSuggestion = suggestions[0];
      if (firstSuggestion) {
        handleSuggestionClick(firstSuggestion);
      }
    }
  }, [showSuggestions, suggestions, isLoading, handleSuggestionClick, clearSuggestions]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    if (inputValue.length >= 2 && suggestions.length === 0 && !isLoading) {
      suggestOnFocus(inputValue);
      setShowSuggestions(true);
    }
  }, [inputValue, suggestions.length, isLoading, suggestOnFocus]);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    // Небольшая задержка для обработки клика по suggestion
    setTimeout(() => {
      if (!document.activeElement?.closest('.suggestion-item')) {
        setShowSuggestions(false);
      }
    }, 150);
  }, []);

  // Проверяем наличие координат
  const hasValidCoordinates = coordinates && 
    coordinates.lat !== undefined && 
    coordinates.lng !== undefined && 
    coordinates.lat !== 0 && 
    coordinates.lng !== 0;

  return (
    <div className={cn("relative w-full group", className)} ref={containerRef}>
      {/* Лейбл */}
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
        </label>
      )}

      {/* Основной инпут */}
      <div className={cn(
        "relative flex items-center rounded-xl border-2 bg-white pr-10 pl-4 py-3 transition-all duration-200 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100/50",
        error ? "border-red-500 ring-2 ring-red-100/50" : "border-gray-200 hover:border-gray-300",
        disabled && "bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed"
      )}>
        <Search className={cn(
          "w-5 h-5 flex-shrink-0 transition-colors",
          isFocused ? "text-blue-600" : "text-gray-400"
        )} />
        
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-400 text-base font-normal",
            error && "pr-2",
            disabled && "cursor-not-allowed"
          )}
          autoComplete="off"
          aria-label={label || placeholder}
          aria-describedby={suggestError ? "suggest-error" : undefined}
          aria-expanded={showSuggestions}
          aria-haspopup="listbox"
        />

        {/* Индикатор координат */}
        {hasValidCoordinates && (
          <div className="absolute right-10 p-1 bg-green-100 rounded-full border border-green-200">
            <MapPin className="w-4 h-4 text-green-600" />
          </div>
        )}

        {/* Кнопка очистки */}
        {inputValue && !disabled && (
          <button
            onClick={handleClear}
            className="absolute right-3 p-1 text-gray-400 hover:text-gray-600 transition-colors rounded-full hover:bg-gray-100 disabled:opacity-50"
            type="button"
            disabled={disabled}
            aria-label="Очистить"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Ошибка suggest API */}
      {suggestError && (
        <div id="suggest-error" className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2 text-sm" role="alert">
          <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0" />
          <span className="text-yellow-800">{suggestError}</span>
        </div>
      )}

      {/* Список предложений */}
      {showSuggestions && (suggestions.length > 0 || isLoading) && (
        <div 
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-72 overflow-hidden"
          role="listbox"
          aria-label="Предложения адресов"
        >
          <div className="overflow-y-auto max-h-72" ref={listRef}>
            {isLoading ? (
              <div className="px-4 py-4 text-center text-gray-500 text-sm bg-gray-50">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>Поиск адресов...</span>
                </div>
              </div>
            ) : suggestions.length > 0 ? (
              <ul className="divide-y divide-gray-100">
                {suggestions.map((suggestion, index) => (
                  <li key={`${suggestion.value}-${index}`} className="cursor-pointer">
                    <button
                      onClick={() => handleSuggestionClick(suggestion)}
                      className={cn(
                        "w-full text-left px-4 py-3 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none transition-colors",
                        "group flex items-center justify-between suggestion-item"
                      )}
                      role="option"
                      aria-selected={false}
                    >
                      <div className="flex-1 min-w-0">
                        <div 
                          className="text-sm text-gray-900 font-medium truncate pr-2" 
                          title={suggestion.title}
                        >
                          {suggestion.title}
                        </div>
                        {suggestion.subtitle && (
                          <div 
                            className="text-xs text-gray-500 mt-1 truncate pr-2" 
                            title={suggestion.subtitle}
                          >
                            {suggestion.subtitle}
                          </div>
                        )}
                        {suggestion.coordinates && (
                          <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                            <MapPin className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">Точные координаты</span>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 ml-2 flex-shrink-0" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-4 py-4 text-center text-gray-500 text-sm bg-gray-50 border-t border-gray-100">
                {inputValue.length >= 2 ? 'Адреса не найдены' : 'Начните вводить адрес'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Валидация ошибки */}
      {error && inputValue && !isFocused && !disabled && (
        <div className="mt-2 flex items-center gap-2 text-sm text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Введите корректный адрес</span>
        </div>
      )}
    </div>
  );
};

export default AddressInput;
