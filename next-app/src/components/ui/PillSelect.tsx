import { cn } from "@/utils/cn";

export interface PillOption<T> {
  label: string;
  value: T;
}

interface PillSelectProps<T> {
  options: PillOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function PillSelect<T extends string | number>({ options, value, onChange, className }: PillSelectProps<T>) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-4 py-2 rounded-full text-xs font-bold transition-all border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              isActive 
                ? "bg-slate-800 border-slate-800 text-white shadow-md" 
                : "bg-white border-slate-200 text-slate-600 hover:border-brand-300"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}