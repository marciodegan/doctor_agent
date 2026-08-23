import express from "express";
import multer from "multer";
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

let hasServiceAccountCredential = false;

// Helper to safely parse service account from environment
function parseServiceAccount(raw?: string): any {
  if (!raw) return null;
  let str = raw.trim();
  if (str.startsWith('"') && str.endsWith('"')) {
    str = str.slice(1, -1);
  }
  // If base64-encoded, decode it
  if (!str.startsWith("{") && (str.startsWith("ey") || str.includes("="))) {
    try {
      str = Buffer.from(str, "base64").toString("utf8");
    } catch (_) {}
  }
  try {
    const parsed = JSON.parse(str);
    if (parsed.private_key && typeof parsed.private_key === "string") {
      // Fix escaped newlines in private key
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (e) {
    console.error("[Firebase] Error parsing FIREBASE_SERVICE_ACCOUNT:", e);
    return null;
  }
}

// Initialize Firebase Admin lazily or at module level but safely
if (firebaseConfig.projectId && !admin.apps.length) {
  try {
    const cert = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (cert && cert.project_id && cert.private_key) {
      admin.initializeApp({
        credential: admin.credential.cert(cert),
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket
      });
      hasServiceAccountCredential = true;
      console.log("[Firebase] Admin initialized with service account certificate.");
    } else {
      admin.initializeApp({
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket
      });
      console.log("[Firebase] Admin initialized with projectId (ADC / standard credentials):", firebaseConfig.projectId);
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

const clearAuthCookies = (res: express.Response) => {
  const options = { httpOnly: true, secure: true, sameSite: "none" as const, path: "/" };
  res.clearCookie(COOKIE_NAME, { ...options, partitioned: true });
  res.clearCookie(LEGACY_COOKIE_NAME, options);
  res.clearCookie("n_session_p", { ...options, partitioned: true });
  res.clearCookie("n_session_u", options);
  res.clearCookie("google_token", options);
};

const isInvalidGrantError = (err: any) => {
  if (!err) return false;
  const errMsg = (err.message || "").toLowerCase();
  const errDesc = (err.response?.data?.error_description || "").toLowerCase();
  const errCode = (err.code || "").toLowerCase();
  const errString = JSON.stringify(err).toLowerCase();

  return (
    errMsg.includes("invalid_grant") ||
    errMsg.includes("expired or revoked") ||
    errDesc.includes("invalid_grant") ||
    errDesc.includes("expired or revoked") ||
    errCode.includes("invalid_grant") ||
    errString.includes("invalid_grant") ||
    errString.includes("expired or revoked")
  );
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
  } catch (e: any) {
    console.error("[API] Error getting user ID:", e);
    if (isInvalidGrantError(e)) {
      (req as any).isInvalidGrant = true;
    }
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
    if (isInvalidGrantError(err) || (req as any).isInvalidGrant) {
      clearAuthCookies(res);
      return res.status(401).json({ error: "invalid_grant", message: "Sua sessão expirou. Por favor, faça login novamente." });
    }
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

  const withTimeout = <T>(promise: Promise<T>, timeoutMs = 7000, label = "Operation"): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs))
    ]);
  };

  try {
    const oauth2 = google.oauth2({ version: "v2", auth: authClient });
    const userRes = await withTimeout(oauth2.userinfo.get(), 6000, "Google OAuth userinfo");
    const { id, email, name, picture } = userRes.data;

    if (!id) throw new Error("No user ID found");

    if (!hasServiceAccountCredential && !process.env.K_SERVICE && !process.env.GOOGLE_CLOUD_PROJECT) {
      console.error("[Firebase] createCustomToken requested on external host without FIREBASE_SERVICE_ACCOUNT.");
      return res.status(500).json({
        error: "missing_service_account",
        details: "The FIREBASE_SERVICE_ACCOUNT environment variable is required on Vercel to generate Firebase tokens. Please set it in Vercel project settings."
      });
    }

    // Ensure User exists in Firebase Auth with correct metadata
    try {
      await withTimeout(
        admin.auth().updateUser(id, {
          email: email || undefined,
          displayName: name || undefined,
          photoURL: picture || undefined,
          emailVerified: true
        }),
        4000,
        "admin.auth().updateUser"
      );
    } catch (e: any) {
      if (e.code === 'auth/user-not-found') {
        await withTimeout(
          admin.auth().createUser({
            uid: id,
            email: email || undefined,
            displayName: name || undefined,
            photoURL: picture || undefined,
            emailVerified: true
          }),
          4000,
          "admin.auth().createUser"
        );
      }
    }

    const customToken = await withTimeout(
      admin.auth().createCustomToken(id, { email, name }),
      5000,
      "admin.auth().createCustomToken"
    );
    
    // Also upsert user profile in Firestore (best effort)
    try {
      await withTimeout(
        db.collection("users").doc(id).set({
          uid: id,
          email: email || "",
          name: name || "",
          photoURL: picture || "",
          lastSeen: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true }),
        3000,
        "Firestore upsert user"
      );
    } catch (dbErr) {
      console.warn("[Firebase] Could not upsert user document:", dbErr);
    }

    res.json({ customToken });
  } catch (err: any) {
    console.error("[Firebase] Error in /api/auth/firebase-token:", err);
    if (isInvalidGrantError(err) || (err.message && err.message.includes("timed out"))) {
      clearAuthCookies(res);
      return res.status(401).json({
        error: "session_expired",
        message: "Sua sessão expirou ou não pôde ser validada. Por favor, faça login novamente."
      });
    }
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
  clearAuthCookies(res);
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
    if (isInvalidGrantError(err) || (req as any).isInvalidGrant) {
      clearAuthCookies(res);
      return res.status(401).json({ error: "invalid_grant", message: "Sua sessão expirou. Por favor, faça login novamente." });
    }
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
    const isVideoUrlLocal = (url: string) => {
      if (!url) return false;
      const cleanUrl = url.split("?")[0].toLowerCase();
      return cleanUrl.endsWith(".mp4") || cleanUrl.endsWith(".mov") || cleanUrl.endsWith(".webm") || cleanUrl.endsWith(".quicktime") || cleanUrl.endsWith(".m4v");
    };
    const isPdfUrlLocal = (url: string) => {
      if (!url) return false;
      const cleanUrl = url.split("?")[0].toLowerCase();
      return cleanUrl.endsWith(".pdf");
    };

    report.imagens = filesSnap.docs
      .filter(doc => doc.data().status !== "removed")
      .map(doc => {
        const data = doc.data();
        const fileTypeResolved = data.fileType || (isVideoUrlLocal(data.link || "") ? "video" : (isPdfUrlLocal(data.link || "") ? "pdf" : "image"));
        return {
          id: doc.id,
          data: data.timestamp ? data.timestamp.toDate().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Recent",
          descricao: data.description || "Arquivo",
          link: data.link,
          aiResposta: data.aiAnalysis || "",
          fileType: fileTypeResolved,
          contentType: data.contentType || "",
          size: data.size || 0,
          originalName: data.originalName || data.description || "Arquivo",
          uploadedByEmail: data.uploadedByEmail || "",
          encryption: data.encryption || null
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

// Helpers for secure file uploading and formatting
const sanitizeFileName = (fileName: string): string => {
  if (!fileName) return "arquivo_" + Date.now();
  
  // 1. Normalize accents
  let sanitized = fileName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // 2. Separate name and extension
  const lastDotIndex = sanitized.lastIndexOf(".");
  let namePart = lastDotIndex !== -1 ? sanitized.substring(0, lastDotIndex) : sanitized;
  let extPart = lastDotIndex !== -1 ? sanitized.substring(lastDotIndex + 1) : "";
  
  // 3. Replace spaces with dash
  namePart = namePart.replace(/\s+/g, "-");
  
  // 4. Keep only letters, numbers, dash and underscore
  namePart = namePart.toLowerCase().replace(/[^a-z0-9-_.]/g, "");
  
  // Lowercase extension and keep only alphanumeric
  extPart = extPart.toLowerCase().replace(/[^a-z0-9]/g, "");
  
  // If namePart becomes empty, generate a fallback
  let finalName = namePart || "arquivo_" + Date.now();
  
  // Assemble back
  return extPart ? `${finalName}.${extPart}` : finalName;
};

const getSafeContentType = (fileName: string, fileMime?: string): string => {
  const name = (fileName || "").toLowerCase();
  const ext = name.split(".").pop() || "";
  const mime = (fileMime || "").toLowerCase();

  if (ext === "mov") return "video/quicktime";
  if (ext === "mp4") return "video/mp4";
  if (ext === "m4v") return "video/x-m4v";
  if (ext === "webm") return "video/webm";
  if (ext === "3gp") return "video/3gpp";
  if (ext === "3gpp") return "video/3gpp";
  if (ext === "mkv") return "video/x-matroska";
  if (ext === "avi") return "video/x-msvideo";
  if (ext === "wmv") return "video/x-ms-wmv";
  if (ext === "flv") return "video/x-flv";
  if (ext === "qt") return "video/quicktime";
  if (ext === "ts") return "video/mp2t";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "pdf") return "application/pdf";

  if (mime && mime !== "application/octet-stream" && mime !== "") {
    return mime;
  }

  return "application/octet-stream";
};

// Secure Image Sharing Endpoints
app.post("/api/share/create", express.json(), async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    let { url, groupId, patientName, alt } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL é obrigatória" });
    }

    // Extract raw storage URL if wrapped in proxy
    if (url.includes("proxy-storage-file?url=")) {
      try {
        const idx = url.indexOf("proxy-storage-file?url=");
        const param = url.substring(idx + "proxy-storage-file?url=".length);
        const decoded = decodeURIComponent(param);
        if (decoded.startsWith("http")) {
          url = decoded;
        }
      } catch (e) {}
    }

    const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

    const shareRecord = {
      token,
      groupId: groupId || "",
      fileUrl: url,
      patientName: patientName || "",
      alt: alt || "Imagem",
      createdBy: user?.uid || "",
      createdAt: new Date().toISOString()
    };

    await db.collection("share_tokens").doc(token).set(shareRecord);

    const host = req.get("x-forwarded-host") || req.get("host") || "";
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const shareUrl = `${protocol}://${host}/share/${token}`;

    return res.json({ token, shareUrl, shortUrl: shareUrl });
  } catch (err: any) {
    console.error("[Share] Error creating token:", err);
    return res.status(500).json({ error: err.message || "Erro ao gerar link de compartilhamento" });
  }
});

app.post("/api/shorten-url", express.json(), async (req, res, next) => {
  // Direct internal forwarding for backwards compatibility
  try {
    const user = await getAuthenticatedUser(req);
    let { url, groupId, patientName, alt } = req.body || {};
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "URL é obrigatória" });
    }

    if (url.includes("proxy-storage-file?url=")) {
      try {
        const idx = url.indexOf("proxy-storage-file?url=");
        const param = url.substring(idx + "proxy-storage-file?url=".length);
        const decoded = decodeURIComponent(param);
        if (decoded.startsWith("http")) {
          url = decoded;
        }
      } catch (e) {}
    }

    const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);

    await db.collection("share_tokens").doc(token).set({
      token,
      groupId: groupId || "",
      fileUrl: url,
      patientName: patientName || "",
      alt: alt || "Imagem",
      createdBy: user?.uid || "",
      createdAt: new Date().toISOString()
    });

    const host = req.get("x-forwarded-host") || req.get("host") || "";
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const shareUrl = `${protocol}://${host}/share/${token}`;

    return res.json({ token, shareUrl, shortUrl: shareUrl, code: token });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/share/verify", express.json(), async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Token é obrigatório" });
    }

    // 1. Authenticated user check
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({
        error: "unauthenticated",
        message: "Você precisa estar autenticado para visualizar esta imagem."
      });
    }

    // 2. Fetch share token doc
    let doc = await db.collection("share_tokens").doc(token).get();
    let tokenData = doc.exists ? doc.data() : null;

    if (!tokenData) {
      const legacyDoc = await db.collection("short_urls").doc(token).get();
      if (legacyDoc.exists) {
        const leg = legacyDoc.data();
        tokenData = {
          token,
          fileUrl: leg?.url || "",
          groupId: leg?.groupId || "",
          patientName: leg?.patientName || "",
          alt: leg?.alt || "Imagem"
        };
      }
    }

    if (!tokenData) {
      return res.status(404).json({
        error: "not_found",
        message: "O link de imagem compartilhado é inválido ou expirou."
      });
    }

    const { groupId, patientName, alt } = tokenData;

    // 3. Group membership check (if groupId is set)
    if (groupId) {
      try {
        await requireGroupMember(req, groupId);
      } catch (membershipErr: any) {
        console.warn(`[Share] User ${user.email || user.uid} denied access to group ${groupId}:`, membershipErr.message);
        return res.status(403).json({
          error: "access_denied",
          message: `Acesso Negado: Sua conta (${user.email || "conectada"}) não pertence ao grupo responsável por esta imagem.`
        });
      }
    }

    return res.json({
      authorized: true,
      token,
      groupId: groupId || "",
      patientName: patientName || "Ficha de Paciente",
      alt: alt || "Imagem",
      mediaUrl: `/api/share/media/${token}`
    });
  } catch (err: any) {
    console.error("[Share] Error verifying token:", err);
    return res.status(500).json({ error: "Erro interno ao validar compartilhamento." });
  }
});

