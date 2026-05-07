import express from "express";
import { google } from "googleapis";
import cookieParser from "cookie-parser";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { Readable } from "stream";
import Stripe from "stripe";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

dotenv.config();

let firebaseConfig: any = {};
try {
  const firebaseConfigPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(firebaseConfigPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
  } else {
    console.warn("[Firebase] Config file not found at:", firebaseConfigPath);
  }
} catch (e) {
  console.error("[Firebase] Failed to load config:", e);
}

// Initialize Firebase Admin lazily or at module level but safely
if (firebaseConfig.projectId && !admin.apps.length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
      try {
        const cert = JSON.parse(serviceAccount);
        admin.initializeApp({
          credential: admin.credential.cert(cert),
          projectId: firebaseConfig.projectId,
          storageBucket: firebaseConfig.storageBucket
        });
        console.log("[Firebase] Admin initialized with service account from env.");
      } catch (jsonErr) {
        console.error("[Firebase] FIREBASE_SERVICE_ACCOUNT parsing error:", jsonErr);
        // Fallback to default
        admin.initializeApp({ projectId: firebaseConfig.projectId });
      }
    } else {
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket
      });
      console.log("[Firebase] Admin initialized with projectId (ADC):", firebaseConfig.projectId);
    }
  } catch (e) {
    console.error("[Firebase] Admin initialization error:", e);
  }
}

const _getDb = () => {
  if (!admin.apps.length) {
    throw new Error("Firebase Admin not initialized. Ensure firebase-applet-config.json exists or FIREBASE_SERVICE_ACCOUNT is set in environment.");
  }
  if (!firebaseConfig.firestoreDatabaseId) {
    throw new Error("Firestore Database ID is not configured in firebase-applet-config.json");
  }
  return getFirestore(firebaseConfig.firestoreDatabaseId);
};

const _getStorage = () => {
  if (!admin.apps.length) {
    throw new Error("Firebase Admin not initialized.");
  }
  return getStorage().bucket();
};

// Use a Proxy to make 'db' and 'bucket' lazy and avoid module-load crashes
const db = new Proxy({} as any, {
  get(target, prop) {
    if (!target._instance) {
      target._instance = _getDb();
    }
    return target._instance[prop];
  }
}) as admin.firestore.Firestore;

const bucket = new Proxy({} as any, {
  get(target, prop) {
    if (!target._instance) {
      target._instance = _getStorage();
    }
    return target._instance[prop];
  }
}) as any;

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

const logQuotaUsage = async (auth: any, path: string, method: string) => {
  // Logic to log quota usage by user identity could be implemented here
  // For now, it's a placeholder to satisfy the middleware calls
  return;
};

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
  "https://www.googleapis.com/auth/calendar.events"
];

// Resource caching to reduce consumption
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

// --- Auth Helpers ---

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

