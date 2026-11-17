import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { TutorialSection } from '@/components/landing/TutorialSection';
import { CTASection } from '@/components/landing/CTASection';
import { Footer } from '@/components/landing/Footer';

// Лендинг переехал с / на /about (docs/ux-human-wave.md M2): главный сценарий
// открывается сразу картой и панелью, а «как это работает» — отдельным адресом,
// на который ведут «Как это работает» в шапке панели и Navigation.about.
// GIF-пути /tutorial/step1..6.gif статические — не меняются.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: "Landing" });
  const ru = locale !== "en";
  return {
    title: t("aboutTitle"),
    description: ru
      ? "Как генератор прогулок собирает пешеходную петлю по реальным улицам: время, вайб, честный тайминг и остановки-якоря."
      : "How the walk generator builds a pedestrian loop on real streets: time, vibe, honest timing and anchor stops.",
  };
}

export default async function AboutPage() {
  return (
    <main className="min-h-screen">
      <HeroSection />
      <FeaturesSection />
      <TutorialSection />
      <CTASection />
      <Footer />
    </main>
  );
}
