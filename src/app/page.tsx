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

const TABS = [
  { id: "profile", label: "Kunde", icon: "👤" },
  { id: "inputs", label: "Eingaben", icon: "💶" },
  { id: "portfolio", label: "Portfolio", icon: "📊" },
  { id: "simulation", label: "Simulation", icon: "⚙️" },
  { id: "results", label: "Ergebnisse", icon: "📈" },
  { id: "historical", label: "Historie", icon: "📉" },
  { id: "scenarios", label: "Szenarien", icon: "🔀" },
  { id: "export", label: "Export", icon: "📄" },
];

export default function RetirementPlannerApp() {
  const { state, dispatch } = useAppState();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50" data-design-id="app-root">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50" data-design-id="app-header">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3" data-design-id="app-logo">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                RP
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight" data-design-id="app-title">
                  Ruhestandsplaner
                </h1>
                <p className="text-xs text-slate-400 leading-tight" data-design-id="app-tagline">
                  Professionelle Ruhestandsanalyse — DACH-Markt
                </p>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-400" data-design-id="app-meta">
              <span className="px-2 py-1 bg-slate-100 rounded-md font-medium">EUR</span>
              <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded-md font-medium">
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
          <TabsList className="grid grid-cols-4 md:grid-cols-8 w-full h-auto p-1 bg-white border shadow-sm rounded-xl" data-design-id="tabs-list">
            {TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex flex-col gap-0.5 py-2 px-1 text-xs data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm rounded-lg"
                data-design-id={`tab-trigger-${tab.id}`}
              >
                <span className="text-base leading-none">{tab.icon}</span>
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

      <footer className="border-t bg-white/60 backdrop-blur-sm mt-12" data-design-id="app-footer">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-slate-400">
            <p data-design-id="footer-disclaimer">
              Nur zu Informationszwecken. Keine Anlageberatung. Konsultieren Sie einen qualifizierten Finanzberater.
            </p>
            <p data-design-id="footer-copyright">
              © {new Date().getFullYear()} Ruhestandsplaner Pro — Drei-Topf Monte-Carlo-Engine
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
