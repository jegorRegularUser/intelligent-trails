import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { cn } from "@/utils/cn";

const iconButtonVariants = {
  ghost: "bg-transparent text-slate-400 hover:text-brand-500 hover:bg-brand-50",
  outline: "bg-white text-slate-600 border-2 border-slate-200 hover:border-brand-500 hover:text-brand-600",
  primary: "bg-brand-500 text-white hover:bg-brand-600",
  danger: "bg-transparent text-slate-400 hover:text-red-500 hover:bg-red-50",
};

const iconButtonSizes = {
  sm: "h-8 w-8 p-1.5",
  md: "h-10 w-10 p-2",
  lg: "h-12 w-12 p-3",
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  variant?: keyof typeof iconButtonVariants;
  size?: keyof typeof iconButtonSizes;
  rounded?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      icon,
      variant = "ghost",
      size = "md",
      rounded = "rounded-xl",
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center shrink-0 transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
          "active:scale-95",
          "disabled:pointer-events-none disabled:opacity-50",
          iconButtonVariants[variant],
          iconButtonSizes[size],
          rounded,
          className
        )}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
