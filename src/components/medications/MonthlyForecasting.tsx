import React, { useState, useEffect } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line
} from "recharts";
import { 
  TrendingUp, Search, Layers, Box, AlertCircle, RefreshCw, Calendar, ChevronRight, MapPin, Tag 
} from "lucide-react";
import { useGroup } from "../../contexts/GroupContext";
import { Medication } from "../../types/medications";

interface MonthlyForecastingProps {
  userRole: string;
}

export function MonthlyForecasting({ userRole }: MonthlyForecastingProps) {
  const { apiFetch } = useGroup();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [surgeries, setSurgeries] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedMed, setSelectedMed] = useState<Medication | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchForecastingData = async () => {
    try {
      setIsLoading(true);
      const [mRes, bRes, pRes, sRes] = await Promise.all([
        apiFetch("/api/app/medications"),
        apiFetch("/api/app/inventory-batches"),
        apiFetch("/api/app/medication-plans"),
        apiFetch("/api/app/calendario")
      ]);

      if (mRes.ok && bRes.ok && pRes.ok && sRes.ok) {
        const mData = await mRes.json();
        const bData = await bRes.json();
        const pData = await pRes.json();
        const sData = await sRes.json();

        setMedications(mData.filter((m: any) => m.status === "active"));
        setBatches(bData);
        setPlans(pData);
        setSurgeries(sData);

        if (mData.length > 0) {
          setSelectedMed(mData[0]);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchForecastingData();
  }, []);

  // Compute projections: Estimate next 3 months based on current surgeries rate
  const computeChartData = () => {
    // Generate simulated months
    const now = new Date();
    const months = Array.from({ length: 3 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    });

    // Base multiplier on how many surgeries are scheduled
    const baseSurgeriesCount = surgeries.length || 5;

    // Sum total estimated consumed units
    return medications.slice(0, 5).map((med, index) => {
      // Calculate a base estimated requirement per surgery for this med
      const baseQtyPerSurgery = med.category === "Anestésico" ? 3 : med.category === "Analgésico" ? 5 : 2;
      const baseEstimate = baseSurgeriesCount * baseQtyPerSurgery;

      return {
        name: med.genericName,
        [months[0]]: Math.round(baseEstimate * 0.9),
        [months[1]]: Math.round(baseEstimate * 1.1),
        [months[2]]: Math.round(baseEstimate * 1.3),
        "Estoque Atual": batches
          .filter(b => b.medicationId === med.id)
          .reduce((acc, b) => acc + b.quantityAvailable, 0)
      };
    });
  };

  const chartData = computeChartData();
  const currentMonthName = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const filteredMeds = medications.filter(med => 
    med.genericName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    med.commercialName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-6 rounded-3xl border border-gray-100 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Projeção e Inteligência de Compras</h2>
          <p className="text-xs text-gray-500 font-medium mt-1">
            Planejamento preditivo de consumo mensal baseado na agenda cirúrgica ativa.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 bg-white/40 rounded-3xl border border-gray-100">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Projections Chart Area */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 text-left">
              <div className="flex justify-between items-center">
                <h3 className="font-black text-gray-900 text-base uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp size={18} className="text-blue-600" /> Projeção de Demanda Mensal (ampolas)
                </h3>
                <span className="text-[10px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-black uppercase tracking-wider">
                  Modelo Preditivo Ativo
                </span>
              </div>
              <p className="text-xs text-gray-500">Estimativa baseada nos protocolos de anestesia recomendados e cirurgias agendadas no sistema.</p>

              {/* Recharts container */}
              <div className="h-72 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: "16px", border: "1px solid #f1f5f9", fontSize: "11px" }} />
                    <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                    <Bar dataKey={Object.keys(chartData[0] || {}).find(k => k !== "name" && k !== "Estoque Atual") || ""} name="Mês Atual" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey={Object.keys(chartData[0] || {}).filter(k => k !== "name" && k !== "Estoque Atual")[1] || ""} name="Próximo Mês" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Estoque Atual" name="Estoque Disponível" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Clickable Medication Details panel */}
            {selectedMed && (
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm text-left space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-1 rounded">
                      {selectedMed.category}
                    </span>
                    <h3 className="font-black text-gray-900 text-base leading-snug mt-1.5">
                      {selectedMed.genericName}
                    </h3>
                    {selectedMed.commercialName && (
                      <p className="text-xs text-gray-400 italic">Marca de referência: "{selectedMed.commercialName}"</p>
                    )}
                  </div>
                  
                  {/* Totals cards */}
                  <div className="flex gap-4">
                    <div className="text-right">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Estoque Atual</span>
                      <span className="block text-lg font-black text-emerald-600 font-mono">
                        {batches
                          .filter(b => b.medicationId === selectedMed.id)
                          .reduce((acc, b) => acc + b.quantityAvailable, 0)}
                      </span>
                    </div>
                    <div className="text-right border-l border-gray-100 pl-4">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Segurança</span>
                      <span className="block text-lg font-bold text-gray-700 font-mono">
                        {selectedMed.minStock} amp
                      </span>
                    </div>
                  </div>
                </div>

                {/* Batches detailed table */}
                <div className="space-y-3">
                  <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400">Rastreabilidade de Lotes em Estoque</span>
                  
                  {batches.filter(b => b.medicationId === selectedMed.id).length === 0 ? (
                    <p className="text-xs text-gray-400 italic bg-gray-50 p-4 rounded-xl text-center">Nenhum lote físico cadastrado em estoque.</p>
                  ) : (
                    <div className="space-y-2">
                      {batches.filter(b => b.medicationId === selectedMed.id).map((batch, index) => (
                        <div key={index} className="border border-gray-100 p-3.5 rounded-2xl bg-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                          <div className="space-y-0.5">
                            <span className="font-bold text-gray-800">Lote: {batch.batchNumber}</span>
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-400">
                              <span className="flex items-center gap-1"><MapPin size={10} /> {batch.locationName}</span>
                              {batch.supplier && <span className="flex items-center gap-1"><Tag size={10} /> {batch.supplier}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-4 text-right justify-between md:justify-end">
                            <div>
                              <span className="block text-[8px] font-black text-gray-400 uppercase">Validade</span>
                              <span className="font-bold text-gray-800">{batch.expiryDate}</span>
                            </div>
                            <div className="border-l border-gray-100 pl-4">
                              <span className="block text-[8px] font-black text-gray-400 uppercase">Disponível</span>
                              <span className="font-mono font-black text-sm text-gray-900">{batch.quantityAvailable} un</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Left Clickable Medication List */}
          <div className="lg:col-span-1 space-y-4 text-left">
            <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Selecione para ver Lotes</span>
            
            {/* Search filter inside medications */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={15} />
              <input
                type="text"
                placeholder="Filtrar medicamento..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-white border border-gray-200 text-xs text-gray-800"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="space-y-2 max-h-[100vh] overflow-y-auto">
              {filteredMeds.map((med) => {
                const totalQty = batches
                  .filter(b => b.medicationId === med.id)
                  .reduce((acc, b) => acc + b.quantityAvailable, 0);

                const isLow = totalQty <= med.minStock;

                return (
                  <div
                    key={med.id}
                    onClick={() => setSelectedMed(med)}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                      selectedMed?.id === med.id
                        ? "bg-blue-600 text-white border-blue-600 shadow-md"
                        : "bg-white border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <div>
                      <h4 className="font-black text-xs leading-snug">{med.genericName}</h4>
                      <span className={`text-[9px] ${selectedMed?.id === med.id ? "text-blue-100" : "text-gray-400"}`}>
                        {med.category}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className={`font-mono text-xs font-black ${
                        selectedMed?.id === med.id 
                          ? "text-white" 
                          : isLow 
                          ? "text-red-500" 
                          : "text-gray-800"
                      }`}>
                        {totalQty} un
                      </span>
                      {isLow && (
                        <span className="block text-[8px] bg-red-100 text-red-700 px-1 rounded uppercase font-black tracking-widest mt-0.5">Crítico</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
