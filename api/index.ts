import express from "express";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { Readable } from "stream";
import Stripe from "stripe";

dotenv.config();

let stripe: Stripe | null = null;
const getStripe = () => {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
  }
  return stripe;
};

export const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

// Quota usage middleware
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api/app/")) {
    try {
      const auth = getAuthClient(req);
      if (auth) {
        // Try to get email from tokens if possible (it's often in id_token part of response if requested)
        // or just log the userId if we had it. For now, just mark as authenticated.
        logQuotaUsage(auth, req.path, req.method).catch(() => {});
      }
    } catch (e) {
      // Ignore auth errors in middleware to allow normal flow
    }
  }
  next();
});

const getRedirectUri = (req?: express.Request) => {
  // Allow explicit override via environment variable
  if (process.env.GOOGLE_REDIRECT_URL) {
    return process.env.GOOGLE_REDIRECT_URL;
  }

  // Use x-forwarded-host as priority for Vercel/proxies
  const host = req?.get("x-forwarded-host") || req?.get("host") || "unknown-host";
  let protocol = req?.get("x-forwarded-proto") || "https";
  
  // Localhost fallback
  if ((host.includes("localhost") || host.includes("127.0.0.1")) && !req?.get("x-forwarded-proto")) {
    protocol = "http";
  }

  const uri = `${protocol}://${host}/api/auth/google/callback`;
  console.log(`[OAuth] Using Redirect URI: ${uri}`);
  return uri;
};

