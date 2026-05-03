import express from "express";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { Readable } from "stream";

dotenv.config();

export const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(cookieParser());

const getRedirectUri = (req?: express.Request) => {
  const host = req?.get("host") || "unknown-host";
  let protocol = req?.get("x-forwarded-proto") || "https";
  
  // Localhost fallback to http if proto not explicit
  if ((host.includes("localhost") || host.includes("127.0.0.1")) && !req?.get("x-forwarded-proto")) {
    protocol = "http";
  }

  const uri = `${protocol}://${host}/auth/callback`;
  console.log(`[OAuth] Redirect URI: ${uri}`);
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
  "https://www.googleapis.com/auth/drive.file"
];

const MASTER_SHEET_NAME = "Nexus - Banco de Dados";
const SHEET_TABS = {
  CADASTRO: "Cadastro",
  LOGS: "Atendimentos",
  ARQUIVOS: "Arquivos",
  FAMILIARES: "Familiares"
};

// --- Helper for Unifying Databases ---
const getOrCreateMasterSheet = async (auth: any) => {
  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });

  const search = await drive.files.list({
    q: `name = '${MASTER_SHEET_NAME}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: "files(id, name)",
  });

  let fileId = search.data.files?.[0]?.id;

  if (!fileId) {
    const createRes = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: MASTER_SHEET_NAME },
        sheets: [
          { properties: { title: SHEET_TABS.CADASTRO } },
          { properties: { title: SHEET_TABS.LOGS } },
          { properties: { title: SHEET_TABS.ARQUIVOS } },
          { properties: { title: SHEET_TABS.FAMILIARES } }
        ]
      }
    });
    fileId = createRes.data.spreadsheetId;

    // Initialize Headers
    await Promise.all([
      sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.CADASTRO}!A1:D1`, valueInputOption: "RAW", requestBody: { values: [["ID", "Nome", "Telefone", "Idade"]] } }),
      sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.LOGS}!A1:D1`, valueInputOption: "RAW", requestBody: { values: [["Data", "Paciente", "Conteudo", "Tipo"]] } }),
      sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.ARQUIVOS}!A1:D1`, valueInputOption: "RAW", requestBody: { values: [["Data", "Paciente", "Descricao", "Link"]] } }),
      sheets.spreadsheets.values.update({ spreadsheetId: fileId as string, range: `${SHEET_TABS.FAMILIARES}!A1:F1`, valueInputOption: "RAW", requestBody: { values: [["ID", "Nome Familiar", "Tipo de Relação", "Telefone", "ID do Paciente", "Nome do Paciente"]] } })
    ]);
  }
  
  return fileId as string;
};

// Helper to get auth client from cookie
const getAuthClient = (req: express.Request) => {
  const token = req.cookies.google_token;
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
      return res.status(500).json({ error: "Google OAuth credentials not configured in Vercel environment variables." });
    }

    const url = client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent"
    });
    res.json({ url });
  } catch (err: any) {
    console.error("Error generating auth URL:", err);
    res.status(500).json({ error: err.message || "Internal server error generating auth URL" });
  }
});

