"use client";

import { useAppState } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClientProfileSection } from "@/components/sections/ClientProfile";
import { FinancialInputsSection } from "@/components/sections/FinancialInputs";
import { PortfolioBuilderSection } from "@/components/sections/PortfolioBuilder";
import { SimulationPanel } from "@/components/sections/SimulationPanel";
import { ResultsDashboard } from "@/components/sections/ResultsDashboard";
import { HistoricalAnalysisSection } from "@/components/sections/HistoricalAnalysis";
import { ScenarioComparisonSection } from "@/components/sections/ScenarioComparison";
import { DetailedExampleSection } from "@/components/sections/DetailedExample";
import { ExportPanel } from "@/components/sections/ExportPanel";
import { ClientView } from "@/components/sections/ClientView";
import { HoldingsBucket } from "@/components/sections/HoldingsBucket";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ModeToggle } from "@/components/ModeToggle";
import { ModeChooserModal } from "@/components/ModeChooserModal";
import Image from "next/image";

const ALL_TABS = [
  { id: "profile", labelKey: "tab.profile", icon: "/icons/rot/schild.png" },
  { id: "inputs", labelKey: "tab.inputs", icon: "/icons/rot/Scheckkarte.png" },
  { id: "portfolio", labelKey: "tab.portfolio", icon: "/icons/rot/Wagge.png" },
  { id: "holdings", labelKey: "tab.holdings", icon: "/icons/rot/Scheckkarte.png", proOnly: true },
  { id: "simulation", labelKey: "tab.simulation", icon: "/icons/rot/Computer.png" },
  { id: "results", labelKey: "tab.results", icon: "/icons/rot/Ziel.png" },
  { id: "historical", labelKey: "tab.historical", icon: "/icons/rot/Uhr.png" },
  { id: "scenarios", labelKey: "tab.scenarios", icon: "/icons/rot/Pfeil.png" },
  { id: "detailed", labelKey: "tab.detailed", icon: "/icons/rot/Uhr.png" },
  { id: "clientview", labelKey: "tab.clientview", icon: "/icons/rot/Daumenhoch.png" },
  { id: "export", labelKey: "tab.export", icon: "/icons/rot/Scheckkarte.png" },
];

export default function RetirementPlannerApp() {
  const { state, dispatch } = useAppState();
  const { t } = useI18n();

  const visibleTabs = ALL_TABS.filter(
    (tab) => state.uiMode === "pro" || !tab.proOnly,
  );
  // Tailwind-Klassen für Grid-Spalten je nach Tab-Anzahl (nur 10 oder 11 hier).
  const gridColsClass =
    visibleTabs.length === 11 ? "md:grid-cols-11" : "md:grid-cols-10";

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-white to-red-50/30" data-design-id="app-root">
      <ModeChooserModal />
      <header className="border-b border-neutral-200 bg-white/90 backdrop-blur-sm sticky top-0 z-50" data-design-id="app-header">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4" data-design-id="app-logo">
              <Image
                src="/icons/logo.png"
                alt={t("app.title")}
                width={48}
                height={48}
                className="h-10 w-auto"
                priority
              />
              <div className="hidden sm:block h-8 w-px bg-neutral-300" />
              <div className="hidden md:block">
                <ModeToggle />
                <p className="text-xs text-[#4D4A47] leading-tight mt-0.5" data-design-id="app-tagline">
                  {t("app.tagline")}
                </p>
              </div>
              {/* Mobile: kompakter Modus-Switch ohne Tagline */}
              <div className="md:hidden">
                <ModeToggle />
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#4D4A47]" data-design-id="app-meta">
              <LanguageToggle />
              <span className="hidden md:inline-block px-2 py-1 bg-neutral-100 rounded-md font-medium">EUR</span>
              <span className="hidden md:inline-block px-2 py-1 bg-red-50 text-[#D31220] rounded-md font-medium">
                {t("app.threeBucket")}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6" data-design-id="app-main">
        <Tabs
          value={state.activeTab}
          onValueChange={(tab) => dispatch({ type: "SET_TAB", payload: tab })}
          className="space-y-6"
        >
          <TabsList
            className={`grid grid-cols-3 sm:grid-cols-6 ${gridColsClass} w-full h-auto p-1 bg-white border border-neutral-200 shadow-sm rounded-xl`}
            data-design-id="tabs-list"
          >
            {visibleTabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex flex-col items-center gap-1 py-2 px-1 text-xs data-[state=active]:bg-red-50 data-[state=active]:text-[#D31220] data-[state=active]:shadow-sm rounded-lg transition-colors"
                data-design-id={`tab-trigger-${tab.id}`}
              >
                <Image
                  src={tab.icon}
                  alt={t(tab.labelKey)}
                  width={22}
                  height={22}
                  className="h-5 w-5 object-contain"
                />
                <span className="font-medium">{t(tab.labelKey)}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profile" data-design-id="tab-content-profile">
            <ClientProfileSection />
          </TabsContent>
          <TabsContent value="inputs" data-design-id="tab-content-inputs">
            <FinancialInputsSection />
          </TabsContent>
          <TabsContent value="portfolio" data-design-id="tab-content-portfolio">
            <PortfolioBuilderSection />
          </TabsContent>
          {state.uiMode === "pro" && (
            <TabsContent value="holdings" data-design-id="tab-content-holdings">
              <HoldingsBucket />
            </TabsContent>
          )}
          <TabsContent value="simulation" data-design-id="tab-content-simulation">
            <SimulationPanel />
          </TabsContent>
          <TabsContent value="results" data-design-id="tab-content-results">
            <ResultsDashboard />
          </TabsContent>
          <TabsContent value="historical" data-design-id="tab-content-historical">
            <HistoricalAnalysisSection />
          </TabsContent>
          <TabsContent value="scenarios" data-design-id="tab-content-scenarios">
            <ScenarioComparisonSection />
          </TabsContent>
          <TabsContent value="detailed" data-design-id="tab-content-detailed">
            <DetailedExampleSection />
          </TabsContent>
          <TabsContent value="clientview" data-design-id="tab-content-clientview">
            <ClientView />
          </TabsContent>
          <TabsContent value="export" data-design-id="tab-content-export">
            <ExportPanel />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-neutral-200 bg-white/60 backdrop-blur-sm mt-12" data-design-id="app-footer">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-[#4D4A47]">
            <p data-design-id="footer-disclaimer">
              {t("app.footer.disclaimer")}
            </p>
            <p data-design-id="footer-copyright">
              © {new Date().getFullYear()} {t("app.footer.copyright")}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}