const getOAuth2Client = (req?: express.Request) => {
  const clientId = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const redirectUri = getRedirectUri(req);

  if (!clientId || !clientSecret) {
    console.error("CRITICAL: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing!");
    return null;
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.metadata.readonly"
];

const MASTER_SHEET_NAME = "Doctor Pro - Banco de Dados";
const IMAGES_FOLDER_NAME = "Doctor Pro - Imagens";
const SHEET_TABS = {
  CADASTRO: "Cadastro",
  LOGS: "Log de Status",
  ARQUIVOS: "Arquivos",
  FAMILIARES: "Familiares",
  SETTINGS: "Configuracoes",
  HOSPITAIS: "Hospitais",
  STATUSES: "Statuses",
  STATUS_LOG: "Atividades",
  OPCOES_IMAGENS: "OpcoesImagens",
  STATUS_USER: "Status User",
  LOCAL_USER: "Local User",
  AI_USAGE: "AI_Usage",
  QUOTA_USAGE: "QuotaUsage"
};

// Cache for Master Sheet ID and verification status to reduce quota consumption
let cachedMasterFileId: string | null = null;
let masterSheetTabsVerified = false;
let masterSheetInitPromise: Promise<string> | null = null;

// Resource caching to reduce Sheets API quota consumption
const RESOURCE_CACHE = {
  hospitals: { data: null as any[] | null, lastFetch: 0 },
  statuses: { data: null as any[] | null, lastFetch: 0 },
  ttl: parseInt(process.env.RESOURCE_CACHE_TTL_MS || "120000")
};

console.log(`[Cache] Resource Cache TTL initialized: ${RESOURCE_CACHE.ttl}ms`);

const invalidateCache = (type: "hospitals" | "statuses") => {
  console.log(`[Cache] Invalidating ${type} cache`);
  if (type === "hospitals") RESOURCE_CACHE.hospitals.lastFetch = 0;
  if (type === "statuses") RESOURCE_CACHE.statuses.lastFetch = 0;
};

// --- Helper for Unifying Databases ---
const getOrCreateMasterSheet = async (auth: any) => {
  // If already verified in this process life, return immediately
  if (cachedMasterFileId && masterSheetTabsVerified) {
    return cachedMasterFileId;
  }

  // Prevent race conditions with a shared promise
  if (masterSheetInitPromise) {
    return masterSheetInitPromise;
  }

  masterSheetInitPromise = (async () => {
    try {
      const drive = google.drive({ version: "v3", auth });
      const sheets = google.sheets({ version: "v4", auth });

      let fileId = cachedMasterFileId;

      if (!fileId) {
        console.log(`[Drive] Searching for master sheet: ${MASTER_SHEET_NAME}`);
        const search = await drive.files.list({
          q: `name = '${MASTER_SHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
          fields: "files(id, name, owners, shared)",
        });

        const files = search.data.files || [];
        console.log(`[Drive] Found ${files.length} potential master sheets.`);
        fileId = files[0]?.id;
      }

      if (!fileId) {
        console.log(`[Drive] Master sheet not found. Creating a new one...`);
        const createRes = await sheets.spreadsheets.create({
          requestBody: {
            properties: { title: MASTER_SHEET_NAME },
            sheets: Object.values(SHEET_TABS).map(title => ({ properties: { title } }))
          }
        });
        fileId = createRes.data.spreadsheetId;

        if (!fileId) throw new Error("Failed to create master sheet");

        // Initialize Headers
        await Promise.all([
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.CADASTRO}!A1:H1`, valueInputOption: "RAW", requestBody: { values: [["ID", "Nome", "Telefone", "Idade", "status_id", "hospital_id", "room_number", "paciente_cpf"]] } }),
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.LOGS}!A1:D1`, valueInputOption: "RAW", requestBody: { values: [["data", "paciente_id", "paciente_nome", "descricao"]] } }),
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.ARQUIVOS}!A1:E1`, valueInputOption: "RAW", requestBody: { values: [["data", "paciente_id", "descricao", "link", "ai_resposta"]] } }),
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.FAMILIARES}!A1:F1`, valueInputOption: "RAW", requestBody: { values: [["id", "nome_familiar", "tipo_parentesco", "telefone", "paciente_id", "paciente_nome"]] } }),
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.SETTINGS}!A1:B1`, valueInputOption: "RAW", requestBody: { values: [["Chave", "Valor"]] } }),
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.HOSPITAIS}!A1:H1`, valueInputOption: "RAW", requestBody: { values: [["ID", "Nome do Hospital", "Telefone", "Contato 1", "Contato 2", "Contato 3", "Contato 4", "Contato 5"]] } }),
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.STATUSES}!A1:B7`, valueInputOption: "RAW", requestBody: { values: [["ID", "Nome"], ["1", "Pré-operatorio"], ["2", "Pós-operatorio"], ["3", "Acompanhamento"], ["4", "Alta"], ["5", "Não informado"]] } }),
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.STATUS_LOG}!A1:D1`, valueInputOption: "RAW", requestBody: { values: [["ID", "Nome", "Status", "Data"]] } }),
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.OPCOES_IMAGENS}!A1:A4`, valueInputOption: "RAW", requestBody: { values: [["Opcao"], ["Cirurgia"], ["Evolução saída de sala"], ["Evolução de alta"]] } }),
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.STATUS_USER}!A1:E1`, valueInputOption: "RAW", requestBody: { values: [["status_id", "status_data", "status_atual", "paciente_id", "paciente_nome"]] } }),
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.LOCAL_USER}!A1:E1`, valueInputOption: "RAW", requestBody: { values: [["local_id", "local_room_number", "local_hospital", "paciente_id", "paciente_nome"]] } }),
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.AI_USAGE}!A1:B1`, valueInputOption: "RAW", requestBody: { values: [["Data", "UsageCount"]] } }),
          sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.QUOTA_USAGE}!A1:D1`, valueInputOption: "RAW", requestBody: { values: [["Timestamp", "Endpoint", "Method", "User"]] } })
        ]);
        masterSheetTabsVerified = true;
      } else if (!masterSheetTabsVerified) {
        // Ensure all tabs exist in the existing sheet
        console.log(`[Drive] Verifying tabs for master sheet: ${fileId}`);
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: fileId });
        const existingTabs = spreadsheet.data.sheets?.map(s => s.properties?.title) || [];
        const requiredTabs = Object.values(SHEET_TABS);
        const missingTabs = requiredTabs.filter(t => !existingTabs.includes(t));

        if (missingTabs.length > 0) {
          console.log(`[Drive] Adding missing tabs: ${missingTabs.join(", ")}`);
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: fileId,
            requestBody: {
              requests: missingTabs.map(title => ({
                addSheet: { properties: { title } }
              }))
            }
          });

          // Initialize missing headers
          for (const tab of missingTabs) {
            console.log(`[Drive] Initializing headers for missing tab: ${tab}`);
            if (tab === SHEET_TABS.STATUSES) {
              await sheets.spreadsheets.values.update({ spreadsheetId: fileId, range: `${SHEET_TABS.STATUSES}!A1:B7`, valueInputOption: "RAW", requestBody: { values: [["ID", "Nome"], ["1", "Pré-operatorio"], ["2", "Pós-operatorio"], ["3", "Acompanhamento"], ["4", "Alta"], ["5", "Não informado"]] } });
            }
            if (tab === SHEET_TABS.STATUS_LOG) {
              await sheets.spreadsheets.values.update({ spreadsheetId: fileId, range: `${SHEET_TABS.STATUS_LOG}!A1:D1`, valueInputOption: "RAW", requestBody: { values: [["ID", "Nome", "Status", "Data"]] } });
            }
            if (tab === SHEET_TABS.OPCOES_IMAGENS) {
              await sheets.spreadsheets.values.update({ spreadsheetId: fileId, range: `${SHEET_TABS.OPCOES_IMAGENS}!A1:A4`, valueInputOption: "RAW", requestBody: { values: [["Opcao"], ["Cirurgia"], ["Evolução saída de sala"], ["Evolução de alta"]] } });
            }
            if (tab === SHEET_TABS.STATUS_USER) {
              await sheets.spreadsheets.values.update({ spreadsheetId: fileId, range: `${SHEET_TABS.STATUS_USER}!A1:E1`, valueInputOption: "RAW", requestBody: { values: [["status_id", "status_data", "status_atual", "paciente_id", "paciente_nome"]] } });
            }
            if (tab === SHEET_TABS.LOCAL_USER) {
              await sheets.spreadsheets.values.update({ spreadsheetId: fileId, range: `${SHEET_TABS.LOCAL_USER}!A1:E1`, valueInputOption: "RAW", requestBody: { values: [["local_id", "local_room_number", "local_hospital", "paciente_id", "paciente_nome"]] } });
            }
            if (tab === SHEET_TABS.AI_USAGE) {
              await sheets.spreadsheets.values.update({ spreadsheetId: fileId, range: `${SHEET_TABS.AI_USAGE}!A1:B1`, valueInputOption: "RAW", requestBody: { values: [["Data", "UsageCount"]] } });
            }
            if (tab === SHEET_TABS.QUOTA_USAGE) {
              console.log("[Drive] Initializing QuotaUsage headers...");
              await sheets.spreadsheets.values.update({ spreadsheetId: fileId, range: `${SHEET_TABS.QUOTA_USAGE}!A1:D1`, valueInputOption: "RAW", requestBody: { values: [["Timestamp", "Endpoint", "Method", "User"]] } });
            }
          }
        }

        // Ensure AI_Resposta column exists in ARQUIVOS
        const range = `${SHEET_TABS.ARQUIVOS}!1:1`;
        const headersRes = await sheets.spreadsheets.values.get({ spreadsheetId: fileId, range });
        const headers = headersRes.data.values?.[0] || [];
        if (!headers.includes("ai_resposta")) {
          await sheets.spreadsheets.values.update({
            spreadsheetId: fileId,
            range: `${SHEET_TABS.ARQUIVOS}!E1`,
            valueInputOption: "RAW",
            requestBody: { values: [["ai_resposta"]] }
          });
        }
        masterSheetTabsVerified = true;
      }
      
      cachedMasterFileId = fileId as string;
      return fileId as string;
    } catch (err) {
      console.error("[Drive] masterSheetInitPromise error:", err);
      throw err;
    } finally {
      masterSheetInitPromise = null;
    }
  })();

  return masterSheetInitPromise;
};

const checkAndIncrementAIUsage = async (auth: any) => {
  const sheets = google.sheets({ version: "v4", auth });
  const fileId = await getOrCreateMasterSheet(auth);
  const today = new Date().toISOString().split('T')[0];

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: fileId,
    range: `${SHEET_TABS.AI_USAGE}!A:B`
  });

  const rows = res.data.values || [];
  const todayRowIdx = rows.findIndex(r => r[0] === today);
  const currentCount = todayRowIdx !== -1 ? parseInt(rows[todayRowIdx][1] || "0") : 0;

  if (currentCount >= 10) {
    throw new Error("Cota diária de IA (10 análises) atingida. Tente novamente amanhã.");
  }

  if (todayRowIdx !== -1) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.AI_USAGE}!B${todayRowIdx + 1}`,
      valueInputOption: "RAW",
      requestBody: { values: [[currentCount + 1]] }
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.AI_USAGE}!A:B`,
      valueInputOption: "RAW",
      requestBody: { values: [[today, 1]] }
    });
  }
};

