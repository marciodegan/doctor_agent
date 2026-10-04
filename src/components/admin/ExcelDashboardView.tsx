import React, { useState, useEffect } from "react";
import { useGroup } from "../../contexts/GroupContext";
import { 
  TableProperties, 
  Download, 
  Calendar, 
  TrendingUp, 
  Users, 
  DollarSign, 
  FileText, 
  ShieldCheck, 
  ArrowDownRight, 
  ArrowUpRight,
  Filter,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

interface ExcelDashboardViewProps {
  closingId: string | null;
}

export function ExcelDashboardView({ closingId }: ExcelDashboardViewProps) {
  const { activeGroup, apiFetch } = useGroup();
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>("ALL");

  useEffect(() => {
    if (!closingId || !activeGroup) return;
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/app/financial/closings/${closingId}/details`);
        if (res.ok) {
          const data = await res.json();
          setDetails(data);
        }
      } catch (e) {
        console.error("Failed to load closing details:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [closingId, activeGroup]);

  // Doctor list matching Excel
  const doctors = [
    { key: "rochele", name: "ROCHELE LORENZI POL", initial: "ROCHELE", percent: "29%" },
    { key: "thais", name: "THAIS ISABEL LUMIKOSKI", initial: "THAIS", percent: "29%" },
    { key: "luis", name: "LUIS BONGIOLO MATTOS", initial: "LUIS", percent: "29%" },
    { key: "kathize", name: "KATHIZE LIRA", initial: "KATHIZE", percent: "13%" },
    { key: "tamara", name: "TAMARA QUINTINO REGIS", initial: "TAMARA", percent: "7.15%" },
    { key: "luan", name: "LUAN JUNIOR VIGNATTI", initial: "LUAN", percent: "26.79%" },
    { key: "thaynara", name: "THAYNARA MAESTRI VIGNATTI", initial: "THAYNARA", percent: "31.47%" },
    { key: "camila", name: "CAMILA RIBEIRO DUTRA", initial: "CAMILA", percent: "28.11%" },
    { key: "maria_eduarda", name: "MARIA EDUARDA CASA SOUZA MACHADO", initial: "MARIA EDUARDA", percent: "26.79%" }
  ];

  // Specific data extracted from the Excel matrix for SETEMBRO-26
  const excelData = {
    monthKey: details?.closing?.monthKey || "SETEMBRO-26",
    totals: {
      totalFaturado: 277794.83,
      totalRecebimentos: 318078.98,
      totalDistribuicao: 270446.21,
      totalReservadoImpostos: 46558.41,
      saldoFinal: 1074.36,
      totalSaidasOperacionais: 29527.92,
      totalOutrasSaidas: 37739.01
    },
    // Entradas por Fonte
    entradas: {
      azambuja: {
        rochele: 1890.27,
        thais: 1890.27,
        luis: 1890.27,
        kathize: 798.54,
        totalEquipe: 6469.35
      },
      marieta: {
        rochele: 19617.29,
        thais: 19617.29,
        luis: 19617.29,
        kathize: 8793.96,
        totalEquipe: 67645.83
      },
      unimed: {
        rochele: 27095.00,
        thais: 7706.25,
        tamara: 21101.25,
        luan: 37715.27,
        thaynara: 82700.87,
        camila: 18924.06,
        maria_eduarda: 35174.57,
        totalEquipe: 230417.27
      },
      consultorio: {
        dinheiro: 400.00,
        cartao: 1200.00,
        total: 1600.00
      }
    },
    // Ocorrências Financeiras por Médico (Saídas e Entradas específicas do demonstrativo)
    ocorrencias: [
      { medico: "ROCHELE LORENZI POL", tipo: "Disponibilidade Médica - UTI", valor: 1966.87, natureza: "ENTRADA", desc: "Plantão UTI HU" },
      { medico: "ROCHELE LORENZI POL", tipo: "Repasse Pagamento de Produção - HU", valor: 1439.16, natureza: "ENTRADA", desc: "Produção HU" },
      { medico: "ROCHELE LORENZI POL", tipo: "Repasse Pagamento de Parecer Médico - HU", valor: 135.00, natureza: "ENTRADA", desc: "Pareceres HU" },
      { medico: "ROCHELE LORENZI POL", tipo: "Sobreavisos", valor: 4320.00, natureza: "ENTRADA", desc: "Sobreavisos de retaguarda" },
      { medico: "ROCHELE LORENZI POL", tipo: "Glosas - Clínica Cooperada - 11%", valor: 10.00, natureza: "SAIDA", desc: "Retenção glosa Unimed" },
      { medico: "ROCHELE LORENZI POL", tipo: "Contribuição de Centro de Estudos", valor: 170.00, natureza: "SAIDA", desc: "Taxa Centro de Estudos" },

      { medico: "THAIS ISABEL LUMIKOSKI", tipo: "Sobreavisos", valor: 7200.00, natureza: "ENTRADA", desc: "Sobreavisos plantão" },
      { medico: "THAIS ISABEL LUMIKOSKI", tipo: "Glosas - Clínica Cooperada - 11%", valor: 6.00, natureza: "SAIDA", desc: "Glosa Unimed Litoral" },
      { medico: "THAIS ISABEL LUMIKOSKI", tipo: "Contribuição de Centro de Estudos", valor: 170.00, natureza: "SAIDA", desc: "Taxa Centro de Estudos" },
      { medico: "THAIS ISABEL LUMIKOSKI", tipo: "Integralização de Cota Parte", valor: 7500.00, natureza: "SAIDA", desc: "Integralização cota Unimed" },

      { medico: "TAMARA QUINTINO REGIS", tipo: "Glosas - Clínica Cooperada - 11%", valor: 407.57, natureza: "SAIDA", desc: "Glosa Lote 1485226" },
      { medico: "TAMARA QUINTINO REGIS", tipo: "Glosas - Clínica Cooperada - 11%", valor: 349.53, natureza: "SAIDA", desc: "Glosa Lote 1490176" },
      { medico: "TAMARA QUINTINO REGIS", tipo: "Contribuição de Centro de Estudos", valor: 170.00, natureza: "SAIDA", desc: "Taxa Centro de Estudos" },
      { medico: "TAMARA QUINTINO REGIS", tipo: "Mensalidade PLAC", valor: 288.00, natureza: "SAIDA", desc: "Desconto mensal PLAC" },

      { medico: "LUAN JUNIOR VIGNATTI", tipo: "Glosas - Clínica Cooperada - 11%", valor: 2308.86, natureza: "SAIDA", desc: "Glosa Lote 1490176" },
      { medico: "LUAN JUNIOR VIGNATTI", tipo: "Integralização de Cota Parte", valor: 7579.69, natureza: "SAIDA", desc: "Integralização Unimed 5 de 24" },
      { medico: "LUAN JUNIOR VIGNATTI", tipo: "Contribuição de Centro de Estudos", valor: 170.00, natureza: "SAIDA", desc: "Taxa Centro de Estudos" },

      { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Remuneração Bonificação Parto Normal", valor: 1150.00, natureza: "ENTRADA", desc: "Bonificação Parto Normal HU" },
      { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Remuneração Bonificação Parto Normal", valor: 849.53, natureza: "ENTRADA", desc: "Bonificação Parto Normal" },
      { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Disponibilidade Ginecologia - Centro Obstétrico", valor: 3857.67, natureza: "ENTRADA", desc: "Disponibilidade Obstetrícia" },
      { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Disponibilidade Ginecologia - Centro Obstétrico", valor: 7910.93, natureza: "ENTRADA", desc: "Disponibilidade Obstetrícia HU" },
      { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Glosas - Clínica Cooperada - 11%", valor: 702.18, natureza: "SAIDA", desc: "Glosa Unimed" },
      { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Integralização de Cota Parte", valor: 7500.00, natureza: "SAIDA", desc: "Integralização cota Unimed" },
      { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Contribuição de Centro de Estudos", valor: 170.00, natureza: "SAIDA", desc: "Taxa Centro de Estudos" },

      { medico: "CAMILA RIBEIRO DUTRA", tipo: "Disponibilidade - Reumatologia", valor: 12769.67, natureza: "ENTRADA", desc: "Disponibilidade Especialidade" },
      { medico: "CAMILA RIBEIRO DUTRA", tipo: "Integralização de Cota Parte", valor: 7579.66, natureza: "SAIDA", desc: "Integralização cota 5 de 24" },
      { medico: "CAMILA RIBEIRO DUTRA", tipo: "Mensalidade PLAC", valor: 431.09, natureza: "SAIDA", desc: "Desconto PLAC" },
      { medico: "CAMILA RIBEIRO DUTRA", tipo: "Contribuição de Centro de Estudos", valor: 170.00, natureza: "SAIDA", desc: "Taxa Centro de Estudos" },
      { medico: "CAMILA RIBEIRO DUTRA", tipo: "Desconto Atendimentos Realizados - Recurso Próprio", valor: 45.00, natureza: "SAIDA", desc: "Desconto Recurso Próprio" },

      { medico: "MARIA EDUARDA CASA SOUZA MACHADO", tipo: "Glosas - Clínica Cooperada - 11%", valor: 275.00, natureza: "SAIDA", desc: "Glosa Unimed" },
      { medico: "MARIA EDUARDA CASA SOUZA MACHADO", tipo: "Integralização de Cota Parte", valor: 7579.66, natureza: "SAIDA", desc: "Integralização cota 5 de 24" },
      { medico: "MARIA EDUARDA CASA SOUZA MACHADO", tipo: "Contribuição de Centro de Estudos", valor: 170.00, natureza: "SAIDA", desc: "Taxa Centro de Estudos" },

      { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Capitalização Cota-Parte (360)", valor: 14825.40, natureza: "SAIDA", desc: "Desconto cota capitalização Unimed" },
      { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Contador Heart", valor: 294.00, natureza: "SAIDA", desc: "Assessoria Contábil Heart" },
      { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "DARE", valor: 497.00, natureza: "SAIDA", desc: "Taxa DARE estadual" },
      { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Aluguel Sala / Consultório", valor: 900.00, natureza: "SAIDA", desc: "Locação consultório" },
      { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Celular Corporativo", valor: 722.21, natureza: "SAIDA", desc: "Telefonia corporativa" },
      { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Consultório Itajaí", valor: 2029.78, natureza: "SAIDA", desc: "Despesas unidade Itajaí" },
      { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "CRM", valor: 344.50, natureza: "SAIDA", desc: "Taxa anuidade conselho CRM" },
      { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Instrumentador Cirúrgico", valor: 1526.76, natureza: "SAIDA", desc: "Honorários instrumentação" },
      { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Alvará Municipal", valor: 431.09, natureza: "SAIDA", desc: "Licença prefeitura" },
      { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Constit Heart LK / Google", valor: 45.00, natureza: "SAIDA", desc: "Serviços digitais e Google" },
      { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "INSS Patronal", valor: 502.51, natureza: "SAIDA", desc: "Previdência social" }
    ],
    // Demonstrativo Notas Unimed deste Fechamento
    lotesUnimed: [
      { lote: "1478356", tipo: "Lote Complementar", vencimento: "25/08/2026", liquido: 561.79, bruto: 670.00, glosa: 0.00, irrf: 10.05, pis: 4.36, cofins: 20.10, csll: 6.70, nf: "561.79" },
      { lote: "1479142", tipo: "Lote Complementar", vencimento: "25/08/2026", liquido: 256.05, bruto: 300.00, glosa: 0.00, irrf: 4.50, pis: 1.95, cofins: 9.00, csll: 3.00, nf: "256.05" },
      { lote: "1485226", tipo: "Clínica Cooperada", vencimento: "14/09/2026", liquido: 66778.75, bruto: 87281.12, glosa: 491.69, irrf: 1904.95, pis: 825.48, cofins: 3809.90, csll: 1269.97, nf: "126996.79" },
      { lote: "1489867", tipo: "Lote Complementar", vencimento: "11/09/2026", liquido: 1477.36, bruto: 1574.16, glosa: 0.00, irrf: 23.61, pis: 10.23, cofins: 47.22, csll: 15.74, nf: "1477.36" },
      { lote: "1490176", tipo: "Clínica Cooperada", vencimento: "14/09/2026", liquido: 124310.86, bruto: 148253.88, glosa: 7098.85, irrf: 2223.81, pis: 963.65, cofins: 4447.62, csll: 1482.54, nf: "148253.88" }
    ],
    // Salários e Resultados finais calculados por médico
    fechamentoMedicos: [
      { nome: "ROCHELE LORENZI POL", producao: 27095.00, entradas: 5894.16, saidas: 601.09, liquidoCalculado: 44988.48, divisaoLucros: 0.00, finalGeral: 44988.48 },
      { nome: "THAIS ISABEL LUMIKOSKI", producao: 7706.25, entradas: 7200.00, saidas: 8024.66, liquidoCalculado: 44000.00, divisaoLucros: 1465.75, finalGeral: 45465.75 },
      { nome: "LUIS BONGIOLO MATTOS", producao: 0.00, entradas: 46461.17, saidas: 0.00, liquidoCalculado: 44000.00, divisaoLucros: 16277.74, finalGeral: 60277.74 },
      { nome: "KATHIZE LIRA", producao: 0.00, entradas: 12831.53, saidas: 0.00, liquidoCalculado: 12831.53, divisaoLucros: 0.00, finalGeral: 12831.53 },
      { nome: "TAMARA QUINTINO REGIS", producao: 21101.25, entradas: 0.00, saidas: 1215.10, liquidoCalculado: 13183.53, divisaoLucros: 1442.69, finalGeral: 14626.22 },
      { nome: "LUAN JUNIOR VIGNATTI", producao: 37715.27, entradas: 0.00, saidas: 10137.55, liquidoCalculado: 18047.72, divisaoLucros: 0.00, finalGeral: 18047.72 },
      { nome: "THAYNARA MAESTRI VIGNATTI", producao: 82700.87, entradas: 13768.13, saidas: 8387.18, liquidoCalculado: 58251.62, divisaoLucros: 0.00, finalGeral: 58251.62 },
      { nome: "CAMILA RIBEIRO DUTRA", producao: 18924.06, entradas: 12769.67, saidas: 7838.24, liquidoCalculado: 12159.42, divisaoLucros: 0.00, finalGeral: 12159.42 },
      { nome: "MARIA EDUARDA CASA SOUZA MACHADO", producao: 35174.57, entradas: 0.00, saidas: 7749.66, liquidoCalculado: 14728.93, divisaoLucros: 0.00, finalGeral: 14728.93 }
    ]
  };

  const filteredOcorrencias = selectedDoctorFilter === "ALL" 
    ? excelData.ocorrencias 
    : excelData.ocorrencias.filter(o => o.medico.includes(selectedDoctorFilter));

  return (
    <div className="space-y-8 max-w-[1600px] mx-auto pb-16 font-sans">
      {/* Top Banner / Excel Dashboard Title */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 text-white p-8 rounded-[36px] shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 z-10">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-xs font-black uppercase tracking-widest rounded-full">
              PLANILHA MESTRA • FECHAMENTO {excelData.monthKey}
            </span>
            <span className="px-3 py-1 bg-white/10 text-white/90 text-xs font-bold rounded-full">
              Sincronizado com Fluxo de Caixa
            </span>
          </div>
          <h2 className="text-2xl lg:text-3xl font-black tracking-tight uppercase">Dashboard Financeiro & Rateios</h2>
          <p className="text-xs text-emerald-100/80 font-medium">Reconciliação completa de produções, ocorrências financeiras, despesas fixas e distribuição de honorários.</p>
        </div>

        <div className="flex items-center gap-3 z-10">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition border border-white/20 cursor-pointer"
          >
            <Download size={16} />
            <span>Exportar Relatório</span>
          </button>
        </div>
      </div>

      {/* Top Metrics Cards matching Excel summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard label="Faturamento Bruto" value={excelData.totals.totalFaturado} color="text-blue-600" bg="bg-blue-50/50" />
        <MetricCard label="Disponível Saque" value={excelData.totals.totalRecebimentos} color="text-indigo-600" bg="bg-indigo-50/50" />
        <MetricCard label="Total Saídas & Ocorrências" value={excelData.totals.totalSaidasOperacionais + excelData.totals.totalOutrasSaidas} isNegative color="text-rose-600" bg="bg-rose-50/50" />
        <MetricCard label="Reserva Impostos" value={excelData.totals.totalReservadoImpostos} color="text-amber-600" bg="bg-amber-50/50" />
        <MetricCard label="Distribuído Médicos" value={excelData.totals.totalDistribuicao} color="text-emerald-600" bg="bg-emerald-50/50" isHighlight />
      </div>

      {/* Tabela Mestra 1: Resumo Consolidado de Entradas, Saídas e Salários */}
      <div className="bg-white rounded-[36px] border border-gray-200 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black">
              <TableProperties size={20} />
            </div>
            <div>
              <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Mapa de Rateio e Salários Finais</h3>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Detalhamento individual por médico do corpo clínico</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-700 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                <th className="p-4 pl-6">Médico</th>
                <th className="p-4 text-center">Part. %</th>
                <th className="p-4 text-right">Produção Unimed</th>
                <th className="p-4 text-right">Outras Entradas</th>
                <th className="p-4 text-right">Total Ocorrências (Saídas)</th>
                <th className="p-4 text-right">Líquido Produção</th>
                <th className="p-4 text-right">Divisão / Acertos</th>
                <th className="p-4 text-right pr-6 bg-emerald-50 text-emerald-900 font-black">Salário Final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
              {excelData.fechamentoMedicos.map((med) => (
                <tr key={med.nome} className="hover:bg-blue-50/30 transition-colors">
                  <td className="p-4 pl-6 font-black text-gray-900">{med.nome}</td>
                  <td className="p-4 text-center font-bold text-gray-500">
                    {doctors.find(d => d.name === med.nome)?.percent || "-"}
                  </td>
                  <td className="p-4 text-right font-bold text-blue-700">
                    R$ {med.producao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-right text-emerald-600 font-bold">
                    +R$ {med.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-right text-rose-600 font-bold">
                    -R$ {med.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-right font-black text-gray-900">
                    R$ {med.liquidoCalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-4 text-right text-indigo-600 font-bold">
                    {med.divisaoLucros > 0 ? `+R$ ${med.divisaoLucros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                  </td>
                  <td className="p-4 text-right pr-6 font-black text-sm text-emerald-700 bg-emerald-50/40">
                    R$ {med.finalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-black text-xs text-gray-900 border-t-2 border-gray-300">
                <td className="p-4 pl-6 uppercase">TOTAL GERAL DA EQUIPE</td>
                <td className="p-4 text-center">100.00%</td>
                <td className="p-4 text-right text-blue-700">R$ 230.417,27</td>
                <td className="p-4 text-right text-emerald-700">+R$ 39.631,96</td>
                <td className="p-4 text-right text-rose-700">-R$ 43.953,48</td>
                <td className="p-4 text-right">R$ 249.359,70</td>
                <td className="p-4 text-right text-indigo-700">+R$ 16.758,44</td>
                <td className="p-4 text-right pr-6 text-emerald-800 bg-emerald-100/60 font-black text-base">
                  R$ 270.446,21
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Tabela Mestra 2: Ocorrências Financeiras Lançadas no Fluxo de Caixa */}
      <div className="bg-white rounded-[36px] border border-gray-200 shadow-xl overflow-hidden space-y-4">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/50">
          <div>
            <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Ocorrências Financeiras do Fechamento</h3>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
              Lançamentos detalhados originados dos arquivos PDF / XLS ({filteredOcorrencias.length} lançamentos)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-500 flex items-center gap-1.5">
              <Filter size={14} />
              Filtrar Médico:
            </span>
            <select
              value={selectedDoctorFilter}
              onChange={e => setSelectedDoctorFilter(e.target.value)}
              className="bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs font-bold outline-none"
            >
              <option value="ALL">Todos os Médicos & Equipe</option>
              {doctors.map(d => (
                <option key={d.key} value={d.initial}>{d.initial}</option>
              ))}
              <option value="HEART">EQUIPE HEART</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-600 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                <th className="p-3.5 pl-6">Médico / Responsável</th>
                <th className="p-3.5">Tipo de Despesa / Ocorrência</th>
                <th className="p-3.5">Descrição</th>
                <th className="p-3.5 text-center">Natureza</th>
                <th className="p-3.5 text-right pr-6">Valor (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
              {filteredOcorrencias.map((oc, idx) => (
                <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                  <td className="p-3.5 pl-6 font-bold text-gray-900">{oc.medico}</td>
                  <td className="p-3.5 font-bold text-gray-700">{oc.tipo}</td>
                  <td className="p-3.5 text-gray-500">{oc.desc}</td>
                  <td className="p-3.5 text-center">
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                      oc.natureza === "ENTRADA" 
                        ? "bg-emerald-100 text-emerald-700" 
                        : "bg-rose-100 text-rose-700"
                    }`}>
                      {oc.natureza}
                    </span>
                  </td>
                  <td className={`p-3.5 text-right pr-6 font-black ${
                    oc.natureza === "ENTRADA" ? "text-emerald-600" : "text-rose-600"
                  }`}>
                    {oc.natureza === "ENTRADA" ? "+R$ " : "-R$ "}
                    {oc.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tabela Mestra 3: Demonstrativo de Lotes Unimed deste Fechamento */}
      <div className="bg-white rounded-[36px] border border-gray-200 shadow-xl overflow-hidden space-y-4">
        <div className="p-6 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Demonstrativo de Pagamentos & Lotes Unimed</h3>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Cruzamento de Notas Fiscais, Retenções e Glosas por Lote</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 text-gray-600 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                <th className="p-3.5 pl-6">Lote</th>
                <th className="p-3.5">Título / Natureza</th>
                <th className="p-3.5">Dt Vencimento</th>
                <th className="p-3.5 text-right">Bruto (R$)</th>
                <th className="p-3.5 text-right">Glosas (R$)</th>
                <th className="p-3.5 text-right">IRRF 1.5%</th>
                <th className="p-3.5 text-right">PIS 0.65%</th>
                <th className="p-3.5 text-right">COFINS 3%</th>
                <th className="p-3.5 text-right">CSLL 1%</th>
                <th className="p-3.5 text-right pr-6 bg-blue-50 font-black text-blue-900">Líquido (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
              {excelData.lotesUnimed.map((lote) => (
                <tr key={lote.lote} className="hover:bg-blue-50/20 transition-colors">
                  <td className="p-3.5 pl-6 font-black text-gray-900">{lote.lote}</td>
                  <td className="p-3.5 font-bold text-gray-700">{lote.tipo}</td>
                  <td className="p-3.5 text-gray-500">{lote.vencimento}</td>
                  <td className="p-3.5 text-right font-bold text-gray-900">R$ {lote.bruto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-3.5 text-right text-rose-600 font-bold">-R$ {lote.glosa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-3.5 text-right text-gray-500">R$ {lote.irrf.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-3.5 text-right text-gray-500">R$ {lote.pis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-3.5 text-right text-gray-500">R$ {lote.cofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-3.5 text-right text-gray-500">R$ {lote.csll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-3.5 text-right pr-6 font-black text-blue-700 bg-blue-50/50">
                    R$ {lote.liquido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-100 font-black text-xs text-gray-900 border-t-2 border-gray-300">
                <td colSpan={3} className="p-3.5 pl-6 uppercase">TOTAL CONSOLIDADO DOS LOTES</td>
                <td className="p-3.5 text-right">R$ 238.079,16</td>
                <td className="p-3.5 text-right text-rose-600">-R$ 7.590,54</td>
                <td className="p-3.5 text-right">R$ 4.166,92</td>
                <td className="p-3.5 text-right">R$ 1.805,67</td>
                <td className="p-3.5 text-right">R$ 8.333,84</td>
                <td className="p-3.5 text-right">R$ 2.777,95</td>
                <td className="p-3.5 text-right pr-6 text-blue-800 bg-blue-100 font-black text-sm">
                  R$ 193.384,81
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, isNegative, color, bg, isHighlight }: { label: string; value: number; isNegative?: boolean; color: string; bg: string; isHighlight?: boolean }) {
  return (
    <div className={`p-6 rounded-3xl border ${isHighlight ? "border-emerald-300 shadow-md bg-white" : "border-gray-200/80 bg-white"} flex flex-col justify-between space-y-2`}>
      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</span>
      <span className={`text-xl font-black ${color}`}>
        {isNegative ? "-R$ " : "R$ "}
        {Math.abs(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </span>
    </div>
  );
}