// Secure Patient Profile Sharing Endpoints
app.post("/api/share/patient/create", express.json(), async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ error: "Você precisa estar autenticado." });
    }

    const { patientId } = req.body || {};
    if (!patientId || typeof patientId !== "string") {
      return res.status(400).json({ error: "patientId é obrigatório" });
    }

    const { groupId, patient } = await requirePatientAccess(req, patientId);

    const existingSnap = await db.collection("patient_share_tokens")
      .where("patientId", "==", patientId)
      .limit(1)
      .get();

    let token = "";
    if (!existingSnap.empty) {
      token = existingSnap.docs[0].id;
    } else {
      token = "p_" + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      await db.collection("patient_share_tokens").doc(token).set({
        token,
        type: "patient",
        patientId,
        groupId,
        patientName: patient.name || "Paciente",
        createdBy: user.uid,
        createdAt: new Date().toISOString()
      });
    }

    const host = req.get("x-forwarded-host") || req.get("host") || "";
    const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
    const shareUrl = `${protocol}://${host}/patient/${token}`;

    return res.json({ token, shareUrl, patientId, patientName: patient.name });
  } catch (err: any) {
    console.error("[SharePatient] Error creating patient share token:", err);
    return res.status(err.statusCode || 500).json({ error: err.message || "Erro ao gerar link do paciente" });
  }
});