const logQuotaUsage = async (auth: any, endpoint: string, method: string, userEmail?: string) => {
  try {
    const fileId = await getOrCreateMasterSheet(auth);
    const sheets = google.sheets({ version: "v4", auth });
    const timestamp = new Date().toISOString();
    
    // Fire and forget, but with a simple log
    sheets.spreadsheets.values.append({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.QUOTA_USAGE}!A:D`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[timestamp, endpoint, method, userEmail || "authenticated_user"]]
      }
    }).then(() => {
      // console.log(`[Quota] Logged usage for ${endpoint}`);
    }).catch(e => {
      console.error(`[Quota] Failed to log usage for ${endpoint}:`, e.message);
    });
  } catch (err) {
    // Silent fail for logs to not break UI
  }
};

const getOrCreateImagesFolder = async (auth: any) => {
  const drive = google.drive({ version: "v3", auth });

  console.log(`[Drive] Searching for images folder: ${IMAGES_FOLDER_NAME}`);
  const search = await drive.files.list({
    q: `name = '${IMAGES_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id, name)",
  });

  let folderId = search.data.files?.[0]?.id;

  if (!folderId) {
    console.log(`[Drive] Images folder not found. Creating a new one...`);
    const createRes = await drive.files.create({
      requestBody: {
        name: IMAGES_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });
    folderId = createRes.data.id;

    // Set permission so files inside are accessible to anyone with the link
    // This allows multi-user visibility for files linked in the sheet.
    try {
      await drive.permissions.create({
        fileId: folderId as string,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
      });
      console.log(`[Drive] Folder permissions set to 'anyone with link'`);
    } catch (permError) {
      console.error("[Drive] Failed to set folder permissions:", permError);
    }
  }

  return folderId as string;
};

const COOKIE_NAME = "__Secure-nexus-p-v1";
const LEGACY_COOKIE_NAME = "__Secure-nexus-u-v1";

// Use global storage for serverless persistence (best effort across cold starts on same instance)
const globalStore = global as any;
if (!globalStore.pendingSessions) {
  globalStore.pendingSessions = new Map<string, any>();
}
const pendingSessions: Map<string, any> = globalStore.pendingSessions;

const setAuthCookies = (res: express.Response, tokens: any) => {
  const cookieOptions: any = {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
    partitioned: true 
  };
  
  res.cookie(COOKIE_NAME, tokens, cookieOptions);
  // Also set legacy for compatibility or debug
  res.cookie(LEGACY_COOKIE_NAME, tokens, { ...cookieOptions, partitioned: false });
  // Set a visible breadcrumb for client-side visibility checks
  res.cookie("n_active", "1", { ...cookieOptions, httpOnly: false, partitioned: false });
};

// Helper to get auth client from cookie
const getAuthClient = (req: express.Request) => {
  const token = req.cookies[COOKIE_NAME] || req.cookies[LEGACY_COOKIE_NAME] || req.cookies["n_session_p"] || req.cookies["n_session_u"] || req.cookies["google_token"];
  if (!token) return null;
  
  const client = getOAuth2Client(req);
  if (!client) return null;
  
  client.setCredentials(token);
  return client;
};

// --- Auth Routes ---
app.get("/api/ping", (req, res) => {
  res.json({ 
    status: "pong", 
    env: !!process.env.GOOGLE_CLIENT_ID,
    host: req.get("host"),
    protocol: req.get("x-forwarded-proto"),
    time: new Date().toISOString()
  });
});

app.get("/api/diagnostics", (req, res) => {
  res.json({
    env: {
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasGeminiKey: !!process.env.GEMINI_API_KEY,
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL
    },
    headers: req.headers,
    url: req.url,
    method: req.method,
    calculatedRedirectUri: getRedirectUri(req)
  });
});

app.get("/api/auth/url", (req, res) => {
  try {
    const client = getOAuth2Client(req);
    if (!client) {
      console.error("Auth client initialization failed: missing credentials");
      return res.status(500).json({ error: "Google OAuth credentials not configured." });
    }

    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
      state: state
    });
    res.json({ url, state });
  } catch (err: any) {
    console.error("Error generating auth URL:", err);
    res.status(500).json({ error: err.message || "Internal server error generating auth URL" });
  }
});

