import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Склеивает классы Tailwind, разрешая конфликты (например, если передано два разных цвета фона)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}