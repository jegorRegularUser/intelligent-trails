import { useState, useEffect } from 'react';

/**
 * Откладывает обновление значения на указанное время (в миллисекундах).
 * Если значение меняется до истечения времени, таймер сбрасывается.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}