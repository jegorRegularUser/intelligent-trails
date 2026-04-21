"use client";

import { createContext, useContext, ReactNode } from "react";
import { DistanceUnit } from "@/utils/format";

interface PreferencesContextType {
  distanceUnit: DistanceUnit;
  locale: "ru" | "en";
  mapLocale: "ru" | "en";
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

interface PreferencesProviderProps {
  children: ReactNode;
  distanceUnit?: DistanceUnit;
  locale: "ru" | "en";
  mapLocale?: "ru" | "en";
}

export function PreferencesProvider({
  children,
  distanceUnit = "km",
  locale,
  mapLocale,
}: PreferencesProviderProps) {
  return (
    <PreferencesContext.Provider
      value={{
        distanceUnit,
        locale,
        mapLocale: mapLocale || locale,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error("usePreferences must be used within a PreferencesProvider");
  }
  return context;
}