const getGroupId = (req: express.Request) => {
  return req.headers["x-group-id"]?.toString() || null;
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
    if (!firebaseConfig || !firebaseConfig.projectId) {
      console.error("Firebase config is missing or invalid at startup");
      return res.status(500).json({ 
        error: "Server configuration error: Firebase configuration not found.",
        details: "Ensure firebase-applet-config.json is present in the project root."
      });
    }

    const client = getOAuth2Client(req);
    if (!client) {
      console.error("Auth client initialization failed: missing credentials");
      return res.status(500).json({ 
        error: "Google OAuth credentials not configured.",
        details: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
      });
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

app.get("/api/auth/firebase-token", async (req, res) => {
  const authClient = getAuthClient(req);
  if (!authClient) return res.status(401).json({ error: "Unauthorized" });

  try {
    const oauth2 = google.oauth2({ version: "v2", auth: authClient });
    const userRes = await oauth2.userinfo.get();
    const { id, email, name, picture } = userRes.data;

    if (!id) throw new Error("No user ID found");

    // Ensure User exists in Firebase Auth with correct metadata
    try {
      await admin.auth().updateUser(id, {
        email: email || undefined,
        displayName: name || undefined,
        photoURL: picture || undefined,
        emailVerified: true
      });
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        await admin.auth().createUser({
          uid: id,
          email: email || undefined,
          displayName: name || undefined,
          photoURL: picture || undefined,
          emailVerified: true
        });
      }
    }

    const customToken = await admin.auth().createCustomToken(id, { email, name });
    
    // Also upsert user profile in Firestore
    await db.collection("users").doc(id).set({
      uid: id,
      email: email || "",
      name: name || "",
      photoURL: picture || "",
      lastSeen: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    res.json({ customToken });
  } catch (err: any) {
    console.error("[Firebase] Error in /api/auth/firebase-token:", err);
    res.status(500).json({ 
      error: err.message, 
      details: "This error usually means the Firebase Admin SDK is not correctly initialized with a Service Account which is required for createCustomToken on external platforms like Vercel."
    });
  }
});

app.get("/api/auth/status", (req, res) => {
  try {
    const token = req.cookies[COOKIE_NAME] || req.cookies[LEGACY_COOKIE_NAME] || req.cookies["n_session_p"] || req.cookies["n_session_u"] || req.cookies["google_token"];
    res.json({ 
      isAuthenticated: !!token,
      debug: {
        hasPartitioned: !!req.cookies[COOKIE_NAME],
        hasLegacy: !!req.cookies[LEGACY_COOKIE_NAME],
        cookieCount: Object.keys(req.cookies || {}).length,
        allCookies: Object.keys(req.cookies || {}),
        ua: req.headers["user-agent"],
        configLoaded: !!firebaseConfig.projectId,
        hasServiceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT
      }
    });
  } catch (err: any) {
    console.error("Error in auth status:", err);
    res.status(500).json({ error: "Internal server error fetching auth status" });
  }
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

// --- Firestore Data Operations ---

// --- Migration and Legacy Helpers removed ---

const handleApiError = (res: express.Response, error: any, context: string) => {
  console.error(`[API Error] ${context}:`, error);
  const errorMessage = error.message || "Internal Server Error";
  
  let details = undefined;
  if (errorMessage.includes("credentials") || 
      errorMessage.includes("initialized") || 
      errorMessage.includes("no-app") ||
      error.code === "ERR_OSSL_PEM_NO_START_LINE") {
    details = "Firebase initialization error. This usually means the Service Account is missing or invalid. On Vercel, set the FIREBASE_SERVICE_ACCOUNT environment variable to the JSON content of your service account key.";
  }

  res.status(500).json({ 
    error: errorMessage,
    context,
    details
  });
};

// Get all patients directly from Firestore
app.get("/api/app/patient-contacts/:patientId", async (req, res) => {
  const { patientId } = req.params;
  try {
    const snap = await db.collection("patients_contacts").where("patientId", "==", patientId).get();
    const contacts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/app/patient-logs", express.json(), async (req, res) => {
  const { patientId, text } = req.body;
  if (!patientId || !text) {
    return res.status(400).json({ error: "patientId and text are required" });
  }
  try {
    const docRef = db.collection("patient_logs").doc();
    const newLog = {
      id: docRef.id,
      patientId: patientId.toString(),
      text,
      type: "text",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await docRef.set(newLog);
    res.json(newLog);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/app/patient-contacts", express.json(), async (req, res) => {
  const { patientId, name, relationship, phone } = req.body;
  if (!patientId || !name) {
    return res.status(400).json({ error: "patientId and name are required" });
  }
  try {
    const docRef = db.collection("patients_contacts").doc();
    const newContact = {
      id: docRef.id,
      patientId: patientId.toString(),
      name,
      relationship: relationship || "",
      phone: phone || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await docRef.set(newContact);
    res.json(newContact);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.get("/api/app/patients", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  try {
    let patientsQuery: admin.firestore.Query = db.collection("patients").where("groupId", "==", groupId);
    const hFilter = req.query.hospitalId?.toString();
    const sFilter = req.query.statusId?.toString();

    // Use a more robust approach for filtering that handles both string and number IDs
    // and correctly handles "1" (which should be a filter, not "all").
    // We prioritize allowing both filters at once.
    
    if (hFilter && hFilter !== "all" && hFilter !== "" && hFilter !== "1") { // Keeping '1' skip for hospital as it might be 'all' in some UI
      const numericH = parseInt(hFilter);
      if (!isNaN(numericH)) {
        patientsQuery = patientsQuery.where("hospitalId", "in", [hFilter, numericH]);
      } else {
        patientsQuery = patientsQuery.where("hospitalId", "==", hFilter);
      }
    }

    if (sFilter && sFilter !== "all" && sFilter !== "" && sFilter !== "1") {
      const numericS = parseInt(sFilter);
      if (!isNaN(numericS)) {
        // If we already have an 'in' filter from hospital, we can't add another.
        // We'll check if surgeryQuery already has an 'in' (approximate check via internal state or just try-catch)
        try {
          patientsQuery = patientsQuery.where("statusId", "in", [sFilter, numericS]);
        } catch (e) {
          // Fallback if we exceeded 'in' limits
          patientsQuery = patientsQuery.where("statusId", "==", sFilter);
        }
      } else {
        patientsQuery = patientsQuery.where("statusId", "==", sFilter);
      }
    } else if (hFilter && hFilter !== "all" && hFilter !== "" && hFilter !== "1") {
      // If hospital is filtered but status is NOT, original code excluded '5'
      // This is a business rule we should semi-keep but maybe only if they didn't explicitly ask for all statuses
      // patientsQuery = patientsQuery.where("statusId", "!=", "5"); // Removing for now to be less restrictive as it caused confusion
    }

    const [patientsSnap, hospitalsSnap, statusesSnap] = await Promise.all([
      patientsQuery.get(),
      db.collection("hospitals").get(),
      db.collection("patient_statuses").get()
    ]);

    const hMap = Object.fromEntries(hospitalsSnap.docs.map(doc => [doc.id, doc.data().name]));
    const sMap = Object.fromEntries(statusesSnap.docs.map(doc => [doc.id, doc.data().name]));

    const patients = patientsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        nome: data.name, // Map name to nome for frontend
        hospitalName: hMap[data.hospitalId] || data.hospitalId || "Sem Hospital",
        status: sMap[data.statusId] || data.statusId || "Não informado"
      };
    });

    if (req.query.full === "true") {
      const sortedStatuses = statusesSnap.docs.map(d => {
        const sData = d.data();
        return { id: d.id, ...sData, nome: sData.name };
      }).sort((a, b) => (parseInt(a.id) || 0) - (parseInt(b.id) || 0));

      res.json({
        patients,
        hospitals: hospitalsSnap.docs.map(d => {
          const hData = d.data();
          return { id: d.id, ...hData, nome: hData.name };
        }),
        statuses: sortedStatuses
      });
    } else {
      res.json(patients);
    }
  } catch (error) {
    handleApiError(res, error, "Fetching patients");
  }
});

// Get app settings
app.get("/api/app/settings", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  try {
    const doc = await db.collection("settings").doc(groupId).get();
    const data = doc.data() || {};

    res.json({
      companyName: data.companyName || "Doctor Pro",
      whatsappNumber: data.whatsappNumber || ""
    });
  } catch (error) {
    handleApiError(res, error, "Fetching settings");
  }
});

// Update app settings
app.post("/api/app/settings", async (req, res) => {
  const { companyName, whatsappNumber } = req.body;
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  try {
    await db.collection("settings").doc(groupId).set({
      companyName: companyName || "",
      whatsappNumber: whatsappNumber || "",
      groupId
    }, { merge: true });
    res.json({ status: "ok" });
  } catch (error) {
    handleApiError(res, error, "Updating settings");
  }
});

// Hospital and Backup routes removed or simplified

// Get all hospitals
app.get("/api/app/hospitals", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  try {
    const snap = await db.collection("hospitals").where("groupId", "==", groupId).get();
    const hospitals = snap.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data, nome: data.name };
    });
    res.json(hospitals);
  } catch (error) {
    handleApiError(res, error, "Fetching hospitals");
  }
});

// Add a new hospital
app.post("/api/app/hospitals", express.json(), async (req, res) => {
  const { nome, fone, contatos } = req.body;
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  if (!nome) return res.status(400).json({ error: "Nome do Hospital é obrigatório." });

  try {
    const hospitalRef = db.collection("hospitals").doc();
    await hospitalRef.set({
      id: hospitalRef.id,
      name: nome,
      phone: fone || "",
      contacts: contatos || [],
      groupId
    });

    res.json({ success: true, id: hospitalRef.id });
  } catch (error) {
    handleApiError(res, error, "Adding hospital");
  }
});

// Get image description options
app.get("/api/app/image-options", async (req, res) => {
  try {
    const snap = await db.collection("image_options").get();
    const options = snap.docs.map(doc => doc.data().name);
    if (options.length === 0) {
      return res.json(["Prescrição", "Exame", "Relatório", "Outros"]);
    }
    res.json(options);
  } catch (error) {
    handleApiError(res, error, "Fetching image options");
  }
});

// Get consolidated report for a specific patient without LLM
app.get("/api/app/patient-report/:id", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  const { id } = req.params;

  try {
    const report: any = {
      cadastro: null,
      audios: [],
      imagens: [],
      familiares: []
    };

    const [contactsSnap, logsSnap, filesSnap, patientSnap, statusesSnap, activityLogsSnap, hospitalsSnap] = await Promise.all([
      db.collection("patients_contacts").where("patientId", "==", id).get(),
      db.collection("patient_logs").where("patientId", "==", id).orderBy("createdAt", "desc").get(),
      db.collection("files").where("patientId", "==", id).orderBy("timestamp", "desc").get(),
      db.collection("patients").doc(id).get(),
      db.collection("patient_statuses").get(),
      db.collection("logs").where("patientId", "==", id).orderBy("timestamp", "desc").get(),
      db.collection("hospitals").get()
    ]);

    const statusesMap = new Map();
    statusesSnap.docs.forEach(doc => {
      const data = doc.data();
      statusesMap.set(doc.id, data.name || data.nome);
    });

    const hospitalsMap = new Map();
    hospitalsSnap.docs.forEach(doc => {
      const data = doc.data();
      hospitalsMap.set(doc.id, data.name || data.nome);
    });

    if (patientSnap.exists) {
      const pData = patientSnap.data()!;
      report.cadastro = {
        ID: id,
        Nome: pData.name,
        Telefone: pData.phone,
        Idade: pData.age,
        Status: statusesMap.get(pData.statusId) || pData.statusId || pData.status,
        hospitalName: hospitalsMap.get(pData.hospitalId) || pData.hospitalId,
        roomNumber: pData.roomNumber
      };
    } else {
      return res.status(404).json({ error: `Paciente '${id}' não encontrado.` });
    }

    // Process Files/Images
    report.imagens = filesSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        data: data.timestamp ? data.timestamp.toDate().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Recent",
        descricao: data.description || "Arquivo",
        link: data.link,
        aiResposta: data.aiAnalysis || ""
      };
    });

    // Process Clinical Logs (patient_logs)
    report.audios = logsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        conteudo: data.text,
        tipo: data.type || "texto",
        data: data.createdAt ? data.createdAt.toDate().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Recent"
      };
    });

    // Add Activity Logs (status changes etc)
    activityLogsSnap.docs.forEach(doc => {
      const data = doc.data();
      report.audios.push({
        id: doc.id,
        conteudo: data.description,
        tipo: "atividade",
        data: data.timestamp ? data.timestamp.toDate().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Recent"
      });
    });

    // Sort logs by date after merging
    report.audios.sort((a: any, b: any) => new Date(b.data).getTime() - new Date(a.data).getTime());

    // Process Family Members
    report.familiares = contactsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        nome: data.name,
        relacao: data.relationship,
        fone: data.phone
      };
    });

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// Register a new patient directly (Zero LLM)
app.post("/api/app/patients", express.json(), async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  const { nome, fone, idade, status, cpf, hospitalName, roomNumber } = req.body;

  if (!nome) return res.status(400).json({ error: "Nome é obrigatório." });

  try {
    const patientRef = db.collection("patients").doc();
    await patientRef.set({
      name: nome,
      phone: fone || "",
      age: idade || "",
      statusId: status?.toString() || "5",
      cpf: cpf || "",
      hospitalId: hospitalName?.toString() || "",
      roomNumber: roomNumber || "",
      groupId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, id: patientRef.id });
  } catch (error) {
    handleApiError(res, error, "Registering patient");
  }
});

