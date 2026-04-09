import { ReactNode } from "react";
import { cn } from "@/utils/cn";

interface TimelineItemProps {
  children: ReactNode;
  icon: ReactNode;
  isLast?: boolean;
  isActive?: boolean;
  className?: string;
}

export function TimelineItem({ children, icon, isLast, isActive, className }: TimelineItemProps) {
  return (
    <div className={cn("relative flex gap-4 pb-8", isLast && "pb-0", className)}>
      {/* Линия и Иконка */}
      <div className="flex flex-col items-center shrink-0">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center border-2 border-white shadow-sm z-10 transition-colors",
          isActive ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-500"
        )}>
          {icon}
        </div>
        {!isLast && (
          <div className="absolute left-[19px] top-10 bottom-0 w-0.5 bg-slate-200 z-0" />
        )}
      </div>

      {/* Контент */}
      <div className="flex-1 pt-1 min-w-0">
        {children}
      </div>
    </div>
  );
}