app.get("/api/auth/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error) {
    console.error("Auth query error:", error);
    return res.status(403).send(`Authentication failed: ${error}`);
  }

  const client = getOAuth2Client(req);
  if (!client) return res.status(500).send("Server configuration error.");

  try {
    const { tokens } = await client.getToken(code as string);
    
    const essentialTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      token_type: tokens.token_type
    };

    // Store for polling
    if (state) {
      console.log(`[Auth] Storing pending session for state: ${state}`);
      pendingSessions.set(state as string, essentialTokens);
      setTimeout(() => pendingSessions.delete(state as string), 5 * 60 * 1000);
    }

    setAuthCookies(res, essentialTokens);

    res.send(`
      <html>
        <head>
          <title>Autenticação Doctor Pro</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f3f4f6; color: #111827; }
            .card { text-align: center; padding: 2.5rem; background: white; border-radius: 1.5rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04); max-width: 90%; width: 420px; }
            h2 { margin-bottom: 0.5rem; font-weight: 800; letter-spacing: -0.025em; color: #1e40af; }
            p { color: #4b5563; font-size: 0.9375rem; margin-bottom: 2rem; line-height: 1.5; }
            .spinner { width: 48px; height: 48px; border: 4px solid #e5e7eb; border-top: 4px solid #2563eb; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .btn { background: #2563eb; color: white; border: none; padding: 1.25rem 2rem; border-radius: 1rem; font-weight: 800; cursor: pointer; transition: all 0.2s; display: block; text-decoration: none; margin: 1.5rem auto 0; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.4); text-transform: uppercase; font-size: 0.875rem; letter-spacing: 0.05em; }
            .btn:hover { background: #1d4ed8; transform: translateY(-2px); box-shadow: 0 20px 25px -5px rgba(37, 99, 235, 0.5); }
            .btn:active { transform: translateY(0); }
            .status { margin-top: 2rem; font-size: 0.75rem; color: #9ca3af; font-family: monospace; }
          </style>
        </head>
        <body>
          <div class="card">
            <div id="content">
              <div class="spinner"></div>
              <h2>Sincronizando...</h2>
              <p>Autenticação concluída! Estamos vinculando sua sessão. Você pode fechar esta janela agora.</p>
            </div>
            
            <button onclick="copyTokens()" class="btn" id="finish-btn">CONCLUIR LOGIN</button>
            
            <div id="debug-status" class="status">Tentando comunicação direta...</div>

            <script>
              const tokens = ${JSON.stringify(essentialTokens)};
              const payload = { type: 'OAUTH_AUTH_SUCCESS', tokens, timestamp: Date.now() };

              function notify() {
                try {
                  const channel = new BroadcastChannel('doctor_pro_auth_channel');
                  channel.postMessage(payload);
                } catch (e) {}
                try {
                  if (window.opener) window.opener.postMessage(payload, '*');
                } catch (e) {}
                try {
                  localStorage.setItem('doctor_pro_auth_success', JSON.stringify(payload));
                } catch (e) {}
              }

              notify();
              let count = 0;
              const interval = setInterval(() => {
                count++;
                notify();
                document.getElementById('debug-status').innerText = "Comunicando com o app... (" + count + ")";
                
                if (count >= 15) {
                  clearInterval(interval);
                  document.getElementById('content').innerHTML = "<h2>Login Pronto</h2><p>Pode fechar esta janela e voltar ao Doctor Pro.</p>";
                  document.getElementById('debug-status').innerText = "Processo finalizado.";
                }
              }, 1000);

              window.copyTokens = function() {
                notify();
                setTimeout(() => {
                  if (window.opener) window.close();
                  else window.location.href = '/';
                }, 500);
              };

              // Auto-close if successful
              setTimeout(() => {
                 if (window.opener) window.close();
              }, 20000);
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("Auth token error:", err);
    res.status(500).send(`Authentication failed: ${err.message}`);
  }
});

app.get("/api/auth/poll/:state", (req, res) => {
  const { state } = req.params;
  const tokens = pendingSessions.get(state);
  
  // Fallback to cookies if Map is empty (Serverless instances often hit different executors)
  const cookieTokens = req.cookies[COOKIE_NAME] || req.cookies[LEGACY_COOKIE_NAME];
  
  if (tokens || cookieTokens) {
    console.log(`[Auth] Poll SUCCESS for state: ${state} | Map: ${!!tokens} | Cookie: ${!!cookieTokens}`);
    if (tokens) pendingSessions.delete(state);
    return res.json({ tokens: tokens || cookieTokens });
  }
  
  const allCookieNames = Object.keys(req.cookies || {});
  console.log(`[Auth] Poll 404 for state: ${state} | Cookies present: ${allCookieNames.join(", ") || "none"}`);

  res.status(404).json({ 
    error: "Session pending",
    debug: {
      stateRequested: state,
      hasStateInMap: pendingSessions.has(state),
      cookieCount: allCookieNames.length,
      cookieNames: allCookieNames
    }
  });
});

app.post("/api/auth/session", (req, res) => {
  const { tokens } = req.body;
  if (!tokens) return res.status(400).json({ error: "Missing tokens" });
  setAuthCookies(res, tokens);
  res.json({ success: true });
});

app.get("/api/auth/status", (req, res) => {
  const token = req.cookies[COOKIE_NAME] || req.cookies[LEGACY_COOKIE_NAME] || req.cookies["n_session_p"] || req.cookies["n_session_u"] || req.cookies["google_token"];
  res.json({ 
    isAuthenticated: !!token,
    debug: {
      hasPartitioned: !!req.cookies[COOKIE_NAME],
      hasLegacy: !!req.cookies[LEGACY_COOKIE_NAME],
      cookieCount: Object.keys(req.cookies || {}).length,
      allCookies: Object.keys(req.cookies || {}),
      ua: req.headers["user-agent"]
    }
  });
});

app.post("/api/auth/logout", (req, res) => {
  const options = { httpOnly: true, secure: true, sameSite: "none" as const, path: "/" };
  res.clearCookie(COOKIE_NAME, { ...options, partitioned: true });
  res.clearCookie(LEGACY_COOKIE_NAME, options);
  res.clearCookie("n_session_p", { ...options, partitioned: true });
  res.clearCookie("n_session_u", options);
  res.clearCookie("google_token", options);
  res.json({ success: true });
});

// --- Direct App Shortcuts (To save tokens/LLM calls) ---

// Get all patients directly from the master sheet with detailed status and location
app.get("/api/app/patients", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    const now = Date.now();

    // Get base data ranges
    const ranges = [
      `${SHEET_TABS.CADASTRO}!A:W`, // Fetch wider range to include Hospitals (M:T) and Statuses (V:W)
      `${SHEET_TABS.STATUS_USER}!A:E`,
      `${SHEET_TABS.LOCAL_USER}!A:E`
    ];

    const batchRes = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: fileId,
      ranges,
    });

    const vRanges = batchRes.data.valueRanges || [];
    const cadRows = vRanges[0]?.values || [];
    const statusRows = vRanges[1]?.values || [];
    const localRows = vRanges[2]?.values || [];
    
    // Parse Hospitals from Cadastro columns M:T (indices 12 to 19)
    const hospitals = cadRows.slice(1)
      .filter(row => row[12]) // Must have an ID in column M
      .map(row => ({
        id: row[12]?.toString().trim(),
        nome: (row[14] || row[13])?.toString().trim(), // User said column O (index 14) is hospital_nome
        fone: row[15]?.toString().trim(), // Shifted phone to index 15
        contatos: [row[16], row[17], row[18], row[19]].filter(Boolean)
      }));

    if (hospitals.length > 0) {
      RESOURCE_CACHE.hospitals.data = hospitals;
      RESOURCE_CACHE.hospitals.lastFetch = now;
      console.log(`[Cache] Updated hospitals cache from Cadastro sheet (${hospitals.length} items)`);
    }

    // Parse Statuses from Cadastro columns V:W (indices 21 to 22)
    const statuses = cadRows.slice(1)
      .filter(row => row[21]) // Must have an ID in column V
      .map(row => ({
        id: row[21]?.toString().trim(),
        nome: row[22]?.toString().trim() || row[21]?.toString().trim()
      }));

    if (statuses.length > 0) {
      RESOURCE_CACHE.statuses.data = statuses;
      RESOURCE_CACHE.statuses.lastFetch = now;
      console.log(`[Cache] Updated statuses cache from Cadastro sheet (${statuses.length} items)`);
    }

    const hData = RESOURCE_CACHE.hospitals.data || [];
    const sData = RESOURCE_CACHE.statuses.data || [];

    const hMap = Object.fromEntries(hData.map(r => [r.id, r.nome]));
    const sMap = Object.fromEntries(sData.map(r => [r.id, r.nome]));

    // Reverse maps for name-to-id lookup (robustness)
    const hNameMap = Object.fromEntries(hData.map(r => [r.nome.toLowerCase(), r.id]));
    const sNameMap = Object.fromEntries(sData.map(r => [r.nome.toLowerCase(), r.id]));

    // Pre-index status and local data for O(1) lookup
    const statusMap = new Map<string, string>();
    statusRows.slice(1).forEach(r => {
      const pId = r[3]?.toString().trim();
      const status = r[2]?.toString().trim();
      if (pId && status) statusMap.set(pId, status); // Map stores last one seen
    });

    const localMap = new Map<string, { room: string, hospital: string }>();
    localRows.slice(1).forEach(r => {
      const pId = r[3]?.toString().trim();
      if (pId) {
        localMap.set(pId, {
          room: r[1]?.toString().trim() || "",
          hospital: r[2]?.toString().trim() || ""
        });
      }
    });

    // Map patients basic info
    const patients = cadRows.slice(1).map(row => {
      const id = row[0]?.toString().trim();
      const statusInput = row[4]?.toString().trim();
      const hospitalInput = row[6]?.toString().trim(); // Column G
      
      // Robust Hospital Mapping
      let hName = "";
      let hId = hospitalInput || "";
      if (hospitalInput) {
        if (hMap[hospitalInput]) {
          hName = hMap[hospitalInput];
        } else if (hNameMap[hospitalInput.toLowerCase()]) {
          hId = hNameMap[hospitalInput.toLowerCase()];
          hName = hMap[hId];
        } else {
          hName = hospitalInput; // Fallback to raw input
        }
      }

      // Robust Status Mapping
      let sName = "";
      let sId = statusInput || "";
      if (statusInput) {
        if (sMap[statusInput]) {
          sName = sMap[statusInput];
        } else if (sNameMap[statusInput.toLowerCase()]) {
          sId = sNameMap[statusInput.toLowerCase()];
          sName = sMap[sId];
        } else {
          sName = statusInput; // Fallback to raw input
        }
      }
      
      const p: any = {
        id: id,
        nome: row[1]?.toString().trim(),
        fone: row[2]?.toString().trim(),
        idade: row[3]?.toString().trim(),
        statusId: sId,
        status: sName || "Não informado",
        hospitalId: hId,
        hospitalName: hName || "Sem Hospital",
        roomNumber: row[5]?.toString().trim() || ""
      };

      // Enrich with Status User (most recent from Map)
      if (id && statusMap.has(id)) {
        p.status = statusMap.get(id);
      }

      // Enrichment with Local User
      if (id && localMap.has(id)) {
        const local = localMap.get(id)!;
        p.roomNumber = local.room || p.roomNumber;
        p.hospitalName = local.hospital || p.hospitalName;
      }

      return p;
    });

    if (req.query.full === "true") {
      res.json({
        patients,
        hospitals: hData,
        statuses: sData
      });
    } else {
      res.json(patients);
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get app settings
app.get("/api/app/settings", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  try {
    const fileId = await getOrCreateMasterSheet(auth);
    const sheets = google.sheets({ version: "v4", auth });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.SETTINGS}!A:B`,
    });

    const rows = result.data.values || [];
    const settings: Record<string, string> = {};
    rows.slice(1).forEach(row => {
      if (row[0]) settings[row[0]] = row[1] || "";
    });

    res.json({
      companyName: settings["companyName"] || "Doctor Pro"
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update app settings
app.post("/api/app/settings", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const { companyName } = req.body;

  try {
    const fileId = await getOrCreateMasterSheet(auth);
    const sheets = google.sheets({ version: "v4", auth });

    // We only support companyName for now
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.SETTINGS}!A:B`,
    });

    const rows = result.data.values || [];
    let foundIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === "companyName") {
        foundIndex = i + 1;
        break;
      }
    }

    if (foundIndex !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: fileId,
        range: `${SHEET_TABS.SETTINGS}!B${foundIndex}`,
        valueInputOption: "RAW",
        requestBody: { values: [[companyName]] }
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: fileId,
        range: `${SHEET_TABS.SETTINGS}!A:B`,
        valueInputOption: "RAW",
        requestBody: { values: [["companyName", companyName]] }
      });
    }

    res.json({ status: "ok" });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get current database info
app.get("/api/app/db-info", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  try {
    const fileId = await getOrCreateMasterSheet(auth);
    const drive = google.drive({ version: "v3", auth });
    const file = await drive.files.get({
      fileId,
      fields: "id, name, webViewLink, owners"
    });
    res.json({
      id: file.data.id,
      name: file.data.name,
      link: file.data.webViewLink,
      owner: file.data.owners?.[0]?.emailAddress
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Perform a backup of the master sheet
app.post("/api/app/backup", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  try {
    const fileId = await getOrCreateMasterSheet(auth);
    const drive = google.drive({ version: "v3", auth });
    
    const now = new Date();
    const timestamp = `${now.getDate().toString().padStart(2, '0')}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getFullYear()}_${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}`;
    const backupName = `${MASTER_SHEET_NAME} backup ${timestamp}`;

    const copyRes = await drive.files.copy({
      fileId,
      requestBody: {
        name: backupName
      }
    });

    res.json({ success: true, backupId: copyRes.data.id, name: backupName });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get all hospitals
app.get("/api/app/hospitals", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const now = Date.now();
  if (RESOURCE_CACHE.hospitals.data && (now - RESOURCE_CACHE.hospitals.lastFetch < RESOURCE_CACHE.ttl)) {
    console.log("[Cache] Hit (direct route): hospitals");
    return res.json(RESOURCE_CACHE.hospitals.data);
  }
  console.log("[Cache] Miss (direct route): hospitals");

  const sheets = google.sheets({ version: "v4", auth });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.HOSPITAIS}!A:H`,
    });

    const rows = valuesRes.data.values || [];
    const hospitals = rows.slice(1).map(row => ({
      id: row[0],
      nome: row[1],
      fone: row[2],
      contatos: [row[3], row[4], row[5], row[6], row[7]].filter(Boolean)
    }));

    RESOURCE_CACHE.hospitals.data = hospitals;
    RESOURCE_CACHE.hospitals.lastFetch = now;

    res.json(hospitals);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add a new hospital
