import { cn } from "@/utils/cn";
import { User } from "lucide-react";

interface AvatarProps {
  src?: string | null;
  alt?: string;
  className?: string;
}

export const Avatar = ({ src, alt = "User avatar", className }: AvatarProps) => {
  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full bg-slate-100 border border-slate-200 overflow-hidden",
        "h-24 w-24 sm:h-32 sm:w-32", // Дефолтные размеры
        className
      )}
    >
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <User className="h-1/2 w-1/2 text-slate-400" />
      )}
    </div>
  );
};