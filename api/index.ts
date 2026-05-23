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
  const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
  return getFirestore(dbId);
};

const _getStorage = () => {
  if (!admin.apps.length) {
    throw new Error("Firebase Admin not initialized.");
  }
  
  // Return the default bucket from admin.initializeApp config
  // In the upload route we have more complex retry logic anyway
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
  "profile"
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

// Cache for user ID to avoid redundant userinfo.get() calls
const userIdCache = new Map<string, { id: string; expires: number }>();

const getUserId = async (req: express.Request) => {
  const token = req.cookies[COOKIE_NAME] || req.cookies[LEGACY_COOKIE_NAME];
  if (!token) return null;
  
  // Hash the token for cache key
  const cacheKey = JSON.stringify(token);
  const cached = userIdCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.id;
  }

  const authClient = getAuthClient(req);
  if (!authClient) return null;
  try {
    const oauth2 = google.oauth2({ version: "v2", auth: authClient });
    const userRes = await oauth2.userinfo.get();
    const id = userRes.data.id;
    if (id) {
      userIdCache.set(cacheKey, { id, expires: Date.now() + 5 * 60 * 1000 }); // 5 min cache
      return id;
    }
    return null;
  } catch (e) {
    console.error("[API] Error getting user ID:", e);
    return null;
  }
};

const verifyMembership = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const groupId = getRequestGroupId(req);
    if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
    
    const { user, group, member } = await requireGroupMember(req, groupId);
    (req as any).user = user;
    (req as any).group = group;
    (req as any).member = member;
    next();
  } catch (err: any) {
    console.error("[verifyMembership] Failed:", err.message);
    const code = err.statusCode || 401;
    res.status(code).json({ error: err.message || "Unauthorized" });
  }
};

const getAuthenticatedUser = async (req: express.Request) => {
  // 1. Try Firebase Bearer Token
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const idToken = authHeader.split("Bearer ")[1];
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      if (decodedToken && decodedToken.uid) {
        return { uid: decodedToken.uid, email: decodedToken.email || "", source: "firebase" };
      }
    } catch (err) {
      console.warn("[Auth] Firebase Bearer token verification failed:", err);
    }
  }

  // 2. Fallback to Google OAuth Cookie
  try {
    const oauthUser = await getUserId(req);
    if (oauthUser) {
      const authClient = getAuthClient(req);
      let email = "";
      if (authClient) {
        try {
          const oauth2 = google.oauth2({ version: "v2", auth: authClient });
          const userRes = await oauth2.userinfo.get();
          email = userRes.data.email || "";
        } catch (err) {
          console.warn("[Auth] Failed to fetch email from userinfo:", err);
        }
      }
      return { uid: oauthUser, email: email, source: "cookie" };
    }
  } catch (err) {
    console.error("[Auth] Google cookie verification failed:", err);
  }

  return null;
};

const requireAuth = async (req: express.Request) => {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    const err = new Error("Unauthorized");
    (err as any).statusCode = 401;
    throw err;
  }
  return user;
};

const getRequestGroupId = (req: express.Request) => {
  return (
    req.headers["x-group-id"]?.toString() ||
    req.query.groupId?.toString() ||
    req.body.groupId?.toString() ||
    null
  );
};

const requireGroupMember = async (req: express.Request, groupId: string | null) => {
  const user = await requireAuth(req);
  if (!groupId) {
    const err = new Error("Active Group ID is required");
    (err as any).statusCode = 400;
    throw err;
  }

  const groupDoc = await db.collection("groups").doc(groupId).get();
  if (!groupDoc.exists) {
    const err = new Error("Group not found");
    (err as any).statusCode = 404;
    throw err;
  }
  const groupData = groupDoc.data();
  if (groupData?.status === "terminated") {
    const err = new Error("Group is terminated");
    (err as any).statusCode = 403;
    throw err;
  }

  // 1. Check member document
  const memberDoc = await db.collection("groups").doc(groupId).collection("members").doc(user.uid).get();
  if (memberDoc.exists) {
    const mData = memberDoc.data();
    if (mData?.status === "active" || mData?.status === "conectado") {
      return { user, group: groupData, member: mData };
    }
  }

  // 2. Creator check
  if (groupData?.createdBy === user.uid) {
    return { user, group: groupData, member: null };
  }

  // 3. Email fallback
  if (user.email) {
    const membersByEmailSnap = await db.collection("groups").doc(groupId).collection("members")
      .where("userEmail", "==", user.email.trim().toLowerCase())
      .get();
    for (const d of membersByEmailSnap.docs) {
      const mData = d.data();
      if (mData?.status === "active" || mData?.status === "conectado") {
        return { user, group: groupData, member: mData };
      }
    }
  }

  const err = new Error("Access denied: you are not an active member of this group");
  (err as any).statusCode = 403;
  throw err;
};

const requireGroupOwner = async (req: express.Request, groupId: string | null) => {
  const { user, group, member } = await requireGroupMember(req, groupId);
  
  if (group.createdBy === user.uid) {
    return { user, group, member };
  }

  if (member && (member.role === "owner" || member.role === "admin")) {
    return { user, group, member };
  }

  const err = new Error("Access denied: group owner or admin privilege required");
  (err as any).statusCode = 403;
  throw err;
};

