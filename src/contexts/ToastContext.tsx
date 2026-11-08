"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import Link from "next/link";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/utils/cn";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastAction {
  label: string;
  href?: string;
  onClick?: () => void;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, action?: ToastAction) => void;
}

const TOAST_STYLES: Record<ToastType, { container: string; icon: typeof CheckCircle2 }> = {
  success: {
    container: "bg-white border border-emerald-200 text-emerald-900 shadow-emerald-100/50",
    icon: CheckCircle2,
  },
  error: {
    container: "bg-white border border-red-200 text-red-900 shadow-red-100/50",
    icon: AlertCircle,
  },
  warning: {
    container: "bg-white border border-amber-200 text-amber-900 shadow-amber-100/50",
    icon: AlertTriangle,
  },
  info: {
    container: "bg-white border border-slate-200 text-slate-800 shadow-slate-200/50",
    icon: Info,
  },
};

const ICON_COLORS: Record<ToastType, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-brand-500",
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info", action?: ToastAction) => {
    const id = Math.random().toString(36).substring(7);
    const newToast: Toast = { id, message, type, action };

    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, action ? 6000 : 4500);
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 pointer-events-none max-w-sm w-full sm:w-auto px-4 sm:px-0">
        {toasts.map((toast) => {
          const style = TOAST_STYLES[toast.type];
          const Icon = style.icon;

          return (
            <div
              key={toast.id}
              role="alert"
              className={cn(
                "pointer-events-auto flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-xl backdrop-blur-md animate-in slide-in-from-right-full duration-300",
                style.container
              )}
            >
              <Icon size={20} className={cn("shrink-0 mt-0.5", ICON_COLORS[toast.type])} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">{toast.message}</p>
                {toast.action && (
                  <div className="mt-2">
                    {toast.action.href ? (
                      <Link
                        href={toast.action.href}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700 underline underline-offset-2"
                      >
                        {toast.action.label}
                      </Link>
                    ) : (
                      <button
                        onClick={toast.action.onClick}
                        className="text-xs font-semibold text-brand-600 hover:text-brand-700 underline underline-offset-2"
                      >
                        {toast.action.label}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => removeToast(toast.id)}
                className="shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors text-slate-400 hover:text-slate-600"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}