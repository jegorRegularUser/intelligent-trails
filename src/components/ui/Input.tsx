import { InputHTMLAttributes, forwardRef, ReactNode } from "react";
import { cn } from "@/utils/cn";

// Варианты дизайна для разных ситуаций
const inputVariants = {
  default: "bg-white border-slate-200 focus:border-brand-500 focus:ring-brand-500/20",
  filled: "bg-slate-100 border-transparent hover:bg-slate-200 focus:bg-white focus:border-brand-500 focus:ring-brand-500/20",
  ghost: "bg-transparent border-transparent hover:bg-slate-100 focus:bg-white focus:border-brand-500 focus:ring-brand-500/20",
};

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  variant?: keyof typeof inputVariants;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  error?: boolean;       // Переключатель красного состояния
  errorText?: string;    // Текст ошибки под инпутом
  rounded?: string;      // Дефолтное скругление
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant = "default",
      rounded = "rounded-2xl",
      leftIcon,
      rightIcon,
      error = false,
      errorText,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <div className="w-full flex flex-col gap-1.5">
        {/* Обертка для позиционирования иконок */}
        <div className="relative flex items-center w-full">
          
          {/* Левая иконка */}
          {leftIcon && (
            <div className="absolute left-4 text-slate-400 pointer-events-none flex items-center justify-center">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            disabled={disabled}
            className={cn(
              // Базовые стили (высота 48px для удобного тапа на мобилке)
              "w-full h-12 text-base text-slate-900 placeholder:text-slate-400",
              "border-2 outline-none transition-all duration-200",
              "focus:ring-4", // Кольцо фокуса
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50",
              
              // Подключаем вариант, скругление
              inputVariants[variant],
              rounded,

              // Динамические отступы: если есть иконка, сдвигаем текст, чтобы не наезжал
              leftIcon ? "pl-11" : "pl-4",
              rightIcon ? "pr-11" : "pr-4",

              // Стили ошибки (перезаписывают бордер и кольцо фокуса)
              error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",

              // Кастомные классы извне
              className
            )}
            {...props}
          />

          {/* Правая иконка (часто используется для кнопок "Очистить" или "Показать пароль", 
              поэтому убираем pointer-events-none, если туда передали кнопку) */}
          {rightIcon && (
            <div className="absolute right-4 text-slate-400 flex items-center justify-center">
              {rightIcon}
            </div>
          )}
        </div>

        {/* Вывод текста ошибки, если он передан */}
        {errorText && (
          <span className="text-sm font-medium text-red-500 pl-4">
            {errorText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";