import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { TutorialSection } from '@/components/landing/TutorialSection';
import { CTASection } from '@/components/landing/CTASection';
import { Footer } from '@/components/landing/Footer';

export default async function LandingPage() {

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