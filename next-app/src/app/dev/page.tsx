import { notFound } from "next/navigation";
import { WalkDemo } from "@/components/walk/WalkDemo";
import { SketchCard } from "@/components/ui/SketchCard";

export const metadata = { title: "Dev — главный экран прогулки" };

interface DevPageProps {
  searchParams: Promise<{ sketch?: string }>;
}

/**
 * Dev-страница: демо главного экрана «Прогуляться сейчас» (визуал + колбэки,
 * движок и стор не подключены) и эксперимент SketchCard (?sketch=1).
 * Только для разработки: в проде честный 404.
 */
export default async function DevPage({ searchParams }: DevPageProps) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const { sketch } = await searchParams;
  const sketchOn = sketch === "1";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto flex w-full max-w-[460px] flex-col gap-8">
        <WalkDemo />

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            SketchCard — hand-drawn эксперимент
          </h2>
          <SketchCard sketch={sketchOn} className="p-5 text-sm leading-relaxed text-slate-600">
            <p>
              {sketchOn
                ? "Рамка нарисована нативными SVG-фильтрами (feTurbulence + feDisplacementMap), без rough.js."
                : "Обычная карточка. Включите ?sketch=1, чтобы увидеть sketch-рамку."}
            </p>
          </SketchCard>
          <div className="flex gap-4 text-xs">
            <a href="/dev?sketch=1" className="text-brand-600 underline">
              включить
            </a>
            <a href="/dev" className="text-brand-600 underline">
              выключить
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}
