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
    res.cookie("google_token", tokens, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
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
  res.json({ isAuthenticated: !!token });
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

  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });

  try {
    // 1. Find the master sheet
    const searchRes = await drive.files.list({
      q: "name = 'Pacientes - Cadastro' and mimeType = 'application/vnd.google-apps.spreadsheet'",
      fields: "files(id, name)",
    });

    const file = searchRes.data.files?.[0];
    if (!file?.id) return res.status(404).json({ error: "Planilha 'Pacientes - Cadastro' não encontrada." });

    // 2. Get values (A: ID, B: Nome, C: Telefone, D: Idade)
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: file.id,
      range: "A:D",
    });

    const rows = valuesRes.data.values || [];
    // Skip header and map to objects
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

  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });
  const { id } = req.params;

  try {
    // 1. Find all relevant sheets
    const searchRes = await drive.files.list({
      q: "(name = 'Pacientes - Cadastro' or name = 'Pacientes - Áudios' or name = 'Pacientes - Imagens') and mimeType = 'application/vnd.google-apps.spreadsheet'",
      fields: "files(id, name)",
    });

    const files = searchRes.data.files || [];
    const cadastroSheet = files.find(f => f.name === "Pacientes - Cadastro");
    const audiosSheet = files.find(f => f.name === "Pacientes - Áudios");
    const imagensSheet = files.find(f => f.name === "Pacientes - Imagens");

    if (!cadastroSheet) return res.status(404).json({ error: "Planilha 'Pacientes - Cadastro' não encontrada." });

    const report: any = {
      cadastro: null,
      audios: [],
      imagens: []
    };

    // 2. Fetch data from Cadastro (A:D)
    const cadRes = await sheets.spreadsheets.values.get({ spreadsheetId: cadastroSheet.id!, range: "A:D" });
    const cadRows = cadRes.data.values || [];
    const cadHeader = cadRows[0] || [];
    const cadData = cadRows.slice(1).find(row => row[0] === id || row[1] === id); // Match ID or Name

    if (cadData) {
      // Return key-value pairs based on header
      report.cadastro = cadHeader.reduce((acc: any, col: string, idx: number) => {
        acc[col] = cadData[idx];
        return acc;
      }, {});
    } else {
      return res.status(404).json({ error: `Paciente '${id}' não encontrado no Cadastro.` });
    }

    const patientName = cadData[1]; // Use canonical Name for secondary sheet lookups

    // 3. Fetch data from Áudios and Imagens in parallel
    const [audioRes, imgRes] = await Promise.all([
      audiosSheet ? sheets.spreadsheets.values.get({ spreadsheetId: audiosSheet.id!, range: "A:E" }) : Promise.resolve({ data: { values: [] } }),
      imagensSheet ? sheets.spreadsheets.values.get({ spreadsheetId: imagensSheet.id!, range: "A:E" }) : Promise.resolve({ data: { values: [] } })
    ]);

    // Process Audios
    const audioRows = audioRes.data.values || [];
    const audioIdx = audioRows[0]?.indexOf("Paciente");
    if (audioIdx !== -1) {
      report.audios = audioRows.slice(1)
        .filter(row => row[audioIdx] === patientName || row[audioIdx] === id)
        .map(row => ({ data: row[0], conteudo: row[2], link: row[3] }));
    }

    // Process Imagens
    const imgRows = imgRes.data.values || [];
    const imgIdx = imgRows[0]?.indexOf("Paciente");
    if (imgIdx !== -1) {
      report.imagens = imgRows.slice(1)
        .filter(row => row[imgIdx] === patientName || row[imgIdx] === id)
        .map(row => ({ data: row[0], descricao: row[2], link: row[3] }));
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

  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });
  const { nome, fone, idade } = req.body;

  if (!nome) return res.status(400).json({ error: "Nome é obrigatório." });

  try {
    const searchRes = await drive.files.list({
      q: "name = 'Pacientes - Cadastro' and mimeType = 'application/vnd.google-apps.spreadsheet'",
      fields: "files(id, name)",
    });

    const file = searchRes.data.files?.[0];
    if (!file?.id) return res.status(404).json({ error: "Planilha 'Pacientes - Cadastro' não encontrada." });

    // Get current rows to determine next ID
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId: file.id,
      range: "A:A",
    });
    const nextId = (valuesRes.data.values?.length || 1).toString();

    // Append new patient: [ID, Nome, Telefone, Idade]
    await sheets.spreadsheets.values.append({
      spreadsheetId: file.id,
      range: "A:D",
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

// Add a text log directly to "Pacientes - Áudios" (Zero LLM)
app.post("/api/app/logs", express.json(), async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const drive = google.drive({ version: "v3", auth });
  const sheets = google.sheets({ version: "v4", auth });
  const { patientId, text } = req.body;

  if (!patientId || !text) return res.status(400).json({ error: "PatientID e Texto são obrigatórios." });

  try {
    // 1. Find the target sheet
    const searchRes = await drive.files.list({
      q: "name = 'Pacientes - Áudios' and mimeType = 'application/vnd.google-apps.spreadsheet'",
      fields: "files(id, name)",
    });

    const file = searchRes.data.files?.[0];
    if (!file?.id) return res.status(404).json({ error: "Planilha 'Pacientes - Áudios' não encontrada." });

    // 2. Append: [Date, PatientID/Name, Content, Link/Type]
    const now = new Date().toLocaleString("pt-BR");
    await sheets.spreadsheets.values.append({
      spreadsheetId: file.id,
      range: "A:D",
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

    const fileId = driveFile.data.id;
    const shareLink = driveFile.data.webViewLink;

    // 2. Find "Pacientes - Imagens" sheet
    const searchRes = await drive.files.list({
      q: "name = 'Pacientes - Imagens' and mimeType = 'application/vnd.google-apps.spreadsheet'",
      fields: "files(id, name)",
    });

    const sheetFile = searchRes.data.files?.[0];
    if (sheetFile?.id) {
      // 3. Append: [Date, Patient, Description, Link]
      const now = new Date().toLocaleString("pt-BR");
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetFile.id,
        range: "A:D",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[now, patientId, description || "Upload Direto", shareLink]]
        }
      });
    }

    res.json({ success: true, fileId, link: shareLink });
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
