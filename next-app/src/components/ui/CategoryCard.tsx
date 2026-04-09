import { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface CategoryCardProps {
  title: string;
  icon: ReactNode;
  selected?: boolean;
  onClick: () => void;
  className?: string;
}

export function CategoryCard({ title, icon, selected, onClick, className }: CategoryCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // Базовые стили: карточка для удобного тапа (Touch Target)
        "flex flex-col items-center justify-center gap-2 p-4 rounded-2xl transition-all duration-200",
        "border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        "active:scale-95", // Эффект пружинки при нажатии
        
        // Невыбранное состояние
        !selected && "bg-white border-slate-100 text-slate-600 hover:border-brand-200 hover:bg-brand-50/50",
        
        // Выбранное состояние (Изумрудный акцент)
        selected && "bg-brand-50 border-brand-500 text-brand-700 shadow-sm",
        
        className
      )}
    >
      <div className={cn(
        "p-3 rounded-full transition-colors",
        selected ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-500"
      )}>
        {icon}
      </div>
      <span className="text-sm font-medium text-center leading-tight">
        {title}
      </span>
    </button>
  );
}