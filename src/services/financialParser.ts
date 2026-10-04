import { FinancialProduction, FinancialGlosa, FinancialTax, FinancialAdjustment, FinancialTransaction, FinancialPendency } from "../types/financial";

// Known Doctors list in the team
export const KNOWN_DOCTORS = [
  "ROCHELE LORENZI POL",
  "THAIS ISABEL LUMIKOSKI",
  "LUIS BONGIOLO MATTOS",
  "KATHIZE LIRA",
  "TAMARA QUINTINO REGIS",
  "LUAN JUNIOR VIGNATTI",
  "THAYNARA MAESTRI VIGNATTI",
  "CAMILA RIBEIRO DUTRA",
  "MARIA EDUARDA CASA SOUZA MACHADO"
];

export function identifyDoctor(executingProvider: string): { doctorId?: string; doctorName?: string; isTeam: boolean } {
  const clean = (executingProvider || "").trim().toUpperCase();
  if (!clean || clean.includes("HEART CIRURGIA CARDIOVASCULAR")) {
    return { isTeam: true };
  }
  const found = KNOWN_DOCTORS.find(doc => doc === clean || clean.includes(doc));
  if (found) {
    return {
      doctorId: found.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      doctorName: found,
      isTeam: false
    };
  }
  return { isTeam: true };
}

export interface ParsedFinancialBundle {
  batchNumber: string;
  providerName: string;
  paymentDate: string;
  emissionDate: string;
  productionRecords: Omit<FinancialProduction, "id" | "teamId" | "closingId" | "importId" | "createdAt">[];
  glosas: Omit<FinancialGlosa, "id" | "teamId" | "closingId" | "importId" | "createdAt">[];
  taxes: Omit<FinancialTax, "id" | "closingId" | "importId" | "createdAt">[];
  adjustments: Omit<FinancialAdjustment, "id" | "closingId" | "importId">[];
  transactions: Omit<FinancialTransaction, "id" | "teamId" | "closingId" | "importId" | "createdAt">[];
  pendencies: FinancialPendency[];
  totals: {
    informed: number;
    processed: number;
    released: number;
    glosas: number;
    taxes: number;
    debits: number;
    credits: number;
    net: number;
    quantity: number;
  };
}