const requirePatientAccess = async (req: express.Request, patientId: string) => {
  if (!patientId) {
    const err = new Error("Patient ID is required");
    (err as any).statusCode = 400;
    throw err;
  }

  let patientDoc = await db.collection("patients").doc(patientId).get();

  if (!patientDoc.exists && patientId.startsWith("personal_")) {
    const grId = patientId.substring("personal_".length);
    // Verify the user is indeed a member of this personal group first
    await requireGroupMember(req, grId);

    // Create the dummy patient document representing personal files
    await db.collection("patients").doc(patientId).set({
      name: "Arquivos Pessoais",
      groupId: grId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      recordStatus: "active"
    });
    patientDoc = await db.collection("patients").doc(patientId).get();
  }

  if (!patientDoc.exists) {
    const err = new Error("Patient not found");
    (err as any).statusCode = 404;
    throw err;
  }

  const patientData = patientDoc.data();
  if (patientData?.recordStatus === "removed") {
    const err = new Error("Este paciente foi removido.");
    (err as any).statusCode = 404;
    throw err;
  }

  const groupId = patientData?.groupId;
  if (!groupId) {
    const err = new Error("Patient is not associated with any group");
    (err as any).statusCode = 400;
    throw err;
  }

  const { user, group, member } = await requireGroupMember(req, groupId);
  return { user, group, member, patient: patientData, groupId };
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

app.get("/api/diagnostics", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }
  try {
    await requireAuth(req);
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
  } catch (err) {
    res.status(401).json({ error: "Unauthorized" });
  }
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

    const returnTo = req.query.returnTo?.toString() || "";

    const randomState = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const state = randomState + (returnTo ? "___returnTo___" + encodeURIComponent(returnTo) : "");

    const authOptions: any = {
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
      state: state
    };

    const url = client.generateAuthUrl(authOptions);
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

    const stateStr = (state as string) || "";
    const returnToMatch = stateStr.match(/___returnTo___(.*)$/);
    const returnTo = returnToMatch ? decodeURIComponent(returnToMatch[1]) : "";

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
          <title>Autenticando...</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #0f172a; }
            .card { text-align: center; padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 90%; width: 360px; }
            .spinner { width: 36px; height: 36px; border: 3px solid #e2e8f0; border-top: 3px solid #10b981; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1rem; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            h2 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; color: #1e293b; }
            p { color: #64748b; font-size: 0.875rem; margin: 0; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <h2>Conectando conta...</h2>
            <p>Por favor, aguarde um instante.</p>
 
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
 
              // Send notification immediately
              notify();
              
              // Do it multiple times quickly to ensure reception
              let tries = 0;
              const interval = setInterval(() => {
                notify();
                tries++;
                if (tries >= 10) {
                  clearInterval(interval);
                }
              }, 100);

              // Close or redirect automatically after 600ms
              setTimeout(() => {
                if (window.opener) {
                  window.close();
                } else {
                  window.location.href = '${returnTo || "/"}';
                }
              }, 600);
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

app.use("/api/app", verifyMembership);
app.use("/api/drive", (req, res) => {
  res.status(410).json({ 
    error: "Google Drive integration is disabled. File storage is being migrated to Firebase Storage." 
  });
});

const verifyGeneralAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const user = await requireAuth(req);
    (req as any).user = user;
    next();
  } catch (err: any) {
    res.status(401).json({ error: err.message || "Unauthorized" });
  }
};

app.use("/api/debug", verifyGeneralAuth);
app.use("/api/storage", verifyGeneralAuth);
app.use("/api/ai", verifyGeneralAuth);

// --- Direct App Shortcuts (To save tokens/LLM calls) ---

// --- Firestore Data Operations ---

// --- Migration and Legacy Helpers removed ---

const handleApiError = (res: express.Response, error: any, context: string) => {
  console.error(`[API Error] ${context}:`, error);
  const errorMessage = error.message || "Internal Server Error";
  const statusCode = error.statusCode || error.status || 500;
  
  let details = undefined;
  if (errorMessage.includes("credentials") || 
      errorMessage.includes("initialized") || 
      errorMessage.includes("no-app") ||
      error.code === "ERR_OSSL_PEM_NO_START_LINE") {
    details = "Firebase initialization error. This usually means the Service Account is missing or invalid. On Vercel, set the FIREBASE_SERVICE_ACCOUNT environment variable to the JSON content of your service account key.";
  }

  res.status(statusCode).json({ 
    error: errorMessage,
    context,
    details
  });
};

// Get all patient contacts directly from Firestore
app.get("/api/app/patient-contacts/:patientId", async (req, res) => {
  const { patientId } = req.params;
  try {
    const { groupId } = await requirePatientAccess(req, patientId);

    const snap = await db.collection("patients_contacts")
      .where("patientId", "==", patientId)
      .where("status", "!=", "removed")
      .get();
    const contacts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/app/patient-logs", async (req, res) => {
  const { patientId, text } = req.body;
  if (!patientId || !text) {
    return res.status(400).json({ error: "patientId and text are required" });
  }
  try {
    const { groupId } = await requirePatientAccess(req, patientId);

    const docRef = db.collection("patient_logs").doc();
    const newLog = {
      id: docRef.id,
      patientId: patientId.toString(),
      text,
      type: "text",
      groupId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await docRef.set(newLog);
    res.json(newLog);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.post("/api/app/patient-contacts", async (req, res) => {
  const { patientId, name, relationship, phone } = req.body;
  if (!patientId || !name) {
    return res.status(400).json({ error: "patientId and name are required" });
  }
  try {
    const { groupId } = await requirePatientAccess(req, patientId);

    const docRef = db.collection("patients_contacts").doc();
    const newContact = {
      id: docRef.id,
      patientId: patientId.toString(),
      name,
      relationship: relationship || "",
      phone: phone || "",
      groupId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await docRef.set(newContact);
    res.json(newContact);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

const normalizeText = (value = "") =>
  value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

app.get("/api/app/patients", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  try {
    // Verify membership using centralised check
    await requireGroupMember(req, groupId);

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
      db.collection("hospitals").where("groupId", "==", groupId).get(),
      db.collection("patient_statuses").where("groupId", "==", groupId).get()
    ]);

    const hMap = Object.fromEntries(hospitalsSnap.docs.map(doc => [doc.id, doc.data().name]));
    const sMap = Object.fromEntries(statusesSnap.docs.map(doc => [doc.id, doc.data().name]));

    let patients = patientsSnap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        nome: data.name, // Map name to nome for frontend
        hospitalName: hMap[data.hospitalId] || data.hospitalId || "Sem Hospital",
        status: (data.statusId && sMap[data.statusId]) ? sMap[data.statusId] : "Sem Status"
      };
    }).filter(patient => (patient as any).recordStatus !== "removed");

    const normalizedSearch = normalizeText((req.query.search || req.query.q || "") as string);
    if (normalizedSearch) {
      patients = patients.filter(patient => {
        const patientName = normalizeText((patient as any).nome || (patient as any).name || "");
        return patientName.includes(normalizedSearch);
      });
    }

    // Optimization for the future: create nameNormalized and searchTokens fields when creating/updating patient, then use indexed Firestore queries.

    if (req.query.full === "true") {
      const sortedStatuses = statusesSnap.docs.map(d => {
        const sData = d.data();
        return { id: d.id, ...sData, nome: sData.name } as any;
      }).sort((a: any, b: any) => {
        const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 999999;
        const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 999999;
        if (orderA !== orderB) return orderA - orderB;
        const nameA = (a.nome || a.name || "").toLowerCase();
        const nameB = (b.nome || b.name || "").toLowerCase();
        return nameA.localeCompare(nameB);
      });

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

    const groupDoc = await db.collection("groups").doc(groupId).get();
    const groupType = groupDoc.data()?.groupType;
    const defaultName = "Dr. Agent";

    res.json({
      companyName: data.companyName || defaultName,
      whatsappNumber: data.whatsappNumber || "",
      imageAnalysisPrompt: data.imageAnalysisPrompt || "Aja como um médico experiente em cirurgia cardíaca e descreva esta imagem médica indicando possíveis achados e soluções ideais."
    });
  } catch (error) {
    handleApiError(res, error, "Fetching settings");
  }
});

// Update app settings
app.post("/api/app/settings", async (req, res) => {
  const { companyName, whatsappNumber, imageAnalysisPrompt, groupPhotoURL } = req.body;
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  try {
    await requireGroupOwner(req, groupId);
    const batch = db.batch();
    
    // Update settings collection
    const settingsRef = db.collection("settings").doc(groupId);
    batch.set(settingsRef, {
      companyName: companyName || "",
      whatsappNumber: whatsappNumber || "",
      imageAnalysisPrompt: imageAnalysisPrompt || "",
      groupId
    }, { merge: true });

    // Update groups collection for quick access to photo and name
    const groupRef = db.collection("groups").doc(groupId);
    const groupUpdate: any = {};
    if (companyName) groupUpdate.name = companyName;
    if (groupPhotoURL !== undefined) groupUpdate.photoURL = groupPhotoURL;
    
    if (Object.keys(groupUpdate).length > 0) {
      batch.set(groupRef, groupUpdate, { merge: true });
    }

    await batch.commit();
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
    await requireGroupOwner(req, groupId);
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
  const { id } = req.params;

  try {
    const { groupId, patient } = await requirePatientAccess(req, id);

    const report: any = {
      cadastro: null,
      audios: [],
      imagens: [],
      familiares: []
    };

    const [contactsSnap, logsSnap, filesSnap, statusesSnap, activityLogsSnap, hospitalsSnap] = await Promise.all([
      db.collection("patients_contacts").where("patientId", "==", id).get(),
      db.collection("patient_logs").where("patientId", "==", id).orderBy("createdAt", "desc").get(),
      db.collection("files").where("patientId", "==", id).orderBy("timestamp", "desc").get(),
      db.collection("patient_statuses").where("groupId", "==", groupId).get(),
      db.collection("logs").where("patientId", "==", id).orderBy("timestamp", "desc").get(),
      db.collection("hospitals").where("groupId", "==", groupId).get()
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

    const pData = patient;
    report.cadastro = {
      ID: id,
      Nome: pData.name,
      Telefone: pData.phone,
      Idade: pData.age,
      Status: (pData.statusId && statusesMap.get(pData.statusId)) ? statusesMap.get(pData.statusId) : "Sem Status",
      statusId: pData.statusId || "",
      hospitalName: hospitalsMap.get(pData.hospitalId) || pData.hospitalId,
      hospitalId: pData.hospitalId || "",
      roomNumber: pData.roomNumber,
      surgery_type: pData.surgery_type || "",
      procedure: pData.procedure || ""
    };

    // Process Files/Images
    report.imagens = filesSnap.docs
      .filter(doc => doc.data().status !== "removed")
      .map(doc => {
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
    report.audios = logsSnap.docs
      .filter(doc => doc.data().status !== "removed")
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          conteudo: data.text,
          tipo: data.type || "texto",
          data: data.createdAt ? data.createdAt.toDate().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Recent"
        };
      });

    // Process Family Members
    report.familiares = contactsSnap.docs
      .filter(doc => doc.data().status !== "removed")
      .map(doc => {
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
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  let { nome, fone, idade, status, cpf, hospitalName, roomNumber, procedimento, surgery_type } = req.body;

  const sanitizeStr = (v: any) => {
    if (v === undefined || v === null) return "";
    const str = v.toString().trim();
    if (str === "null" || str === "undefined") return "";
    return str;
  };

  nome = sanitizeStr(nome);
  fone = sanitizeStr(fone);
  idade = sanitizeStr(idade);
  const statusIdVal = sanitizeStr(status);
  cpf = sanitizeStr(cpf);
  const resolvedHospitalId = sanitizeStr(hospitalName);
  roomNumber = sanitizeStr(roomNumber);
  procedimento = sanitizeStr(procedimento);
  surgery_type = sanitizeStr(surgery_type);

  if (!nome) return res.status(400).json({ error: "Nome é obrigatório." });

  try {
    await requireGroupMember(req, groupId);
    const patientRef = db.collection("patients").doc();
    await patientRef.set({
      name: nome,
      phone: fone,
      age: idade,
      statusId: statusIdVal,
      cpf: cpf,
      hospitalId: resolvedHospitalId,
      roomNumber: roomNumber,
      procedure: procedimento,
      surgery_type: surgery_type,
      groupId,
      recordStatus: "active",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Add initial log
    await db.collection("logs").add({
      patientId: patientRef.id,
      patientName: nome,
      description: "Paciente cadastrado no sistema.",
      groupId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, id: patientRef.id });
  } catch (error) {
    handleApiError(res, error, "Registering patient");
  }
});

// Update patient status (Zero LLM)
app.post("/api/app/patients/status", express.json(), async (req, res) => {
  const { patientId, status, statusName } = req.body;

  if (!patientId || !status) return res.status(400).json({ error: "PatientID e Status são obrigatórios." });

  try {
    const authUser = await requireAuth(req);
    const { groupId, patient } = await requirePatientAccess(req, patientId);

    let userName = authUser.email || "Unknown User";
    try {
      const fbUser = await admin.auth().getUser(authUser.uid);
      if (fbUser.displayName) {
        userName = fbUser.displayName;
      }
    } catch (e) {
      console.warn("Could not load display name from firebase:", e);
    }

    const patientRef = db.collection("patients").doc(patientId);
    const patientName = patient.name;
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
        groupId,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      const statusUserRef = db.collection("status_history").doc();
      t.set(statusUserRef, {
        patientId,
        patientName,
        status: finalStatusName,
        groupId,
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
  const { id, nome, fone, idade, hospitalName, roomNumber, status, surgery_type } = req.body;

  if (!id) return res.status(400).json({ error: "ID do paciente é obrigatório." });

  try {
    const { groupId, patient } = await requirePatientAccess(req, id);
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
    if (surgery_type !== undefined) updateData.surgery_type = surgery_type;

    await patientRef.update(updateData);
    
    // Record log of update
    await db.collection("logs").add({
      patientId: id,
      patientName: patient.name,
      description: "Informações do perfil atualizadas.",
      groupId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Updating patient info");
  }
});

// Remove patient (soft delete)
app.post("/api/app/patients/:patientId/remove", express.json(), async (req, res) => {
  const { patientId } = req.params;
  if (!patientId) return res.status(400).json({ error: "ID do paciente é obrigatório." });

  try {
    const { user, groupId, patient } = await requirePatientAccess(req, patientId);

    const patientRef = db.collection("patients").doc(patientId);
    await patientRef.update({
      recordStatus: "removed",
      removedAt: admin.firestore.FieldValue.serverTimestamp(),
      removedBy: user.uid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Record log of removal
    const logRef = db.collection("logs").doc();
    await logRef.set({
      patientId,
      patientName: patient.name || "Paciente",
      description: `Paciente removido por ${user.email || 'usuário'}.`,
      groupId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Removing patient");
  }
});

// Get logs for a specific patient
app.get("/api/app/patients/:id/logs", async (req, res) => {
  const { id } = req.params;

  try {
    const { groupId } = await requirePatientAccess(req, id);
    const logsSnap = await db.collection("logs")
      .where("patientId", "==", id)
      .where("groupId", "==", groupId)
      .orderBy("timestamp", "desc")
      .get();
    
    const logs = logsSnap.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id, 
        ...data,
        timestamp: data.timestamp
      };
    });
    res.json(logs);
  } catch (error) {
    handleApiError(res, error, "Fetching patient logs");
  }
});

// Add a manual log for a patient
app.post("/api/app/patients/:id/logs", express.json(), async (req, res) => {
  const { id } = req.params;
  const { description } = req.body;

  if (!description) return res.status(400).json({ error: "Descrição do log é obrigatória." });

  try {
    const { groupId, patient } = await requirePatientAccess(req, id);

    const logRef = db.collection("logs").doc();
    await logRef.set({
      patientId: id,
      patientName: patient.name,
      description,
      groupId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, id: logRef.id });
  } catch (error) {
    handleApiError(res, error, "Adding patient log");
  }
});

// Get basic patient info
app.get("/api/app/patients/info/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const { patient } = await requirePatientAccess(req, id);
    res.json({ id, ...patient });
  } catch (error) {
    handleApiError(res, error, "Fetching patient info");
  }
});

app.get("/api/app/statuses", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  
  try {
    const statusesSnap = await db.collection("patient_statuses")
      .where("groupId", "==", groupId)
      .get();
    
    // Fallback if no specific statuses for this group, but we probably want them to be strict
    let statuses = statusesSnap.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, ...data, nome: data.name };
    });

    res.json(statuses);
  } catch (error) {
    handleApiError(res, error, "Fetching statuses");
  }
});

app.post("/api/app/statuses/reorder", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  const { statusId, direction } = req.body;
  if (!statusId || !direction) {
    return res.status(400).json({ error: "statusId and direction are required" });
  }

  try {
    // 1. Verify owner/admin privilege
    await requireGroupOwner(req, groupId);

    // 2. Fetch the target status and verify ownership
    const targetStatusRef = db.collection("patient_statuses").doc(statusId);
    const targetStatusSnap = await targetStatusRef.get();
    if (!targetStatusSnap.exists) {
      return res.status(404).json({ error: "Status not found" });
    }

    const targetStatusData = targetStatusSnap.data();
    if (targetStatusData?.groupId !== groupId) {
      return res.status(403).json({ error: "Access denied to this status" });
    }

    // 3. Fetch all active statuses in this group
    const statusesSnap = await db.collection("patient_statuses")
      .where("groupId", "==", groupId)
      .get();

    const statuses = statusesSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        nome: data.name || data.nome || "",
        active: data.active,
        status: data.status,
        sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 999999
      };
    })
    .filter(s => s.active !== false && s.status !== "removed")
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.nome.localeCompare(b.nome);
    });

    const currentIndex = statuses.findIndex(s => s.id === statusId);
    if (currentIndex === -1) {
      return res.status(404).json({ error: "Status is either deleted or not in this group" });
    }

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= statuses.length) {
      return res.json({ success: true, noop: true });
    }

    const currentStatus = statuses[currentIndex];
    const otherStatus = statuses[targetIndex];

    const batch = db.batch();

    // Reinitialize sorting sequences of any outdated elements to ensure sequential indexes
    const needsInitialization = statuses.some((s, index) => s.sortOrder === 999999 || s.sortOrder !== index + 1);
    if (needsInitialization) {
      for (let i = 0; i < statuses.length; i++) {
        batch.set(db.collection("patient_statuses").doc(statuses[i].id), {
          sortOrder: i + 1,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
    }

    // Swap sortOrder
    batch.set(db.collection("patient_statuses").doc(currentStatus.id), {
      sortOrder: targetIndex + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    batch.set(db.collection("patient_statuses").doc(otherStatus.id), {
      sortOrder: currentIndex + 1,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    await batch.commit();
    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Reordering status");
  }
});

app.post("/api/app/statuses/remove", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  const { statusId } = req.body;
  if (!statusId) {
    return res.status(400).json({ error: "statusId is required" });
  }

  try {
    // 1. Verify owner/admin privilege
    await requireGroupOwner(req, groupId);

    // 2. Fetch status and verify ownership
    const statusRef = db.collection("patient_statuses").doc(statusId);
    const statusSnap = await statusRef.get();
    if (!statusSnap.exists) {
      return res.status(404).json({ error: "Status not found" });
    }

    const statusData = statusSnap.data();
    if (statusData?.groupId !== groupId) {
      return res.status(403).json({ error: "Access denied to this status" });
    }

    // 3. Mark status as deleted
    await statusRef.update({
      active: false,
      status: "removed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Removing status");
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
      await requirePatientAccess(req, patientId);
      query = query.where("patientId", "==", patientId);
    } else {
      await requireGroupMember(req, groupId);
      query = query.where("groupId", "==", groupId);
    }

    const snap = await query.get();
    const family = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    res.json(family);
  } catch (error) {
    handleApiError(res, error, "Fetching family members");
  }
});

// Add log from LLM tool
app.post("/api/app/logs", express.json(), async (req, res) => {
  const { patientId, text } = req.body;

  try {
    const { groupId, patient } = await requirePatientAccess(req, patientId);

    const logRef = db.collection("logs").doc();
    await logRef.set({
      patientId,
      patientName: patient.name,
      description: text,
      groupId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, id: logRef.id });
  } catch (error) {
    handleApiError(res, error, "Adding patient log");
  }
});

app.post("/api/app/family-members", express.json(), async (req, res) => {
  const { nome, relacao, fone, patientId, paciente_nome } = req.body;
  if (!nome || !patientId) return res.status(400).json({ error: "Nome e ID do Paciente são obrigatórios." });

  try {
    const { groupId, patient } = await requirePatientAccess(req, patientId);

    let finalPatientNome = paciente_nome || patient.name || "Unknown";

    const memberRef = db.collection("family_members").doc();
    await memberRef.set({
      name: nome,
      relationship: relacao || "",
      phone: fone || "",
      patientId,
      patientName: finalPatientNome,
      groupId
    });

    res.json({ success: true, id: memberRef.id });
  } catch (error) {
    handleApiError(res, error, "Adding family member");
  }
});

// Add a log entry for a patient
app.post("/api/app/logs_secondary", express.json(), async (req, res) => {
  const { patientId, text, paciente_nome } = req.body;
  if (!patientId || !text) return res.status(400).json({ error: "PatientID e Texto são obrigatórios." });

  try {
    const { groupId, patient } = await requirePatientAccess(req, patientId);
    let finalPatientNome = paciente_nome || patient.name || "Paciente Desconhecido";

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
app.post("/api/app/upload-image", express.json({ limit: "25mb" }), async (req, res) => {
  const { patientId, description, fileName, mimeType, base64Data } = req.body;

  if (!patientId || !base64Data) return res.status(400).json({ error: "PatientID e Imagem são obrigatórios." });

  try {
    const { groupId } = await requirePatientAccess(req, patientId);

    // 2. Upload to Firebase Storage
    const buffer = Buffer.from(base64Data, "base64");
    const filename = fileName || `Documento_P${patientId}_${Date.now()}.jpg`;
    const destination = `patients/${patientId}/${filename}`;
    const file = bucket.file(destination);

    await file.save(buffer, {
      metadata: {
        contentType: mimeType || "image/jpeg",
        metadata: {
          patientId: patientId,
          description: description || "",
          groupId
        }
      }
    });

    // Make public and get URL
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(destination)}`;

    // 3. Save metadata to Firestore
    const fileRef = db.collection("files").doc();
    await fileRef.set({
      patientId,
      description: description || "Upload Direto",
      link: publicUrl,
      storagePath: destination,
      groupId,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true, fileId: fileRef.id, link: publicUrl });
  } catch (error) {
    handleApiError(res, error, "Uploading image to Storage");
  }
});

// Remove file (soft delete)
app.post("/api/app/files/remove", express.json(), async (req, res) => {
  const { fileId } = req.body;

  if (!fileId) return res.status(400).json({ error: "FileID é obrigatório." });

  try {
    const fileRef = db.collection("files").doc(fileId);
    const fileDoc = await fileRef.get();

    if (!fileDoc.exists) {
      return res.status(404).json({ error: "Arquivo não encontrado." });
    }

    const { groupId } = await requirePatientAccess(req, fileDoc.data()?.patientId);

    await fileRef.update({
      status: "removed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Removing file");
  }
});

// Update patient log
app.post("/api/app/patient-logs/update", express.json(), async (req, res) => {
  const { logId, text } = req.body;
  if (!logId || !text) return res.status(400).json({ error: "ID e texto são obrigatórios." });

  try {
    const logRef = db.collection("patient_logs").doc(logId);
    const logDoc = await logRef.get();
    if (!logDoc.exists) return res.status(404).json({ error: "Informação não encontrada." });

    const { groupId } = await requirePatientAccess(req, logDoc.data()?.patientId);

    await logRef.update({
      text,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Updating patient log");
  }
});

// Update patient contact
app.post("/api/app/patient-contacts/update", express.json(), async (req, res) => {
  const { contactId, name, relationship, phone } = req.body;
  if (!contactId) return res.status(400).json({ error: "ID é obrigatório." });

  try {
    const contactRef = db.collection("patients_contacts").doc(contactId);
    const contactDoc = await contactRef.get();
    if (!contactDoc.exists) return res.status(404).json({ error: "Contato não encontrado." });

    const { groupId } = await requirePatientAccess(req, contactDoc.data()?.patientId);

    await contactRef.update({
      name: name !== undefined ? name : contactDoc.data()?.name,
      relationship: relationship !== undefined ? relationship : contactDoc.data()?.relationship,
      phone: phone !== undefined ? phone : contactDoc.data()?.phone,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Updating patient contact");
  }
});

// Remove patient contact (soft delete)
app.post("/api/app/patient-contacts/remove", express.json(), async (req, res) => {
  const { contactId } = req.body;
  if (!contactId) return res.status(400).json({ error: "ID é obrigatório." });

  try {
    const contactRef = db.collection("patients_contacts").doc(contactId);
    const contactDoc = await contactRef.get();
    if (!contactDoc.exists) return res.status(404).json({ error: "Contato não encontrado." });

    const { groupId } = await requirePatientAccess(req, contactDoc.data()?.patientId);

    await contactRef.update({
      status: "removed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Removing patient contact");
  }
});

// Remove patient log (soft delete)
app.post("/api/app/patient-logs/remove", express.json(), async (req, res) => {
  const { logId } = req.body;

  if (!logId) return res.status(400).json({ error: "LogID é obrigatório." });

  try {
    const logRef = db.collection("patient_logs").doc(logId);
    const logDoc = await logRef.get();

    if (!logDoc.exists) {
      return res.status(404).json({ error: "Informação não encontrada." });
    }

    const { groupId } = await requirePatientAccess(req, logDoc.data()?.patientId);

    await logRef.update({
      status: "removed",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ success: true });
  } catch (error) {
    handleApiError(res, error, "Removing patient log");
  }
});

// Share helper to apply editing permissions (writer) to secondary members
const shareItemWithMembers = async (drive: any, fileId: string, emails: string[]) => {
  for (const email of emails) {
    if (!email || typeof email !== "string" || !email.includes("@")) {
      console.warn(`[Drive] Skipping share for invalid email: "${email}"`);
      continue;
    }
    try {
      await drive.permissions.create({
        fileId: fileId,
        requestBody: {
          type: 'user',
          role: 'writer',
          emailAddress: email.trim().toLowerCase()
        },
        sendNotificationEmail: false
      });
    } catch (e: any) {
      console.warn(`[Drive] Failed to share item ${fileId} with ${email}:`, e.message);
    }
  }
};

const resolveGroupRootFolder = async (groupId: string): Promise<string> => {
  if (!groupId) {
    throw new Error("Active Group ID is required");
  }
  const groupDoc = await db.collection("groups").doc(groupId).get();
  if (!groupDoc.exists) {
    throw new Error("Group not found");
  }
  const groupData = groupDoc.data()!;
  let rootFolderId = "";
  if (groupData.groupType === "personal") {
    rootFolderId = groupData.driveRootFolderId;
  } else {
    const configSnap = await db.collection("groups").doc(groupId).collection("settings").doc("drive").get();
    if (configSnap.exists) {
      rootFolderId = configSnap.data()!.mainFolderId;
    }
  }
  if (!rootFolderId) {
    throw new Error("A pasta principal do Google Drive não está configurada para este grupo.");
  }
  return rootFolderId;
};

const assertFolderInsideRoot = async (drive: any, folderId: string, rootFolderId: string): Promise<boolean> => {
  if (!folderId || !rootFolderId) return false;
  if (folderId === rootFolderId) return true;
  
  let currentId = folderId;
  const visited = new Set<string>();
  
  for (let i = 0; i < 8; i++) {
    if (currentId === rootFolderId) return true;
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);
    
    try {
      const fileRes = await drive.files.get({
        fileId: currentId,
        fields: "parents, name",
      });
      const parents = fileRes.data.parents;
      if (!parents || parents.length === 0) {
        break;
      }
      currentId = parents[0];
    } catch (e) {
      console.error(`[assertFolderInsideRoot] Error fetching parents for ${currentId}:`, e);
      break;
    }
  }
  return false;
};

// Generic Storage Upload
app.get("/api/drive/config", async (req, res) => {
  const userId = await getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Autorização do Google Drive necessária ou expirada. Reconecte sua conta do Google." });
  }
  
  const groupId = getGroupId(req);

  try {
    let configData: any = {};
    if (groupId) {
      const groupDoc = await db.collection("groups").doc(groupId).get();
      if (groupDoc.exists) {
        const groupData = groupDoc.data() || {};
        if (groupData.groupType === "personal") {
          // Rule 7: Retrieve using driveRootFolderId from Firestore group document
          if (groupData.driveRootFolderId) {
            configData = {
              mainFolderId: groupData.driveRootFolderId,
              mainFolderName: groupData.driveRootFolderName || groupData.name || "Pasta Principal",
              adminId: groupData.driveOwnerUserId || "",
              adminEmail: groupData.driveOwnerEmail || "",
              setupAt: groupData.createdAt || null,
            };
          } else {
            configData = {};
          }
        } else {
          // Professional group compatibility
          const driveDoc = await db.collection("groups").doc(groupId).collection("settings").doc("drive").get();
          configData = driveDoc.data() || {};
        }
      }
    }

    // Fallback or secondary check for user-level if groupId not provided or group config empty
    if (!configData || Object.keys(configData).length === 0) {
      const userDoc = await db.collection("users").doc(userId).collection("settings").doc("drive").get();
      configData = userDoc.data() || {};
    }

    res.json(configData);
  } catch (error: any) {
    res.status(500).json({ error: error.message || String(error) });
  }
});

// New endpoint to share with a specific email
app.post("/api/drive/share", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) {
    return res.status(401).json({ error: "Acesso ao Google Drive não autorizado. Certifique-se de realizar o login." });
  }
  
  const groupId = getGroupId(req);
  const { email } = req.body;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return res.status(400).json({ error: "Membro não possui um e-mail válido." });
  }

  if (!groupId) return res.status(400).json({ error: "ID do grupo é obrigatório." });

  try {
    const groupDoc = await db.collection("groups").doc(groupId).get();
    if (!groupDoc.exists) return res.status(404).json({ error: "Grupo não encontrado." });

    const groupData = groupDoc.data()!;
    let folderId = "";

    const userId = await getUserId(req);

    if (groupData.groupType === "personal") {
      folderId = groupData.driveRootFolderId;
      if (!folderId) {
        return res.status(400).json({ error: "A pasta principal do Google Drive não está configurada para este grupo." });
      }

      // Verify if the current user is the group admin or owner/creator of the folder.
      // If a non-admin member triggers sharing (like accepting an invite link), they don't own the Drive folder,
      // so calling permissions.create on Google Drive API will fail with a 403.
      // We gracefully bypass and return success since the admin already invited/shared the folder previously.
      const isAdmin = groupData.createdBy === userId || groupData.driveOwnerUserId === userId;
      if (!isAdmin) {
        console.log(`[Drive] Non-admin user ${userId} requested manual drive share. Bypassing permissions setup since folder belongs to admin.`);
        return res.json({ success: true, bypassed: true, message: "Somente o administrador pode alterar permissões da pasta. O compartilhamento foi sincronizado com sucesso." });
      }
    } else {
      const configSnap = await db.collection("groups").doc(groupId).collection("settings").doc("drive").get();
      if (!configSnap.exists) {
        return res.json({ success: false, message: "Drive não configurado para este grupo" });
      }
      folderId = configSnap.data()!.mainFolderId;
    }

    if (!folderId) {
      return res.status(400).json({ error: "A pasta principal do Google Drive está ausente para este grupo." });
    }

    const drive = google.drive({ version: "v3", auth });

    await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        type: 'user',
        role: 'writer', // Permission of editing (permissão de edição)
        emailAddress: email.trim().toLowerCase()
      },
      sendNotificationEmail: false
    }).catch((err: any) => {
      console.error("[Drive] Google Drive API permissions.create FULL error structure:", JSON.stringify(err, null, 2));
      throw new Error(`Erro ao compartilhar pasta com o novo membro: ${err.message || err}`);
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error(`[Drive] Share failed for ${email}:`, err);
    res.status(500).json({ error: err.message || err });
  }
});

app.post("/api/drive/setup", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) {
    return res.status(401).json({ error: "Acesso ao Google Drive não autorizado. Certifique-se de realizar o login e conceder as permissões necessárias." });
  }
  const userId = await getUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }

  const { rootFolderName, adminEmail } = req.body;
  const groupId = getGroupId(req);

  if (!rootFolderName) return res.status(400).json({ error: "Nome completo da pasta é obrigatório." });

  const drive = google.drive({ version: "v3", auth });

  try {
    let folderId = "";
    let isPersonal = false;
    let groupName = rootFolderName;

    // 1. If we have a groupId, check group type and see if folder already exists in Firestore (Rule 8)
    if (groupId) {
      const groupDoc = await db.collection("groups").doc(groupId).get();
      if (groupDoc.exists) {
        const groupData = groupDoc.data()!;
        isPersonal = groupData.groupType === "personal";
        if (isPersonal) {
          groupName = groupData.name || rootFolderName;
          if (!groupName.endsWith(" - principal")) {
            groupName = `${groupName} - principal`;
          }
          if (groupData.driveRootFolderId) {
            folderId = groupData.driveRootFolderId;
            console.log("[Drive] Reusing existing driveRootFolderId from group doc:", folderId);
          } else {
            // Verify if the current user is owner/creator of the group (Rule 3)
            if (groupData.createdBy !== userId) {
              return res.status(403).json({ 
                error: "A pasta principal deste grupo ainda não foi criada pelo administrador." 
              });
            }
          }
        } else {
          const configSnap = await db.collection("groups").doc(groupId).collection("settings").doc("drive").get();
          if (configSnap.exists) {
            const driveData = configSnap.data()!;
            if (driveData.mainFolderId) {
              folderId = driveData.mainFolderId;
              console.log("[Drive] Reusing existing mainFolderId from settings collection:", folderId);
            }
          }
        }
      }
    }

    // 2. If no folderId was found in Firestore, search or create folder on Drive
    if (!folderId) {
      console.log("[Drive] Setting up folder:", groupName, "for user:", userId, "Group:", groupId);
      
      const folderRes = await drive.files.list({
        q: `name = '${groupName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id)",
      }).catch(err => {
        console.error("[Drive] Error listing folders during setup:", err.message);
        throw new Error(`Acesso ao Google Drive não autorizado. Certifique-se de realizar o login e conceder as permissões necessárias.`);
      });

      if (folderRes.data.files && folderRes.data.files.length > 0) {
        folderId = folderRes.data.files[0].id!;
        console.log("[Drive] Found existing folder on Drive, reusing:", folderId);
      } else {
        const createFolderRes = await drive.files.create({
          requestBody: {
            name: groupName,
            mimeType: "application/vnd.google-apps.folder",
            description: "App Storage Folder - Dr. Agent",
          },
          fields: "id",
        }).catch(err => {
          console.error("[Drive] Error creating root folder:", err.message);
          throw new Error(`Erro ao criar pasta no Drive: ${err.message}`);
        });
        folderId = createFolderRes.data.id!;
        console.log("[Drive] Created new folder on Drive:", folderId);
      }
    }

    // 3. Save configuration
    if (groupId) {
      if (isPersonal) {
        console.log("[Drive] Saving personal config to Group Firestore:", groupId);
        
        let finalOwnerEmail = adminEmail || "";
        if (!finalOwnerEmail) {
          try {
            const oauth2 = google.oauth2({ version: "v2", auth });
            const userRes = await oauth2.userinfo.get();
            finalOwnerEmail = userRes.data.email || "";
          } catch (e) {
            console.warn("[Drive] Failed to fetch email from oauth2 userinfo:", e);
          }
        }

        // Save directly in the group document (Rule 2)
        await db.collection("groups").doc(groupId).set({
          driveRootFolderId: folderId,
          driveRootFolderName: groupName,
          driveOwnerUserId: userId,
          driveOwnerEmail: finalOwnerEmail,
          driveCreatedByAdmin: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        // Also save in settings/drive subcollection for complete query consistency
        await db.collection("groups").doc(groupId).collection("settings").doc("drive").set({
          mainFolderId: folderId,
          mainFolderName: groupName,
          adminId: userId,
          setupAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      } else {
        console.log("[Drive] Saving professional config to Settings Collection:", groupId);
        await db.collection("groups").doc(groupId).collection("settings").doc("drive").set({
          mainFolderId: folderId,
          mainFolderName: groupName,
          adminId: userId,
          setupAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      // 4. Share with all current group members (as requested) (Rule 3)
      try {
        const membersSnap = await db.collection("groups").doc(groupId).collection("members").get();
        let finalOwnerEmail = adminEmail || "";
        if (!finalOwnerEmail && isPersonal) {
          try {
            const oauth2 = google.oauth2({ version: "v2", auth });
            const userRes = await oauth2.userinfo.get();
            finalOwnerEmail = userRes.data.email || "";
          } catch (e) {}
        }

        const emails = membersSnap.docs
          .map(d => d.data().userEmail)
          .filter(e => !!e && e.toLowerCase() !== (finalOwnerEmail || "").toLowerCase());

        console.log(`[Drive] Sharing folder ${folderId} with ${emails.length} members`);
        await shareItemWithMembers(drive, folderId, emails);
      } catch (shareErr) {
        console.error("[Drive] Error during member sharing:", shareErr);
      }
    } else {
      console.log("[Drive] Saving config to User Firestore:", userId);
      await db.collection("users").doc(userId).collection("settings").doc("drive").set({
        mainFolderId: folderId,
        mainFolderName: groupName,
        setupAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    res.json({ mainFolderId: folderId, mainFolderName: groupName });
  } catch (error: any) {
    console.error("[Drive] Setup Exception:", error);
    const message = error.response?.data?.error?.message || error.message || String(error);
    const details = error.response?.data?.error || null;
    res.status(500).json({ 
      error: message.includes("permissão") || message.includes("autorizado") ? message : `Erro ao criar pasta no Drive: ${message}`,
      details: details 
    });
  }
});

// New endpoint to refresh sharing for a group
app.post("/api/drive/sync-sharing", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Acesso ao Google Drive não autorizado. Certifique-se de realizar o login." });
  
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "ID do grupo é obrigatório." });

  try {
    let folderId = "";
    const groupDoc = await db.collection("groups").doc(groupId).get();
    if (groupDoc.exists) {
      const groupData = groupDoc.data()!;
      if (groupData.groupType === "personal") {
        folderId = groupData.driveRootFolderId || "";
      }
    }

    if (!folderId) {
      const configSnap = await db.collection("groups").doc(groupId).collection("settings").doc("drive").get();
      if (configSnap.exists) {
        folderId = configSnap.data()!.mainFolderId || "";
      }
    }

    if (!folderId) {
      return res.status(400).json({ error: "A pasta principal do Google Drive está ausente para este grupo." });
    }

    const drive = google.drive({ version: "v3", auth });
    
    const membersSnap = await db.collection("groups").doc(groupId).collection("members").get();
    const emails = membersSnap.docs.map(d => d.data().userEmail).filter(e => !!e);

    await shareItemWithMembers(drive, folderId, emails);

    res.json({ success: true, sharedWithCount: emails.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/drive/upload", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Acesso ao Google Drive não autorizado. Certifique-se de realizar o login." });

  const userId = await getUserId(req);
  const { name, mimeType, base64Data, parentFolderId, folderName } = req.body;

  if (!base64Data) {
    return res.status(400).json({ error: "Missing base64Data" });
  }

  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "ID do grupo é obrigatório." });

  const drive = google.drive({ version: "v3", auth });

  try {
    const rootFolderId = await resolveGroupRootFolder(groupId);
    let finalParentId = parentFolderId;

    if (!finalParentId && folderName) {
      const folderRes = await drive.files.list({
        q: `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed = false`,
        fields: "files(id)",
      });
      
      if (folderRes.data.files && folderRes.data.files.length > 0) {
        finalParentId = folderRes.data.files[0].id!;
      } else {
        const createFolderRes = await drive.files.create({
          requestBody: {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [rootFolderId],
          },
          fields: "id",
        }).catch(err => {
          throw new Error(`Erro ao criar subpasta no Drive: ${err.message}`);
        });
        finalParentId = createFolderRes.data.id!;

        try {
          const membersSnap = await db.collection("groups").doc(groupId).collection("members").get();
          const emails = membersSnap.docs.map(d => d.data().userEmail).filter(e => !!e);
          await shareItemWithMembers(drive, finalParentId, emails);
        } catch (e: any) {
          console.warn("[Drive] Failed to auto-share newly created subfolder:", e.message);
        }
      }
    } else if (!finalParentId) {
      finalParentId = rootFolderId;
    }

    // Security Check: parent folder must be inside rootFolderId
    const isInside = await assertFolderInsideRoot(drive, finalParentId, rootFolderId);
    if (!isInside) {
      return res.status(403).json({ error: "Acesso negado: pasta destino fora do diretório do grupo." });
    }

    // Upload File
    const buffer = Buffer.from(base64Data, "base64");
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const fileMetadata = {
      name: name || `Upload_${Date.now()}`,
      parents: [finalParentId],
    };
    const media = {
      mimeType: mimeType || "image/jpeg",
      body: stream,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, webViewLink, webContentLink",
    }).catch(err => {
      throw new Error(`Erro ao enviar arquivo para o Google Drive: ${err.message}`);
    });

    const fileId = response.data.id!;

    // Ensure newly uploaded file is visible/shared with all group members if needed
    try {
      const membersSnap = await db.collection("groups").doc(groupId).collection("members").get();
      const emails = membersSnap.docs.map(d => d.data().userEmail).filter(e => !!e);
      await shareItemWithMembers(drive, fileId, emails);
    } catch (e: any) {
      console.warn("[Drive] Failed to auto-share uploaded file:", e.message);
    }

    res.json(response.data);
  } catch (error: any) {
    console.error("[Drive] Upload error:", error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

// Rename custom Google Drive Folder or file
app.post("/api/drive/rename", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Acesso ao Google Drive não autorizado. Certifique-se de realizar o login." });

  const userId = await getUserId(req);
  const { newName } = req.body;
  if (!newName) return res.status(400).json({ error: "O novo nome é obrigatório." });

  const groupId = getGroupId(req);
  const drive = google.drive({ version: "v3", auth });

  try {
    let folderId = "";
    let isPersonal = false;

    if (groupId) {
      const groupDoc = await db.collection("groups").doc(groupId).get();
      if (groupDoc.exists) {
        const groupData = groupDoc.data()!;
        isPersonal = groupData.groupType === "personal";
        
        const isAdmin = groupData.createdBy === userId || groupData.driveOwnerUserId === userId;
        if (!isAdmin) {
          return res.status(403).json({ error: "Somente o administrador pode renomear a pasta do grupo." });
        }

        if (isPersonal) {
          folderId = groupData.driveRootFolderId;
        } else {
          const configSnap = await db.collection("groups").doc(groupId).collection("settings").doc("drive").get();
          if (configSnap.exists) {
            folderId = configSnap.data()!.mainFolderId;
          }
        }
      }
    } else {
      const userSnap = await db.collection("users").doc(userId).collection("settings").doc("drive").get();
      if (userSnap.exists) {
        folderId = userSnap.data()!.mainFolderId;
      }
    }

    if (!folderId) {
      return res.status(400).json({ error: "Nenhuma pasta configurada encontrada para renomear." });
    }

    if (groupId) {
      const rootFolderId = await resolveGroupRootFolder(groupId);
      const isInside = await assertFolderInsideRoot(drive, folderId, rootFolderId);
      if (!isInside) {
        return res.status(403).json({ error: "Acesso negado: pasta fora do diretório do grupo." });
      }
    }

    await drive.files.update({
      fileId: folderId,
      requestBody: {
        name: newName
      }
    });

    if (groupId) {
      if (isPersonal) {
        await db.collection("groups").doc(groupId).set({
          driveRootFolderName: newName,
        }, { merge: true });

        await db.collection("groups").doc(groupId).collection("settings").doc("drive").set({
          mainFolderName: newName,
        }, { merge: true });
      } else {
        await db.collection("groups").doc(groupId).collection("settings").doc("drive").set({
          mainFolderName: newName,
        }, { merge: true });
      }
    } else {
      await db.collection("users").doc(userId).collection("settings").doc("drive").set({
        mainFolderName: newName,
      }, { merge: true });
    }

    res.json({ success: true, folderId, newName });
  } catch (err: any) {
    console.error("[Drive] Rename Exception:", err);
    res.status(500).json({ error: `Erro ao renomear pasta: ${err.message || err}` });
  }
});

// Create Subfolder in Google Drive parent folder
app.post("/api/drive/create-folder", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).json({ error: "Acesso ao Google Drive não autorizado. Certifique-se de realizar o login." });

  const { name, parentFolderId } = req.body;
  if (!name) return res.status(400).json({ error: "O nome da subpasta é obrigatório." });
  if (!parentFolderId) return res.status(400).json({ error: "ID da pasta pai é obrigatório." });

  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "ID do grupo é obrigatório." });

  const drive = google.drive({ version: "v3", auth });

  try {
    const rootFolderId = await resolveGroupRootFolder(groupId);
    const isInside = await assertFolderInsideRoot(drive, parentFolderId, rootFolderId);
    if (!isInside) {
      return res.status(403).json({ error: "Acesso negado: pasta pai fora do diretório do grupo." });
    }

    const response = await drive.files.create({
      requestBody: {
        name: name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId]
      },
      fields: "id, name, mimeType"
    });

    const folderId = response.data.id!;

    if (groupId) {
      try {
        const membersSnap = await db.collection("groups").doc(groupId).collection("members").get();
        const emails = membersSnap.docs.map(d => d.data().userEmail).filter(e => !!e);
        await shareItemWithMembers(drive, folderId, emails);
      } catch (shareErr: any) {
        console.warn("[Drive] Failed to share new subfolder with group members:", shareErr.message);
      }
    }

    res.json({ success: true, id: folderId, name: response.data.name, mimeType: response.data.mimeType });
  } catch (err: any) {
    console.error("[Drive] Folder Creation Exception:", err);
    res.status(500).json({ error: `Erro ao criar pasta: ${err.message || err}` });
  }
});

// Proxy and Stream Google Drive file content securely in the app
app.get("/api/drive/file/:fileId", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) return res.status(401).send("Acesso não autorizado.");

  const fileId = req.params.fileId;
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).send("ID do grupo é obrigatório.");

  const drive = google.drive({ version: "v3", auth });

  try {
    const rootFolderId = await resolveGroupRootFolder(groupId);
    const isInside = await assertFolderInsideRoot(drive, fileId, rootFolderId);
    if (!isInside) {
      return res.status(403).send("Acesso negado: o arquivo está fora do diretório do grupo.");
    }

    const fileMeta = await drive.files.get({
      fileId,
      fields: "mimeType, name, size"
    });

    const mimeType = fileMeta.data.mimeType || "application/octet-stream";
    const name = fileMeta.data.name || "file";

    res.setHeader("Content-Type", mimeType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(name)}"`);
    if (fileMeta.data.size) {
      res.setHeader("Content-Length", fileMeta.data.size);
    }

    const response = await drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" }
    );

    response.data
      .on("error", (err: any) => {
        console.error("[Drive Stream Error] error streaming:", err);
        if (!res.headersSent) {
          res.status(500).send("Erro ao transmitir arquivo.");
        }
      })
      .pipe(res);

  } catch (err: any) {
    console.error("[Drive] Proxy file exception:", err);
    if (!res.headersSent) {
      res.status(500).send(err.message || "Erro ao obter o arquivo do Google Drive.");
    }
  }
});

app.get("/api/drive/list", async (req, res) => {
  const auth = getAuthClient(req);
  if (!auth) {
    return res.status(403).json({ error: "Autorização do Google Drive necessária ou expirada. Reconecte sua conta do Google." });
  }

  const { folderName, parentFolderId } = req.query;
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "ID do grupo é obrigatório." });

  const drive = google.drive({ version: "v3", auth });

  try {
    const rootFolderId = await resolveGroupRootFolder(groupId);
    let targetParentId = parentFolderId as string;

    if (!targetParentId && folderName) {
      // Find the subfolder ID inside the secure rootFolderId
      const folderRes = await drive.files.list({
        q: `name = '${(folderName as string).replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed = false`,
        fields: "files(id)",
      });
      
      if (folderRes.data.files && folderRes.data.files.length > 0) {
        targetParentId = folderRes.data.files[0].id!;
      } else {
        // Create the subfolder under secure rootFolderId if it doesn't exist (Lazy creation)
        try {
          const createFolderRes = await drive.files.create({
            requestBody: {
              name: folderName as string,
              mimeType: "application/vnd.google-apps.folder",
              parents: [rootFolderId],
            },
            fields: "id",
          });
          targetParentId = createFolderRes.data.id!;
          
          // Share newly created lazy subfolder with all group members
          const membersSnap = await db.collection("groups").doc(groupId).collection("members").get();
          const emails = membersSnap.docs.map(d => d.data().userEmail).filter(e => !!e);
          await shareItemWithMembers(drive, targetParentId, emails);
        } catch (createErr: any) {
          console.error("[Drive] Error creating subfolder during list:", createErr);
          return res.json([]); // Fallback to empty list if creation fails
        }
      }
    } else if (!targetParentId) {
       targetParentId = rootFolderId;
    }

    // Security Check: Target folder must reside securely inside rootFolderId
    const isInside = await assertFolderInsideRoot(drive, targetParentId, rootFolderId);
    if (!isInside) {
      return res.status(403).json({ error: "Acesso negado: pasta fora do diretório do grupo." });
    }

    let q = `trashed = false and '${targetParentId}' in parents`;

    const response = await drive.files.list({
      q: q,
      fields: "files(id, name, mimeType, webViewLink, iconLink, thumbnailLink, createdTime)",
      orderBy: "createdTime desc",
    });

    res.json(response.data.files || []);
  } catch (error: any) {
    console.error("[Drive] List error:", error);
    if (error.status === 401 || error.status === 403 || error.message?.includes("auth") || error.message?.includes("credentials") || error.message?.includes("permission")) {
      return res.status(403).json({ error: "Autorização do Google Drive necessária ou expirada. Reconecte sua conta do Google." });
    }
    res.status(500).json({ error: error.message || String(error) });
  }
});

// Generic Storage Upload
app.get("/api/debug/storage-buckets", async (req, res) => {
  try {
    const [buckets] = await (getStorage() as any).getBuckets();
    res.json({ buckets: buckets.map(b => (b as any).name) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generic Storage Upload (Original for Firebase Storage)
app.post("/api/storage/upload", express.json({ limit: "25mb" }), async (req, res) => {
  const { name, mimeType, base64Data } = req.body;

  if (!base64Data) {
    return res.status(400).json({ error: "Missing base64Data" });
  }

  try {
    const buffer = Buffer.from(base64Data, "base64");
    const filename = name || `Upload_${Date.now()}.jpg`;
    const destination = `uploads/${filename}`;
    
    // We'll try a few common bucket names if the primary one fails
    const projectId = firebaseConfig.projectId;
    const bucketsToTry = [
      bucket.name, // The one from config via proxy
      firebaseConfig.storageBucket,
      `${projectId}.appspot.com`,
      `${projectId}.firebasestorage.app`,
      projectId, // Bare project ID
    ].filter((b, i, arr) => b && arr.indexOf(b) === i && b !== "[DEFAULT]"); // Unique non-null and not placeholder

    let lastError: any = null;
    let successfulBucketName = "";
    let fileObj: any = null;
    let attemptedBuckets: string[] = [];

    for (const bucketName of bucketsToTry) {
      if (!bucketName || bucketName === "") continue;
      attemptedBuckets.push(bucketName);
      try {
        console.log(`[Upload] Attempting bucket: ${bucketName}`);
        const currentBucket = getStorage().bucket(bucketName);
        const currentFile = currentBucket.file(destination);
        
        await currentFile.save(buffer, {
          metadata: { contentType: mimeType || "image/jpeg" },
          resumable: false
        });
        
        fileObj = currentFile;
        successfulBucketName = bucketName;
        console.log(`[Upload] Success with bucket: ${bucketName}`);
        break; // Exit loop on success
      } catch (err: any) {
        lastError = err;
        console.warn(`[Upload] Failed with bucket ${bucketName}: ${err.message}`);
      }
    }

    if (!fileObj) {
      console.log("[Upload] All candidate buckets failed. Attempting to list available buckets...");
      try {
        const [availableBuckets] = await (getStorage() as any).getBuckets();
        const bucketNames = availableBuckets.map((b: any) => b.name);
        console.log(`[Upload] Available buckets found: ${bucketNames.join(", ")}`);
        
        if (bucketNames.length > 0) {
          // Try each found bucket
          for (const bName of bucketNames) {
            if (attemptedBuckets.includes(bName)) continue;
            try {
              console.log(`[Upload] Trying discovered bucket: ${bName}`);
              const currentBucket = getStorage().bucket(bName);
              const currentFile = currentBucket.file(destination);
              await currentFile.save(buffer, {
                metadata: { contentType: mimeType || "image/jpeg" },
                resumable: false
              });
              fileObj = currentFile;
              successfulBucketName = bName;
              break;
            } catch (err: any) {
              console.warn(`[Upload] Rediscovered bucket ${bName} failed: ${err.message}`);
            }
          }
        } else {
          lastError = new Error("Nenhum bucket de storage encontrado no projeto. Por favor, ative o Firebase Storage no console e clique em 'Começar'.");
        }
      } catch (listErr: any) {
        console.error("[Upload] Failed to list buckets while recovering:", listErr);
        // If we can't even list, we might have an IAM issue or NO buckets exist.
      }
    }

    if (!fileObj) {
      console.error(`[Upload] All buckets failed. Final attempt failed with:`, lastError);
      return res.status(500).json({ 
        error: lastError?.message || "Erro no upload: Nenhum bucket de Storage disponível.",
        code: lastError?.code || 500,
        details: lastError?.errors || [],
        suggestion: "Verifique se o Firebase Storage está ativado no console do Firebase e se o bucket padrão foi criado."
      });
    }

    try {
      await fileObj.makePublic();
    } catch (publicError: any) {
      console.warn(`[Upload] makePublic failed:`, publicError);
    }

    const publicUrl = `https://storage.googleapis.com/${successfulBucketName}/${encodeURIComponent(destination)}`;
    console.log(`[Upload] Public URL: ${publicUrl}`);

    res.json({
      id: fileObj.name,
      name: fileObj.name,
      webViewLink: publicUrl,
      webContentLink: publicUrl
    });
  } catch (error: any) {
    console.error(`[Upload] Global error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// --- Stripe Integration ---
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    await requireAuth(req);
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
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
    // 1. Verify file ownership via parent patient or directly if stored
    const fileRef = db.collection("files").doc(fileId);
    const fileDoc = await fileRef.get();
    if (!fileDoc.exists) return res.status(404).json({ error: "File not found" });
    
    const fileData = fileDoc.data();
    const { groupId } = await requirePatientAccess(req, fileData?.patientId);

    // 2. Quota increment in Firestore
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

  try {
    const user = await getAuthenticatedUser(req);
    const email = user?.email;

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

  try {
    const user = await getAuthenticatedUser(req).catch(() => null);
    if (!user) return res.json({ subscribed: false, authenticated: false });
    const email = user.email;

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