// Update patient status (Zero LLM)
app.post("/api/app/patients/status", express.json(), async (req, res) => {
  const authClient = getAuthClient(req);
  if (!authClient) return res.status(401).json({ error: "Unauthorized" });

  const { patientId, status, statusName } = req.body;

  if (!patientId || !status) return res.status(400).json({ error: "PatientID e Status são obrigatórios." });

  try {
    const oauth2 = google.oauth2({ version: "v2", auth: authClient });
    const userInfo = await oauth2.userinfo.get();
    const userName = userInfo.data.name || userInfo.data.email || "Unknown User";

    const patientRef = db.collection("patients").doc(patientId);
    const patientDoc = await patientRef.get();

    if (!patientDoc.exists) {
      return res.status(404).json({ error: `Paciente com ID ${patientId} não encontrado.` });
    }

    const patientData = patientDoc.data()!;
    const patientName = patientData.name;
    const finalStatusName = statusName || status;

    await db.runTransaction(async (t) => {
      t.update(patientRef, { 
        statusId: status.toString(), 
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });

      const logRef = db.collection("logs").doc();
      t.set(logRef, {
        patientId,
        patientName,
        description: `Status alterado para ${finalStatusName} por ${userName}`,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      const statusUserRef = db.collection("status_history").doc();
      t.set(statusUserRef, {
        patientId,
        patientName,
        status: finalStatusName,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Updating patient status");
  }
});

// Update patient information (Generic)
app.post("/api/app/patients/update", express.json(), async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Unauthorized" });

  const { id, nome, fone, idade, hospitalName, roomNumber, status } = req.body;

  if (!id) return res.status(400).json({ error: "ID do paciente é obrigatório." });

  try {
    const patientRef = db.collection("patients").doc(id);
    const updateData: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (nome) updateData.name = nome;
    if (fone) updateData.phone = fone;
    if (idade) updateData.age = idade;
    if (hospitalName !== undefined) updateData.hospitalId = hospitalName.toString();
    if (roomNumber !== undefined) updateData.roomNumber = roomNumber;
    if (status !== undefined) updateData.statusId = status.toString();

    await patientRef.update(updateData);

    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Updating patient info");
  }
});

// Get all allowed statuses
app.get("/api/app/statuses", async (req, res) => {
  const groupId = getGroupId(req);
  // Statuses could be global, but if they have groupId and rules check it, we need to filter or allow global
  try {
    const statusesSnap = await db.collection("patient_statuses").orderBy("id").get();
    const statuses = statusesSnap.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data, nome: data.name };
    });
    res.json(statuses);
  } catch (error) {
    handleApiError(res, error, "Fetching statuses");
  }
});

// Get family members for a patient
app.get("/api/app/family-members/:patientId", async (req, res) => {
  const { patientId } = req.params;
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  try {
    let query: admin.firestore.Query = db.collection("family_members");
    if (patientId !== "all") {
      query = query.where("patientId", "==", patientId);
    } else {
      // If listing all, we should probably still filter by groupId if we had it there
      // But rules will catch it. For better performance/safety:
      // query = query.where("groupId", "==", groupId); // If we add groupId to family_members
    }

    const snap = await query.get();
    const family = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.json(family);
  } catch (error) {
    handleApiError(res, error, "Fetching family members");
  }
});

// Register a new family member
app.post("/api/app/family-members", express.json(), async (req, res) => {
  const { nome, relacao, fone, patientId, paciente_nome } = req.body;

  if (!nome || !patientId) return res.status(400).json({ error: "Nome e ID do Paciente são obrigatórios." });

  try {
    let finalPatientNome = paciente_nome;
    if (!finalPatientNome) {
      const patientDoc = await db.collection("patients").doc(patientId).get();
      finalPatientNome = patientDoc.data()?.name || "Unknown";
    }

    const memberRef = db.collection("family_members").doc();
    await memberRef.set({
      name: nome,
      relationship: relacao || "",
      phone: fone || "",
      patientId,
      patientName: finalPatientNome
    });

    res.json({ success: true, id: memberRef.id });
  } catch (error) {
    handleApiError(res, error, "Adding family member");
  }
});
// Add a log entry for a patient
app.post("/api/app/logs", express.json(), async (req, res) => {
  const { patientId, text, paciente_nome } = req.body;
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  if (!patientId || !text) return res.status(400).json({ error: "PatientID e Texto são obrigatórios." });

  try {
    let finalPatientNome = paciente_nome;
    if (!finalPatientNome) {
      const patientDoc = await db.collection("patients").doc(patientId).get();
      const pData = patientDoc.data();
      if (pData?.groupId !== groupId) throw new Error("Unauthorized group access");
      finalPatientNome = pData?.name || "Paciente Desconhecido";
    }

    const logRef = db.collection("logs").doc();
    await logRef.set({
      patientId,
      patientName: finalPatientNome,
      description: text,
      groupId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, id: logRef.id });
  } catch (error) {
    handleApiError(res, error, "Adding log entry");
  }
});

// Upload image/document directly to Firebase Storage and link to Firestore
app.post("/api/app/upload-image", express.json({ limit: "15mb" }), async (req, res) => {
  const { patientId, description, fileName, mimeType, base64Data } = req.body;

  if (!patientId || !base64Data) return res.status(400).json({ error: "PatientID e Imagem são obrigatórios." });

  try {
    // 1. Upload to Firebase Storage
    const buffer = Buffer.from(base64Data, "base64");
    const filename = fileName || `Documento_P${patientId}_${Date.now()}.jpg`;
    const destination = `patients/${patientId}/${filename}`;
    const file = bucket.file(destination);

    await file.save(buffer, {
      metadata: {
        contentType: mimeType || "image/jpeg",
        metadata: {
          patientId: patientId,
          description: description || ""
        }
      }
    });

    // Make public and get URL
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(destination)}`;

    // 2. Save metadata to Firestore
    const fileRef = db.collection("files").doc();
    await fileRef.set({
      patientId,
      description: description || "Upload Direto",
      link: publicUrl,
      storagePath: destination,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, fileId: fileRef.id, link: publicUrl });
  } catch (error) {
    handleApiError(res, error, "Uploading image to Storage");
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

// Generic Storage Upload
app.post("/api/storage/upload", express.json({ limit: "15mb" }), async (req, res) => {
  const { name, mimeType, base64Data } = req.body;

  if (!base64Data) {
    return res.status(400).json({ error: "Missing base64Data" });
  }

  try {
    const buffer = Buffer.from(base64Data, "base64");
    const filename = name || `Upload_${Date.now()}.jpg`;
    const destination = `uploads/${filename}`;
    const file = bucket.file(destination);

    await file.save(buffer, {
      metadata: {
        contentType: mimeType || "image/jpeg"
      }
    });

    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(destination)}`;

    res.json({
      id: file.name,
      name: file.name,
      webViewLink: publicUrl,
      webContentLink: publicUrl
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
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
  try {
    const today = new Date().toISOString().split('T')[0];
    const quotaRef = db.collection("ai_usage").doc(today);
    const quotaDoc = await quotaRef.get();
    
    const currentCount = quotaDoc.exists ? (quotaDoc.data()?.UsageCount || 0) : 0;

    res.json({ count: currentCount, remaining: Math.max(0, 10 - currentCount) });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/ai/save-analysis", async (req, res) => {
  const { fileId, analysis } = req.body;
  if (!fileId || !analysis) return res.status(400).json({ error: "Missing fileId or analysis" });

  try {
    // 1. Quota increment in Firestore
    const today = new Date().toISOString().split('T')[0];
    const quotaRef = db.collection("ai_usage").doc(today);
    
    await db.runTransaction(async (t) => {
      const quotaDoc = await t.get(quotaRef);
      const currentCount = quotaDoc.exists ? (quotaDoc.data()?.UsageCount || 0) : 0;
      
      if (currentCount >= 10) {
        throw new Error("Cota diária de IA atingida.");
      }
      
      t.set(quotaRef, { 
        UsageCount: currentCount + 1,
        date: today
      }, { merge: true });
    });

    // 2. Save analysis to the file document in Firestore
    const fileRef = db.collection("files").doc(fileId);
    await fileRef.update({
      aiAnalysis: analysis,
      analyzedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
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