app.post("/api/app/hospitals", express.json(), async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  const { nome, fone, contatos } = req.body;

  if (!nome) return res.status(400).json({ error: "Nome do Hospital é obrigatório." });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.HOSPITAIS}!A:A`,
    });
    const nextId = (valuesRes.data.values?.length || 1).toString();

    const c1 = contatos?.[0] || "";
    const c2 = contatos?.[1] || "";
    const c3 = contatos?.[2] || "";
    const c4 = contatos?.[3] || "";
    const c5 = contatos?.[4] || "";

    await sheets.spreadsheets.values.append({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.HOSPITAIS}!A:H`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[nextId, nome, fone || "", c1, c2, c3, c4, c5]]
      }
    });

    invalidateCache("hospitals");
    res.json({ success: true, id: nextId });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get image description options
app.get("/api/app/image-options", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.OPCOES_IMAGENS}!A:A`,
    });

    const rows = valuesRes.data.values || [];
    const options = rows.slice(1).map(row => row[0]).filter(Boolean);

    res.json(options);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add a new hospital
app.post("/api/app/hospitals", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const { nome, telefone } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome é obrigatório." });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    // Get last ID
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.HOSPITAIS}!A:A`,
    });

    const rows = valuesRes.data.values || [];
    let nextId = 1;
    if (rows.length > 1) {
      const ids = rows.slice(1).map(r => parseInt(r[0])).filter(n => !isNaN(n));
      if (ids.length > 0) nextId = Math.max(...ids) + 1;
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.HOSPITAIS}!A:C`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[nextId, nome, telefone || ""]]
      }
    });

    invalidateCache("hospitals");
    res.json({ success: true, id: nextId });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get consolidated report for a specific patient without LLM
app.get("/api/app/patient-report/:id", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  const { id } = req.params;

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    const report: any = {
      cadastro: null,
      audios: [],
      imagens: [],
      familiares: []
    };

    // Use a single batchGet for all tabs
    const ranges = [
      `${SHEET_TABS.CADASTRO}!A:H`,
      `${SHEET_TABS.LOGS}!A:D`,
      `${SHEET_TABS.ARQUIVOS}!A:D`,
      `${SHEET_TABS.FAMILIARES}!A:F`
    ];

    const batchRes = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: fileId,
      ranges
    });

    const valueRanges = batchRes.data.valueRanges || [];
    const cadRows = valueRanges[0]?.values || [];
    const logRows = valueRanges[1]?.values || [];
    const imgRows = valueRanges[2]?.values || [];
    const famRows = valueRanges[3]?.values || [];

    // Process Cadastro
    const cadHeader = cadRows[0] || [];
    const cadData = cadRows.slice(1).find(row => row[0] === id || row[1] === id); 

    if (cadData) {
      report.cadastro = cadHeader.reduce((acc: any, col: string, idx: number) => {
        acc[col] = cadData[idx];
        return acc;
      }, {});
    } else {
      return res.status(404).json({ error: `Paciente '${id}' não encontrado.` });
    }

    const patientName = cadData[1];
    const patientId = cadData[0];

    // Process Logs/Audios (Evoluções - Log de Status)
    if (logRows.length > 0) {
      report.audios = logRows.slice(1)
        .filter(row => row[1] === patientId.toString() || row[2] === patientName)
        .map(row => ({ data: row[0], conteudo: row[3] }));
    }

    // Process Imagens/Arquivos (Arquivos)
    if (imgRows.length > 0) {
      report.imagens = imgRows.slice(1)
        .filter(row => row[1] === patientId.toString())
        .map(row => ({ 
          data: row[0], 
          descricao: row[2], 
          link: row[3],
          aiResposta: row[4] 
        }));
    }

    // Process Familiares
    if (famRows.length > 0) {
      report.familiares = famRows.slice(1)
        .filter(row => row[4] === patientId || row[5] === patientName)
        .map(row => ({
          id: row[0],
          nome: row[1],
          relacao: row[2],
          fone: row[3]
        }));
    }

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Register a new patient directly (Zero LLM)
app.post("/api/app/patients", express.json(), async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  const { nome, fone, idade, status, cpf, hospitalName, roomNumber } = req.body;

  if (!nome) return res.status(400).json({ error: "Nome é obrigatório." });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    // Get current rows to determine next ID (Safe Max + 1)
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.CADASTRO}!A:A`,
    });
    const rows = valuesRes.data.values || [];
    const ids = rows.slice(1).map(r => parseInt(r[0])).filter(n => !isNaN(n));
    const nextId = (ids.length > 0 ? Math.max(...ids) + 1 : 1).toString();

    // Append new patient: ID, Nome, Telefone, Idade, status_id, hospital_id, room_number, paciente_cpf
    await sheets.spreadsheets.values.append({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.CADASTRO}!A:H`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[nextId, nome, fone, idade, status || "", hospitalName || "", roomNumber || "", cpf || ""]]
      }
    });

    res.json({ success: true, id: nextId });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update patient status (Zero LLM)
app.post("/api/app/patients/status", express.json(), async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  const oauth2 = google.oauth2({ version: "v2", auth });
  const { patientId, status } = req.body;

  if (!patientId || !status) return res.status(400).json({ error: "PatientID e Status são obrigatórios." });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    // 1. Get User Info
    const userInfo = await oauth2.userinfo.get();
    const userId = userInfo.data.id || "Unknown";
    const userName = userInfo.data.name || userInfo.data.email || "Unknown User";

    // 2. Find row index for the patient ID and get the name
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.CADASTRO}!A:B`,
    });
    const rows = valuesRes.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === patientId.toString());

    if (rowIndex === -1) {
      return res.status(404).json({ error: `Paciente com ID ${patientId} não encontrado.` });
    }

    const patientName = rows[rowIndex][1];

    // 3. Update Column E (status_id) at the specific row
    const rowNumber = rowIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.CADASTRO}!E${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[status]]
      }
    });

    // 4. Log in Log de Status
    const now = new Date();
    const dateStr = `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()} ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.STATUS_LOG}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[patientId, patientName, status, dateStr]]
      }
    });

    // 5. Log in Status User
    // format: status_id, status_data, status_atual, paciente_id, paciente_nome
    const valuesStatusRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.STATUS_USER}!A:A`,
    });
    const nextStatusId = (valuesStatusRes.data.values?.length || 1).toString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.STATUS_USER}!A:E`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[nextStatusId, dateStr, status, patientId, patientName]]
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Update patient information (Generic)
app.post("/api/app/patients/update", express.json(), async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  const { id, nome, fone, idade, hospitalName, roomNumber } = req.body;

  if (!id) return res.status(400).json({ error: "ID do paciente é obrigatório." });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    // Find row index
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.CADASTRO}!A:A`,
    });
    const rows = valuesRes.data.values || [];
    const rowIndex = rows.findIndex(row => row[0] === id.toString());

    if (rowIndex === -1) {
      return res.status(404).json({ error: `Paciente com ID ${id} não encontrado.` });
    }

    const rowNumber = rowIndex + 1;
    
    // Update individual cells if provided
    if (nome) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: fileId,
        range: `${SHEET_TABS.CADASTRO}!B${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[nome]] }
      });
    }
    if (fone) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: fileId,
        range: `${SHEET_TABS.CADASTRO}!C${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[fone]] }
      });
    }
    if (idade) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: fileId,
        range: `${SHEET_TABS.CADASTRO}!D${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[idade]] }
      });
    }
    if (hospitalName !== undefined) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: fileId,
        range: `${SHEET_TABS.CADASTRO}!F${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[hospitalName]] }
      });
    }
    if (roomNumber !== undefined) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: fileId,
        range: `${SHEET_TABS.CADASTRO}!G${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[roomNumber]] }
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get all allowed statuses
app.get("/api/app/statuses", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const now = Date.now();
  if (RESOURCE_CACHE.statuses.data && (now - RESOURCE_CACHE.statuses.lastFetch < RESOURCE_CACHE.ttl)) {
    console.log("[Cache] Hit (direct route): statuses");
    return res.json(RESOURCE_CACHE.statuses.data);
  }
  console.log("[Cache] Miss (direct route): statuses");

  const sheets = google.sheets({ version: "v4", auth });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.STATUSES}!A:B`,
    });

    const rows = valuesRes.data.values || [];
    const statuses = rows.slice(1).map(row => ({
      id: row[0],
      nome: row[1] || row[0]
    })).filter(s => s.nome);

    RESOURCE_CACHE.statuses.data = statuses;
    RESOURCE_CACHE.statuses.lastFetch = now;

    res.json(statuses);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Get family members for a patient
