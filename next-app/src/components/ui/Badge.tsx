import { ReactNode } from "react";
import { cn } from "@/utils/cn";

const badgeVariants = {
  default: "bg-slate-100 text-slate-700 border-slate-200",
  primary: "bg-brand-100 text-brand-700 border-brand-200",
  secondary: "bg-blue-100 text-blue-700 border-blue-200",
  success: "bg-green-100 text-green-700 border-green-200",
  warning: "bg-yellow-100 text-yellow-700 border-yellow-200",
  danger: "bg-red-100 text-red-700 border-red-200",
};

const badgeSizes = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-3 py-1",
};

export interface BadgeProps {
  children: ReactNode;
  variant?: keyof typeof badgeVariants;
  size?: keyof typeof badgeSizes;
  className?: string;
}

export function Badge({ children, variant = "default", size = "sm", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium rounded-full border transition-colors",
        badgeVariants[variant],
        badgeSizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}