// Sample parser implementation for batch 10944
export function parseBatch10944Files(closingId: string): ParsedFinancialBundle {
  const productionRecords = [
    {
      protocol: "1937592",
      date: "21/07/2026",
      patientName: "DANIELE DAMIN",
      patientCode: "0148-8562-000088-00-4",
      document: "24135869",
      quantity: 1,
      ambCode: "30101000",
      procedureDescription: "PACOTE DE EXERESE E SUTURA SIM",
      honorValue: 0,
      operationalValue: 48.99,
      filmValue: 0,
      administrativeFee: 0,
      executingProvider: "HEART CIRURGIA CARDIOVASCULAR",
      paymentProvider: "",
      protocolProvider: "LUAN JUNIOR VIGNATTI",
      doctorId: undefined,
      doctorName: undefined
    },
    {
      protocol: "1937592",
      date: "21/07/2026",
      patientName: "DANIELE DAMIN",
      patientCode: "0148-8562-000088-00-4",
      document: "24135869",
      quantity: 1,
      ambCode: "30101298",
      procedureDescription: "Eletrocoagulação de lesões de",
      honorValue: 37.5,
      operationalValue: 0,
      filmValue: 0,
      administrativeFee: 0,
      executingProvider: "LUAN JUNIOR VIGNATTI",
      paymentProvider: "",
      protocolProvider: "LUAN JUNIOR VIGNATTI",
      doctorId: "luan_junior_vignatti",
      doctorName: "LUAN JUNIOR VIGNATTI"
    },
    {
      protocol: "1937605",
      date: "21/07/2026",
      patientName: "PAULA DE LUCCA CECCATO",
      patientCode: "0976-8372-000040-31-0",
      document: "23798672",
      quantity: 1,
      ambCode: "31303293",
      procedureDescription: "Implante de dispositivo intra-",
      honorValue: 325,
      operationalValue: 0,
      filmValue: 0,
      administrativeFee: 0,
      executingProvider: "THAYNARA MAESTRI VIGNATTI",
      paymentProvider: "",
      protocolProvider: "THAYNARA MAESTRI VIGNATTI",
      doctorId: "thaynara_maestri_vignatti",
      doctorName: "THAYNARA MAESTRI VIGNATTI"
    },
    {
      protocol: "1938826",
      date: "20/07/2026",
      patientName: "LUANA STANKOWSKI SZIMANSKI",
      patientCode: "0048-1923-299015-35-4",
      document: "24231977",
      quantity: 1,
      ambCode: "10101012",
      procedureDescription: "Consulta em consultorio",
      honorValue: 130,
      operationalValue: 0,
      filmValue: 0,
      administrativeFee: 0,
      executingProvider: "LUAN JUNIOR VIGNATTI",
      paymentProvider: "",
      protocolProvider: "LUAN JUNIOR VIGNATTI",
      doctorId: "luan_junior_vignatti",
      doctorName: "LUAN JUNIOR VIGNATTI"
    },
    {
      protocol: "1947966",
      date: "29/07/2026",
      patientName: "MARLI TEREZINHA BALDIN",
      patientCode: "0025-0921-000517-00-3",
      document: "24321172",
      quantity: 1,
      ambCode: "10101012",
      procedureDescription: "Consulta em consultorio",
      honorValue: 140,
      operationalValue: 0,
      filmValue: 0,
      administrativeFee: 0,
      executingProvider: "THAYNARA MAESTRI VIGNATTI",
      paymentProvider: "",
      protocolProvider: "THAYNARA MAESTRI VIGNATTI",
      doctorId: "thaynara_maestri_vignatti",
      doctorName: "THAYNARA MAESTRI VIGNATTI"
    },
    {
      protocol: "1952897",
      date: "17/07/2026",
      patientName: "CRISLEY SOUZA OLIVEIRA",
      patientCode: "0242-1764-100000-01-6",
      document: "24211647",
      quantity: 1,
      ambCode: "10101012",
      procedureDescription: "Consulta em consultorio",
      honorValue: 170,
      operationalValue: 0,
      filmValue: 0,
      administrativeFee: 0,
      executingProvider: "THAYNARA MAESTRI VIGNATTI",
      paymentProvider: "",
      protocolProvider: "THAYNARA MAESTRI VIGNATTI",
      doctorId: "thaynara_maestri_vignatti",
      doctorName: "THAYNARA MAESTRI VIGNATTI"
    },
    {
      protocol: "1957533",
      date: "11/08/2026",
      patientName: "DAIANE COREHIA DOS SANTOS",
      patientCode: "0032-0000-086837-61-3",
      document: "24141166",
      quantity: 1,
      ambCode: "41301137",
      procedureDescription: "Dermatoscopia (por lesão)",
      honorValue: 18.75,
      operationalValue: 0,
      filmValue: 0,
      administrativeFee: 0,
      executingProvider: "LUAN JUNIOR VIGNATTI",
      paymentProvider: "",
      protocolProvider: "LUAN JUNIOR VIGNATTI",
      doctorId: "luan_junior_vignatti",
      doctorName: "LUAN JUNIOR VIGNATTI"
    }
  ];

  const glosas = [
    {
      protocol: "1937592",
      lot: "724500",
      protocolDate: "20/08/2026",
      valueInformed: 17032.88,
      valueProcessed: 13961.92,
      valueReleased: 13961.92,
      glosaValue: 3070.96,
      doctorId: "luan_junior_vignatti",
      doctorName: "LUAN JUNIOR VIGNATTI",
      allocationStatus: "ALLOCATED" as const,
      sourceDocument: "10944_DEMONSTRATIVO.pdf"
    },
    {
      protocol: "1937605",
      lot: "724501",
      protocolDate: "24/08/2026",
      valueInformed: 7935.38,
      valueProcessed: 7584.45,
      valueReleased: 7584.45,
      glosaValue: 350.93,
      doctorId: "thaynara_maestri_vignatti",
      doctorName: "THAYNARA MAESTRI VIGNATTI",
      allocationStatus: "ALLOCATED" as const,
      sourceDocument: "10944_DEMONSTRATIVO.pdf"
    },
    {
      protocol: "1947966",
      lot: "724502",
      protocolDate: "25/08/2026",
      valueInformed: 15160.00,
      valueProcessed: 14710.00,
      valueReleased: 14710.00,
      glosaValue: 450.00,
      doctorId: "thaynara_maestri_vignatti",
      doctorName: "THAYNARA MAESTRI VIGNATTI",
      allocationStatus: "ALLOCATED" as const,
      sourceDocument: "10944_DEMONSTRATIVO.pdf"
    },
    {
      protocol: "1952897",
      lot: "724503",
      protocolDate: "25/08/2026",
      valueInformed: 14830.00,
      valueProcessed: 14690.00,
      valueReleased: 14690.00,
      glosaValue: 140.00,
      doctorId: "thaynara_maestri_vignattí",
      doctorName: "THAYNARA MAESTRI VIGNATTI",
      allocationStatus: "ALLOCATED" as const,
      sourceDocument: "10944_DEMONSTRATIVO.pdf"
    },
    {
      protocol: "1957533",
      lot: "724504",
      protocolDate: "20/08/2026",
      valueInformed: 8199.10,
      valueProcessed: 6122.21,
      valueReleased: 6122.21,
      glosaValue: 2076.89,
      doctorId: "luan_junior_vignatti",
      doctorName: "LUAN JUNIOR VIGNATTI",
      allocationStatus: "ALLOCATED" as const,
      sourceDocument: "10944_DEMONSTRATIVO.pdf"
    },
    {
      protocol: "1957863",
      lot: "724881",
      protocolDate: "19/08/2026",
      valueInformed: 1490.50,
      valueProcessed: 1415.50,
      valueReleased: 1415.50,
      glosaValue: 75.00,
      doctorId: "maria_eduarda_casa_souza_machado",
      doctorName: "MARIA EDUARDA CASA SOUZA MACHADO",
      allocationStatus: "ALLOCATED" as const,
      sourceDocument: "10944_DEMONSTRATIVO.pdf"
    }
  ];

  const taxes = [
    { type: "IRRF", code: "1708", description: "IRRF - Serviços Tomados - Cód: 1708", baseValue: 148253.88, taxValue: 2223.81, sourceDocument: "10944_DEMONSTRATIVO.pdf" },
    { type: "PIS", code: "5952", description: "PIS - Retenção - Cód: 5952 - Lei 13137", baseValue: 148253.88, taxValue: 963.65, sourceDocument: "10944_DEMONSTRATIVO.pdf" },
    { type: "COFINS", code: "5952", description: "Cofins - Retenção - Cód: 5952 - Lei13137", baseValue: 148253.88, taxValue: 4447.62, sourceDocument: "10944_DEMONSTRATIVO.pdf" },
    { type: "CSLL", code: "5952", description: "CSLL - Retenção - Cód: 5952 - Lei13137", baseValue: 148253.88, taxValue: 1482.54, sourceDocument: "10944_DEMONSTRATIVO.pdf" }
  ];

  const adjustments = [
    { type: "Capitalizacao", code: "360", description: "Capitalização Cota-Parte", amount: -14825.40, nature: "DEBIT" as const, scope: "TEAM" as const, sourceDocument: "10944_DEMONSTRATIVO.pdf" }
  ];

  const transactions = [
    // Retenções / Impostos
    { scope: "CLOSING" as const, typeId: "irrf", typeName: "IRRF", date: "14/09/2026", amount: 2223.81, nature: "DEBIT" as const, observation: "IRRF - Serviços Tomados - Cód: 1708", source: "PDF" as const, sourceFile: "10944_DEMONSTRATIVO.pdf" },
    { scope: "CLOSING" as const, typeId: "pis", typeName: "PIS", date: "14/09/2026", amount: 963.65, nature: "DEBIT" as const, observation: "PIS - Retenção - Cód: 5952", source: "PDF" as const, sourceFile: "10944_DEMONSTRATIVO.pdf" },
    { scope: "CLOSING" as const, typeId: "cofins", typeName: "COFINS", date: "14/09/2026", amount: 4447.62, nature: "DEBIT" as const, observation: "Cofins - Retenção - Cód: 5952", source: "PDF" as const, sourceFile: "10944_DEMONSTRATIVO.pdf" },
    { scope: "CLOSING" as const, typeId: "csll", typeName: "CSLL", date: "14/09/2026", amount: 1482.54, nature: "DEBIT" as const, observation: "CSLL - Retenção - Cód: 5952", source: "PDF" as const, sourceFile: "10944_DEMONSTRATIVO.pdf" },

    // Ocorrências Rochele
    { scope: "DOCTOR" as const, doctorId: "rochele", doctorName: "ROCHELE LORENZI POL", typeId: "disp_uti", typeName: "Disponibilidade Médica - UTI", date: "14/09/2026", amount: 1966.87, nature: "CREDIT" as const, observation: "Plantão UTI HU", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "rochele", doctorName: "ROCHELE LORENZI POL", typeId: "repasse_hu", typeName: "Repasse Pagamento de Produção - HU", date: "14/09/2026", amount: 1439.16, nature: "CREDIT" as const, observation: "Repasse Produção HU", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "rochele", doctorName: "ROCHELE LORENZI POL", typeId: "sobreaviso", typeName: "Sobreavisos", date: "14/09/2026", amount: 4320.00, nature: "CREDIT" as const, observation: "Sobreavisos de retaguarda", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "rochele", doctorName: "ROCHELE LORENZI POL", typeId: "glosa", typeName: "Glosas - Clínica Cooperada - 11%", date: "14/09/2026", amount: 10.00, nature: "DEBIT" as const, observation: "Glosa Unimed", source: "PDF" as const, sourceFile: "10944_DEMONSTRATIVO.pdf" },
    { scope: "DOCTOR" as const, doctorId: "rochele", doctorName: "ROCHELE LORENZI POL", typeId: "centro_estudos", typeName: "Contribuição de Centro de Estudos", date: "14/09/2026", amount: 170.00, nature: "DEBIT" as const, observation: "Contribuição Centro de Estudos", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },

    // Ocorrências Thais
    { scope: "DOCTOR" as const, doctorId: "thais", doctorName: "THAIS ISABEL LUMIKOSKI", typeId: "sobreaviso", typeName: "Sobreavisos", date: "14/09/2026", amount: 7200.00, nature: "CREDIT" as const, observation: "Sobreavisos plantão", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "thais", doctorName: "THAIS ISABEL LUMIKOSKI", typeId: "glosa", typeName: "Glosas - Clínica Cooperada - 11%", date: "14/09/2026", amount: 6.00, nature: "DEBIT" as const, observation: "Glosa Unimed Litoral", source: "PDF" as const, sourceFile: "10944_DEMONSTRATIVO.pdf" },
    { scope: "DOCTOR" as const, doctorId: "thais", doctorName: "THAIS ISABEL LUMIKOSKI", typeId: "cota_parte", typeName: "Integralização de Cota Parte", date: "14/09/2026", amount: 7500.00, nature: "DEBIT" as const, observation: "Integralização de cota cooperativa", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "thais", doctorName: "THAIS ISABEL LUMIKOSKI", typeId: "centro_estudos", typeName: "Contribuição de Centro de Estudos", date: "14/09/2026", amount: 170.00, nature: "DEBIT" as const, observation: "Taxa Centro de Estudos", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },

    // Ocorrências Tamara
    { scope: "DOCTOR" as const, doctorId: "tamara", doctorName: "TAMARA QUINTINO REGIS", typeId: "glosa", typeName: "Glosas - Clínica Cooperada - 11%", date: "14/09/2026", amount: 757.10, nature: "DEBIT" as const, observation: "Glosas identificadas Lote 10944", source: "PDF" as const, sourceFile: "10944_DEMONSTRATIVO.pdf" },
    { scope: "DOCTOR" as const, doctorId: "tamara", doctorName: "TAMARA QUINTINO REGIS", typeId: "plac", typeName: "Mensalidade PLAC", date: "14/09/2026", amount: 288.00, nature: "DEBIT" as const, observation: "Desconto PLAC", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "tamara", doctorName: "TAMARA QUINTINO REGIS", typeId: "centro_estudos", typeName: "Contribuição de Centro de Estudos", date: "14/09/2026", amount: 170.00, nature: "DEBIT" as const, observation: "Taxa Centro de Estudos", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },

    // Ocorrências Luan
    { scope: "DOCTOR" as const, doctorId: "luan", doctorName: "LUAN JUNIOR VIGNATTI", typeId: "glosa", typeName: "Glosas - Clínica Cooperada - 11%", date: "14/09/2026", amount: 2308.86, nature: "DEBIT" as const, observation: "Glosas por protocolo Luan", source: "PDF" as const, sourceFile: "10944_DEMONSTRATIVO.pdf" },
    { scope: "DOCTOR" as const, doctorId: "luan", doctorName: "LUAN JUNIOR VIGNATTI", typeId: "cota_parte", typeName: "Integralização de Cota Parte", date: "14/09/2026", amount: 7579.69, nature: "DEBIT" as const, observation: "Integralização cota Unimed 5 de 24", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "luan", doctorName: "LUAN JUNIOR VIGNATTI", typeId: "centro_estudos", typeName: "Contribuição de Centro de Estudos", date: "14/09/2026", amount: 170.00, nature: "DEBIT" as const, observation: "Taxa Centro de Estudos", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },

    // Ocorrências Thaynara
    { scope: "DOCTOR" as const, doctorId: "thaynara", doctorName: "THAYNARA MAESTRI VIGNATTI", typeId: "bonificacao_parto", typeName: "Remuneração Bonificação Parto Normal", date: "14/09/2026", amount: 1999.53, nature: "CREDIT" as const, observation: "Bonificação Parto Normal HU (1150.00 + 849.53)", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "thaynara", doctorName: "THAYNARA MAESTRI VIGNATTI", typeId: "disp_obstetricia", typeName: "Disponibilidade Ginecologia - Centro Obstétrico", date: "14/09/2026", amount: 11768.60, nature: "CREDIT" as const, observation: "Disponibilidade Obstetrícia HU (3857.67 + 7910.93)", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "thaynara", doctorName: "THAYNARA MAESTRI VIGNATTI", typeId: "glosa", typeName: "Glosas - Clínica Cooperada - 11%", date: "14/09/2026", amount: 702.18, nature: "DEBIT" as const, observation: "Glosa Unimed", source: "PDF" as const, sourceFile: "10944_DEMONSTRATIVO.pdf" },
    { scope: "DOCTOR" as const, doctorId: "thaynara", doctorName: "THAYNARA MAESTRI VIGNATTI", typeId: "cota_parte", typeName: "Integralização de Cota Parte", date: "14/09/2026", amount: 7500.00, nature: "DEBIT" as const, observation: "Integralização cota Unimed", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "thaynara", doctorName: "THAYNARA MAESTRI VIGNATTI", typeId: "centro_estudos", typeName: "Contribuição de Centro de Estudos", date: "14/09/2026", amount: 170.00, nature: "DEBIT" as const, observation: "Taxa Centro de Estudos", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },

    // Ocorrências Camila
    { scope: "DOCTOR" as const, doctorId: "camila", doctorName: "CAMILA RIBEIRO DUTRA", typeId: "disp_reumato", typeName: "Disponibilidade - Reumatologia", date: "14/09/2026", amount: 12769.67, nature: "CREDIT" as const, observation: "Disponibilidade Especialidade HU", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "camila", doctorName: "CAMILA RIBEIRO DUTRA", typeId: "cota_parte", typeName: "Integralização de Cota Parte", date: "14/09/2026", amount: 7579.66, nature: "DEBIT" as const, observation: "Integralização cota 5 de 24", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "camila", doctorName: "CAMILA RIBEIRO DUTRA", typeId: "plac", typeName: "Mensalidade PLAC", date: "14/09/2026", amount: 431.09, nature: "DEBIT" as const, observation: "Desconto PLAC", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "camila", doctorName: "CAMILA RIBEIRO DUTRA", typeId: "centro_estudos", typeName: "Contribuição de Centro de Estudos", date: "14/09/2026", amount: 170.00, nature: "DEBIT" as const, observation: "Taxa Centro de Estudos", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "camila", doctorName: "CAMILA RIBEIRO DUTRA", typeId: "desconto_proprio", typeName: "Desconto Atendimentos Realizados - Recurso Próprio", date: "14/09/2026", amount: 45.00, nature: "DEBIT" as const, observation: "Desconto Recurso Próprio", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },

    // Ocorrências Maria Eduarda
    { scope: "DOCTOR" as const, doctorId: "maria_eduarda", doctorName: "MARIA EDUARDA CASA SOUZA MACHADO", typeId: "glosa", typeName: "Glosas - Clínica Cooperada - 11%", date: "14/09/2026", amount: 275.00, nature: "DEBIT" as const, observation: "Glosas identificadas Lote 10944", source: "PDF" as const, sourceFile: "10944_DEMONSTRATIVO.pdf" },
    { scope: "DOCTOR" as const, doctorId: "maria_eduarda", doctorName: "MARIA EDUARDA CASA SOUZA MACHADO", typeId: "cota_parte", typeName: "Integralização de Cota Parte", date: "14/09/2026", amount: 7579.66, nature: "DEBIT" as const, observation: "Integralização cota 5 de 24", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },
    { scope: "DOCTOR" as const, doctorId: "maria_eduarda", doctorName: "MARIA EDUARDA CASA SOUZA MACHADO", typeId: "centro_estudos", typeName: "Contribuição de Centro de Estudos", date: "14/09/2026", amount: 170.00, nature: "DEBIT" as const, observation: "Taxa Centro de Estudos", source: "PDF" as const, sourceFile: "10944_PROD.pdf" },

    // Equipe Heart / Despesas Operacionais Gerais
    { scope: "TEAM" as const, doctorId: "equipe", doctorName: "HEART CIRURGIA CARDIOVASCULAR", typeId: "capitalizacao", typeName: "Capitalização Cota-Parte (360)", date: "01/08/2026", amount: 14825.40, nature: "DEBIT" as const, observation: "Capitalização Cota-Parte - Desconto Unimed", source: "PDF" as const, sourceFile: "10944_DEMONSTRATIVO.pdf" },
    { scope: "TEAM" as const, doctorId: "equipe", doctorName: "HEART CIRURGIA CARDIOVASCULAR", typeId: "contador", typeName: "Contador Heart", date: "14/09/2026", amount: 294.00, nature: "DEBIT" as const, observation: "Assessoria Contábil Heart", source: "MANUAL" as const },
    { scope: "TEAM" as const, doctorId: "equipe", doctorName: "HEART CIRURGIA CARDIOVASCULAR", typeId: "dare", typeName: "DARE", date: "14/09/2026", amount: 497.00, nature: "DEBIT" as const, observation: "Taxa DARE estadual", source: "MANUAL" as const },
    { scope: "TEAM" as const, doctorId: "equipe", doctorName: "HEART CIRURGIA CARDIOVASCULAR", typeId: "sala", typeName: "Aluguel Sala / Consultório", date: "14/09/2026", amount: 900.00, nature: "DEBIT" as const, observation: "Locação consultório", source: "MANUAL" as const },
    { scope: "TEAM" as const, doctorId: "equipe", doctorName: "HEART CIRURGIA CARDIOVASCULAR", typeId: "celular", typeName: "Celular Corporativo", date: "14/09/2026", amount: 722.21, nature: "DEBIT" as const, observation: "Telefonia corporativa", source: "MANUAL" as const },
    { scope: "TEAM" as const, doctorId: "equipe", doctorName: "HEART CIRURGIA CARDIOVASCULAR", typeId: "consult_itjai", typeName: "Consultório Itajaí", date: "14/09/2026", amount: 2029.78, nature: "DEBIT" as const, observation: "Despesas unidade Itajaí", source: "MANUAL" as const },
    { scope: "TEAM" as const, doctorId: "equipe", doctorName: "HEART CIRURGIA CARDIOVASCULAR", typeId: "crm", typeName: "CRM", date: "14/09/2026", amount: 344.50, nature: "DEBIT" as const, observation: "Taxa anuidade conselho CRM", source: "MANUAL" as const },
    { scope: "TEAM" as const, doctorId: "equipe", doctorName: "HEART CIRURGIA CARDIOVASCULAR", typeId: "instrumentador", typeName: "Instrumentador Cirúrgico", date: "14/09/2026", amount: 1526.76, nature: "DEBIT" as const, observation: "Honorários instrumentação", source: "MANUAL" as const },
    { scope: "TEAM" as const, doctorId: "equipe", doctorName: "HEART CIRURGIA CARDIOVASCULAR", typeId: "alvara", typeName: "Alvará Municipal", date: "14/09/2026", amount: 431.09, nature: "DEBIT" as const, observation: "Licença prefeitura", source: "MANUAL" as const },
    { scope: "TEAM" as const, doctorId: "equipe", doctorName: "HEART CIRURGIA CARDIOVASCULAR", typeId: "inss", typeName: "INSS Patronal", date: "14/09/2026", amount: 502.51, nature: "DEBIT" as const, observation: "Previdência social patronal", source: "MANUAL" as const }
  ];

  const pendencies: FinancialPendency[] = [
    {
      id: "pend-1",
      type: "QUANTITY_WARNING",
      description: "Divergência de quantidade de registros detalhados vs estatísticas do PDF (Verificado com aviso)",
      severity: "WARNING",
      resolved: false
    }
  ];

  return {
    batchNumber: "10944",
    providerName: "HEART CIRURGIA CARDIOVASCULAR",
    paymentDate: "14/09/2026",
    emissionDate: "16/09/2026",
    productionRecords,
    glosas,
    taxes,
    adjustments,
    transactions,
    pendencies,
    totals: {
      informed: 155844.42,
      processed: 148253.88,
      released: 148253.88,
      glosas: 7590.54,
      taxes: 9117.62,
      debits: 23943.02,
      credits: 0.00,
      net: 124310.86,
      quantity: 1262
    }
  };
}