app.get("/api/app/family-members/:patientId", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  const { patientId } = req.params;

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.FAMILIARES}!A:F`,
    });

    const rows = valuesRes.data.values || [];
    const family = rows.slice(1)
      .filter(row => row[4] === patientId || row[5] === patientId || patientId === "all")
      .map(row => ({
        id: row[0],
        nome: row[1],
        relacao: row[2],
        fone: row[3],
        pacienteId: row[4],
        pacienteNome: row[5]
      }));

    res.json(family);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Register a new family member
app.post("/api/app/family-members", express.json(), async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  const { nome, relacao, fone, patientId, paciente_nome } = req.body;

  if (!nome || !patientId) return res.status(400).json({ error: "Nome e ID do Paciente são obrigatórios." });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    let finalPatientNome = paciente_nome;
    if (!finalPatientNome) {
      const cadValuesRes = await sheets.spreadsheets.values.get({
        spreadsheetId: fileId,
        range: `${SHEET_TABS.CADASTRO}!A:B`,
      });
      const cadRows = cadValuesRes.data.values || [];
      const patientRow = cadRows.find(row => row[0] === patientId);
      if (patientRow) {
        finalPatientNome = patientRow[1];
      }
    }

    // Determine ID (Safe Max + 1)
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.FAMILIARES}!A:A`,
    });
    const rows = valuesRes.data.values || [];
    const ids = rows.slice(1).map(r => parseInt(r[0])).filter(n => !isNaN(n));
    const nextId = (ids.length > 0 ? Math.max(...ids) + 1 : 1).toString();

    // Append: [id, nome_familiar, tipo_parentesco, telefone, paciente_id, paciente_nome]
    await sheets.spreadsheets.values.append({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.FAMILIARES}!A:F`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[nextId, nome, relacao || "Não especificado", fone || "", patientId, finalPatientNome || ""]]
      }
    });

    res.json({ success: true, id: nextId });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Add a text log directly to "Log de Status" (Zero LLM)
app.post("/api/app/logs", express.json(), async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  const { patientId, text, paciente_nome } = req.body;

  if (!patientId || !text) return res.status(400).json({ error: "PatientID e Texto são obrigatórios." });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    let finalPatientNome = paciente_nome;
    if (!finalPatientNome) {
      const cadValuesRes = await sheets.spreadsheets.values.get({
        spreadsheetId: fileId,
        range: `${SHEET_TABS.CADASTRO}!A:B`,
      });
      const rows = cadValuesRes.data.values || [];
      const row = rows.find(r => r[0] === patientId.toString());
      finalPatientNome = row ? row[1] : "Paciente Desconhecido";
    }

    const now = new Date().toLocaleString("pt-BR");
    await sheets.spreadsheets.values.append({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.LOGS}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[now, patientId, finalPatientNome, text]]
      }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Upload image/document directly to Drive and link to sheet (Zero LLM)
app.post("/api/app/upload-image", express.json({ limit: "10mb" }), async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });
  const { patientId, description, fileName, mimeType, base64Data } = req.body;

  if (!patientId || !base64Data) return res.status(400).json({ error: "PatientID e Imagem são obrigatórios." });

  try {
    const fileId = await getOrCreateMasterSheet(auth);
    const folderId = await getOrCreateImagesFolder(auth);

    // 1. Upload to Drive
    const buffer = Buffer.from(base64Data, "base64");
    const driveFile = await drive.files.create({
      requestBody: {
        name: fileName || `Documento_P${patientId}_${Date.now()}`,
        mimeType: mimeType || "image/jpeg",
        parents: [folderId],
      },
      media: {
        mimeType: mimeType || "image/jpeg",
        body: Readable.from(buffer),
      },
      fields: "id, webViewLink, webContentLink",
    });

    const driveFileId = driveFile.data.id;
    const shareLink = driveFile.data.webViewLink;

    // Also set specific file permission just in case inheritance is slow
    try {
      await drive.permissions.create({
        fileId: driveFileId as string,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
      });
    } catch (e) {
      console.error("Error setting file permission:", e);
    }

    // 2. Append to master spreadsheet
    const now = new Date().toLocaleString("pt-BR");
    await sheets.spreadsheets.values.append({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.ARQUIVOS}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[now, patientId, description || "Upload Direto", shareLink]]
      }
    });

    res.json({ success: true, fileId: driveFileId, link: shareLink });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Shortcut Routes for Google APIs ---

// Calendar: List Events
app.get("/api/calendar/events", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const calendar = google.calendar({ version: "v3", auth });
  const { timeMin, timeMax } = req.query;
  
  try {
    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: (timeMin as string) || new Date().toISOString(),
      timeMax: (timeMax as string) || undefined,
      maxResults: 20,
      singleEvents: true,
      orderBy: "startTime",
      timeZone: "America/Sao_Paulo"
    });
    res.json(response.data.items);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Calendar: Create Event
app.post("/api/calendar/events", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  console.log("[Calendar] Creating event with body:", JSON.stringify(req.body, null, 2));

  const calendar = google.calendar({ version: "v3", auth });
  try {
    const response = await calendar.events.insert({
      calendarId: "primary",
      requestBody: req.body,
    });
    console.log("[Calendar] Event created successfully:", response.data.id);
    res.json(response.data);
  } catch (error) {
    console.error("[Calendar] Error creating event:", (error as any).message);
    res.status(500).json({ error: (error as Error).message });
  }
});

// Calendar: Delete Event
app.delete("/api/calendar/events/:eventId", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const calendar = google.calendar({ version: "v3", auth });
  const { eventId } = req.params;
  try {
    await calendar.events.delete({
      calendarId: "primary",
      eventId: eventId,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Drive: List Files
app.get("/api/drive/files", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const drive = google.drive({ version: "v3", auth });
  try {
    const response = await drive.files.list({
      pageSize: 10,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
    });
    res.json(response.data.files);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Sheets: Create Spreadsheet
app.post("/api/sheets/create", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  try {
    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: req.body.title || "Doctor Pro Agent Sheet" },
      },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Sheets: Get Values
app.get("/api/sheets/:spreadsheetId/values", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  const { spreadsheetId } = req.params;
  const { range } = req.query;
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: range as string,
    });
    res.json(response.data.values);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Sheets: Append Values
app.post("/api/sheets/:spreadsheetId/append", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  const { spreadsheetId } = req.params;
  const { range, values } = req.body;
  try {
    const response = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Drive: Search File by Name
app.get("/api/drive/search", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const drive = google.drive({ version: "v3", auth });
  const { name } = req.query;
  try {
    const response = await drive.files.list({
      q: `name = '${name}' and mimeType = 'application/vnd.google-apps.spreadsheet'`,
      fields: "files(id, name)",
    });
    res.json(response.data.files);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Drive: Upload File
app.post("/api/drive/upload", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const drive = google.drive({ version: "v3", auth });
  const { name, mimeType, base64Data } = req.body;

  if (!base64Data) {
    return res.status(400).json({ error: "Missing base64Data" });
  }

  try {
    const folderId = await getOrCreateImagesFolder(auth);
    const buffer = Buffer.from(base64Data, "base64");
    const response = await drive.files.create({
      requestBody: {
        name: name,
        mimeType: mimeType,
        parents: [folderId],
      },
      media: {
        mimeType: mimeType,
        body: Readable.from(buffer),
      },
      fields: "id, name, webViewLink, webContentLink",
    });

    const fileId = response.data.id;

    // Set permission so others can see it
    try {
      await drive.permissions.create({
        fileId: fileId as string,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
      });
    } catch (e) {
      console.error("Error setting file permission on generic upload:", e);
    }

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Sheets: Update Values
app.post("/api/sheets/:spreadsheetId/values", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  const { spreadsheetId } = req.params;
  const { range, values } = req.body;
  try {
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

  app.get("/api/drive/file/:fileId", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).send("Unauthorized");

  const drive = google.drive({ version: "v3", auth });

  try {
    const { fileId } = req.params;
    const metadata = await drive.files.get({ fileId, fields: "mimeType" });
    const mimeType = metadata.data.mimeType;

    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    res.setHeader("Content-Type", mimeType || "image/jpeg");
    response.data.pipe(res);
  } catch (error) {
    console.error("Error fetching file:", error);
    res.status(500).send("Error fetching file");
  }
});

app.get("/api/drive/file-base64/:fileId", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const drive = google.drive({ version: "v3", auth });
  try {
    const { fileId } = req.params;
    const metadata = await drive.files.get({ fileId, fields: "mimeType" });
    const mimeType = metadata.data.mimeType;

    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" }
    );

    const base64 = Buffer.from(response.data as ArrayBuffer).toString("base64");
    res.json({ base64, mimeType });
  } catch (error) {
    res.status(500).json({ error: "Error fetching file" });
  }
});

// --- Stripe Integration ---
app.post("/api/create-checkout-session", async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured." });
  }

  const { priceId } = req.body;
  if (!priceId) {
    return res.status(400).json({ error: "Price ID is required." });
  }

  try {
    const host = req.get("host");
    const protocol = req.get("x-forwarded-proto") || "https";
    const origin = `${protocol}://${host}`;

    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${origin}/?success=false`,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe Checkout Error:", error);
    res.status(500).json({ error: error.message });
  }
});


app.get("/api/ai/check-quota", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const fileId = await getOrCreateMasterSheet(auth);
    const today = new Date().toISOString().split('T')[0];

    const resUsage = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.AI_USAGE}!A:B`
    });

    const rows = resUsage.data.values || [];
    const todayRowIdx = rows.findIndex(r => r[0] === today);
    const currentCount = todayRowIdx !== -1 ? parseInt(rows[todayRowIdx][1] || "0") : 0;

    res.json({ count: currentCount, remaining: Math.max(0, 10 - currentCount) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/ai/save-analysis", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const { driveId, analysis } = req.body;
  if (!driveId || !analysis) return res.status(400).json({ error: "Missing driveId or analysis" });

  try {
    // 1. Quota increment
    await checkAndIncrementAIUsage(auth);

    // 2. Save to Sheets
    const sheets = google.sheets({ version: "v4", auth });
    const fileId = await getOrCreateMasterSheet(auth);

    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.ARQUIVOS}!A:E`
    });

    const rows = valuesRes.data.values || [];
    // Link column is D (index 3). We search for the driveId in the link.
    const rowIdx = rows.findIndex(r => r[3] && r[3].includes(driveId));

    if (rowIdx !== -1) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: fileId,
        range: `${SHEET_TABS.ARQUIVOS}!E${rowIdx + 1}`, // Column E is ai_resposta
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[analysis]] }
      });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Registro do arquivo não encontrado na planilha." });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/create-portal-session", async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) {
    return res.status(500).json({ error: "Stripe is not configured." });
  }

  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  try {
    const userInfo = await google.oauth2("v2").userinfo.get({ auth });
    const email = userInfo.data.email;

    if (!email) return res.status(400).json({ error: "Email for user not found" });

    // Find customer by email
    const customers = await stripeInstance.customers.list({
      email: email,
      limit: 1,
    });

    if (customers.data.length === 0) {
      return res.status(404).json({ error: "No Stripe customer found for this email." });
    }

    const host = req.get("host");
    const protocol = req.get("x-forwarded-proto") || "https";
    const origin = `${protocol}://${host}`;

    const session = await stripeInstance.billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: origin,
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Stripe Portal Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/stripe/status", async (req, res) => {
  const stripeInstance = getStripe();
  if (!stripeInstance) return res.json({ subscribed: false, configured: false });

  const auth = getAuthClient(req);
  if (!auth) return res.json({ subscribed: false, authenticated: false });

  try {
    const userInfo = await google.oauth2("v2").userinfo.get({ auth });
    const email = userInfo.data.email;

    if (!email) return res.json({ subscribed: false });

    const customers = await stripeInstance.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) return res.json({ subscribed: false });

    const subscriptions = await stripeInstance.subscriptions.list({
      customer: customers.data[0].id,
      status: "active",
      limit: 1,
    });

    res.json({ 
      subscribed: subscriptions.data.length > 0,
      customer: customers.data[0].id,
      configured: true
    });
  } catch (error) {
    res.json({ subscribed: false, error: (error as Error).message });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.VERCEL !== "1") {
  startServer();
}

export default app;
