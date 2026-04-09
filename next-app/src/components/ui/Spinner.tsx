import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

interface SpinnerProps {
  className?: string;
  size?: number;
}

export function Spinner({ className, size = 20 }: SpinnerProps) {
  return (
    <Loader2 
      size={size} 
      // animate-spin - это встроенный класс Tailwind для бесконечного вращения
      className={cn("animate-spin text-current", className)} 
    />
  );
}