app.get("/auth/callback", async (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    console.error("Auth query error:", error);
    return res.status(403).send(`Authentication failed: ${error}. Certifique-se de que seu e-mail está na lista de 'Test Users' no Google Cloud Console.`);
  }

  const client = getOAuth2Client(req);
  if (!client) return res.status(500).send("Server configuration error: Missing Google Credentials.");

  try {
    const { tokens } = await client.getToken(code as string);
    console.log(`[OAuth] Tokens received. Expiry: ${tokens.expiry_date}`);
    
    // Only store what we need to keep cookie size small (browsers limit to ~4KB)
    const essentialTokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      scope: tokens.scope,
      token_type: tokens.token_type
    };

    res.cookie("google_token", essentialTokens, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });
    res.send(`
      <html>
        <body>
          <script>
            try {
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 1000);
              } else {
                window.location.href = '/';
              }
            } catch (e) {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. Redirecting...</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Auth token error:", error);
    const msg = (error as any).message || "Unknown error";
    res.status(500).send(`Authentication failed: ${msg}`);
  }
});

app.get("/api/auth/status", (req, res) => {
  const token = req.cookies.google_token;
  const hasToken = !!token;
  console.log(`[Auth] Status check. Token present: ${hasToken}`);
  
  res.json({ 
    isAuthenticated: hasToken,
    debug: {
      hasCookie: hasToken,
      cookieKeys: token ? Object.keys(token) : [],
      env: {
        hasClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET
      }
    }
  });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("google_token");
  res.json({ success: true });
});

// --- Direct App Shortcuts (To save tokens/LLM calls) ---

// Get all patients directly from the master sheet
app.get("/api/app/patients", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    // Get values from Cadastro tab
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.CADASTRO}!A:D`,
    });

    const rows = valuesRes.data.values || [];
    const patients = rows.slice(1).map(row => ({
      id: row[0],
      nome: row[1],
      fone: row[2],
      idade: row[3]
    }));

    res.json(patients);
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
      `${SHEET_TABS.CADASTRO}!A:D`,
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

    // Process Logs/Audios
    if (logRows.length > 0) {
      report.audios = logRows.slice(1)
        .filter(row => row[1] === patientName || row[1] === patientId)
        .map(row => ({ data: row[0], conteudo: row[2], link: row[3] }));
    }

    // Process Imagens/Arquivos
    if (imgRows.length > 0) {
      report.imagens = imgRows.slice(1)
        .filter(row => row[1] === patientName || row[1] === patientId)
        .map(row => ({ data: row[0], descricao: row[2], link: row[3] }));
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
  const { nome, fone, idade } = req.body;

  if (!nome) return res.status(400).json({ error: "Nome é obrigatório." });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    // Get current rows to determine next ID
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.CADASTRO}!A:A`,
    });
    const nextId = (valuesRes.data.values?.length || 1).toString();

    // Append new patient
    await sheets.spreadsheets.values.append({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.CADASTRO}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[nextId, nome, fone, idade]]
      }
    });

    res.json({ success: true, id: nextId });
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
  const { nome, relacao, fone, patientId, patientNome } = req.body;

  if (!nome || !patientId) return res.status(400).json({ error: "Nome e ID do Paciente são obrigatórios." });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    let finalPatientNome = patientNome;
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

    // Determine ID
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.FAMILIARES}!A:A`,
    });
    const nextId = (valuesRes.data.values?.length || 1).toString();

    // Append: [ID, Nome Familiar, Tipo de Relação, Telefone, ID do Paciente, Nome do Paciente]
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

// Add a text log directly to "Pacientes - Áudios" (Zero LLM)
app.post("/api/app/logs", express.json(), async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const sheets = google.sheets({ version: "v4", auth });
  const { patientId, text } = req.body;

  if (!patientId || !text) return res.status(400).json({ error: "PatientID e Texto são obrigatórios." });

  try {
    const fileId = await getOrCreateMasterSheet(auth);

    const now = new Date().toLocaleString("pt-BR");
    await sheets.spreadsheets.values.append({
      spreadsheetId: fileId,
      range: `${SHEET_TABS.LOGS}!A:D`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[now, patientId, text, "REGISTRO_TEXTO"]]
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

    // 1. Upload to Drive
    const buffer = Buffer.from(base64Data, "base64");
    const driveFile = await drive.files.create({
      requestBody: {
        name: fileName || `Documento_P${patientId}_${Date.now()}`,
        mimeType: mimeType || "image/jpeg",
      },
      media: {
        mimeType: mimeType || "image/jpeg",
        body: Readable.from(buffer),
      },
      fields: "id, webViewLink, webContentLink",
    });

    const driveFileId = driveFile.data.id;
    const shareLink = driveFile.data.webViewLink;

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
        properties: { title: req.body.title || "Nexus Agent Sheet" },
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
    const buffer = Buffer.from(base64Data, "base64");
    const response = await drive.files.create({
      requestBody: {
        name: name,
        mimeType: mimeType,
      },
      media: {
        mimeType: mimeType,
        body: Readable.from(buffer),
      },
      fields: "id, name, webViewLink",
    });
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
