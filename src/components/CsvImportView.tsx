import React, { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertTriangle, ArrowLeft, Loader2, RefreshCw, X, Check } from "lucide-react";
import { useGroup } from "../contexts/GroupContext";
import { useAuth } from "../hooks/useAuth";

interface CsvImportViewProps {
  onBack: () => void;
}

interface ParsedRow {
  [key: string]: string;
}

interface PreviewStats {
  fileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  uniquePatientsCount: number;
  newPatientsCount: number;
  existingPatientsCount: number;
  proceduresCount: number;
  errors: string[];
  groupedPatients: Map<string, {
    nome: string;
    documento: string;
    prestador: string;
    rows: ParsedRow[];
  }>;
}

export function CsvImportView({ onBack }: CsvImportViewProps) {
  const { activeGroup, apiFetch, activeGroupMembers } = useGroup();
  const { user } = useAuth();

  const userRole = activeGroupMembers.find(m => m.userId === user?.uid)?.role;
  const isCreator = activeGroup?.createdBy === user?.uid;
  const isAdmin = userRole === "owner" || userRole === "admin" || isCreator;

  const [step, setStep] = useState<"upload" | "preview" | "importing" | "result">("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewStats, setPreviewStats] = useState<PreviewStats | null>(null);
  const [importResult, setImportResult] = useState<{
    newPatients: number;
    updatedPatients: number;
    totalProcessed: number;
    proceduresImported: number;
    errorsCount: number;
    errorDetails: string[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Robust CSV parser supporting commas, semicolons, and quotes
  const parseCsvText = (text: string): { headers: string[]; rows: ParsedRow[] } => {
    const lines = text.split(/\r\n|\n/);
    if (lines.length === 0) return { headers: [], rows: [] };

    // Determine delimiter (comma or semicolon) based on first line
    const firstLine = lines[0];
    const delimiter = firstLine.includes(";") ? ";" : ",";

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let inQuotes = false;
      let currentVal = "";
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(currentVal.trim());
          currentVal = "";
        } else {
          currentVal += char;
        }
      }
      result.push(currentVal.trim());
      return result.map(v => v.replace(/^"|"$/g, "").trim());
    };

    const rawHeaders = parseLine(lines[0]);
    const headers = rawHeaders.filter(h => h.length > 0);

    const rows: ParsedRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = parseLine(line);
      const rowObj: ParsedRow = {};
      rawHeaders.forEach((h, index) => {
        if (h) {
          rowObj[h] = values[index] !== undefined ? values[index] : "";
        }
      });
      rows.push(rowObj);
    }

    return { headers: rawHeaders, rows };
  };

  const normalizeHeader = (str: string): string => {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  };

  const findHeaderKey = (headers: string[], targetNames: string[]): string | null => {
    for (const h of headers) {
      const cleanH = normalizeHeader(h);
      for (const t of targetNames) {
        const cleanT = normalizeHeader(t);
        if (cleanH === cleanT || cleanH.includes(cleanT) || cleanT.includes(cleanH)) {
          return h;
        }
      }
    }
    return null;
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setIsProcessingFile(true);
    setErrorMessage(null);

    try {
      const text = await file.text();
      const { headers, rows } = parseCsvText(text);

      // Find required columns with flexible target names and accent normalization
      const codeKey = findHeaderKey(headers, ["codigo do usuario", "codigodousuario", "codusuario", "codigo usuario", "cod. usuario", "codigo", "cod"]);
      const nameKey = findHeaderKey(headers, ["nome do usuario", "nomedousuario", "nome usuario", "nome", "paciente"]);

      if (!codeKey) {
        throw new Error("Não foi possível importar o arquivo. A coluna Código do Usuário não foi encontrada.");
      }
      if (!nameKey) {
        throw new Error("Não foi possível importar o arquivo. A coluna Nome do Usuário não foi encontrada.");
      }

      // Fetch existing patients in this group to compare
      let existingPatientsMap = new Map<string, any>();
      if (activeGroup) {
        try {
          const res = await apiFetch("/api/app/patients?full=true");
          if (res.ok) {
            const patientsList = await res.json();
            if (Array.isArray(patientsList)) {
              patientsList.forEach((p: any) => {
                if (p.codigoUsuario) {
                  existingPatientsMap.set(p.codigoUsuario.toString().trim(), p);
                }
              });
            }
          }
        } catch (err) {
          console.warn("Could not fetch existing patients for preview comparison:", err);
        }
      }

      const grouped = new Map<string, { nome: string; documento: string; prestador: string; rows: ParsedRow[] }>();
      let invalidCount = 0;
      const errorsList: string[] = [];

      rows.forEach((row, idx) => {
        const rawCode = row[codeKey];
        const rawName = row[nameKey];

        if (!rawCode || rawCode.trim() === "" || rawCode.toLowerCase() === "null") {
          invalidCount++;
          if (errorsList.length < 10) {
            errorsList.push(`Linha ${idx + 2}: Ignorada por ausência do Código do Usuário.`);
          }
          return;
        }

        const codigoUsuario = rawCode.toString().trim();
        const nomeUsuario = rawName ? rawName.toString().trim() : "Sem Nome";
        
        // Find document or CPF column
        const docKey = findHeaderKey(headers, ["documento", "cpf", "rg"]);
        const docVal = docKey ? row[docKey] || "" : "";

        // Find provider / hospital column
        const prestadorKey = findHeaderKey(headers, ["prestador executante", "prestador", "hospital"]);
        const prestadorVal = prestadorKey ? row[prestadorKey] || "" : "";

        if (!grouped.has(codigoUsuario)) {
          grouped.set(codigoUsuario, {
            nome: nomeUsuario,
            documento: docVal,
            prestador: prestadorVal,
            rows: []
          });
        }
        grouped.get(codigoUsuario)?.rows.push(row);
      });

      let newCount = 0;
      let existingCount = 0;

      grouped.forEach((data, code) => {
        if (existingPatientsMap.has(code)) {
          existingCount++;
        } else {
          newCount++;
        }
      });

      setPreviewStats({
        fileName: file.name,
        totalRows: rows.length + invalidCount,
        validRows: rows.length - invalidCount,
        invalidRows: invalidCount,
        uniquePatientsCount: grouped.size,
        newPatientsCount: newCount,
        existingPatientsCount: existingCount,
        proceduresCount: rows.length - invalidCount,
        errors: errorsList,
        groupedPatients: grouped
      });

      setStep("preview");
    } catch (err: any) {
      console.error("CSV parse error:", err);
      setErrorMessage(err.message || "Erro ao processar o arquivo CSV.");
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewStats || !activeGroup) return;

    setStep("importing");
    setErrorMessage(null);

    try {
      // Convert groupedPatients Map to plain serializable object/array for API
      const patientsPayload: any[] = [];
      previewStats.groupedPatients.forEach((val, codigoUsuario) => {
        patientsPayload.push({
          codigoUsuario,
          nome: val.nome,
          documento: val.documento,
          prestador: val.prestador,
          rows: val.rows
        });
      });

      const res = await apiFetch("/api/app/patients/import-csv", {
        method: "POST",
        body: JSON.stringify({
          groupId: activeGroup.id,
          patients: patientsPayload
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}`);
      }

      const resultData = await res.json();
      setImportResult({
        newPatients: resultData.newPatients || 0,
        updatedPatients: resultData.updatedPatients || 0,
        totalProcessed: resultData.totalProcessed || previewStats.uniquePatientsCount,
        proceduresImported: resultData.proceduresImported || previewStats.proceduresCount,
        errorsCount: resultData.errorsCount || 0,
        errorDetails: resultData.errorDetails || []
      });
      setStep("result");
    } catch (err: any) {
      console.error("Import execution error:", err);
      setErrorMessage(err.message || "Erro ao executar importação no servidor.");
      setStep("preview");
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button 
          onClick={onBack} 
          className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-500"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
            <Upload size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Importar Pacientes via CSV</h3>
            <p className="text-xs text-gray-500">Sincronize sua base de pacientes e procedimentos com segurança</p>
          </div>
        </div>
      </div>

      {!isAdmin && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-3 text-amber-800">
          <AlertTriangle size={20} className="shrink-0" />
          <p className="text-sm font-medium">Apenas administradores ou proprietários do grupo podem realizar importações de CSV.</p>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-800">
          <AlertTriangle size={20} className="shrink-0" />
          <p className="text-sm font-medium">{errorMessage}</p>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div className="max-w-2xl mx-auto w-full py-8">
          <div 
            onClick={() => isAdmin && fileInputRef.current?.click()}
            className={`border-2 border-dashed border-gray-200 hover:border-blue-500 bg-gray-50/50 hover:bg-blue-50/20 rounded-[32px] p-12 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-4 ${
              !isAdmin ? "opacity-50 cursor-not-allowed" : ""
            }`}
          >
            <div className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/10">
              {isProcessingFile ? <Loader2 size={32} className="animate-spin" /> : <Upload size={32} />}
            </div>
            <div>
              <h4 className="text-lg font-bold text-gray-900">Clique para selecionar o arquivo CSV</h4>
              <p className="text-sm text-gray-500 mt-1">Suporta arquivos CSV estruturados com Código do Usuário e Nome do Usuário</p>
            </div>
            <span className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20">
              Selecionar Arquivo CSV
            </span>
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".csv,text/csv" 
              onChange={handleFileSelected} 
              className="hidden" 
              disabled={!isAdmin || isProcessingFile}
            />
          </div>

          <div className="mt-8 p-6 bg-blue-50/50 border border-blue-100 rounded-2xl text-xs text-blue-900 space-y-2">
            <p className="font-bold uppercase tracking-wider text-blue-700">Regras de Importação:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>O <b>Código do Usuário</b> é o identificador único e não altera pacientes existentes.</li>
              <li>Novos pacientes receberão automaticamente o status <b>"Sem Status"</b>.</li>
              <li>Pacientes já cadastrados <b>manterão seu status atual</b> inalterado.</li>
              <li>Múltiplas linhas com o mesmo código serão agrupadas como procedimentos do mesmo paciente.</li>
              <li>A importação é totalmente idempotente e segura contra duplicidades.</li>
            </ul>
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && previewStats && (
        <div className="max-w-2xl mx-auto w-full space-y-6">
          <div className="bg-white border border-gray-100 shadow-xl rounded-[28px] p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <FileText size={24} className="text-blue-600" />
                <div>
                  <h4 className="font-bold text-gray-900 text-base">{previewStats.fileName}</h4>
                  <p className="text-xs text-gray-500">Pré-visualização dos dados prontos para sincronização</p>
                </div>
              </div>
              <button 
                onClick={() => setStep("upload")}
                className="text-xs text-gray-500 hover:text-gray-900 font-medium px-3 py-1.5 bg-gray-100 rounded-xl transition-all"
              >
                Trocar Arquivo
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Pacientes Únicos</span>
                <span className="text-2xl font-black text-gray-900 mt-1 block">{previewStats.uniquePatientsCount}</span>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">Novos Pacientes</span>
                <span className="text-2xl font-black text-emerald-700 mt-1 block">{previewStats.newPatientsCount}</span>
              </div>
              <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100">
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider block">Já Existentes</span>
                <span className="text-2xl font-black text-blue-700 mt-1 block">{previewStats.existingPatientsCount}</span>
              </div>
              <div className="p-4 rounded-2xl bg-purple-50 border border-purple-100">
                <span className="text-xs font-bold text-purple-600 uppercase tracking-wider block">Procedimentos</span>
                <span className="text-2xl font-black text-purple-700 mt-1 block">{previewStats.proceduresCount}</span>
              </div>
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Linhas Válidas</span>
                <span className="text-2xl font-black text-gray-900 mt-1 block">{previewStats.validRows}</span>
              </div>
              <div className={`p-4 rounded-2xl border ${previewStats.invalidRows > 0 ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100"}`}>
                <span className={`text-xs font-bold uppercase tracking-wider block ${previewStats.invalidRows > 0 ? "text-amber-700" : "text-gray-400"}`}>Ignoradas</span>
                <span className={`text-2xl font-black mt-1 block ${previewStats.invalidRows > 0 ? "text-amber-800" : "text-gray-900"}`}>{previewStats.invalidRows}</span>
              </div>
            </div>

            {previewStats.errors.length > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 space-y-1">
                <p className="font-bold">Avisos de formatação:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {previewStats.errors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => setStep("upload")}
                className="px-5 py-2.5 rounded-2xl border border-gray-200 text-gray-700 text-sm font-bold hover:bg-gray-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmImport}
                className="px-6 py-2.5 rounded-2xl bg-blue-600 text-white text-sm font-bold shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all flex items-center gap-2"
              >
                <Check size={16} />
                Importar Pacientes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Importing Loading */}
      {step === "importing" && (
        <div className="max-w-md mx-auto w-full py-16 text-center space-y-6">
          <div className="w-20 h-20 rounded-[28px] bg-blue-50 text-blue-600 flex items-center justify-center mx-auto shadow-2xl shadow-blue-500/20">
            <Loader2 size={36} className="animate-spin" />
          </div>
          <div>
            <h4 className="text-xl font-black text-gray-900">Processando Importação...</h4>
            <p className="text-sm text-gray-500 mt-1">Sincronizando pacientes e gravando procedimentos no grupo atual</p>
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === "result" && importResult && (
        <div className="max-w-xl mx-auto w-full space-y-6">
          <div className="bg-white border border-gray-100 shadow-xl rounded-[32px] p-8 text-center space-y-6">
            <div className="w-20 h-20 rounded-[28px] bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-2xl shadow-emerald-500/20">
              <CheckCircle2 size={40} />
            </div>

            <div>
              <h4 className="text-2xl font-black text-gray-900">Importação Concluída!</h4>
              <p className="text-sm text-gray-500 mt-1">Os dados foram sincronizados com sucesso no grupo</p>
            </div>

            <div className="grid grid-cols-2 gap-4 text-left">
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  ✓
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-bold block uppercase">Novos Pacientes</span>
                  <span className="text-xl font-black text-gray-900">{importResult.newPatients}</span>
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  ↻
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-bold block uppercase">Atualizados</span>
                  <span className="text-xl font-black text-gray-900">{importResult.updatedPatients}</span>
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                  #
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-bold block uppercase">Processados</span>
                  <span className="text-xl font-black text-gray-900">{importResult.totalProcessed}</span>
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  ⚙
                </div>
                <div>
                  <span className="text-xs text-gray-400 font-bold block uppercase">Procedimentos</span>
                  <span className="text-xl font-black text-gray-900">{importResult.proceduresImported}</span>
                </div>
              </div>
            </div>

            {importResult.errorsCount > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left text-xs text-amber-800 space-y-1">
                <p className="font-bold">Atenção ({importResult.errorsCount} ocorrências):</p>
                <ul className="list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
                  {importResult.errorDetails.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={onBack}
              className="w-full py-3.5 rounded-2xl bg-blue-600 text-white font-bold shadow-xl shadow-blue-600/20 hover:bg-blue-700 transition-all"
            >
              Concluir e Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