app.post("/api/share/patient/verify", express.json(), async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Token é obrigatório" });
    }

    // 1. Authenticated user check
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({
        error: "unauthenticated",
        message: "Você precisa estar autenticado para acessar a página deste paciente."
      });
    }

    // 2. Fetch token doc
    const doc = await db.collection("patient_share_tokens").doc(token).get();
    if (!doc.exists) {
      return res.status(404).json({
        error: "not_found",
        message: "O link de compartilhamento deste paciente é inválido ou expirou."
      });
    }

    const tokenData = doc.data();
    const { patientId } = tokenData || {};

    if (!patientId) {
      return res.status(404).json({
        error: "not_found",
        message: "Paciente não encontrado para este link."
      });
    }

    // 3. Group membership check via requirePatientAccess
    let access;
    try {
      access = await requirePatientAccess(req, patientId);
    } catch (accessErr: any) {
      console.warn(`[SharePatient] Access denied to patient ${patientId} for user ${user.email || user.uid}:`, accessErr.message);
      return res.status(403).json({
        error: "access_denied",
        message: `Acesso Negado: Sua conta (${user.email || "conectada"}) não pertence ao grupo responsável por este paciente.`
      });
    }

    const { groupId, patient } = access;

    // 4. Build full patient report data
    const report: any = {
      cadastro: null,
      audios: [],
      imagens: [],
      familiares: []
    };

    const [contactsSnap, logsSnap, filesSnap, statusesSnap, hospitalsSnap] = await Promise.all([
      db.collection("patients_contacts").where("patientId", "==", patientId).get(),
      db.collection("patient_logs").where("patientId", "==", patientId).orderBy("createdAt", "desc").get(),
      db.collection("files").where("patientId", "==", patientId).orderBy("timestamp", "desc").get(),
      db.collection("patient_statuses").where("groupId", "==", groupId).get(),
      db.collection("hospitals").where("groupId", "==", groupId).get()
    ]);

    const statusesMap = new Map();
    statusesSnap.docs.forEach(d => {
      const data = d.data();
      statusesMap.set(d.id, data.name || data.nome);
    });

    const hospitalsMap = new Map();
    hospitalsSnap.docs.forEach(d => {
      const data = d.data();
      hospitalsMap.set(d.id, data.name || data.nome);
    });

    const allStatuses = statusesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const allHospitals = hospitalsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    report.cadastro = {
      ID: patientId,
      Nome: patient.name,
      Idade: patient.age || null,
      Status: patient.status || null,
      hospitalId: patient.hospitalId || null,
      hospital_nome: hospitalsMap.get(patient.hospitalId) || patient.hospital_nome || "Não informado",
      roomNumber: patient.roomNumber || patient.room_number || "Sala ?",
      procedure: patient.procedure || "",
      surgery_type: patient.surgery_type || "",
      Telefone: patient.phone || patient.telefone || ""
    };

    report.familiares = contactsSnap.docs
      .filter(d => d.data().status !== "removed" && !d.data().isDeleted && !d.data().deletedAt)
      .map(d => ({
        id: d.id,
        nome: d.data().name || d.data().nome,
        relacao: d.data().relationship || d.data().relacao,
        fone: d.data().phone || d.data().fone
      }));

    report.audios = logsSnap.docs
      .filter(d => d.data().status !== "removed" && !d.data().isDeleted && !d.data().deletedAt)
      .map(d => ({
        id: d.id,
        conteudo: d.data().text || d.data().conteudo,
        tipo: d.data().type || "texto",
        data: d.data().createdAt ? new Date(d.data().createdAt.toDate ? d.data().createdAt.toDate() : d.data().createdAt).toLocaleDateString("pt-BR") : ""
      }));

    report.imagens = filesSnap.docs
      .filter(d => d.data().status !== "removed" && !d.data().isDeleted && !d.data().deletedAt)
      .map(d => ({
        id: d.id,
        descricao: d.data().description || d.data().descricao || "Imagem",
        link: d.data().link || d.data().url || "",
        data: d.data().timestamp ? new Date(d.data().timestamp.toDate ? d.data().timestamp.toDate() : d.data().timestamp).toLocaleDateString("pt-BR") : "",
        aiAnalysis: d.data().aiAnalysis || d.data().aiResposta
      }));

    return res.json({
      authorized: true,
      token,
      patientId,
      groupId,
      patientName: patient.name || "Ficha do Paciente",
      reportData: report,
      allStatuses,
      allHospitals,
      profileData: {
        id: patientId,
        nome: patient.name,
        idade: patient.age ? patient.age.toString() : "N/A",
        status: patient.status || "",
        hospitalId: patient.hospitalId || "",
        hospitalNome: hospitalsMap.get(patient.hospitalId) || patient.hospital_nome || "Não informado",
        roomNumber: patient.roomNumber || patient.room_number || "Sala ?",
        surgery_type: patient.surgery_type || "",
        procedure: patient.procedure || ""
      }
    });
  } catch (err: any) {
    console.error("[SharePatient] Error verifying patient token:", err);
    return res.status(500).json({ error: "Erro interno ao validar acesso ao paciente." });
  }
});

app.get("/api/share/media/:token", async (req, res) => {
  try {
    const token = req.params.token;

    // 1. Authenticated user check
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).send("Acesso restrito: Faça login para visualizar.");
    }

    // 2. Fetch share token doc
    let doc = await db.collection("share_tokens").doc(token).get();
    let tokenData = doc.exists ? doc.data() : null;

    if (!tokenData) {
      const legacyDoc = await db.collection("short_urls").doc(token).get();
      if (legacyDoc.exists) {
        tokenData = legacyDoc.data();
      }
    }

    if (!tokenData) {
      return res.status(404).send("Imagem não encontrada.");
    }

    const { groupId, fileUrl } = tokenData;

    // 3. Group membership check
    if (groupId) {
      try {
        await requireGroupMember(req, groupId);
      } catch (e) {
        return res.status(403).send("Acesso negado: Sua conta não pertence ao grupo responsável por esta imagem.");
      }
    }

    if (!fileUrl) {
      return res.status(404).send("Arquivo indisponível.");
    }

    // 4. Stream file bytes directly without exposing Storage URL
    let bucketName = "";
    let filePath = "";

    if (fileUrl.includes("storage.googleapis.com/") || fileUrl.includes("firebasestorage.googleapis.com/")) {
      try {
        const parsed = new URL(fileUrl);
        if (parsed.hostname === "storage.googleapis.com") {
          const parts = parsed.pathname.substring(1).split("/");
          bucketName = parts[0];
          filePath = decodeURIComponent(parts.slice(1).join("/"));
        } else if (parsed.hostname.includes("firebasestorage.googleapis.com")) {
          const match = parsed.pathname.match(/\/v0\/b\/([^/]+)\/o\/(.+)/);
          if (match) {
            bucketName = match[1];
            filePath = decodeURIComponent(match[2].split("?")[0]);
          }
        }
      } catch (e) {}
    }

    if (bucketName && filePath) {
      try {
        const targetBucket = getStorage().bucket(bucketName);
        const fileRef = targetBucket.file(filePath);
        const [exists] = await fileRef.exists();
        if (exists) {
          const [metadata] = await fileRef.getMetadata();
          const [buffer] = await fileRef.download();
          const contentType = metadata.contentType || "image/jpeg";
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "private, max-age=86400");
          return res.send(buffer);
        }
      } catch (err) {
        console.warn("[ShareMedia] Admin SDK read error:", err);
      }
    }

    // Fallback: server fetch directly and stream
    if (fileUrl.startsWith("http")) {
      const r = await fetch(fileUrl);
      if (r.ok) {
        const contentType = r.headers.get("content-type") || "image/jpeg";
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "private, max-age=86400");
        const arrayBuf = await r.arrayBuffer();
        return res.send(Buffer.from(arrayBuf));
      }
    }

    return res.status(404).send("Não foi possível carregar a imagem.");
  } catch (err: any) {
    console.error("[ShareMedia] Error:", err);
    return res.status(500).send("Erro interno ao carregar a imagem.");
  }
});

app.get("/s/:code", (req, res) => {
  res.redirect(301, `/share/${req.params.code}`);
});

// Secure proxy for Firebase Storage files to bypass browser CORS restrictions during decryption
app.get("/api/app/proxy-storage-file", async (req, res) => {
  const fileUrl = req.query.url as string;
  if (!fileUrl) {
    return res.status(400).json({ error: "Parâmetro URL é obrigatório." });
  }

  try {
    await requireAuth(req);

    const parsedUrl = new URL(fileUrl);
    const host = parsedUrl.hostname;
    const isValidHost = 
      host === "storage.googleapis.com" || 
      host.endsWith(".firebasestorage.app") || 
      host === "firebasestorage.googleapis.com";

    if (!isValidHost) {
      return res.status(400).json({ error: "Host de armazenamento inválido." });
    }

    console.log(`[ProxyStorage] Fetching file over backend proxy to bypass CORS: ${fileUrl}`);
    const r = await fetch(fileUrl);
    if (!r.ok) {
      return res.status(r.status).json({ error: `Erro no servidor do Storage: ${r.statusText}` });
    }

    const contentType = r.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    const contentLength = r.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }

    res.setHeader("Access-Control-Allow-Origin", "*");

    const arrayBuffer = await r.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error: any) {
    console.error("[ProxyStorage] Proxy file failed:", error);
    res.status(500).json({ error: error.message || "Falha do proxy do arquivo." });
  }
});

// Upload image/document directly to Firebase Storage and link to Firestore
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB for HEVC/HD videos
});

