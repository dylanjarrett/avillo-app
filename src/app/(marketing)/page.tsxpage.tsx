import LandingHero from "@/components/landing/landing-hero";
import FeatureSection from "@/components/landing/feature-section";
import PricingTable from "@/components/pricing/pricing-table";
import CTASection from "@/components/cta/cta-section";

export default function MarketingPage() {
  return (
    <div className="space-y-24">
      <LandingHero />
      <FeatureSection />
      <PricingTable />
      <CTASection />
    </div>
  );
}
