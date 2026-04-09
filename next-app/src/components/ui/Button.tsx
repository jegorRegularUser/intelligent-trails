import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Spinner } from "./Spinner";

// 1. Словари стилей (легко расширять в будущем)
const buttonVariants = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 shadow-sm border border-transparent",
  secondary: "bg-brand-100 text-brand-700 hover:bg-brand-200 border border-transparent",
  outline: "bg-transparent text-slate-700 border-2 border-slate-200 hover:border-brand-500 hover:text-brand-600",
  ghost: "bg-transparent text-slate-600 hover:bg-slate-100 border border-transparent",
  danger: "bg-red-500 text-white hover:bg-red-600 shadow-sm border border-transparent",
};

const buttonSizes = {
  sm: "h-9 px-4 text-sm",
  md: "h-12 px-6 text-base font-medium", // 48px - идеальная высота для нажатия пальцем на мобилке
  lg: "h-14 px-8 text-lg font-bold",
  icon: "h-12 w-12 justify-center p-0", // Квадратная кнопка только для иконки
};

// 2. Интерфейс пропсов. Наследуем все стандартные атрибуты <button> (type, onClick, disabled и т.д.)
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof buttonVariants;
  size?: keyof typeof buttonSizes;
  isLoading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  // Позволяем переопределить скругление, если нужно (по умолчанию rounded-2xl)
  rounded?: string; 
}

// 3. Сам компонент
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      rounded = "rounded-2xl", // Дефолтное сильное скругление из нашего дизайн-кода
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    // Если кнопка загружается, она автоматически должна стать disabled
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={cn(
          // Базовые стили для всех кнопок
          "relative inline-flex items-center justify-center gap-2 transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
          "active:scale-[0.98]", // Легкий эффект вдавливания при клике
          "disabled:pointer-events-none disabled:opacity-50", // Стили для неактивного состояния
          
          // Подключаем стили из словарей
          buttonVariants[variant],
          buttonSizes[size],
          rounded,
          
          // Внешние классы для точечной настройки (перезапишут базовые, если есть конфликт)
          className
        )}
        {...props}
      >
        {/* Рендерим лоадер или левую иконку */}
        {isLoading && <Spinner className="absolute left-1/2 -translate-x-1/2" />}
        
        {/* Если загрузка, прячем контент (делаем прозрачным), чтобы ширина кнопки не дергалась */}
        <span className={cn("inline-flex items-center gap-2", isLoading && "opacity-0")}>
          {leftIcon && <span className="shrink-0">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="shrink-0">{rightIcon}</span>}
        </span>
      </button>
    );
  }
);

Button.displayName = "Button"; // Полезно для дебага в React DevTools