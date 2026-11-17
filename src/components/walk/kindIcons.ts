// src/components/walk/kindIcons.ts
// Иконки видов мест и их оттенки — единый источник для таймлайна (StopRow)
// и брендовых пинов на карте (docs/ux-human-wave.md M1: «те же 9 lucide»).
import type { ComponentType } from "react";
import {
  Camera,
  Coffee,
  Landmark,
  MapPin,
  Palette,
  Store,
  Trees,
  Utensils,
  Waves,
} from "lucide-react";
import type { WalkStopKind } from "./types";

export type IconType = ComponentType<{ size?: number | string; className?: string }>;

export const KIND_ICONS: Record<WalkStopKind, IconType> = {
  park: Trees,
  cafe: Coffee,
  food: Utensils,
  museum: Landmark,
  viewpoint: Camera,
  shop: Store,
  waterfront: Waves,
  market: Store,
  other: MapPin,
};

/** Иконка микро-стопа «по пути» (S4 волны «Улицы с характером»). */
export type WalkMicroKind = "viewpoint" | "art" | "water";

export const MICRO_ICONS: Record<WalkMicroKind, IconType> = {
  viewpoint: Camera,
  art: Palette,
  water: Waves,
};

/** Каждой категории — свой оттенок круга: таймлайн и пины читаются с одного взгляда. */
export const KIND_STYLES: Record<WalkStopKind, string> = {
  park: "bg-green-100 text-green-700",
  cafe: "bg-amber-100 text-amber-700",
  food: "bg-orange-100 text-orange-700",
  museum: "bg-purple-100 text-purple-700",
  viewpoint: "bg-sky-100 text-sky-700",
  shop: "bg-pink-100 text-pink-700",
  waterfront: "bg-cyan-100 text-cyan-700",
  market: "bg-lime-100 text-lime-700",
  other: "bg-slate-100 text-slate-600",
};