app.post("/api/app/upload-image", (req, res, next) => {
  const isMultipart = (req.headers["content-type"] || "").includes("multipart/form-data");
  if (isMultipart) {
    upload.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || "Erro no upload do arquivo multi-parte." });
      }
      next();
    });
  } else {
    express.json({ limit: "200mb" })(req, res, next);
  }
}, async (req, res) => {
  const isMultipart = (req.headers["content-type"] || "").includes("multipart/form-data");
  
  let patientId: string = "";
  let description: string = "";
  let fileName: string = "";
  let mimeType: string = "";
  let originalName: string = "";
  let size: number = 0;
  let platform: string = "";
  let buffer: Buffer;

  // Encryption helper fields from client
  let isEncrypted = false;
  let iv = "";
  let originalContentType = "";

  if (isMultipart) {
    const file = req.file;
    patientId = req.body.patientId || "";
    description = req.body.description || "";
    platform = req.body.platform || "";
    isEncrypted = req.body.isEncrypted === "true" || req.body.isEncrypted === true;
    iv = req.body.iv || "";
    originalContentType = req.body.originalContentType || "";
    
    if (!file) {
      return res.status(400).json({ error: "Nenhum arquivo enviado no corpo da requisição." });
    }
    if (!patientId) {
      return res.status(400).json({ error: "PatientID é obrigatório." });
    }

    fileName = file.originalname;
    originalName = file.originalname;
    mimeType = file.mimetype;
    size = file.size;
    buffer = file.buffer;
  } else {
    const { patientId: pId, description: desc, fileName: fName, mimeType: mType, base64Data, originalName: origName, size: sz, platform: plt, isEncrypted: isEnc, iv: ivVal, originalContentType: origContType } = req.body || {};
    patientId = pId;
    description = desc || "";
    fileName = fName || "";
    mimeType = mType || "";
    originalName = origName || "";
    size = sz || 0;
    platform = plt || "";
    isEncrypted = isEnc === "true" || isEnc === true;
    iv = ivVal || "";
    originalContentType = origContType || "";

    if (!patientId || !base64Data) return res.status(400).json({ error: "PatientID e Imagem/Arquivo são obrigatórios." });

    buffer = Buffer.from(base64Data, "base64");
    size = size || buffer.length;
    fileName = fileName || "file";
    originalName = originalName || fileName;
    mimeType = mimeType || "image/jpeg";
  }

  const rawName = originalName || fileName || "file";
  const safeFileName = sanitizeFileName(rawName);
  const safeContentType = getSafeContentType(safeFileName, mimeType);

  try {
    const authUser = await requireAuth(req);
    const { groupId } = await requirePatientAccess(req, patientId);

    // Determine type, validation and size limits
    const mime = safeContentType;
    const name = safeFileName;
    
    // Choose which mime/name to use for logical type checking
    const mimeToCheck = isEncrypted ? (originalContentType || "") : mime;
    const nameToCheck = isEncrypted ? (rawName || "") : name;

    let fileTypeResolved: "image" | "video" | "pdf" = "image";
    if (mimeToCheck.startsWith("image/") || nameToCheck.endsWith(".heic") || nameToCheck.endsWith(".jpeg") || nameToCheck.endsWith(".jpg") || nameToCheck.endsWith(".png") || nameToCheck.endsWith(".webp")) {
      fileTypeResolved = "image";
    } else if (
      mimeToCheck.startsWith("video/") || 
      nameToCheck.endsWith(".mp4") || 
      nameToCheck.endsWith(".mov") || 
      nameToCheck.endsWith(".webm") || 
      nameToCheck.endsWith(".quicktime") || 
      nameToCheck.endsWith(".m4v") || 
      nameToCheck.endsWith(".3gp") || 
      nameToCheck.endsWith(".3gpp") || 
      nameToCheck.endsWith(".mkv") || 
      nameToCheck.endsWith(".avi") || 
      nameToCheck.endsWith(".wmv") || 
      nameToCheck.endsWith(".flv") || 
      nameToCheck.endsWith(".qt") || 
      nameToCheck.endsWith(".ts")
    ) {
      fileTypeResolved = "video";
    } else if (mimeToCheck === "application/pdf" || nameToCheck.endsWith(".pdf")) {
      fileTypeResolved = "pdf";
    } else {
      return res.status(400).json({ error: "Tipo de arquivo não permitido. Envie uma imagem, vídeo ou PDF." });
    }

    const fileSize = size || buffer.length;

    // Detailed logs before upload to storage
    console.log("[Upload] file metadata received");
    console.log("[Upload] name", rawName);
    console.log("[Upload] type", mimeType);
    console.log("[Upload] size", fileSize);
    console.log("[Upload] safeFileName", safeFileName);
    console.log("[Upload] safeContentType", safeContentType);
    console.log("[Upload] isEncrypted", isEncrypted);
    console.log("[Upload] iv", iv);
    console.log("[Upload] originalContentType", originalContentType);

    // Size limit check
    if (fileTypeResolved === "image" && fileSize > 10 * 1024 * 1024) {
      return res.status(400).json({ error: "Este arquivo é muito grande. Escolha um arquivo menor para anexar (máximo 10MB para imagens)." });
    }
    if (fileTypeResolved === "video" && fileSize > 100 * 1024 * 1024) {
      return res.status(400).json({ error: "Este vídeo é muito grande. Escolha um vídeo menor para anexar." });
    }
    if (fileTypeResolved === "pdf" && fileSize > 20 * 1024 * 1024) {
      return res.status(400).json({ error: "Este arquivo é muito grande. Escolha um arquivo menor para anexar (máximo 20MB para PDFs)." });
    }

    // 2. Upload to Firebase Storage with organized path
    const fileId = db.collection("files").doc().id;
    
    let destination = `patients/${patientId}/${safeFileName}`;
    if (groupId) {
      if (isEncrypted) {
        destination = `groups/${groupId}/encrypted-files/${fileId}/${safeFileName}.encrypted`;
      } else {
        destination = `groups/${groupId}/files/${fileId}/${safeFileName}`;
      }
    }

    console.log("[Upload] storagePath", destination);

    const file = bucket.file(destination);
    const contentTypeToSave = isEncrypted ? "application/octet-stream" : safeContentType;

    await file.save(buffer, {
      metadata: {
        contentType: contentTypeToSave,
        metadata: {
          patientId: patientId,
          description: description || "",
          groupId: groupId || "",
          originalName: rawName,
          uploadedFrom: "pwa",
          platform: platform || "other",
          ...(isEncrypted ? {
            encrypted: "true",
            iv: iv,
            originalContentType: originalContentType
          } : {})
        }
      }
    });

    // Make public and get URL
    await file.makePublic();
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(destination)}`;

    // 3. Save detailed metadata to Firestore (under files collection)
    const fileRef = db.collection("files").doc(fileId);
    const metadata = {
      id: fileId,
      groupId: groupId || "",
      patientId: patientId, // For backwards compatibility
      uploadedBy: authUser.uid,
      uploadedByEmail: authUser.email || "",
      originalName: rawName,
      contentType: contentTypeToSave,
      fileType: fileTypeResolved,
      size: fileSize,
      storagePath: destination,
      downloadURL: publicUrl,
      
      // legacy equivalents for maximum compatibility
      description: description || "Upload Direto",
      link: publicUrl,
      status: "active",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),

      // E2E Encryption-specific metadata (if encrypted)
      ...(isEncrypted ? {
        encryption: {
          algorithm: "AES-GCM",
          iv: iv,
          originalContentType: originalContentType,
          encrypted: true
        }
      } : {})
    };

    await fileRef.set(metadata);

    res.json({ success: true, fileId: fileId, link: publicUrl });
  } catch (error) {
    console.error("[Upload] error full", error);
    if (error && typeof error === "object") {
      console.error("[Upload] error code", (error as any).code);
      console.error("[Upload] error message", (error as any).message);
    }
    handleApiError(res, error, "Uploading files or images to Storage");
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
app.post("/api/storage/upload", express.json({ limit: "200mb" }), async (req, res) => {
  const { name, mimeType, base64Data, storagePath, destination: reqDest, customMetadata } = req.body;

  if (!base64Data) {
    return res.status(400).json({ error: "Missing base64Data" });
  }

  try {
    const buffer = Buffer.from(base64Data, "base64");
    const filename = name || `Upload_${Date.now()}.jpg`;
    const destination = storagePath || reqDest || `uploads/${filename}`;
    
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
        console.log(`[Upload] Attempting bucket: ${bucketName} for path: ${destination}`);
        const currentBucket = getStorage().bucket(bucketName);
        const currentFile = currentBucket.file(destination);
        
        await currentFile.save(buffer, {
          metadata: {
            contentType: mimeType || "image/jpeg",
            customMetadata: customMetadata || {}
          },
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
                metadata: {
                  contentType: mimeType || "image/jpeg",
                  customMetadata: customMetadata || {}
                },
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
      downloadURL: publicUrl,
      downloadUrl: publicUrl,
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

// ============================================================================
// --- Medicações e Estoque Cirúrgico APIs ---
// ============================================================================

async function logAudit(groupId: string, userId: string, userName: string, action: string, entityType: string, entityId: string, details: string) {
  try {
    const auditRef = db.collection("groups").doc(groupId).collection("auditLogs").doc();
    await auditRef.set({
      id: auditRef.id,
      groupId,
      userId,
      userName,
      action,
      entityType,
      entityId,
      details,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    console.error("Failed to log audit:", e);
  }
}

// 1. Medications Catalog
app.get("/api/app/medications", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupMember(req, groupId);
    const snap = await db.collection("groups").doc(groupId).collection("medications").get();
    const list = snap.docs.map(doc => doc.data());
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/app/medications", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupMember(req, groupId);
    const medData = req.body;
    const medRef = db.collection("groups").doc(groupId).collection("medications").doc();
    
    const medication = {
      id: medRef.id,
      groupId,
      genericName: medData.genericName || "",
      commercialName: medData.commercialName || "",
      category: medData.category || "Anestésico",
      activeIngredient: medData.activeIngredient || "",
      concentration: parseFloat(medData.concentration) || 0,
      concentrationUnit: medData.concentrationUnit || "mg",
      dosageForm: medData.dosageForm || "Injetável",
      presentation: medData.presentation || "Ampola",
      volumePerUnit: parseFloat(medData.volumePerUnit) || 1,
      stockUnit: medData.stockUnit || "Ampola",
      routeOfAdministration: medData.routeOfAdministration || "EV",
      manufacturer: medData.manufacturer || "",
      highVigilance: !!medData.highVigilance,
      controlled: !!medData.controlled,
      requiresDoubleCheck: !!medData.requiresDoubleCheck,
      allowsFractioning: !!medData.allowsFractioning,
      roundingRule: medData.roundingRule || "exact",
      minStock: parseFloat(medData.minStock) || 0,
      reorderPoint: parseFloat(medData.reorderPoint) || 0,
      idealStock: parseFloat(medData.idealStock) || 0,
      storageCondition: medData.storageCondition || "",
      observations: medData.observations || "",
      status: medData.status || "active",
      createdAt: new Date().toISOString(),
      createdBy: user.uid,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid
    };

    await medRef.set(medication);
    await logAudit(groupId, user.uid, user.email || "Usuário", "CREATE_MED", "medication", medRef.id, `Cadastrou medicamento: ${medication.genericName}`);
    res.json(medication);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/app/medications/:id", async (req, res) => {
  const groupId = getGroupId(req);
  const { id } = req.params;
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupMember(req, groupId);
    const medData = req.body;
    const medRef = db.collection("groups").doc(groupId).collection("medications").doc(id);
    
    const update = {
      ...medData,
      updatedAt: new Date().toISOString(),
      updatedBy: user.uid
    };
    delete update.id;
    delete update.groupId;
    delete update.createdAt;
    delete update.createdBy;

    await medRef.update(update);
    await logAudit(groupId, user.uid, user.email || "Usuário", "UPDATE_MED", "medication", id, `Atualizou dados do medicamento`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Protocols
app.get("/api/app/protocols", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupMember(req, groupId);
    const snap = await db.collection("groups").doc(groupId).collection("protocols").get();
    const list = snap.docs.map(doc => doc.data());
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/app/protocols", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupMember(req, groupId);
    const pData = req.body;
    const pRef = db.collection("groups").doc(groupId).collection("protocols").doc();
    
    const protocol = {
      id: pRef.id,
      groupId,
      name: pData.name || "",
      description: pData.description || "",
      procedureType: pData.procedureType || "",
      specialty: pData.specialty || "",
      minAge: pData.minAge ? parseInt(pData.minAge) : null,
      maxAge: pData.maxAge ? parseInt(pData.maxAge) : null,
      minWeight: pData.minWeight ? parseFloat(pData.minWeight) : null,
      maxWeight: pData.maxWeight ? parseFloat(pData.maxWeight) : null,
      applicationConditions: pData.applicationConditions || "",
      exclusionCriteria: pData.exclusionCriteria || "",
      version: 1,
      effectiveDate: new Date().toISOString().split("T")[0],
      status: pData.status || "draft",
      createdBy: user.uid,
      createdAt: new Date().toISOString(),
      medications: pData.medications || []
    };

    await pRef.set(protocol);
    await logAudit(groupId, user.uid, user.email || "Usuário", "CREATE_PROTOCOL", "protocol", pRef.id, `Criou protocolo: ${protocol.name}`);
    res.json(protocol);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/app/protocols/:id", async (req, res) => {
  const groupId = getGroupId(req);
  const { id } = req.params;
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupMember(req, groupId);
    const pData = req.body;
    const pRef = db.collection("groups").doc(groupId).collection("protocols").doc(id);
    
    const currentSnap = await pRef.get();
    if (!currentSnap.exists) {
      return res.status(404).json({ error: "Protocolo não encontrado." });
    }
    const current = currentSnap.data() || {};
    
    // Versioning logic: If modifying an already published protocol, create a new version
    let updatedVersion = current.version || 1;
    if (current.status === "published" && pData.status === "published") {
      updatedVersion += 1;
      // Save history of previous version
      await db.collection("groups").doc(groupId).collection("protocolVersions").doc(`${id}_v${current.version}`).set({
        ...current,
        archivedAt: new Date().toISOString()
      });
    }

    const update: any = {
      ...pData,
      version: updatedVersion,
      updatedAt: new Date().toISOString()
    };
    
    if (pData.status === "published") {
      update.publishedBy = user.uid;
      update.publishedAt = new Date().toISOString();
    } else if (pData.status === "approved") {
      update.approvedBy = user.uid;
      update.approvedAt = new Date().toISOString();
    }

    delete update.id;
    delete update.groupId;
    delete update.createdAt;
    delete update.createdBy;

    await pRef.update(update);
    await logAudit(groupId, user.uid, user.email || "Usuário", "UPDATE_PROTOCOL", "protocol", id, `Atualizou protocolo para versão ${updatedVersion}`);
    res.json({ success: true, version: updatedVersion });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Inventory Locations
app.get("/api/app/inventory-locations", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupMember(req, groupId);
    const snap = await db.collection("groups").doc(groupId).collection("inventoryLocations").get();
    let list = snap.docs.map(doc => doc.data());
    
    // Pre-populate if empty
    if (list.length === 0) {
      const defaults = [
        { name: "Almoxarifado Central", type: "central", description: "Estoque principal" },
        { name: "Maleta de Anestesia A", type: "bag", description: "Maleta móvel" },
        { name: "Farmácia Centro Cirúrgico", type: "surgery_center", description: "Medicamentos de pronto uso" }
      ];
      const batch = db.batch();
      for (const d of defaults) {
        const ref = db.collection("groups").doc(groupId).collection("inventoryLocations").doc();
        const loc = { id: ref.id, groupId, status: "active", ...d };
        batch.set(ref, loc);
        list.push(loc);
      }
      await batch.commit();
    }
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/app/inventory-locations", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupMember(req, groupId);
    const lData = req.body;
    const lRef = db.collection("groups").doc(groupId).collection("inventoryLocations").doc();
    
    const location = {
      id: lRef.id,
      groupId,
      name: lData.name || "",
      type: lData.type || "central",
      description: lData.description || "",
      status: "active"
    };

    await lRef.set(location);
    await logAudit(groupId, user.uid, user.email || "Usuário", "CREATE_LOCATION", "inventoryLocation", lRef.id, `Criou local de estoque: ${location.name}`);
    res.json(location);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Inventory Batches
app.get("/api/app/inventory-batches", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupMember(req, groupId);
    const snap = await db.collection("groups").doc(groupId).collection("inventoryBatches").get();
    const list = snap.docs.map(doc => doc.data());
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/app/inventory-batches", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupMember(req, groupId);
    const bData = req.body;
    
    const medDoc = await db.collection("groups").doc(groupId).collection("medications").doc(bData.medicationId).get();
    if (!medDoc.exists) return res.status(404).json({ error: "Medicamento não encontrado" });
    const medName = medDoc.data()?.genericName || "Medicamento";

    const bRef = db.collection("groups").doc(groupId).collection("inventoryBatches").doc();
    
    const qty = parseFloat(bData.initialQuantity) || 0;
    
    const batch = {
      id: bRef.id,
      groupId,
      medicationId: bData.medicationId,
      genericName: medName,
      batchNumber: bData.batchNumber || "LOT-NEW",
      expiryDate: bData.expiryDate || "",
      initialQuantity: qty,
      quantityAvailable: qty,
      quantityReserved: 0,
      quantityUnavailable: 0,
      locationId: bData.locationId || "",
      locationName: bData.locationName || "Almoxarifado",
      supplier: bData.supplier || "",
      entryDate: new Date().toISOString(),
      createdBy: user.uid
    };

    const batchOps = db.batch();
    batchOps.set(bRef, batch);

    // Track movement
    const movRef = db.collection("groups").doc(groupId).collection("stockMovements").doc();
    batchOps.set(movRef, {
      id: movRef.id,
      groupId,
      batchId: bRef.id,
      medicationId: batch.medicationId,
      genericName: batch.genericName,
      type: "entry",
      quantity: qty,
      locationId: batch.locationId,
      userId: user.uid,
      userName: user.email || "Estoquista",
      description: `Entrada inicial de estoque - Lote ${batch.batchNumber}`,
      timestamp: new Date().toISOString()
    });

    await batchOps.commit();
    await logAudit(groupId, user.uid, user.email || "Usuário", "ENTRY_BATCH", "inventoryBatch", bRef.id, `Cadastrou lote ${batch.batchNumber} de ${batch.genericName}`);
    res.json(batch);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Adjust stock / inventory audit
app.post("/api/app/inventory-batches/adjust", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupMember(req, groupId);
    const { batchId, newQuantity, justification } = req.body;
    
    if (!justification) return res.status(400).json({ error: "Justificativa obrigatória para ajustes manuais." });

    const bRef = db.collection("groups").doc(groupId).collection("inventoryBatches").doc(batchId);
    const bSnap = await bRef.get();
    if (!bSnap.exists) return res.status(404).json({ error: "Lote não encontrado" });
    
    const current = bSnap.data() || {};
    const oldQty = current.quantityAvailable || 0;
    const diff = parseFloat(newQuantity) - oldQty;
    
    const batchOps = db.batch();
    batchOps.update(bRef, {
      quantityAvailable: parseFloat(newQuantity)
    });

    // Track movement
    const movRef = db.collection("groups").doc(groupId).collection("stockMovements").doc();
    batchOps.set(movRef, {
      id: movRef.id,
      groupId,
      batchId,
      medicationId: current.medicationId,
      genericName: current.genericName,
      type: "inventory_adjustment",
      quantity: diff,
      locationId: current.locationId,
      userId: user.uid,
      userName: user.email || "Estoquista",
      description: `Ajuste manual de estoque. Motivo: ${justification}`,
      timestamp: new Date().toISOString()
    });

    await batchOps.commit();
    await logAudit(groupId, user.uid, user.email || "Usuário", "ADJUST_STOCK", "inventoryBatch", batchId, `Ajustou saldo de estoque de ${current.genericName}. De ${oldQty} para ${newQuantity}.`);
    res.json({ success: true, newQuantity });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Medication Plans (Surgical Planning)
app.get("/api/app/medication-plans", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupMember(req, groupId);
    const snap = await db.collection("groups").doc(groupId).collection("medicationPlans").get();
    const list = snap.docs.map(doc => doc.data());
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/app/medication-plans/:surgeryId", async (req, res) => {
  const groupId = getGroupId(req);
  const { surgeryId } = req.params;
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupMember(req, groupId);
    const doc = await db.collection("groups").doc(groupId).collection("medicationPlans").doc(surgeryId).get();
    if (doc.exists) {
      res.json(doc.data());
    } else {
      res.status(404).json({ error: "Planejamento não encontrado." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/app/medication-plans/calculate", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  
  try {
    await requireGroupMember(req, groupId);
    const { protocolId, patientWeight, patientAge, patientAllergies = [], patientRestrictions = "" } = req.body;
    
    if (!protocolId) return res.status(400).json({ error: "Protocol ID is required" });
    const weightNum = parseFloat(patientWeight);
    const ageNum = parseInt(patientAge);
    
    if (isNaN(weightNum) || weightNum <= 0) {
      return res.status(400).json({ error: "Peso do paciente válido é obrigatório." });
    }
    
    const protocolDoc = await db.collection("groups").doc(groupId).collection("protocols").doc(protocolId).get();
    if (!protocolDoc.exists) {
      return res.status(404).json({ error: "Protocolo não encontrado ou inativo." });
    }
    
    const protocol = protocolDoc.data();
    if (protocol?.status !== "published" && protocol?.status !== "approved") {
      return res.status(400).json({ error: "Não existe um protocolo aprovado para este cálculo. Cadastre ou selecione um protocolo antes de continuar." });
    }
    
    const items: any[] = [];
    
    // Check patient's age and weight limits
    if (protocol.minWeight && weightNum < protocol.minWeight) {
      return res.status(400).json({ error: `Peso do paciente está abaixo do mínimo exigido pelo protocolo (${protocol.minWeight} kg).` });
    }
    if (protocol.maxWeight && weightNum > protocol.maxWeight) {
      return res.status(400).json({ error: `Peso do paciente está acima do máximo exigido pelo protocolo (${protocol.maxWeight} kg).` });
    }
    if (protocol.minAge && ageNum < protocol.minAge) {
      return res.status(400).json({ error: `Idade do paciente está abaixo do mínimo exigido pelo protocolo (${protocol.minAge} anos).` });
    }
    if (protocol.maxAge && ageNum > protocol.maxAge) {
      return res.status(400).json({ error: `Idade do paciente está acima do máximo exigido pelo protocolo (${protocol.maxAge} anos).` });
    }
    
    for (const pMed of (protocol.medications || [])) {
      const medDoc = await db.collection("groups").doc(groupId).collection("medications").doc(pMed.medicationId).get();
      if (!medDoc.exists) {
        return res.status(404).json({ error: `Medicamento ${pMed.genericName} não encontrado no catálogo.` });
      }
      
      const medication = medDoc.data();
      if (medication?.status === "inactive") {
        return res.status(400).json({ error: `Medicamento ${pMed.genericName} está inativo.` });
      }
      
      // Check concentration compatibilities
      const medUnit = (medication?.concentrationUnit || "").toLowerCase().trim();
      const resUnit = (pMed.resultUnit || "").toLowerCase().trim();
      
      // Enforce specific incompatibility warning
      if (medUnit !== resUnit) {
        return res.status(400).json({
          error: "Não foi possível calcular porque as unidades informadas são incompatíveis. Revise a concentração e a fórmula do protocolo."
        });
      }
      
      let calculatedDose = 0;
      if (pMed.formulaType === "fixed") {
        calculatedDose = pMed.formulaValue;
      } else if (pMed.formulaType === "dose_per_weight" || pMed.formulaType === "dose_per_weight_time") {
        calculatedDose = pMed.formulaValue * weightNum;
      } else if (pMed.formulaType === "dose_per_bsa") {
        const bsa = Math.sqrt((weightNum * 170) / 3600); // Mosteller assuming 170cm height
        calculatedDose = pMed.formulaValue * bsa;
      }
      
      // Limits Check
      const warnings: string[] = [];
      if (pMed.minDose && calculatedDose < pMed.minDose) {
        warnings.push(`Dose calculada (${calculatedDose.toFixed(2)} ${resUnit}) está abaixo da dose mínima recomendada (${pMed.minDose} ${resUnit}).`);
      }
      if (pMed.maxDose && calculatedDose > pMed.maxDose) {
        warnings.push(`Dose calculada (${calculatedDose.toFixed(2)} ${resUnit}) ultrapassa a dose máxima de segurança recomendada (${pMed.maxDose} ${resUnit}).`);
      }
      
      // Check allergy warning
      const matchesAllergy = patientAllergies.some((allg: string) => 
        pMed.genericName.toLowerCase().includes(allg.toLowerCase()) || 
        allg.toLowerCase().includes(pMed.genericName.toLowerCase())
      );
      if (matchesAllergy) {
        warnings.push(`ALERTA CRÍTICO: O paciente possui alergia registrada compatível com ${pMed.genericName}.`);
      }
      
      // Calculation of volume: dose / concentration
      let calculatedVolume = medication?.concentration ? (calculatedDose / medication.concentration) : 0;
      
      // Rounding rules
      const roundRule = pMed.roundingRule || medication?.roundingRule || "exact";
      if (roundRule === "ceil") {
        calculatedVolume = Math.ceil(calculatedVolume);
      } else if (roundRule === "floor") {
        calculatedVolume = Math.floor(calculatedVolume);
      } else if (roundRule === "nearest") {
        calculatedVolume = Math.round(calculatedVolume);
      }
      
      // Redo dose based on rounded volume
      const finalDose = medication?.concentration ? (calculatedVolume * medication.concentration) : calculatedDose;
      
      items.push({
        medicationId: pMed.medicationId,
        genericName: pMed.genericName,
        formulaType: pMed.formulaType,
        formulaValue: pMed.formulaValue,
        calculatedDose: finalDose,
        calculatedVolume,
        doseUnit: pMed.resultUnit,
        adjustedDose: finalDose,
        adjustedVolume: calculatedVolume,
        isAdjusted: false,
        warnings,
        highVigilance: !!medication?.highVigilance,
        requiresDoubleCheck: !!medication?.requiresDoubleCheck,
        doubleChecked: false,
        status: "pending",
        quantitySeparated: 0,
        quantityAdministered: 0,
        quantityReturned: 0,
        quantityWasted: 0,
        quantityLost: 0
      });
    }
    
    res.json({
      protocolId,
      protocolName: protocol.name,
      protocolVersion: protocol.version,
      patientWeight: weightNum,
      patientAge: ageNum,
      patientAllergies,
      patientRestrictions,
      items
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/app/medication-plans/confirm", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  
  try {
    const { user } = await requireGroupMember(req, groupId);
    const { surgeryId, patientName, protocolId, protocolName, protocolVersion, patientWeight, patientAge, patientAllergies = [], patientRestrictions = "", items, justifications = {} } = req.body;
    
    if (!surgeryId) return res.status(400).json({ error: "Surgery ID is required" });
    
    const dbRef = db.collection("groups").doc(groupId);
    
    // Double Check constraint: check if any high vigilance item requires double check but hasn't been signed off
    for (const item of items) {
      if (item.requiresDoubleCheck && !item.doubleChecked) {
        return res.status(400).json({ error: `O medicamento de alta vigilância ${item.genericName} exige dupla conferência por outro profissional antes da confirmação.` });
      }
    }
    
    const batchOps = db.batch();
    
    // Process stock reservation FEFO
    for (const item of items) {
      const batchesSnap = await dbRef.collection("inventoryBatches")
        .where("medicationId", "==", item.medicationId)
        .get();
        
      const batches = batchesSnap.docs.map(d => d.data())
        .filter(b => b.quantityAvailable > 0 && new Date(b.expiryDate) >= new Date())
        .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
        
      let needed = Math.ceil(item.adjustedVolume);
      let reservedAmount = 0;
      
      for (const batch of batches) {
        if (needed <= 0) break;
        const take = Math.min(batch.quantityAvailable, needed);
        
        // Update batch available / reserved
        const bRef = dbRef.collection("inventoryBatches").doc(batch.id);
        batchOps.update(bRef, {
          quantityAvailable: admin.firestore.FieldValue.increment(-take),
          quantityReserved: admin.firestore.FieldValue.increment(take)
        });
        
        // Add individual stock reservation
        const itemResRef = dbRef.collection("stockReservations").doc();
        batchOps.set(itemResRef, {
          id: itemResRef.id,
          groupId,
          surgeryId,
          medicationId: item.medicationId,
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          quantity: take,
          status: "active"
        });
        
        // Log movement
        const movRef = dbRef.collection("stockMovements").doc();
        batchOps.set(movRef, {
          id: movRef.id,
          groupId,
          batchId: batch.id,
          medicationId: item.medicationId,
          genericName: item.genericName,
          type: "reservation",
          quantity: take,
          locationId: batch.locationId,
          surgeryId,
          patientName,
          userId: user.uid,
          userName: user.email || "Médico",
          description: `Reserva para cirurgia de ${patientName}`,
          timestamp: new Date().toISOString()
        });
        
        needed -= take;
        reservedAmount += take;
        
        item.batchId = batch.id;
        item.batchNumber = batch.batchNumber;
      }
    }
    
    // Save medication plan
    const planRef = dbRef.collection("medicationPlans").doc(surgeryId);
    const planData = {
      id: surgeryId,
      groupId,
      surgeryId,
      patientName,
      protocolId,
      protocolName,
      protocolVersion,
      status: "confirmed",
      patientWeight,
      patientAge,
      patientAllergies,
      patientRestrictions,
      calculatedBy: user.uid,
      calculatedAt: new Date().toISOString(),
      confirmedBy: user.uid,
      confirmedAt: new Date().toISOString(),
      items,
      justifications,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    batchOps.set(planRef, planData);
    
    // Also update surgery status in calendario
    const surgRef = dbRef.collection("calendario").doc(surgeryId);
    batchOps.update(surgRef, {
      medicationStatus: "confirmed"
    });
    
    await batchOps.commit();
    await logAudit(groupId, user.uid, user.email || "Médico", "CONFIRM_PLAN", "medicationPlan", surgeryId, `Confirmado planejamento de medicação para ${patientName}`);
    
    res.json({ success: true, plan: planData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create/Approve double checks
app.post("/api/app/medication-plans/double-check", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupMember(req, groupId);
    const { surgeryId, medicationId, witnessEmail } = req.body;

    const dbRef = db.collection("groups").doc(groupId);
    
    // Validate witness is another member in the group
    const membersSnap = await dbRef.collection("members")
      .where("userEmail", "==", witnessEmail.trim().toLowerCase())
      .get();
      
    if (membersSnap.empty && user.email?.trim().toLowerCase() === witnessEmail.trim().toLowerCase()) {
      return res.status(400).json({ error: "A dupla conferência exige um segundo profissional diferente da conta atual." });
    }

    const witnessName = !membersSnap.empty ? (membersSnap.docs[0].data().displayName || witnessEmail) : witnessEmail;

    const checkRef = dbRef.collection("doubleChecks").doc();
    const checkData = {
      id: checkRef.id,
      groupId,
      surgeryId,
      medicationId,
      witnessUserId: !membersSnap.empty ? membersSnap.docs[0].id : "external",
      witnessName,
      witnessEmail,
      timestamp: new Date().toISOString(),
      status: "approved"
    };

    await checkRef.set(checkData);
    res.json(checkData);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/app/medication-plans/separate", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupMember(req, groupId);
    const { surgeryId, items } = req.body;

    const dbRef = db.collection("groups").doc(groupId);
    const planRef = dbRef.collection("medicationPlans").doc(surgeryId);
    
    const planSnap = await planRef.get();
    if (!planSnap.exists) return res.status(404).json({ error: "Planejamento não encontrado" });
    const plan = planSnap.data();

    const batchOps = db.batch();
    const updatedItems = (plan?.items || []).map((pItem: any) => {
      const match = items.find((i: any) => i.medicationId === pItem.medicationId);
      if (match) {
        return {
          ...pItem,
          status: "separated",
          quantitySeparated: match.quantitySeparated || pItem.adjustedVolume,
          batchId: match.batchId || pItem.batchId,
          batchNumber: match.batchNumber || pItem.batchNumber
        };
      }
      return pItem;
    });

    batchOps.update(planRef, {
      items: updatedItems,
      status: "separated",
      updatedAt: new Date().toISOString()
    });

    // Also update surgery status in calendario
    const surgRef = dbRef.collection("calendario").doc(surgeryId);
    batchOps.update(surgRef, {
      medicationStatus: "separated"
    });

    // Log separation movements
    for (const item of updatedItems) {
      if (item.status === "separated") {
        const movRef = dbRef.collection("stockMovements").doc();
        batchOps.set(movRef, {
          id: movRef.id,
          groupId,
          batchId: item.batchId || "unknown",
          medicationId: item.medicationId,
          genericName: item.genericName,
          type: "separation",
          quantity: item.quantitySeparated,
          surgeryId,
          patientName: plan?.patientName,
          userId: user.uid,
          userName: user.email || "Enfermagem",
          description: `Separação de kit cirúrgico para ${plan?.patientName}`,
          timestamp: new Date().toISOString()
        });
      }
    }

    await batchOps.commit();
    await logAudit(groupId, user.uid, user.email || "Enfermagem", "SEPARATE_KIT", "medicationPlan", surgeryId, `Kit cirúrgico separado para ${plan?.patientName}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/app/medication-plans/close", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupMember(req, groupId);
    const { surgeryId, items } = req.body; // Array of item details containing final quantities: administered, returned, wasted, lost

    const dbRef = db.collection("groups").doc(groupId);
    const planRef = dbRef.collection("medicationPlans").doc(surgeryId);
    
    const planSnap = await planRef.get();
    if (!planSnap.exists) return res.status(404).json({ error: "Planejamento não encontrado" });
    const plan = planSnap.data();

    const batchOps = db.batch();
    const updatedItems = (plan?.items || []).map((pItem: any) => {
      const match = items.find((i: any) => i.medicationId === pItem.medicationId);
      if (match) {
        const separated = pItem.quantitySeparated || pItem.adjustedVolume || 0;
        const adminQty = parseFloat(match.quantityAdministered) || 0;
        const retQty = parseFloat(match.quantityReturned) || 0;
        const wasteQty = parseFloat(match.quantityWasted) || 0;
        const lostQty = parseFloat(match.quantityLost) || 0;

        // Core Formula Verification: separated = administered + returned + wasted + lost
        const sum = adminQty + retQty + wasteQty + lostQty;
        if (Math.abs(separated - sum) > 0.001) {
          throw new Error(`Divergência na conferência de ${pItem.genericName}: Separado (${separated}) deve ser igual à soma de Administrado (${adminQty}) + Devolvido (${retQty}) + Desperdiçado (${wasteQty}) + Perdido (${lostQty}).`);
        }

        return {
          ...pItem,
          status: "finished",
          quantityAdministered: adminQty,
          quantityReturned: retQty,
          quantityWasted: wasteQty,
          quantityLost: lostQty
        };
      }
      return pItem;
    });

    batchOps.update(planRef, {
      items: updatedItems,
      status: "finished",
      updatedAt: new Date().toISOString()
    });

    // Also update surgery status in calendario
    const surgRef = dbRef.collection("calendario").doc(surgeryId);
    batchOps.update(surgRef, {
      medicationStatus: "finished"
    });

    // Resolve reservations & stock updates
    for (const item of updatedItems) {
      if (item.batchId) {
        const bRef = dbRef.collection("inventoryBatches").doc(item.batchId);
        
        // Remove from reserved amount (as reservation is fulfilled/closed)
        const totalReservedToDeduct = item.quantitySeparated || item.adjustedVolume || 0;
        
        // Add back returned quantity to available stock
        const returnAmount = item.quantityReturned || 0;
        
        // Deduct wasted/administered/lost from total pool (they were already subtracted from available when reserved,
        // so we only need to deduct them from the quantityReserved, and add back the returned quantity to available!)
        batchOps.update(bRef, {
          quantityReserved: admin.firestore.FieldValue.increment(-totalReservedToDeduct),
          quantityAvailable: admin.firestore.FieldValue.increment(returnAmount)
        });

        // Record movements for consumed/administered
        if (item.quantityAdministered > 0) {
          const movRef = dbRef.collection("stockMovements").doc();
          batchOps.set(movRef, {
            id: movRef.id,
            groupId,
            batchId: item.batchId,
            medicationId: item.medicationId,
            genericName: item.genericName,
            type: "administration",
            quantity: item.quantityAdministered,
            surgeryId,
            patientName: plan?.patientName,
            userId: user.uid,
            userName: user.email || "Enfermagem",
            description: `Administração cirúrgica para ${plan?.patientName}`,
            timestamp: new Date().toISOString()
          });
        }

        // Record movements for returned
        if (item.quantityReturned > 0) {
          const movRef = dbRef.collection("stockMovements").doc();
          batchOps.set(movRef, {
            id: movRef.id,
            groupId,
            batchId: item.batchId,
            medicationId: item.medicationId,
            genericName: item.genericName,
            type: "return",
            quantity: item.quantityReturned,
            surgeryId,
            patientName: plan?.patientName,
            userId: user.uid,
            userName: user.email || "Enfermagem",
            description: `Retorno ao estoque para ${plan?.patientName}`,
            timestamp: new Date().toISOString()
          });
        }

        // Record movements for waste
        if (item.quantityWasted > 0) {
          const movRef = dbRef.collection("stockMovements").doc();
          batchOps.set(movRef, {
            id: movRef.id,
            groupId,
            batchId: item.batchId,
            medicationId: item.medicationId,
            genericName: item.genericName,
            type: "waste",
            quantity: item.quantityWasted,
            surgeryId,
            patientName: plan?.patientName,
            userId: user.uid,
            userName: user.email || "Enfermagem",
            description: `Desperdício justificado de medicação - ${plan?.patientName}`,
            timestamp: new Date().toISOString()
          });
        }

        // Record movements for loss
        if (item.quantityLost > 0) {
          const movRef = dbRef.collection("stockMovements").doc();
          batchOps.set(movRef, {
            id: movRef.id,
            groupId,
            batchId: item.batchId,
            medicationId: item.medicationId,
            genericName: item.genericName,
            type: "loss",
            quantity: item.quantityLost,
            surgeryId,
            patientName: plan?.patientName,
            userId: user.uid,
            userName: user.email || "Enfermagem",
            description: `Perda registrada de medicação - ${plan?.patientName}`,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    await batchOps.commit();
    await logAudit(groupId, user.uid, user.email || "Enfermagem", "CLOSE_PLAN", "medicationPlan", surgeryId, `Finalizado fechamento de consumo para ${plan?.patientName}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/app/medication-plans/cancel", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupMember(req, groupId);
    const { surgeryId } = req.body;

    const dbRef = db.collection("groups").doc(groupId);
    const planRef = dbRef.collection("medicationPlans").doc(surgeryId);
    
    const planSnap = await planRef.get();
    if (!planSnap.exists) return res.status(404).json({ error: "Planejamento não encontrado" });
    const plan = planSnap.data();

    // Release stock reservations
    const reservationsSnap = await dbRef.collection("stockReservations")
      .where("surgeryId", "==", surgeryId)
      .get();

    const batchOps = db.batch();
    
    for (const d of reservationsSnap.docs) {
      const resData = d.data();
      // Add back to batch available, decrement reserved
      const bRef = dbRef.collection("inventoryBatches").doc(resData.batchId);
      batchOps.update(bRef, {
        quantityAvailable: admin.firestore.FieldValue.increment(resData.quantity),
        quantityReserved: admin.firestore.FieldValue.increment(-resData.quantity)
      });
      // Delete reservation
      batchOps.delete(d.ref);
    }

    batchOps.update(planRef, {
      status: "cancelled",
      updatedAt: new Date().toISOString()
    });

    // Also update surgery status in calendario
    const surgRef = dbRef.collection("calendario").doc(surgeryId);
    batchOps.update(surgRef, {
      medicationStatus: "cancelled"
    });

    await batchOps.commit();
    await logAudit(groupId, user.uid, user.email || "Médico", "CANCEL_PLAN", "medicationPlan", surgeryId, `Planejamento de medicamentos cancelado para ${plan?.patientName}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Audit Logs
app.get("/api/app/audit-logs", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupMember(req, groupId);
    const snap = await db.collection("groups").doc(groupId).collection("auditLogs").orderBy("timestamp", "desc").limit(100).get();
    const list = snap.docs.map(doc => doc.data());
    res.json(list);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  const distPath = path.join(process.cwd(), "dist");
  const publicPath = path.join(process.cwd(), "public");

  // Explicitly serve manifest.json with standard PWA content-type and CORS in both dev and prod
  app.get("/manifest.json", (req, res) => {
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Access-Control-Allow-Origin", "*");
    const prodPath = path.join(distPath, "manifest.json");
    const devPath = path.join(publicPath, "manifest.json");
    if (fs.existsSync(prodPath)) {
      res.sendFile(prodPath);
    } else if (fs.existsSync(devPath)) {
      res.sendFile(devPath);
    } else {
      res.status(404).json({ error: "Manifest not found" });
    }
  });

  // Explicitly serve icons with correct image/png headers, CORS, and caching
  app.get("/icons/:iconName", (req, res) => {
    const iconName = req.params.iconName;
    const prodFile = path.join(distPath, "icons", iconName);
    const pubFile = path.join(publicPath, "icons", iconName);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");

    if (fs.existsSync(prodFile)) {
      return res.sendFile(prodFile);
    } else if (fs.existsSync(pubFile)) {
      return res.sendFile(pubFile);
    } else {
      return res.status(404).send("Icon not found");
    }
  });

  // Explicitly serve apple-touch-icon.png and favicon.png
  app.get(["/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"], (req, res) => {
    const prodFile = path.join(distPath, "apple-touch-icon.png");
    const pubFile = path.join(publicPath, "apple-touch-icon.png");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (fs.existsSync(prodFile)) {
      return res.sendFile(prodFile);
    } else if (fs.existsSync(pubFile)) {
      return res.sendFile(pubFile);
    }
    res.status(404).send("Not found");
  });

  app.get(["/favicon.png", "/favicon.ico"], (req, res) => {
    const prodFile = path.join(distPath, "favicon.png");
    const pubFile = path.join(publicPath, "favicon.png");
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (fs.existsSync(prodFile)) {
      return res.sendFile(prodFile);
    } else if (fs.existsSync(pubFile)) {
      return res.sendFile(pubFile);
    }
    res.status(404).send("Not found");
  });

  // Explicitly serve service-worker.js with correct Content-Type and no-cache in both dev and prod
  app.get("/service-worker.js", (req, res, next) => {
    const prodPath = path.join(distPath, "service-worker.js");
    if (fs.existsSync(prodPath)) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.sendFile(prodPath);
    } else {
      // Let Vite middleware compile dynamically in dev
      next();
    }
  });

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
    app.use(express.static(distPath));
    app.use(express.static(path.join(process.cwd(), "public")));
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
