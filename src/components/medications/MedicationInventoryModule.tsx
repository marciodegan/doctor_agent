import React, { useState, useEffect } from "react";
import { 
  Plus, Search, Check, X, ClipboardList, Package, Layers, TrendingUp, ShieldAlert, Users, Calendar 
} from "lucide-react";
import { useGroup } from "../../contexts/GroupContext";
import { MedicationCatalog } from "./MedicationCatalog";
import { MedicationProtocols } from "./MedicationProtocols";
import { SurgeryPlanning } from "./SurgeryPlanning";
import { InventoryManagement } from "./InventoryManagement";
import { SeparationList } from "./SeparationList";
import { MonthlyForecasting } from "./MonthlyForecasting";
import { AlertsReports } from "./AlertsReports";

export default function MedicationInventoryModule() {
  const { apiFetch, activeGroup } = useGroup();

  // Selected tab state
  const [activeTab, setActiveTab] = useState<"planning" | "separation" | "catalog" | "protocols" | "inventory" | "forecasting" | "alerts">("planning");

  // User role simulation (for medical team clinical trial auditing)
  const [userRole, setUserRole] = useState<string>("medico");

  // Quick Stats State
  const [stats, setStats] = useState({
    activeMedsCount: 0,
    activePlansCount: 0,
    lowStockCount: 0,
    expiredLotsCount: 0
  });

  const fetchStats = async () => {
    try {
      const [mRes, bRes, pRes] = await Promise.all([
        apiFetch("/api/app/medications"),
        apiFetch("/api/app/inventory-batches"),
        apiFetch("/api/app/medication-plans")
      ]);

      if (mRes.ok && bRes.ok && pRes.ok) {
        const meds = await mRes.json();
        const batches = await bRes.json();
        const plans = await pRes.json();

        // Expired
        const expired = batches.filter((b: any) => new Date(b.expiryDate) < new Date()).length;

        // Active meds
        const activeMeds = meds.filter((m: any) => m.status === "active");

        // Low stock
        let low = 0;
        for (const med of activeMeds) {
          const qty = batches
            .filter((b: any) => b.medicationId === med.id)
            .reduce((acc: number, b: any) => acc + b.quantityAvailable, 0);
          if (qty <= med.minStock) {
            low++;
          }
        }

        setStats({
          activeMedsCount: activeMeds.length,
          activePlansCount: plans.filter((p: any) => p.status === "confirmed" || p.status === "separated").length,
          lowStockCount: low,
          expiredLotsCount: expired
        });
      }
    } catch (e) {
      console.error("Failed to load quick statistics:", e);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [activeTab]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 md:px-6 pb-20 text-left">
      
      {/* Role Simulator and Workspace Banner */}
      <div className="bg-slate-900 text-white p-4 rounded-3xl flex flex-col sm:flex-row justify-between items-center gap-4 border border-slate-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
            <Package size={20} />
          </div>
          <div className="text-left">
            <h1 className="font-black text-sm tracking-wide uppercase">Medicações e Estoque Cirúrgico</h1>
            <p className="text-[10px] text-slate-400 font-semibold uppercase mt-0.5">Doctor Pro Advanced Clinical Module</p>
          </div>
        </div>

        {/* Profile / Role Switcher Simulator */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Perfil Simulado:</span>
          <select
            className="bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-1.5 font-bold text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={userRole}
            onChange={(e) => setUserRole(e.target.value)}
          >
            <option value="medico">Médico Anestesista / Cirurgião</option>
            <option value="responsavel_clinico">Responsável Clínico (Gestor)</option>
            <option value="enfermagem">Enfermeiro de Centro Cirúrgico / Farmácia</option>
            <option value="responsavel_estoque">Responsável pelo Estoque / Estoquista</option>
            <option value="admin">Administrador do Grupo</option>
          </select>
        </div>
      </div>

      {/* Quick Dashboard Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between text-left">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Medicamentos Cadastrados</span>
          <span className="block text-2xl font-black text-gray-900 mt-2 font-mono">{stats.activeMedsCount}</span>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between text-left">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 font-semibold">Kits Ativos (Salas)</span>
          <span className="block text-2xl font-black text-blue-600 mt-2 font-mono">{stats.activePlansCount}</span>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between text-left">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Estoque Crítico</span>
          <span className={`block text-2xl font-black mt-2 font-mono ${stats.lowStockCount > 0 ? "text-amber-500" : "text-gray-900"}`}>
            {stats.lowStockCount}
          </span>
        </div>
        <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between text-left">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Lotes Vencidos</span>
          <span className={`block text-2xl font-black mt-2 font-mono ${stats.expiredLotsCount > 0 ? "text-red-500 font-black" : "text-gray-900"}`}>
            {stats.expiredLotsCount}
          </span>
        </div>
      </div>

      {/* Primary Sub-tab Navigator Navigation Menu */}
      <div className="overflow-x-auto pb-1.5 scrollbar-thin">
        <div className="flex border-b border-gray-200 min-w-max text-xs font-black uppercase tracking-wider">
          <button
            onClick={() => setActiveTab("planning")}
            className={`px-5 py-3 border-b-2 font-bold transition-all ${
              activeTab === "planning"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            Planejamento Cirúrgico
          </button>
          <button
            onClick={() => setActiveTab("separation")}
            className={`px-5 py-3 border-b-2 font-bold transition-all ${
              activeTab === "separation"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            Lista de Separação
          </button>
          <button
            onClick={() => setActiveTab("catalog")}
            className={`px-5 py-3 border-b-2 font-bold transition-all ${
              activeTab === "catalog"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            Catálogo
          </button>
          <button
            onClick={() => setActiveTab("protocols")}
            className={`px-5 py-3 border-b-2 font-bold transition-all ${
              activeTab === "protocols"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            Protocolos
          </button>
          <button
            onClick={() => setActiveTab("inventory")}
            className={`px-5 py-3 border-b-2 font-bold transition-all ${
              activeTab === "inventory"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            Estoque / Lotes
          </button>
          <button
            onClick={() => setActiveTab("forecasting")}
            className={`px-5 py-3 border-b-2 font-bold transition-all ${
              activeTab === "forecasting"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            Previsão Mensal
          </button>
          <button
            onClick={() => setActiveTab("alerts")}
            className={`px-5 py-3 border-b-2 font-bold transition-all ${
              activeTab === "alerts"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            Auditoria / Alertas
          </button>
        </div>
      </div>

      {/* Render selected view with Simulated Role passed in */}
      <div className="pt-2">
        {activeTab === "planning" && <SurgeryPlanning userRole={userRole} />}
        {activeTab === "separation" && <SeparationList userRole={userRole} />}
        {activeTab === "catalog" && <MedicationCatalog userRole={userRole} />}
        {activeTab === "protocols" && <MedicationProtocols userRole={userRole} />}
        {activeTab === "inventory" && <InventoryManagement userRole={userRole} />}
        {activeTab === "forecasting" && <MonthlyForecasting userRole={userRole} />}
        {activeTab === "alerts" && <AlertsReports userRole={userRole} />}
      </div>

    </div>
  );
}
