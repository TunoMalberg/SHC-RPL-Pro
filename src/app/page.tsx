"use client";

import { useAppState } from "@/lib/store";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClientProfileSection } from "@/components/sections/ClientProfile";
import { FinancialInputsSection } from "@/components/sections/FinancialInputs";
import { PortfolioBuilderSection } from "@/components/sections/PortfolioBuilder";
import { SimulationPanel } from "@/components/sections/SimulationPanel";
import { ResultsDashboard } from "@/components/sections/ResultsDashboard";
import { HistoricalAnalysisSection } from "@/components/sections/HistoricalAnalysis";
import { ScenarioComparisonSection } from "@/components/sections/ScenarioComparison";
import { ExportPanel } from "@/components/sections/ExportPanel";
import Image from "next/image";

const TABS = [
  { id: "profile", label: "Kunde", icon: "/icons/rot/schild.png" },
  { id: "inputs", label: "Eingaben", icon: "/icons/rot/Scheckkarte.png" },
  { id: "portfolio", label: "Portfolio", icon: "/icons/rot/Wagge.png" },
  { id: "simulation", label: "Simulation", icon: "/icons/rot/Computer.png" },
  { id: "results", label: "Ergebnisse", icon: "/icons/rot/Ziel.png" },
  { id: "historical", label: "Historie", icon: "/icons/rot/Uhr.png" },
  { id: "scenarios", label: "Szenarien", icon: "/icons/rot/Pfeil.png" },
  { id: "export", label: "Export", icon: "/icons/rot/Daumenhoch.png" },
];

export default function RetirementPlannerApp() {
  const { state, dispatch } = useAppState();

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-50 via-white to-red-50/30" data-design-id="app-root">
      <header className="border-b border-neutral-200 bg-white/90 backdrop-blur-sm sticky top-0 z-50" data-design-id="app-header">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4" data-design-id="app-logo">
              <Image
                src="/icons/shc-logo-pos-small.png"
                alt="Schelhammer Capital"
                width={150}
                height={59}
                className="h-10 w-auto"
                priority
              />
              <div className="hidden sm:block h-8 w-px bg-neutral-300" />
              <div className="hidden sm:block">
                <h1 className="text-sm font-semibold text-[#20201E] leading-tight" data-design-id="app-title">
                  Vermögensmanagement
                </h1>
                <p className="text-xs text-[#4D4A47] leading-tight" data-design-id="app-tagline">
                  Ruhestandsplanung & Simulation
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-[#4D4A47]" data-design-id="app-meta">
              <span className="px-2 py-1 bg-neutral-100 rounded-md font-medium">EUR</span>
              <span className="px-2 py-1 bg-red-50 text-[#D31220] rounded-md font-medium">
                3-Topf-Modell
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
          <TabsList className="grid grid-cols-4 md:grid-cols-8 w-full h-auto p-1 bg-white border border-neutral-200 shadow-sm rounded-xl" data-design-id="tabs-list">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex flex-col items-center gap-1 py-2 px-1 text-xs data-[state=active]:bg-red-50 data-[state=active]:text-[#D31220] data-[state=active]:shadow-sm rounded-lg transition-colors"
                data-design-id={`tab-trigger-${tab.id}`}
              >
                <Image
                  src={tab.icon}
                  alt={tab.label}
                  width={22}
                  height={22}
                  className="h-5 w-5 object-contain"
                />
                <span className="font-medium">{tab.label}</span>
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
          <TabsContent value="export" data-design-id="tab-content-export">
            <ExportPanel />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="border-t border-neutral-200 bg-white/60 backdrop-blur-sm mt-12" data-design-id="app-footer">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-[#4D4A47]">
            <p data-design-id="footer-disclaimer">
              Nur zu Informationszwecken. Keine Anlageberatung. Konsultieren Sie einen qualifizierten Finanzberater.
            </p>
            <p data-design-id="footer-copyright">
              © {new Date().getFullYear()} Schelhammer Capital Bank AG — Drei-Topf Monte-Carlo-Engine
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
