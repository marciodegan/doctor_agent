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
  AlertCircle,
  Stethoscope,
  Building2,
  Wallet,
  Receipt,
  Search,
  Plus,
  Eye,
  ChevronDown,
  Layers,
  Percent,
  Settings2,
  UserCheck,
  UserX,
  Save,
  Check,
  Info,
  Tag
} from "lucide-react";
import { DoctorTeamMember, TeamFinancialSettings } from "../../types/financial";
import { TransactionTypesManager } from "./TransactionTypesManager";

interface ExcelDashboardViewProps {
  closingId: string | null;
  initialSubTab?: "visao_geral" | "config_equipe" | "colunas_medicos" | "entradas_fontes" | "ocorrencias_fluxo" | "lotes_unimed" | "despesas_equipe" | "tipos_lancamento";
}

export function ExcelDashboardView({ closingId, initialSubTab = "visao_geral" }: ExcelDashboardViewProps) {
  const { activeGroup, apiFetch } = useGroup();
  const [closings, setClosings] = useState<any[]>([]);
  const [selectedClosingId, setSelectedClosingId] = useState<string | null>(closingId);
  const [details, setDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<
    "visao_geral" | "config_equipe" | "colunas_medicos" | "entradas_fontes" | "ocorrencias_fluxo" | "lotes_unimed" | "despesas_equipe" | "tipos_lancamento"
  >(initialSubTab);
  const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  // Team settings state
  const [teamSettings, setTeamSettings] = useState<TeamFinancialSettings>({
    teamId: "",
    doctors: [
      { key: "rochele", name: "ROCHELE LORENZI POL", isTeamMember: true, teamSharePercent: 29, proporcaoHeartDinamica: 26.79, disponivelPeriodo: 36086.02, specialty: "Cirurgia Cardiovascular" },
      { key: "thais", name: "THAIS ISABEL LUMIKOSKI", isTeamMember: true, teamSharePercent: 29, proporcaoHeartDinamica: 28.97, disponivelPeriodo: 39019.05, specialty: "Cirurgia Cardiovascular" },
      { key: "luis", name: "LUIS BONGIOLO MATTOS", isTeamMember: true, teamSharePercent: 29, proporcaoHeartDinamica: 26.79, disponivelPeriodo: 36086.02, specialty: "Cirurgia Geral / Cardio" },
      { key: "kathize", name: "KATHIZE LIRA", isTeamMember: true, teamSharePercent: 13, proporcaoHeartDinamica: 17.45, disponivelPeriodo: 23509.08, specialty: "Médica Assistente" },
      { key: "tamara", name: "TAMARA QUINTINO REGIS", isTeamMember: false, teamSharePercent: 0, proporcaoHeartDinamica: 0, disponivelPeriodo: 0, specialty: "Dermatologia Clínica" },
      { key: "luan", name: "LUAN JUNIOR VIGNATTI", isTeamMember: false, teamSharePercent: 0, proporcaoHeartDinamica: 0, disponivelPeriodo: 0, specialty: "Cirurgia da Pele / Dermatologia" },
      { key: "thaynara", name: "THAYNARA MAESTRI VIGNATTI", isTeamMember: false, teamSharePercent: 0, proporcaoHeartDinamica: 0, disponivelPeriodo: 0, specialty: "Ginecologia & Obstetrícia" },
      { key: "camila", name: "CAMILA RIBEIRO DUTRA", isTeamMember: false, teamSharePercent: 0, proporcaoHeartDinamica: 0, disponivelPeriodo: 0, specialty: "Reumatologia & Infusões" },
      { key: "maria_eduarda", name: "MARIA EDUARDA CASA SOUZA MACHADO", isTeamMember: false, teamSharePercent: 0, proporcaoHeartDinamica: 0, disponivelPeriodo: 0, specialty: "Dermatologia & Procedimentos" }
    ],
    teamOnlySources: ["AZAMBUJA", "MARIETA", "CONSULTORIO", "RECEBIDO_DINHEIRO", "CARTAO", "UNIMED_LUIS"],
    teamOnlyExpenses: ["CONTADOR_HEART", "DARE", "ALUGUEL_SALA", "CELULAR", "CONSULTORIO_ITAJAI", "CRM", "INSTRUMENTADOR", "ALVARA", "GOOGLE", "INSS_PATRONAL", "CAPITALIZACAO_COTA_PARTE"]
  });

  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Recalculates dynamic PROPORÇÃO HEART based on disponivelPeriodo
  const recalculateHeartProportions = (docs: DoctorTeamMember[]) => {
    const teamMembers = docs.filter(d => d.isTeamMember);
    const sumDisponivel = teamMembers.reduce((acc, d) => acc + (Number(d.disponivelPeriodo) || 0), 0);
    return docs.map(d => {
      if (d.isTeamMember && sumDisponivel > 0 && d.disponivelPeriodo !== undefined) {
        const dyn = Math.round(((Number(d.disponivelPeriodo) || 0) / sumDisponivel) * 10000) / 100;
        return { ...d, proporcaoHeartDinamica: dyn };
      }
      return d;
    });
  };

  // Load team settings from backend
  useEffect(() => {
    if (!activeGroup) return;
    const fetchTeamSettings = async () => {
      try {
        const res = await apiFetch("/api/app/financial/team-settings");
        if (res.ok) {
          const data = await res.json();
          if (data && data.doctors) {
            setTeamSettings(data);
          }
        }
      } catch (e) {
        console.error("Failed to load team settings:", e);
      }
    };
    fetchTeamSettings();
  }, [activeGroup]);

  // Load available closings
  useEffect(() => {
    if (!activeGroup) return;
    const fetchClosings = async () => {
      try {
        const res = await apiFetch("/api/app/financial/closings");
        if (res.ok) {
          const data = await res.json();
          setClosings(data);
          if (!selectedClosingId && data.length > 0) {
            setSelectedClosingId(data[0].id);
          }
        }
      } catch (e) {
        console.error("Failed to load closings:", e);
      }
    };
    fetchClosings();
  }, [activeGroup]);

  // Sync selectedClosingId when prop changes
  useEffect(() => {
    if (closingId) {
      setSelectedClosingId(closingId);
    }
  }, [closingId]);

  // Load details for selected closing
  useEffect(() => {
    if (!selectedClosingId || !activeGroup) return;
    const fetchDetails = async () => {
      try {
        setLoading(true);
        const res = await apiFetch(`/api/app/financial/closings/${selectedClosingId}/details`);
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
  }, [selectedClosingId, activeGroup]);

  const handleSaveTeamSettings = async () => {
    try {
      setSavingSettings(true);
      const res = await apiFetch("/api/app/financial/team-settings", {
        method: "POST",
        body: JSON.stringify(teamSettings)
      });
      if (res.ok) {
        setSettingsSuccess(true);
        setTimeout(() => setSettingsSuccess(false), 3000);
      }
    } catch (e: any) {
      alert("Erro ao salvar configurações da equipe: " + e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Calculate sum of team percentages
  const teamSumPercent = teamSettings.doctors
    .filter(d => d.isTeamMember)
    .reduce((acc, d) => acc + (Number(d.teamSharePercent) || 0), 0);

  // Excel master dataset linked dynamically with imported closing details
  const excelData = {
    monthKey: details?.closing?.monthKey || "SETEMBRO-26",
    totals: {
      entradasGerais: details?.closing?.processedValue || 266118.14,
      saidasOperacionais: details?.closing?.otherDebits || 4787.49,
      outrasSaidas: details?.closing?.taxValue || 29527.92,
      totalSaidas: (details?.closing?.otherDebits || 0) + (details?.closing?.taxValue || 0) || 34315.41,
      totalFaturado: details?.closing?.informedValue || 277794.83,
      totalRecebimentos: details?.closing?.releasedValue || 318078.98,
      totalDistribuicao: details?.closing?.netValue || 270446.21,
      totalReservadoImpostos: details?.closing?.taxValue || 46558.41,
      saldoFinal: 1074.36
    },
    // Entradas por Fonte
    fontes: {
      azambuja: {
        titulo: "AZAMBUJA (Exclusivo da Equipe)",
        equipePlantao: 57420.94,
        liquidoPlantao: 46782.71,
        particular: 12600.00,
        liquidoParticular: 10265.63,
        total: 70020.94,
        liquidoTotal: 57048.34,
        rateio: [
          { medico: "ROCHELE LORENZI POL", valor: 1890.27 },
          { medico: "THAIS ISABEL LUMIKOSKI", valor: 1890.27 },
          { medico: "LUIS BONGIOLO MATTOS", valor: 1890.27 },
          { medico: "KATHIZE LIRA", valor: 798.54 }
        ]
      },
      marieta: {
        titulo: "MARIETA (Exclusivo da Equipe)",
        total: 81042.09,
        liquidoTotal: 67645.83,
        rateio: [
          { medico: "ROCHELE LORENZI POL", valor: 19617.29 },
          { medico: "THAIS ISABEL LUMIKOSKI", valor: 19617.29 },
          { medico: "LUIS BONGIOLO MATTOS", valor: 19617.29 },
          { medico: "KATHIZE LIRA", valor: 8793.96 }
        ]
      },
      unimed: {
        titulo: "UNIMED LITORAL (Individual por Prestador)",
        total: details?.closing?.informedValue || 277794.83,
        liquidoTotal: details?.closing?.netValue || 227477.88,
        rateio: details?.doctorsSummary && details.doctorsSummary.length > 0
          ? details.doctorsSummary.map((d: any) => ({ medico: d.doctorName, valor: d.netProduction || d.productionTotal || 0 }))
          : [
              { medico: "ROCHELE LORENZI POL", valor: 27095.00 },
              { medico: "THAIS ISABEL LUMIKOSKI", valor: 7706.25 },
              { medico: "TAMARA QUINTINO REGIS", valor: 21101.25 },
              { medico: "LUAN JUNIOR VIGNATTI", valor: 37715.27 },
              { medico: "THAYNARA MAESTRI VIGNATTI", valor: 82700.87 },
              { medico: "CAMILA RIBEIRO DUTRA", valor: 18924.06 },
              { medico: "MARIA EDUARDA CASA SOUZA MACHADO", valor: 35174.57 }
            ]
      },
      consultorio: {
        titulo: "CONSULTÓRIO PARTICULAR & OUTROS (Exclusivo da Equipe)",
        dinheiro: 400.00,
        cartao: 1200.00,
        unimedLuis: 8406.00,
        totalGeral: 10006.00
      }
    },
    // Consolidado por Médico
    fechamentoMedicos: details?.doctorsSummary && details.doctorsSummary.length > 0
      ? details.doctorsSummary.map((d: any) => {
          const isTeam = ['rochele', 'thais', 'luis', 'kathize'].includes(d.doctorId) || KNOWN_DOCTORS.some(k => k.toLowerCase() === d.doctorName.toLowerCase());
          return {
            nome: d.doctorName,
            key: d.doctorId,
            isTeamMember: isTeam,
            percent: isTeam ? (d.doctorId === 'kathize' ? '13%' : '29%') : '0%',
            producao: d.productionTotal || 0,
            entradas: 0,
            saidas: d.glosaTotal || 0,
            liquidoCalculado: d.netProduction || 0,
            divisaoLucros: 0,
            finalGeral: d.netProduction || 0,
            detalhesEntradas: [`Produção: R$ ${(d.productionTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`],
            detalhesSaidas: [`Glosas: R$ ${(d.glosaTotal || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`]
          };
        })
      : [
      // 1. Membros da Equipe (Recebem rateio institucional e dividem custos fixos)
      { 
        nome: "ROCHELE LORENZI POL", 
        key: "rochele",
        isTeamMember: true,
        percent: "29%", 
        producao: 27095.00, 
        entradas: 5894.16, 
        saidas: 601.09, 
        liquidoCalculado: 44988.48, 
        divisaoLucros: 1442.69, 
        finalGeral: 46431.17,
        detalhesEntradas: ["Plantão UTI: R$ 1.966,87", "Produção HU: R$ 1.439,16", "Pareceres HU: R$ 135,00", "Sobreavisos: R$ 4.320,00"],
        detalhesSaidas: ["Glosa Clínica 11%: R$ 10,00", "Centro de Estudos: R$ 170,00"]
      },
      { 
        nome: "THAIS ISABEL LUMIKOSKI", 
        key: "thais",
        isTeamMember: true,
        percent: "29%", 
        producao: 7706.25, 
        entradas: 7200.00, 
        saidas: 8024.66, 
        liquidoCalculado: 44000.00, 
        divisaoLucros: 1465.75, 
        finalGeral: 45465.75,
        detalhesEntradas: ["Sobreavisos: R$ 7.200,00"],
        detalhesSaidas: ["Integralização Cota Parte: R$ 7.500,00", "Centro de Estudos: R$ 170,00", "Glosas Unimed: R$ 6,00"]
      },
      { 
        nome: "LUIS BONGIOLO MATTOS", 
        key: "luis",
        isTeamMember: true,
        percent: "29%", 
        producao: 0.00, 
        entradas: 46461.17, 
        saidas: 0.00, 
        liquidoCalculado: 44000.00, 
        divisaoLucros: 16277.74, 
        finalGeral: 60277.74,
        detalhesEntradas: ["Repasses Azambuja + Marieta", "Participação Cirurgias"],
        detalhesSaidas: ["Sem retenção individual"]
      },
      { 
        nome: "KATHIZE LIRA", 
        key: "kathize",
        isTeamMember: true,
        percent: "13%", 
        producao: 0.00, 
        entradas: 12831.53, 
        saidas: 0.00, 
        liquidoCalculado: 12831.53, 
        divisaoLucros: 0.00, 
        finalGeral: 12831.53,
        detalhesEntradas: ["Marieta: R$ 8.793,96", "Azambuja: R$ 798,54", "Acertos"],
        detalhesSaidas: ["Sem retenção individual"]
      },
      // 2. Não pertencem à equipe (Cooperados / Prestadores Externos - Sem rateio de despesas corporativas)
      { 
        nome: "TAMARA QUINTINO REGIS", 
        key: "tamara",
        isTeamMember: false,
        percent: "0%", 
        producao: 21101.25, 
        entradas: 0.00, 
        saidas: 1215.10, 
        liquidoCalculado: 13183.53, 
        divisaoLucros: 1442.69, 
        finalGeral: 14626.22,
        detalhesEntradas: ["Produção Unimed Própria"],
        detalhesSaidas: ["Glosas: R$ 757,10", "Centro de Estudos: R$ 170,00", "Mensalidade PLAC: R$ 288,00"]
      },
      { 
        nome: "LUAN JUNIOR VIGNATTI", 
        key: "luan",
        isTeamMember: false,
        percent: "0%", 
        producao: 37715.27, 
        entradas: 0.00, 
        saidas: 10137.55, 
        liquidoCalculado: 18047.72, 
        divisaoLucros: 0.00, 
        finalGeral: 18047.72,
        detalhesEntradas: ["Produção Unimed Própria"],
        detalhesSaidas: ["Cota Parte (5/24): R$ 7.579,69", "Glosas Unimed: R$ 2.308,86", "Centro de Estudos: R$ 170,00"]
      },
      { 
        nome: "THAYNARA MAESTRI VIGNATTI", 
        key: "thaynara",
        isTeamMember: false,
        percent: "0%", 
        producao: 82700.87, 
        entradas: 13768.13, 
        saidas: 8387.18, 
        liquidoCalculado: 58251.62, 
        divisaoLucros: 0.00, 
        finalGeral: 58251.62,
        detalhesEntradas: ["Disponibilidade Obstetrícia HU: R$ 7.910,93", "Disponibilidade Ginecologia: R$ 3.857,67", "Bonificação Parto: R$ 1.999,53"],
        detalhesSaidas: ["Cota Parte: R$ 7.500,00", "Glosas Unimed: R$ 702,18", "Centro de Estudos: R$ 170,00"]
      },
      { 
        nome: "CAMILA RIBEIRO DUTRA", 
        key: "camila",
        isTeamMember: false,
        percent: "0%", 
        producao: 18924.06, 
        entradas: 12769.67, 
        saidas: 7838.24, 
        liquidoCalculado: 12159.42, 
        divisaoLucros: 0.00, 
        finalGeral: 12159.42,
        detalhesEntradas: ["Disponibilidade Reumatologia: R$ 12.769,67"],
        detalhesSaidas: ["Cota Parte (5/24): R$ 7.579,66", "PLAC: R$ 431,09", "Centro de Estudos: R$ 170,00", "Recurso Próprio: R$ 45,00"]
      },
      { 
        nome: "MARIA EDUARDA CASA SOUZA MACHADO", 
        key: "maria_eduarda",
        isTeamMember: false,
        percent: "0%", 
        producao: 35174.57, 
        entradas: 0.00, 
        saidas: 7749.66, 
        liquidoCalculado: 14728.93, 
        divisaoLucros: 0.00, 
        finalGeral: 14728.93,
        detalhesEntradas: ["Produção Procedimentos Ambulatoriais"],
        detalhesSaidas: ["Cota Parte (5/24): R$ 7.579,66", "Glosas Unimed: R$ 275,00", "Centro de Estudos: R$ 170,00"]
      }
    ],
    // Ocorrências Financeiras detalhadas por Médico
    ocorrencias: details?.transactions && details.transactions.length > 0
      ? details.transactions.map((t: any) => ({
          medico: t.doctorName || "HEART CIRURGIA CARDIOVASCULAR",
          tipo: t.typeName || t.typeId,
          valor: Math.abs(t.amount || 0),
          natureza: t.nature === "CREDIT" ? "ENTRADA" : "SAIDA",
          desc: t.observation || t.typeName || "Lançamento",
          data: t.date || "14/09/2026",
          scope: t.scope || "DOCTOR"
        }))
      : [
          { medico: "ROCHELE LORENZI POL", tipo: "Disponibilidade Médica - UTI", valor: 1966.87, natureza: "ENTRADA", desc: "Plantão UTI HU", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "ROCHELE LORENZI POL", tipo: "Repasse Pagamento de Produção - HU", valor: 1439.16, natureza: "ENTRADA", desc: "Produção HU Unimed", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "ROCHELE LORENZI POL", tipo: "Repasse Pagamento de Parecer Médico - HU", valor: 135.00, natureza: "ENTRADA", desc: "Pareceres HU", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "ROCHELE LORENZI POL", tipo: "Sobreavisos", valor: 4320.00, natureza: "ENTRADA", desc: "Sobreavisos de retaguarda", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "ROCHELE LORENZI POL", tipo: "Glosas - Clínica Cooperada - 11%", valor: 10.00, natureza: "SAIDA", desc: "Retenção glosa Unimed", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "ROCHELE LORENZI POL", tipo: "Contribuição de Centro de Estudos", valor: 170.00, natureza: "SAIDA", desc: "Taxa Centro de Estudos", data: "14/09/2026", scope: "DOCTOR" },

          { medico: "THAIS ISABEL LUMIKOSKI", tipo: "Sobreavisos", valor: 7200.00, natureza: "ENTRADA", desc: "Sobreavisos plantão", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "THAIS ISABEL LUMIKOSKI", tipo: "Glosas - Clínica Cooperada - 11%", valor: 6.00, natureza: "SAIDA", desc: "Glosa Unimed", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "THAIS ISABEL LUMIKOSKI", tipo: "Contribuição de Centro de Estudos", valor: 170.00, natureza: "SAIDA", desc: "Taxa Centro de Estudos", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "THAIS ISABEL LUMIKOSKI", tipo: "Integralização de Cota Parte", valor: 7500.00, natureza: "SAIDA", desc: "Integralização cota Unimed", data: "14/09/2026", scope: "DOCTOR" },

          { medico: "TAMARA QUINTINO REGIS", tipo: "Glosas - Clínica Cooperada - 11%", valor: 407.57, natureza: "SAIDA", desc: "Glosa Lote 1485226", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "TAMARA QUINTINO REGIS", tipo: "Glosas - Clínica Cooperada - 11%", valor: 349.53, natureza: "SAIDA", desc: "Glosa Lote 1490176", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "TAMARA QUINTINO REGIS", tipo: "Contribuição de Centro de Estudos", valor: 170.00, natureza: "SAIDA", desc: "Taxa Centro de Estudos", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "TAMARA QUINTINO REGIS", tipo: "Mensalidade PLAC", valor: 288.00, natureza: "SAIDA", desc: "Desconto mensal PLAC", data: "14/09/2026", scope: "DOCTOR" },

          { medico: "LUAN JUNIOR VIGNATTI", tipo: "Glosas - Clínica Cooperada - 11%", valor: 2308.86, natureza: "SAIDA", desc: "Glosa Lote 1490176", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "LUAN JUNIOR VIGNATTI", tipo: "Integralização de Cota Parte", valor: 7579.69, natureza: "SAIDA", desc: "Integralização Unimed 5 de 24", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "LUAN JUNIOR VIGNATTI", tipo: "Contribuição de Centro de Estudos", valor: 170.00, natureza: "SAIDA", desc: "Taxa Centro de Estudos", data: "14/09/2026", scope: "DOCTOR" },

          { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Remuneração Bonificação Parto Normal", valor: 1150.00, natureza: "ENTRADA", desc: "Bonificação Parto Normal HU", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Remuneração Bonificação Parto Normal", valor: 849.53, natureza: "ENTRADA", desc: "Bonificação Parto Normal", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Disponibilidade Ginecologia - Centro Obstétrico", valor: 3857.67, natureza: "ENTRADA", desc: "Disponibilidade Obstetrícia", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Disponibilidade Ginecologia - Centro Obstétrico", valor: 7910.93, natureza: "ENTRADA", desc: "Disponibilidade Obstetrícia HU", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Glosas - Clínica Cooperada - 11%", valor: 702.18, natureza: "SAIDA", desc: "Glosa Unimed", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Integralização de Cota Parte", valor: 7500.00, natureza: "SAIDA", desc: "Integralização cota Unimed", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "THAYNARA MAESTRI VIGNATTI", tipo: "Contribuição de Centro de Estudos", valor: 170.00, natureza: "SAIDA", desc: "Taxa Centro de Estudos", data: "14/09/2026", scope: "DOCTOR" },

          { medico: "CAMILA RIBEIRO DUTRA", tipo: "Disponibilidade - Reumatologia", valor: 12769.67, natureza: "ENTRADA", desc: "Disponibilidade Especialidade", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "CAMILA RIBEIRO DUTRA", tipo: "Integralização de Cota Parte", valor: 7579.66, natureza: "SAIDA", desc: "Integralização cota 5 de 24", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "CAMILA RIBEIRO DUTRA", tipo: "Mensalidade PLAC", valor: 431.09, nature: "SAIDA", desc: "Desconto PLAC", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "CAMILA RIBEIRO DUTRA", tipo: "Contribuição de Centro de Estudos", valor: 170.00, nature: "SAIDA", desc: "Taxa Centro de Estudos", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "CAMILA RIBEIRO DUTRA", tipo: "Desconto Atendimentos Realizados - Recurso Próprio", valor: 45.00, nature: "SAIDA", desc: "Desconto Recurso Próprio", data: "14/09/2026", scope: "DOCTOR" },

          { medico: "MARIA EDUARDA CASA SOUZA MACHADO", tipo: "Glosas - Clínica Cooperada - 11%", valor: 275.00, natureza: "SAIDA", desc: "Glosa Unimed", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "MARIA EDUARDA CASA SOUZA MACHADO", tipo: "Integralização de Cota Parte", valor: 7579.66, nature: "SAIDA", desc: "Integralização cota 5 de 24", data: "14/09/2026", scope: "DOCTOR" },
          { medico: "MARIA EDUARDA CASA SOUZA MACHADO", tipo: "Contribuição de Centro de Estudos", valor: 170.00, nature: "SAIDA", desc: "Taxa Centro de Estudos", data: "14/09/2026", scope: "DOCTOR" },

          { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Capitalização Cota-Parte (360)", valor: 14825.40, natureza: "SAIDA", desc: "Desconto cota capitalização Unimed", data: "01/08/2026", scope: "TEAM" },
          { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Contador Heart", valor: 294.00, natureza: "SAIDA", desc: "Assessoria Contábil Heart", data: "14/09/2026", scope: "TEAM" },
          { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "DARE", valor: 497.00, natureza: "SAIDA", desc: "Taxa DARE estadual", data: "14/09/2026", scope: "TEAM" },
          { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Aluguel Sala / Consultório", valor: 900.00, natureza: "SAIDA", desc: "Locação consultório", data: "14/09/2026", scope: "TEAM" },
          { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Celular Corporativo", valor: 722.21, nature: "SAIDA", desc: "Telefonia corporativa", data: "14/09/2026", scope: "TEAM" },
          { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Consultório Itajaí", valor: 2029.78, nature: "SAIDA", desc: "Despesas unidade Itajaí", data: "14/09/2026", scope: "TEAM" },
          { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "CRM", valor: 344.50, nature: "SAIDA", desc: "Taxa anuidade conselho CRM", data: "14/09/2026", scope: "TEAM" },
          { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Instrumentador Cirúrgico", valor: 1526.76, nature: "SAIDA", desc: "Honorários instrumentação", data: "14/09/2026", scope: "TEAM" },
          { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Alvará Municipal", valor: 431.09, nature: "SAIDA", desc: "Licença prefeitura", data: "14/09/2026", scope: "TEAM" },
          { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "Constit Heart LK / Google", valor: 45.00, nature: "SAIDA", desc: "Serviços digitais e Google", data: "14/09/2026", scope: "TEAM" },
          { medico: "HEART CIRURGIA CARDIOVASCULAR", tipo: "INSS Patronal", valor: 502.51, nature: "SAIDA", desc: "Previdência social", data: "14/09/2026", scope: "TEAM" }
        ],
    // Demonstrativo de Lotes Unimed
    lotesUnimed: details?.taxes && details.taxes.length > 0
      ? details.taxes.map((tax: any) => ({
          lote: tax.lote || "1490176",
          tipo: tax.tipo || tax.typeName || "Lote Unimed",
          vencimento: tax.date || "14/09/2026",
          bruto: tax.amount || 148253.88,
          glosa: 0,
          irrf: 2223.81,
          pis: 963.65,
          cofins: 4447.62,
          csll: 1482.54,
          liquido: tax.amount || 124310.86
        }))
      : [
          { lote: "1478356", tipo: "Lote Complementar", vencimento: "25/08/2026", bruto: 670.00, glosa: 0.00, irrf: 10.05, pis: 4.36, cofins: 20.10, csll: 6.70, liquido: 561.79 },
          { lote: "1479142", tipo: "Lote Complementar", vencimento: "25/08/2026", bruto: 300.00, glosa: 0.00, irrf: 4.50, pis: 1.95, cofins: 9.00, csll: 3.00, liquido: 256.05 },
          { lote: "1485226", tipo: "Clínica Cooperada", vencimento: "14/09/2026", bruto: 87281.12, glosa: 491.69, irrf: 1904.95, pis: 825.48, cofins: 3809.90, csll: 1269.97, liquido: 66778.75 },
          { lote: "1489867", tipo: "Lote Complementar", vencimento: "11/09/2026", bruto: 1574.16, glosa: 0.00, irrf: 23.61, pis: 10.23, cofins: 47.22, csll: 15.74, liquido: 1477.36 },
          { lote: "1490176", tipo: "Clínica Cooperada", vencimento: "14/09/2026", bruto: 148253.88, glosa: 7098.85, irrf: 2223.81, pis: 963.65, cofins: 4447.62, csll: 1482.54, liquido: 124310.86 }
        ],
    // Despesas Equipe Heart
    despesasEquipe: details?.transactions && details.transactions.length > 0
      ? details.transactions
          .filter((t: any) => t.nature === "DEBIT" && (t.scope === "TEAM" || t.doctorId === "heart_equipe" || t.doctorId === "heart_cirurgia"))
          .map((t: any) => ({
            despesa: t.typeName || t.observation || "Despesa",
            categoria: t.source || "Operacional",
            valor: Math.abs(t.amount || 0),
            status: "PAGO"
          }))
      : [
          { despesa: "Capitalização Cota-Parte (360)", categoria: "Operacional Unimed", valor: 14825.40, status: "DESCONTADO" },
          { despesa: "Consultório Itajaí", categoria: "Infraestrutura", valor: 2029.78, status: "PAGO" },
          { despesa: "Instrumentador Cirúrgico", categoria: "Equipe Cirúrgica", valor: 1526.76, status: "PAGO" },
          { despesa: "Aluguel Sala / Consultório", categoria: "Infraestrutura", valor: 900.00, status: "PAGO" },
          { despesa: "Celular Corporativo", categoria: "Comunicação", valor: 722.21, status: "PAGO" },
          { despesa: "INSS Patronal", categoria: "Tributário", valor: 502.51, status: "PAGO" },
          { despesa: "DARE", categoria: "Tributário Estadual", valor: 497.00, status: "PAGO" },
          { despesa: "Alvará Municipal", categoria: "Taxa Municipal", valor: 431.09, status: "PAGO" },
          { despesa: "CRM", categoria: "Conselho de Classe", valor: 344.50, status: "PAGO" },
          { despesa: "Contador Heart", categoria: "Contabilidade", valor: 294.00, status: "PAGO" },
          { despesa: "Constit Heart LK / Google", categoria: "Tecnologia", valor: 45.00, status: "PAGO" }
        ]
  };

  // Filter occurrences
  const filteredOcorrencias = excelData.ocorrencias.filter(o => {
    const matchDoctor = selectedDoctorFilter === "ALL" 
      ? true 
      : selectedDoctorFilter === "HEART"
      ? o.medico.includes("HEART")
      : o.medico.includes(selectedDoctorFilter);
    const matchSearch = searchTerm 
      ? o.tipo.toLowerCase().includes(searchTerm.toLowerCase()) || 
        o.desc.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.medico.toLowerCase().includes(searchTerm.toLowerCase())
      : true;
    return matchDoctor && matchSearch;
  });

  const totalOcorrenciasEntradas = filteredOcorrencias
    .filter(o => o.natureza === "ENTRADA")
    .reduce((acc, o) => acc + o.valor, 0);

  const totalOcorrenciasSaidas = filteredOcorrencias
    .filter(o => o.natureza === "SAIDA")
    .reduce((acc, o) => acc + o.valor, 0);

  // Group doctors by team member status
  const teamDoctors = excelData.fechamentoMedicos.filter(d => {
    const config = teamSettings.doctors.find(c => c.name === d.nome);
    return config ? config.isTeamMember : d.isTeamMember;
  });

  const nonTeamDoctors = excelData.fechamentoMedicos.filter(d => {
    const config = teamSettings.doctors.find(c => c.name === d.nome);
    return config ? !config.isTeamMember : !d.isTeamMember;
  });

  return (
    <div className="space-y-6 max-w-[1700px] mx-auto pb-20 font-sans">
      {/* Top Banner / Excel Dashboard Title */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white p-7 lg:p-9 rounded-[36px] shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative overflow-hidden border border-emerald-800/40">
        <div className="space-y-3 z-10">
          <div className="flex flex-wrap items-center gap-3">
            <span className="px-3.5 py-1 bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 text-xs font-black uppercase tracking-widest rounded-full flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              PLANILHA MESTRA • FECHAMENTO {excelData.monthKey}
            </span>
            <span className="px-3 py-1 bg-white/10 text-white/90 text-xs font-bold rounded-full">
              Rateio Diferenciado: Equipe vs. Cooperados
            </span>
          </div>
          <div>
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight uppercase flex items-center gap-3">
              <span>Dashboard Financeiro & Rateios HeaRT</span>
            </h2>
            <p className="text-xs text-emerald-100/80 font-medium max-w-3xl mt-1">
              Controle de rateio para <b>membros da equipe</b> (Rochele, Thais, Luis, Kathize) e <b>cooperados parceiros</b> (Thaynara, Tamara, Maria Eduarda, Camila, Luan) conforme a planilha Google Sheets.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10">
          {/* Closing Month Selector */}
          <div className="bg-black/30 backdrop-blur-md border border-white/20 rounded-2xl px-3 py-2 flex items-center gap-2 text-xs">
            <Calendar size={14} className="text-emerald-300" />
            <select
              value={selectedClosingId || ""}
              onChange={e => setSelectedClosingId(e.target.value)}
              className="bg-transparent text-white font-bold outline-none cursor-pointer pr-2"
            >
              {closings.length > 0 ? (
                closings.map(c => (
                  <option key={c.id} value={c.id} className="text-gray-900 bg-white">
                    {c.monthKey} ({c.status || "CONCILIADO"})
                  </option>
                ))
              ) : (
                <option value="" className="text-gray-900 bg-white">SETEMBRO-26</option>
              )}
            </select>
          </div>

          <button
            onClick={() => setActiveSubTab("config_equipe")}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition border border-emerald-400/40 cursor-pointer shadow-sm active:scale-95"
          >
            <Settings2 size={15} />
            <span>Configurar Equipe & %</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-4 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider transition border border-white/20 cursor-pointer shadow-sm active:scale-95"
          >
            <Download size={15} />
            <span>Exportar PDF</span>
          </button>
        </div>
      </div>

      {/* Top Metrics Cards matching Excel summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <MetricCard 
          label="Entradas Totais" 
          value={excelData.totals.entradasGerais} 
          color="text-emerald-600" 
          bg="bg-emerald-50/50" 
          sub="Produção & Plantões"
        />
        <MetricCard 
          label="Disponível Saque" 
          value={excelData.totals.totalRecebimentos} 
          color="text-indigo-600" 
          bg="bg-indigo-50/50" 
          sub="Recebimentos Brutos"
        />
        <MetricCard 
          label="Total Saídas" 
          value={excelData.totals.totalSaidas} 
          isNegative 
          color="text-rose-600" 
          bg="bg-rose-50/50" 
          sub="Operacional + Outras"
        />
        <MetricCard 
          label="Reserva Impostos" 
          value={excelData.totals.totalReservadoImpostos} 
          color="text-amber-600" 
          bg="bg-amber-50/50" 
          sub="Tributos retidos"
        />
        <MetricCard 
          label="Distribuído Médicos" 
          value={excelData.totals.totalDistribuicao} 
          color="text-blue-600" 
          bg="bg-blue-50/50" 
          isHighlight
          sub="Salários da Equipe"
        />
        <MetricCard 
          label="Saldo Final Caixa" 
          value={excelData.totals.saldoFinal} 
          color="text-emerald-700" 
          bg="bg-emerald-50/60" 
          sub="Sobra em Caixa"
        />
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-gray-200 text-xs font-black uppercase tracking-wider">
        <button
          onClick={() => setActiveSubTab("visao_geral")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "visao_geral"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <TableProperties size={16} />
          <span>1. Mapa de Rateio e Salários</span>
        </button>

        <button
          onClick={() => setActiveSubTab("config_equipe")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "config_equipe"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <Settings2 size={16} />
          <span>2. Configurar Membros da Equipe & Rateio</span>
        </button>

        <button
          onClick={() => setActiveSubTab("colunas_medicos")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "colunas_medicos"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <Users size={16} />
          <span>3. Colunas por Médico (Excel View)</span>
        </button>

        <button
          onClick={() => setActiveSubTab("ocorrencias_fluxo")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "ocorrencias_fluxo"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <Wallet size={16} />
          <span>4. Ocorrências no Fluxo ({excelData.ocorrencias.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab("entradas_fontes")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "entradas_fontes"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <Building2 size={16} />
          <span>5. Fontes (Azambuja, Marieta, Unimed)</span>
        </button>

        <button
          onClick={() => setActiveSubTab("lotes_unimed")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "lotes_unimed"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <Receipt size={16} />
          <span>6. Lotes & Retenções Unimed</span>
        </button>

        <button
          onClick={() => setActiveSubTab("despesas_equipe")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "despesas_equipe"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <FileText size={16} />
          <span>7. Despesas Equipe Heart</span>
        </button>

        <button
          onClick={() => setActiveSubTab("tipos_lancamento")}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl transition cursor-pointer shrink-0 ${
            activeSubTab === "tipos_lancamento"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
          }`}
        >
          <Tag size={16} />
          <span>8. Tipos de Lançamento (Pré-preenchimento)</span>
        </button>
      </div>

      {/* VIEW 1: MAPA MESTRE DE RATEIO E SALÁRIOS (SEPARADO ENTRE EQUIPE E FORA DA EQUIPE) */}
      {activeSubTab === "visao_geral" && (
        <div className="space-y-8">
          {/* BLOCO 1: MEMBROS DA EQUIPE (SÓCIOS) */}
          <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-emerald-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-black shadow-md shadow-emerald-600/20">
                  <UserCheck size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">1. Membros da Equipe HeaRT (Rateio Institucional)</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-600 text-white">
                      Sócios / Equipe
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-medium">
                    Participam do rateio de Azambuja, Marieta, Consultório/Particular e dividem despesas corporativas (Soma dos percentuais: {teamSumPercent}%)
                  </p>
                </div>
              </div>
            </div>

            {/* Explanatory Callout Banner */}
            <div className="mx-6 my-3.5 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl flex items-start gap-3.5 text-xs text-blue-950">
              <Info size={20} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-black text-blue-900 uppercase tracking-wide block text-[11px]">
                  Regra Contábil de Rateio da Equipe HeaRT:
                </span>
                <p className="leading-relaxed text-blue-900">
                  • <strong>Entradas da Equipe (Azambuja, Marieta, Consultório Particular, Cartão, Dinheiro):</strong> entram no rateio nominal societário de <strong>29% (Rochele), 29% (Thais), 29% (Luis) e 13% (Kathize)</strong>.<br />
                  • <strong>Despesas Operacionais e Fixas (Aluguel Sala, Celular, Consultório Itajaí, DARE, Contador):</strong> utilizam a <strong>PROPORÇÃO HEART</strong> (calculada dinamicamente pelo faturamento recebido por cada sócio no período: 26,79%, 28,97%, 26,79%, 17,45%).
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-emerald-100/60 text-emerald-950 font-black uppercase text-[10px] tracking-wider border-b border-emerald-200">
                    <th className="p-4 pl-6">Médico da Equipe</th>
                    <th className="p-4 text-center">% Nominal (Entradas)</th>
                    <th className="p-4 text-center bg-blue-100/70 text-blue-950">PROPORÇÃO HEART (Despesas)</th>
                    <th className="p-4 text-right">Disponível no Mês</th>
                    <th className="p-4 text-right">Produção Unimed</th>
                    <th className="p-4 text-right">Outras Entradas (Azambuja/Marieta)</th>
                    <th className="p-4 text-right">Ocorrências / Deduções</th>
                    <th className="p-4 text-right">Líquido Produção</th>
                    <th className="p-4 text-right">Divisão / Acertos</th>
                    <th className="p-4 text-right pr-6 bg-emerald-100 text-emerald-950 font-black">Salário Final Reajustado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {teamDoctors.map((med) => {
                    const docConfig = teamSettings.doctors.find(d => d.name === med.nome);
                    const nominalPct = docConfig?.teamSharePercent || med.percent;
                    const dynamicHeartPct = docConfig?.proporcaoHeartDinamica || (med.key === 'kathize' ? 17.45 : med.key === 'thais' ? 28.97 : 26.79);
                    const dispMes = docConfig?.disponivelPeriodo || (med.key === 'thais' ? 39019.05 : med.key === 'kathize' ? 23509.08 : 36086.02);

                    return (
                      <tr key={med.nome} className="hover:bg-emerald-50/30 transition-colors">
                        <td className="p-4 pl-6">
                          <div className="font-black text-gray-900 flex items-center gap-2">
                            <span>{med.nome}</span>
                            <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-emerald-100 text-emerald-800">Membro da Equipe</span>
                          </div>
                          <div className="text-[10px] text-gray-400">
                            {docConfig?.specialty || "Médico Sócio"}
                          </div>
                        </td>
                        <td className="p-4 text-center font-black text-emerald-700">
                          <span className="px-2.5 py-1 bg-emerald-100/70 border border-emerald-200 rounded-lg text-xs font-black">
                            {nominalPct}%
                          </span>
                        </td>
                        <td className="p-4 text-center font-black text-blue-900 bg-blue-50/40">
                          <span className="px-2.5 py-1 bg-blue-100 text-blue-900 border border-blue-200 rounded-lg text-xs font-black">
                            {dynamicHeartPct.toFixed(2)}%
                          </span>
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-gray-700">
                          R$ {dispMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 text-right font-bold text-blue-700">
                          R$ {med.producao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 text-right text-emerald-600 font-bold">
                          +R$ {med.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 text-right text-rose-600 font-bold">
                          {med.saidas > 0 ? `-R$ ${med.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                        </td>
                        <td className="p-4 text-right font-black text-gray-900">
                          R$ {med.liquidoCalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-4 text-right text-indigo-600 font-bold">
                          {med.divisaoLucros > 0 ? `+R$ ${med.divisaoLucros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                        </td>
                        <td className="p-4 text-right pr-6 font-black text-sm text-emerald-800 bg-emerald-50/50">
                          R$ {med.finalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* BLOCO 2: MÉDICOS FORA DA EQUIPE (COOPERADOS & PARCEIROS) */}
          <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-700 text-white flex items-center justify-center font-black shadow-md shadow-slate-600/20">
                  <UserX size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">2. Médicos Fora da Equipe (Cooperados Parceiros)</h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-200 text-slate-800">
                      Sem Rateio de Custos Corporativos
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-medium">
                    Recebem a sua própria produção Unimed e plantões específicos, deduzindo apenas ocorrências individuais (sem rateio de Marieta/Azambuja/Consultório/Contador)
                  </p>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                    <th className="p-4 pl-6">Médico Cooperado</th>
                    <th className="p-4 text-center">Escopo</th>
                    <th className="p-4 text-right">Produção Unimed Própria</th>
                    <th className="p-4 text-right">Outras Entradas Diretas</th>
                    <th className="p-4 text-right">Deduções Próprias (Glosas/Cota)</th>
                    <th className="p-4 text-right">Líquido de Produção</th>
                    <th className="p-4 text-right">Divisão / Acertos</th>
                    <th className="p-4 text-right pr-6 bg-slate-100 text-slate-900 font-black">Valor Final a Receber</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                  {nonTeamDoctors.map((med) => (
                    <tr key={med.nome} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="font-black text-gray-900 flex items-center gap-2">
                          <span>{med.nome}</span>
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-slate-100 text-slate-600">Cooperado Externo</span>
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {teamSettings.doctors.find(d => d.name === med.nome)?.specialty || "Médico Cooperado"}
                        </div>
                      </td>
                      <td className="p-4 text-center font-bold text-gray-400">
                        <span className="px-2 py-1 bg-gray-100 rounded-lg text-[10px]">
                          Direto (0% Equipe)
                        </span>
                      </td>
                      <td className="p-4 text-right font-bold text-blue-700">
                        R$ {med.producao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-right text-emerald-600 font-bold">
                        {med.entradas > 0 ? `+R$ ${med.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td className="p-4 text-right text-rose-600 font-bold">
                        {med.saidas > 0 ? `-R$ ${med.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td className="p-4 text-right font-black text-gray-900">
                        R$ {med.liquidoCalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-4 text-right text-indigo-600 font-bold">
                        {med.divisaoLucros > 0 ? `+R$ ${med.divisaoLucros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}
                      </td>
                      <td className="p-4 text-right pr-6 font-black text-sm text-gray-900 bg-slate-50/50">
                        R$ {med.finalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-black text-xs text-gray-900 border-t-2 border-gray-300">
                    <td colSpan={2} className="p-4 pl-6 uppercase">TOTAL GERAL CONSOLIDADO (EQUIPE + COOPERADOS)</td>
                    <td className="p-4 text-right text-blue-700">R$ 230.417,27</td>
                    <td className="p-4 text-right text-emerald-700">+R$ 39.631,96</td>
                    <td className="p-4 text-right text-rose-700">-R$ 43.953,48</td>
                    <td className="p-4 text-right">R$ 249.359,70</td>
                    <td className="p-4 text-right text-indigo-700">+R$ 16.758,44</td>
                    <td className="p-4 text-right pr-6 text-emerald-900 bg-emerald-100/80 font-black text-base">
                      R$ 270.446,21
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: CONFIGURAÇÃO DE MEMBROS DA EQUIPE & REGRAS DE RATEIO */}
      {activeSubTab === "config_equipe" && (
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl p-6 lg:p-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <Settings2 size={22} className="text-emerald-600" />
                <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">
                  Definição de Membros da Equipe & Percentuais de Rateio
                </h3>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-1">
                Defina quais médicos fazem parte da equipe para rateio de receitas institucionais (Marieta, Azambuja, Consultório) e despesas fixas (Contador, DARE, Aluguel).
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 ${
                teamSumPercent === 100 
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200" 
                  : "bg-amber-50 text-amber-800 border border-amber-200"
              }`}>
                <span>Soma dos % da Equipe: {teamSumPercent}%</span>
                {teamSumPercent === 100 ? <Check size={14} /> : <AlertCircle size={14} />}
              </div>

              <button
                onClick={handleSaveTeamSettings}
                disabled={savingSettings}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/20 active:scale-95 transition cursor-pointer"
              >
                <Save size={15} />
                <span>{savingSettings ? "Salvando..." : "Salvar Configuração"}</span>
              </button>
            </div>
          </div>

          {settingsSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 font-bold flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>Configurações da equipe e percentuais de rateio salvos com sucesso!</span>
            </div>
          )}

          {/* Table of doctors and team assignment */}
          <div className="overflow-x-auto border border-gray-200 rounded-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-700 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                  <th className="p-3.5 pl-6">Médico</th>
                  <th className="p-3.5">Especialidade</th>
                  <th className="p-3.5 text-center">Membro da Equipe?</th>
                  <th className="p-3.5 text-center">% Nominal (Entradas)</th>
                  <th className="p-3.5 text-center">Disponível no Mês (R$)</th>
                  <th className="p-3.5 text-center bg-blue-50 text-blue-900">PROPORÇÃO HEART (Despesas)</th>
                  <th className="p-3.5">Regra de Fechamento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {teamSettings.doctors.map((doc, idx) => (
                  <tr key={doc.key} className={doc.isTeamMember ? "bg-emerald-50/20" : "bg-white"}>
                    <td className="p-3.5 pl-6 font-black text-gray-900">{doc.name}</td>
                    <td className="p-3.5 text-gray-500">{doc.specialty || "-"}</td>
                    <td className="p-3.5 text-center">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={doc.isTeamMember}
                          onChange={(e) => {
                            const updated = [...teamSettings.doctors];
                            updated[idx].isTeamMember = e.target.checked;
                            if (!e.target.checked) {
                              updated[idx].teamSharePercent = 0;
                              updated[idx].proporcaoHeartDinamica = 0;
                            }
                            const recalced = recalculateHeartProportions(updated);
                            setTeamSettings({ ...teamSettings, doctors: recalced });
                          }}
                          className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                        />
                        <span className={`text-[11px] font-black uppercase ${doc.isTeamMember ? "text-emerald-700" : "text-gray-400"}`}>
                          {doc.isTeamMember ? "Sim (Equipe)" : "Não (Externo)"}
                        </span>
                      </label>
                    </td>

                    {/* % Nominal Societário (Entradas da Equipe) */}
                    <td className="p-3.5 text-center">
                      {doc.isTeamMember ? (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={doc.teamSharePercent}
                            onChange={(e) => {
                              const updated = [...teamSettings.doctors];
                              updated[idx].teamSharePercent = parseFloat(e.target.value) || 0;
                              setTeamSettings({ ...teamSettings, doctors: updated });
                            }}
                            className="w-16 bg-white border border-gray-300 rounded-lg px-2 py-1 text-center font-black text-emerald-700"
                          />
                          <span className="font-bold text-gray-500">%</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 font-bold">0%</span>
                      )}
                    </td>

                    {/* Disponível no Período (R$) */}
                    <td className="p-3.5 text-center">
                      {doc.isTeamMember ? (
                        <div className="inline-flex items-center gap-1">
                          <span className="text-[10px] text-gray-400 font-bold">R$</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={doc.disponivelPeriodo || ""}
                            onChange={(e) => {
                              const updated = [...teamSettings.doctors];
                              updated[idx].disponivelPeriodo = parseFloat(e.target.value) || 0;
                              const recalced = recalculateHeartProportions(updated);
                              setTeamSettings({ ...teamSettings, doctors: recalced });
                            }}
                            className="w-24 bg-white border border-gray-300 rounded-lg px-2 py-1 text-right font-mono font-bold text-gray-800"
                          />
                        </div>
                      ) : (
                        <span className="text-gray-400 font-mono">—</span>
                      )}
                    </td>

                    {/* PROPORÇÃO HEART Calculada Dinamicamente */}
                    <td className="p-3.5 text-center bg-blue-50/40">
                      {doc.isTeamMember ? (
                        <span className="px-2.5 py-1 bg-blue-100 text-blue-900 border border-blue-200 rounded-lg font-black text-xs">
                          {(doc.proporcaoHeartDinamica || 0).toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-gray-400 font-bold">0%</span>
                      )}
                    </td>

                    <td className="p-3.5 text-gray-600 text-[11px]">
                      {doc.isTeamMember ? (
                        <span className="text-emerald-700 font-bold">
                          Entradas rateadas a {doc.teamSharePercent}% (Nominal) e despesas rateadas a {(doc.proporcaoHeartDinamica || 0).toFixed(2)}% (Proporção HeaRT)
                        </span>
                      ) : (
                        <span className="text-gray-400 font-medium">
                          Recebe somente produção própria Unimed e plantões diretos, sem rateio de custos corporativos
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Definition of Team-Only Sources and Expenses */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 space-y-3">
              <span className="text-xs font-black uppercase text-emerald-800 block">
                Fontes de Receita Exclusivas da Equipe:
              </span>
              <p className="text-[11px] text-gray-500">
                Estas receitas são somadas e rateadas <b>unicamente</b> entre os médicos com status de "Membro da Equipe" segundo os percentuais acima:
              </p>
              <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase">
                {teamSettings.teamOnlySources.map(s => (
                  <span key={s} className="px-2.5 py-1 bg-white border border-emerald-300 text-emerald-800 rounded-lg shadow-2xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="bg-gray-50 p-5 rounded-2xl border border-gray-200 space-y-3">
              <span className="text-xs font-black uppercase text-rose-800 block">
                Despesas e Custos Fixos Exclusivos da Equipe:
              </span>
              <p className="text-[11px] text-gray-500">
                Estas despesas corporativas são deduzidas <b>somente</b> dos membros da equipe HeaRT e nunca cobradas de cooperados externos:
              </p>
              <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase">
                {teamSettings.teamOnlyExpenses.map(e => (
                  <span key={e} className="px-2.5 py-1 bg-white border border-rose-300 text-rose-800 rounded-lg shadow-2xs">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: COLUNAS VERTICAIS POR MÉDICO (EXCEL COLUMN VIEW) */}
      {activeSubTab === "colunas_medicos" && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} />
              <span className="font-bold">Colunas Individuais por Médico do Excel (4 da Equipe e 5 Cooperados Parceiros)</span>
            </div>
            <span className="text-[10px] uppercase font-black tracking-wider text-emerald-700">9 Painéis Conectados</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {excelData.fechamentoMedicos.map((med) => {
              const isTeam = med.isTeamMember;
              return (
                <div 
                  key={med.nome}
                  className={`bg-white rounded-[28px] border shadow-md p-6 flex flex-col justify-between space-y-4 transition ${
                    isTeam 
                      ? "border-emerald-300 ring-2 ring-emerald-500/10 hover:border-emerald-500" 
                      : "border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 border-b border-gray-100 pb-3">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                            isTeam ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                          }`}>
                            {isTeam ? `Membro Equipe (${med.percent})` : "Cooperado Externo"}
                          </span>
                        </div>
                        <h4 className="font-black text-gray-900 text-sm mt-1">{med.nome}</h4>
                        <p className="text-[10px] text-gray-400">
                          {teamSettings.doctors.find(d => d.name === med.nome)?.specialty}
                        </p>
                      </div>
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs shrink-0 ${
                        isTeam ? "bg-emerald-600 text-white" : "bg-gray-200 text-gray-700"
                      }`}>
                        {isTeam ? med.percent : "EXT"}
                      </div>
                    </div>

                    <div className="py-3 space-y-2 border-b border-gray-100">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Produção Unimed:</span>
                        <span className="font-bold text-gray-900">R$ {med.producao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-emerald-600 font-medium">Outras Entradas:</span>
                        <span className="font-bold text-emerald-600">+R$ {med.entradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-rose-600 font-medium">Ocorrências / Descontos:</span>
                        <span className="font-bold text-rose-600">-R$ {med.saidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-indigo-600 font-medium">Divisão / Acertos:</span>
                        <span className="font-bold text-indigo-600">+R$ {med.divisaoLucros.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    {/* Occurrence highlights */}
                    <div className="py-2 space-y-1 text-[10px]">
                      <span className="font-black text-gray-400 uppercase tracking-wider block">Lançamentos Alocados:</span>
                      {med.detalhesEntradas.map((de, idx) => (
                        <div key={idx} className="text-emerald-700 font-medium truncate">• {de}</div>
                      ))}
                      {med.detalhesSaidas.map((ds, idx) => (
                        <div key={idx} className="text-rose-700 font-medium truncate">• {ds}</div>
                      ))}
                    </div>
                  </div>

                  <div className={`p-4 rounded-2xl border flex items-center justify-between ${
                    isTeam 
                      ? "bg-emerald-50/70 border-emerald-100" 
                      : "bg-gray-50 border-gray-200"
                  }`}>
                    <span className="text-[10px] font-black text-gray-700 uppercase">Salário Final Líquido:</span>
                    <span className={`text-base font-black ${isTeam ? "text-emerald-800" : "text-gray-900"}`}>
                      R$ {med.finalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 4: OCORRÊNCIAS NO FLUXO DE CAIXA */}
      {activeSubTab === "ocorrencias_fluxo" && (
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden space-y-4">
          <div className="p-6 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/70">
            <div>
              <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Ocorrências Financeiras Lançadas no Fluxo de Caixa</h3>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
                Detalhamento exato de médico, tipo de despesa, cota parte, glosas e plantões ({filteredOcorrencias.length} lançamentos)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar tipo de despesa..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold outline-none w-56 focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter size={14} className="text-gray-400" />
                <select
                  value={selectedDoctorFilter}
                  onChange={e => setSelectedDoctorFilter(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ALL">Todos os Médicos & Equipe</option>
                  {teamSettings.doctors.map(d => (
                    <option key={d.key} value={d.name}>{d.name} {d.isTeamMember ? "(Equipe)" : "(Externo)"}</option>
                  ))}
                  <option value="HEART">EQUIPE HEART</option>
                </select>
              </div>
            </div>
          </div>

          {/* Totais do filtro atual */}
          <div className="px-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl text-xs flex justify-between items-center">
              <span className="text-emerald-800 font-bold">Total Entradas / Remunerações:</span>
              <span className="font-black text-emerald-700">+R$ {totalOcorrenciasEntradas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl text-xs flex justify-between items-center">
              <span className="text-rose-800 font-bold">Total Saídas / Deduções:</span>
              <span className="font-black text-rose-700">-R$ {totalOcorrenciasSaidas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs flex justify-between items-center">
              <span className="text-gray-700 font-bold">Saldo das Ocorrências:</span>
              <span className={`font-black ${totalOcorrenciasEntradas - totalOcorrenciasSaidas >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                R$ {(totalOcorrenciasEntradas - totalOcorrenciasSaidas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-600 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                  <th className="p-3.5 pl-6">Data</th>
                  <th className="p-3.5">Médico / Responsável</th>
                  <th className="p-3.5">Escopo</th>
                  <th className="p-3.5">Tipo de Despesa / Ocorrência</th>
                  <th className="p-3.5">Descrição</th>
                  <th className="p-3.5 text-center">Natureza</th>
                  <th className="p-3.5 text-right pr-6">Valor (R$)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {filteredOcorrencias.map((oc, idx) => {
                  const isTeam = oc.medico.includes("HEART") || teamSettings.doctors.find(d => d.name === oc.medico)?.isTeamMember;
                  return (
                    <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                      <td className="p-3.5 pl-6 text-gray-500 font-bold">{oc.data}</td>
                      <td className="p-3.5 font-bold text-gray-900">{oc.medico}</td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                          isTeam ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-700"
                        }`}>
                          {isTeam ? "Equipe HeaRT" : "Individual Externo"}
                        </span>
                      </td>
                      <td className="p-3.5 font-bold text-gray-700">{oc.tipo}</td>
                      <td className="p-3.5 text-gray-500">{oc.desc}</td>
                      <td className="p-3.5 text-center">
                        <span className={`px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase ${
                          oc.natureza === "ENTRADA" 
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                            : "bg-rose-100 text-rose-800 border border-rose-200"
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 5: FONTES DE ENTRADA (AZAMBUJA, MARIETA, UNIMED, CONSULTÓRIO) */}
      {activeSubTab === "entradas_fontes" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Unimed Litoral Card */}
          <div className="bg-white rounded-[32px] border border-gray-200 p-6 shadow-md space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                  <Building2 size={16} />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 uppercase text-sm">Unimed Litoral</h4>
                  <p className="text-[10px] text-gray-400">Cooperativa Médica (Produção Individual de Cada Médico)</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 uppercase font-black block">Líquido Recebido:</span>
                <span className="font-black text-blue-700 text-sm">R$ {excelData.fontes.unimed.liquidoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-gray-400">Rateio por Médico:</span>
              <div className="divide-y divide-gray-50 text-xs">
                {excelData.fontes.unimed.rateio.map(r => (
                  <div key={r.medico} className="py-2 flex justify-between items-center">
                    <span className="font-bold text-gray-800">{r.medico}</span>
                    <span className="font-black text-gray-900">R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Marieta Card */}
          <div className="bg-white rounded-[32px] border border-emerald-300 p-6 shadow-md space-y-4 ring-2 ring-emerald-500/10">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-black">
                  <Building2 size={16} />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 uppercase text-sm">Hospital Marieta</h4>
                  <p className="text-[10px] text-emerald-700 font-bold">Exclusivo da Equipe HeaRT (29% / 29% / 29% / 13%)</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 uppercase font-black block">Líquido Total:</span>
                <span className="font-black text-emerald-700 text-sm">R$ {excelData.fontes.marieta.liquidoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-gray-400">Rateio Somente entre Membros da Equipe:</span>
              <div className="divide-y divide-gray-50 text-xs">
                {excelData.fontes.marieta.rateio.map(r => (
                  <div key={r.medico} className="py-2 flex justify-between items-center bg-emerald-50/30 px-3 rounded-lg">
                    <span className="font-bold text-gray-800">{r.medico}</span>
                    <span className="font-black text-emerald-800">R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Azambuja Card */}
          <div className="bg-white rounded-[32px] border border-emerald-300 p-6 shadow-md space-y-4 ring-2 ring-emerald-500/10">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-black">
                  <Building2 size={16} />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 uppercase text-sm">Hospital Azambuja</h4>
                  <p className="text-[10px] text-purple-700 font-bold">Exclusivo da Equipe HeaRT (Plantões e Retaguarda)</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 uppercase font-black block">Líquido Total:</span>
                <span className="font-black text-purple-700 text-sm">R$ {excelData.fontes.azambuja.liquidoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-[10px] font-black uppercase text-gray-400">Rateio Somente entre Membros da Equipe:</span>
              <div className="divide-y divide-gray-50 text-xs">
                {excelData.fontes.azambuja.rateio.map(r => (
                  <div key={r.medico} className="py-2 flex justify-between items-center bg-purple-50/30 px-3 rounded-lg">
                    <span className="font-bold text-gray-800">{r.medico}</span>
                    <span className="font-black text-purple-800">R$ {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Consultório / Particular Card */}
          <div className="bg-white rounded-[32px] border border-emerald-300 p-6 shadow-md space-y-4 ring-2 ring-emerald-500/10">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-black">
                  <Wallet size={16} />
                </div>
                <div>
                  <h4 className="font-black text-gray-900 uppercase text-sm">Consultório & Particular</h4>
                  <p className="text-[10px] text-amber-700 font-bold">Exclusivo da Equipe (Dinheiro, Cartão e Unimed Luis)</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-gray-400 uppercase font-black block">Total Recebido:</span>
                <span className="font-black text-amber-700 text-sm">R$ {excelData.fontes.consultorio.totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="p-3 bg-gray-50 rounded-2xl flex justify-between text-xs">
                <span className="text-gray-600 font-bold">Espécie / Dinheiro:</span>
                <span className="font-black text-gray-900">R$ {excelData.fontes.consultorio.dinheiro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-2xl flex justify-between text-xs">
                <span className="text-gray-600 font-bold">Cartão de Crédito/Débito:</span>
                <span className="font-black text-gray-900">R$ {excelData.fontes.consultorio.cartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="p-3 bg-blue-50/50 rounded-2xl flex justify-between text-xs border border-blue-100">
                <span className="text-blue-700 font-bold">Unimed Dr. Luis:</span>
                <span className="font-black text-blue-900">R$ {excelData.fontes.consultorio.unimedLuis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 6: LOTES UNIMED */}
      {activeSubTab === "lotes_unimed" && (
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden space-y-4">
          <div className="p-6 border-b border-gray-100 bg-gray-50/70">
            <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Demonstrativo de Notas & Lotes Unimed</h3>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Cruzamento de Notas Fiscais, Retenções Tributárias Federais e Glosas</p>
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
                    <td className="p-3.5 text-right text-rose-600 font-bold">{lote.glosa > 0 ? `-R$ ${lote.glosa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : "-"}</td>
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
      )}

      {/* VIEW 7: DESPESAS DA EQUIPE HEART COM RATEIO PELA PROPORÇÃO HEART */}
      {activeSubTab === "despesas_equipe" && (
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden space-y-4">
          <div className="p-6 border-b border-gray-100 bg-gray-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-gray-900 text-base uppercase tracking-tight">Despesas Corporativas & Operacionais (Equipe HeaRT)</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-800">
                  Rateio via PROPORÇÃO HEART
                </span>
              </div>
              <p className="text-xs text-gray-500 font-medium mt-1">
                Custos fixos, infraestrutura e tributos rateados dinamicamente entre os sócios conforme a coluna <strong>PROPORÇÃO HEART</strong> do período:
                <span className="font-bold text-gray-700 ml-1">
                  Rochele ({teamSettings.doctors.find(d => d.key === 'rochele')?.proporcaoHeartDinamica || 26.79}%), 
                  Thais ({teamSettings.doctors.find(d => d.key === 'thais')?.proporcaoHeartDinamica || 28.97}%), 
                  Luis ({teamSettings.doctors.find(d => d.key === 'luis')?.proporcaoHeartDinamica || 26.79}%), 
                  Kathize ({teamSettings.doctors.find(d => d.key === 'kathize')?.proporcaoHeartDinamica || 17.45}%)
                </span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-gray-400 uppercase font-bold block">Total Despesas Equipe:</span>
              <span className="font-black text-rose-600 text-base">R$ 21.618,34</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-700 font-black uppercase text-[10px] tracking-wider border-b border-gray-200">
                  <th className="p-3.5 pl-6">Despesa / Item</th>
                  <th className="p-3.5">Categoria</th>
                  <th className="p-3.5 text-right font-black">Valor Total (R$)</th>
                  <th className="p-3.5 text-right text-emerald-800 bg-emerald-50/50">Drª Rochele (26,79%)</th>
                  <th className="p-3.5 text-right text-emerald-800 bg-emerald-50/50">Drª Thais (28,97%)</th>
                  <th className="p-3.5 text-right text-emerald-800 bg-emerald-50/50">Dr Luis (26,79%)</th>
                  <th className="p-3.5 text-right text-emerald-800 bg-emerald-50/50">Drª Kathize (17,45%)</th>
                  <th className="p-3.5 text-center pr-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-800">
                {excelData.despesasEquipe.map((d, idx) => {
                  const val = d.valor;
                  const pRochele = teamSettings.doctors.find(x => x.key === 'rochele')?.proporcaoHeartDinamica || 26.79;
                  const pThais = teamSettings.doctors.find(x => x.key === 'thais')?.proporcaoHeartDinamica || 28.97;
                  const pLuis = teamSettings.doctors.find(x => x.key === 'luis')?.proporcaoHeartDinamica || 26.79;
                  const pKathize = teamSettings.doctors.find(x => x.key === 'kathize')?.proporcaoHeartDinamica || 17.45;

                  const rRochele = (val * pRochele) / 100;
                  const rThais = (val * pThais) / 100;
                  const rLuis = (val * pLuis) / 100;
                  const rKathize = (val * pKathize) / 100;

                  return (
                    <tr key={idx} className="hover:bg-rose-50/20 transition-colors">
                      <td className="p-3.5 pl-6 font-bold text-gray-900">{d.despesa}</td>
                      <td className="p-3.5 text-gray-600 font-medium">{d.categoria}</td>
                      <td className="p-3.5 text-right font-black text-rose-600">
                        -R$ {val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-right font-mono text-[11px] text-gray-700 bg-emerald-50/20">
                        -R$ {rRochele.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-right font-mono text-[11px] text-gray-700 bg-emerald-50/20">
                        -R$ {rThais.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-right font-mono text-[11px] text-gray-700 bg-emerald-50/20">
                        -R$ {rLuis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-right font-mono text-[11px] text-gray-700 bg-emerald-50/20">
                        -R$ {rKathize.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3.5 text-center pr-6">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[9px] font-black uppercase">
                          {d.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 8: GERENCIADOR DE TIPOS DE LANÇAMENTO */}
      {activeSubTab === "tipos_lancamento" && (
        <div className="bg-white rounded-[32px] border border-gray-200 shadow-xl overflow-hidden p-2">
          <TransactionTypesManager />
        </div>
      )}
    </div>
  );
}

function MetricCard({ 
  label, 
  value, 
  isNegative, 
  color, 
  bg, 
  isHighlight,
  sub 
}: { 
  label: string; 
  value: number; 
  isNegative?: boolean; 
  color: string; 
  bg: string; 
  isHighlight?: boolean;
  sub?: string;
}) {
  return (
    <div className={`p-5 rounded-3xl border ${isHighlight ? "border-emerald-300 shadow-md bg-white ring-2 ring-emerald-500/10" : "border-gray-200/80 bg-white shadow-xs"} flex flex-col justify-between space-y-1`}>
      <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">{label}</span>
      <span className={`text-xl font-black ${color}`}>
        {isNegative ? "-R$ " : "R$ "}
        {Math.abs(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
      </span>
      {sub && <span className="text-[9px] font-bold text-gray-400 block">{sub}</span>}
    </div>
  );
}
