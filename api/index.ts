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
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const DEFAULT_FIREBASE_CONFIG = {
  projectId: "parabolic-craft-277523",
  appId: "1:767503688274:web:25ee5c64401e12706eb58b",
  apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || "AIzaSyBWfqUJbXXNdgS_zgAPIuG8cCDz1ogQHIo",
  authDomain: "parabolic-craft-277523.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-0c2aaf40-e57b-4ffc-b4a7-865c2402ef5e",
  storageBucket: "parabolic-craft-277523.firebasestorage.app",
  messagingSenderId: "767503688274",
  measurementId: ""
};

let firebaseConfig: any = { ...DEFAULT_FIREBASE_CONFIG };
try {
  const possiblePaths = [
    path.resolve(process.cwd(), "firebase-applet-config.json"),
    path.resolve(process.cwd(), "..", "firebase-applet-config.json")
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const loaded = JSON.parse(fs.readFileSync(p, "utf8"));
      firebaseConfig = { ...firebaseConfig, ...loaded };
      break;
    }
  }
} catch (e) {
  console.warn("[Firebase] Could not read config file from disk, using fallback config:", e);
}

// Extract Service Account Certificate if configured in environment
let serviceAccountCert: any = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccountCert = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log("[Firebase] Successfully parsed FIREBASE_SERVICE_ACCOUNT credentials.");
  } catch (jsonErr) {
    console.error("[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:", jsonErr);
  }
}

const targetProjectId = firebaseConfig.projectId || serviceAccountCert?.project_id || "parabolic-craft-277523";
const targetStorageBucket = firebaseConfig.storageBucket || `${targetProjectId}.firebasestorage.app`;

// Initialize Firebase Admin lazily or at module level but safely
if (!admin.apps.length) {
  try {
    if (serviceAccountCert) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountCert),
        projectId: targetProjectId,
        storageBucket: targetStorageBucket
      });
      console.log("[Firebase] Admin initialized with service account from env.");
    } else {
      admin.initializeApp({
        projectId: targetProjectId,
        storageBucket: targetStorageBucket
      });
      console.log("[Firebase] Admin initialized with projectId (ADC):", targetProjectId);
    }
  } catch (e) {
    console.error("[Firebase] Admin initialization error:", e);
  }
}

const _getDb = () => {
  if (!admin.apps.length) {
    throw new Error("Firebase Admin not initialized. Ensure firebase-applet-config.json exists or FIREBASE_SERVICE_ACCOUNT is set in environment.");
  }
  const dbId = firebaseConfig.firestoreDatabaseId || "ai-studio-0c2aaf40-e57b-4ffc-b4a7-865c2402ef5e" || "(default)";
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

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(cookieParser());

// Normalize URL for Vercel serverless functions:
// If request arrives at Vercel function without /api prefix (e.g. rewritten from /auth/...),
// ensure req.url starts with /api so all registered express routes match correctly.
app.use((req, res, next) => {
  if (req.url && !req.url.startsWith("/api") && (req.url.startsWith("/auth") || req.url.startsWith("/app/") || req.url.startsWith("/gemini") || req.url.startsWith("/admin") || req.url.startsWith("/patients") || req.url.startsWith("/hospitals") || req.url.startsWith("/statuses"))) {
    req.url = `/api${req.url.startsWith("/") ? "" : "/"}${req.url}`;
  }
  next();
});

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
  // Set sameSite: "lax" cookie for top-level direct browser visits on custom domains (avoids 3P cookie restrictions)
  res.cookie("n_session_u", tokens, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000, path: '/' });
  // Set a visible breadcrumb for client-side visibility checks
  res.cookie("n_active", "1", { ...cookieOptions, httpOnly: false, partitioned: false });
};

const clearAuthCookies = (res: express.Response) => {
  const options = { httpOnly: true, secure: true, sameSite: "none" as const, path: "/" };
  res.clearCookie(COOKIE_NAME, { ...options, partitioned: true });
  res.clearCookie(LEGACY_COOKIE_NAME, options);
  res.clearCookie("n_session_p", { ...options, partitioned: true });
  res.clearCookie("n_session_u", options);
  res.clearCookie("n_session_u", { ...options, sameSite: "lax" as const });
  res.clearCookie("google_token", options);
  res.clearCookie("n_active", { path: "/" });
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
  const rawToken = req.cookies[COOKIE_NAME] || req.cookies[LEGACY_COOKIE_NAME] || req.cookies["n_session_p"] || req.cookies["n_session_u"] || req.cookies["google_token"];
  if (!rawToken) return null;
  
  const client = getOAuth2Client(req);
  if (!client) return null;
  
  let token = rawToken;
  if (typeof token === "string") {
    try {
      if (token.startsWith("j:")) token = token.slice(2);
      token = JSON.parse(token);
    } catch(e) {}
  }
  
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
  // 0. Demo Mode support for AI Studio preview
  const authHeader = req.headers.authorization;
  if (
    authHeader === "Bearer demo-token" ||
    req.headers["x-demo-mode"] === "true" ||
    getGroupId(req) === "demo-group-hospital"
  ) {
    return {
      uid: "demo-doctor-preview",
      email: "demo@doctor-agent.online",
      source: "demo"
    };
  }

  // 1. Try Firebase Bearer Token
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
  if (groupId === "demo-group-hospital") {
    return {
      user: { uid: "demo-doctor-preview", email: "demo@doctor-agent.online", source: "demo" },
      group: { id: "demo-group-hospital", name: "Equipe Médica - Plantão Geral", createdBy: "demo-doctor-preview", groupType: "professional", status: "active" },
      member: { userId: "demo-doctor-preview", role: "admin", status: "active" }
    };
  }

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

const DEMO_PATIENTS = [
  {
    id: "demo-pat-1",
    groupId: "demo-group-hospital",
    name: "Maria Silva",
    nome: "Maria Silva",
    hospitalId: "demo-hosp-1",
    statusId: "demo-stat-1",
    status: "UTI / Crítico",
    hospital: "Hospital Central & UTI",
    bed: "Leito 302 - UTI Adulto",
    age: "58 anos",
    diagnosis: "Pneumonia Comunitária Grave em desmame ventilatório",
    allergies: "Penicilina, Dipirona",
    currentCondition: "Paciente lúcida, afebril há 48h, tolerando desmame de O2 via cateter nasal (2L/min). Diurese preservada.",
    diet: "Oral branda com espessante",
    access: "CVC subclávia D (D4)",
    pendingActions: "Checar hemograma de controle e Rx de tórax matinal",
    updatedAt: new Date().toISOString()
  },
  {
    id: "demo-pat-2",
    groupId: "demo-group-hospital",
    name: "Carlos Eduardo Santos",
    nome: "Carlos Eduardo Santos",
    hospitalId: "demo-hosp-1",
    statusId: "demo-stat-2",
    status: "Estável / Enfermaria",
    hospital: "Hospital Central & UTI",
    bed: "Leito 105 - Enfermaria Clínica",
    age: "42 anos",
    diagnosis: "Apendicectomia laparoscópica (PO D1)",
    allergies: "Nenhuma conhecida",
    currentCondition: "Bom estado geral, eupneico, dor em FO controlada com analgésicos simples. RHA presentes, aceitou dieta leve.",
    diet: "Líquida restrita evoluindo para branda",
    access: "AVP MSD salinizado",
    pendingActions: "Troca de curativo cirúrgico e previsão de alta amanhã",
    updatedAt: new Date().toISOString()
  },
  {
    id: "demo-pat-3",
    groupId: "demo-group-hospital",
    name: "Ana Beatriz Oliveira",
    nome: "Ana Beatriz Oliveira",
    hospitalId: "demo-hosp-2",
    statusId: "demo-stat-3",
    status: "Observação / Cirúrgico",
    hospital: "Hospital Santa Clara",
    bed: "Leito 210 - Bloco Cirúrgico / Recuperação",
    age: "31 anos",
    diagnosis: "Colecistectomia Eletiva",
    allergies: "Iodo (relato de urticária prévia)",
    currentCondition: "Estável hemodinamicamente, acordada, sem náuseas.",
    diet: "Jejum para procedimento vespertino",
    access: "AVP MSE com hidratação venosa",
    pendingActions: "Aguardando liberação de leito em enfermaria pós-RPA",
    updatedAt: new Date().toISOString()
  }
];

const requirePatientAccess = async (req: express.Request, patientId: string) => {
  if (!patientId) {
    const err = new Error("Patient ID is required");
    (err as any).statusCode = 400;
    throw err;
  }

  // 0. Demo Mode support
  const authHeader = req.headers.authorization;
  const isDemo =
    authHeader === "Bearer demo-token" ||
    req.headers["x-demo-mode"] === "true" ||
    getGroupId(req) === "demo-group-hospital" ||
    patientId.startsWith("demo-pat-");

  if (isDemo) {
    const foundDemo = DEMO_PATIENTS.find(p => p.id === patientId);
    const demoPatientObj = foundDemo || {
      id: patientId,
      name: "Paciente Demo",
      groupId: "demo-group-hospital",
      hospitalId: "demo-hosp-1",
      statusId: "demo-stat-1"
    };
    return {
      user: { uid: "demo-doctor-preview", email: "demo@doctor-agent.online", source: "demo" },
      group: { id: "demo-group-hospital", name: "Equipe Médica - Plantão Geral", createdBy: "demo-doctor-preview", groupType: "professional", status: "active" },
      member: { userId: "demo-doctor-preview", role: "admin", status: "active" },
      patient: demoPatientObj,
      groupId: "demo-group-hospital"
    };
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

    const returnTo = req.query.returnTo?.toString() || "/app";

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
    const returnTo = returnToMatch ? decodeURIComponent(returnToMatch[1]) : "/app";

    // Store for polling
    if (state) {
      console.log(`[Auth] Storing pending session for state: ${state}`);
      pendingSessions.set(state as string, essentialTokens);
      setTimeout(() => pendingSessions.delete(state as string), 5 * 60 * 1000);
    }

    setAuthCookies(res, essentialTokens);

    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <title>Autenticado - Dr. Agent</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; color: #0f172a; }
            .card { text-align: center; padding: 2.5rem 2rem; background: white; border-radius: 1.25rem; box-shadow: 0 10px 25px -5px rgb(0 0 0 / 0.1); max-width: 90%; width: 380px; }
            .spinner { width: 44px; height: 44px; border: 4px solid #e2e8f0; border-top: 4px solid #2563eb; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 1.25rem; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            h2 { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem; color: #1e293b; }
            p { color: #64748b; font-size: 0.875rem; margin: 0 0 1.5rem; line-height: 1.5; }
            .btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem 1.5rem; background: #2563eb; color: white; border-radius: 0.75rem; text-decoration: none; font-size: 0.875rem; font-weight: 700; border: none; cursor: pointer; transition: background 0.15s; width: 100%; box-sizing: border-box; }
            .btn:hover { background: #1d4ed8; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="spinner"></div>
            <h2>Conta Conectada!</h2>
            <p>Redirecionando para o seu espaço de trabalho...</p>
            <a id="btn-open-app" href="${returnTo}" class="btn">Abrir Dr. Agent &rarr;</a>

            <script>
              const tokens = ${JSON.stringify(essentialTokens)};
              const payload = { type: 'OAUTH_AUTH_SUCCESS', tokens, timestamp: Date.now() };
              const targetUrl = '${returnTo}';

              function notifyAll() {
                try {
                  const channel = new BroadcastChannel('doctor_pro_auth_channel');
                  channel.postMessage(payload);
                } catch (e) {}
                try {
                  if (window.opener && !window.opener.closed) {
                    window.opener.postMessage(payload, '*');
                  }
                } catch (e) {}
                try {
                  localStorage.setItem('doctor_pro_auth_success', JSON.stringify(payload));
                  localStorage.setItem('doctor_pro_auth_tokens', JSON.stringify(tokens));
                  localStorage.setItem('doctor_pro_auth_timestamp', String(Date.now()));
                } catch (e) {}
              }

              // Send notifications immediately and repeatedly
              notifyAll();
              let count = 0;
              const interval = setInterval(() => {
                notifyAll();
                count++;
                if (count >= 10) clearInterval(interval);
              }, 100);

              function tryCloseOrRedirect() {
                notifyAll();
                try {
                  if (window.opener) {
                    window.close();
                  }
                } catch (e) {}
                // If window wasn't closed or window.close was blocked, navigate directly
                setTimeout(() => {
                  window.location.replace(targetUrl);
                }, 350);
              }

              document.getElementById('btn-open-app').addEventListener('click', function() {
                notifyAll();
                tryCloseOrRedirect();
              });

              setTimeout(tryCloseOrRedirect, 650);
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
    if (isInvalidGrantError(err)) {
      clearAuthCookies(res);
      return res.status(401).json({
        error: "invalid_grant",
        message: "Sua sessão expirou ou o token de acesso foi revogado. Por favor, faça login novamente."
      });
    }
    const hasServiceAccount = !!process.env.FIREBASE_SERVICE_ACCOUNT;
    res.status(500).json({ 
      error: err.message, 
      hasServiceAccount,
      details: !hasServiceAccount
        ? "Variável FIREBASE_SERVICE_ACCOUNT não encontrada no ambiente. Ela é obrigatória na Vercel para emitir custom tokens do Firebase."
        : "Erro interno no Firebase Admin: " + err.message
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

  if (groupId === "demo-group-hospital") {
    return res.json(DEMO_PATIENTS);
  }

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

    const searchParam = req.query.search?.toString() || req.query.q?.toString() || "";

    if (sFilter && sFilter !== "all" && sFilter !== "" && sFilter !== "1" && !searchParam) {
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

    // Only consider active configured hospitals and statuses (filter out removed or invalid doctor names)
    const activeHospitalsDocs = hospitalsSnap.docs.filter(d => {
      const data = d.data();
      const hName = (data.name || data.nome || "").trim().toLowerCase();
      return data.active !== false && data.status !== "removed" && hName !== "camila ribeiro dutra";
    });

    const activeStatusesDocs = statusesSnap.docs.filter(d => {
      const data = d.data();
      const sName = (data.name || data.nome || "").trim().toLowerCase();
      return data.active !== false && data.status !== "removed" && sName !== "camila ribeiro dutra";
    });

    const hMap = Object.fromEntries(activeHospitalsDocs.map(doc => [doc.id, doc.data().name || doc.data().nome]));
    const sMap = Object.fromEntries(activeStatusesDocs.map(doc => [doc.id, doc.data().name || doc.data().nome]));

    let patients = patientsSnap.docs.map(doc => {
      const data = doc.data();
      const patName = (data.name || "").toString().trim();
      let rawHosp = hMap[data.hospitalId] || data.hospitalName || "";
      if (rawHosp.trim().toLowerCase() === "camila ribeiro dutra" || (patName && rawHosp.trim().toLowerCase() === patName.toLowerCase())) {
        rawHosp = "";
      }
      let rawStat = (data.statusId && sMap[data.statusId]) ? sMap[data.statusId] : (data.statusName || data.status || "");
      if (rawStat.trim().toLowerCase() === "camila ribeiro dutra" || (patName && rawStat.trim().toLowerCase() === patName.toLowerCase())) {
        rawStat = "";
      }

      return {
        id: doc.id,
        ...data,
        nome: patName || "Sem Nome", // Map name to nome for frontend
        hospitalName: rawHosp || "Sem Hospital",
        status: rawStat || "Sem Status",
        statusName: rawStat || "Sem Status"
      };
    }).filter(patient => (patient as any).recordStatus !== "removed");

    const normalizedSearch = normalizeText((req.query.search || req.query.q || "") as string);
    if (normalizedSearch) {
      patients = patients.filter(patient => {
        const patientName = normalizeText((patient as any).nome || (patient as any).name || "");
        const patientCode = normalizeText((patient as any).codigoUsuario || "");
        const patientCpf = normalizeText((patient as any).cpf || (patient as any).documento || "");
        const patientHosp = normalizeText((patient as any).hospitalName || "");
        const patientStat = normalizeText((patient as any).status || (patient as any).statusName || "");
        return patientName.includes(normalizedSearch) ||
               patientCode.includes(normalizedSearch) ||
               patientCpf.includes(normalizedSearch) ||
               patientHosp.includes(normalizedSearch) ||
               patientStat.includes(normalizedSearch);
      });
    }

    // Optimization for the future: create nameNormalized and searchTokens fields when creating/updating patient, then use indexed Firestore queries.

    if (req.query.full === "true") {
      const sortedStatuses = activeStatusesDocs.map(d => {
        const sData = d.data();
        return { id: d.id, ...sData, nome: sData.name || sData.nome } as any;
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
        hospitals: activeHospitalsDocs.map(d => {
          const hData = d.data();
          return { id: d.id, ...hData, nome: hData.name || hData.nome };
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

  if (groupId === "demo-group-hospital") {
    return res.json({
      companyName: "Dr. Agent - Plantão Geral",
      whatsappNumber: "+55 11 99999-9999",
      imageAnalysisPrompt: "Aja como um médico experiente e descreva os achados clínicos e conduta recomendada."
    });
  }

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

  if (groupId === "demo-group-hospital") {
    return res.json([
      { id: "demo-hosp-1", name: "Hospital Central & UTI", nome: "Hospital Central & UTI", fone: "(11) 3456-7890" },
      { id: "demo-hosp-2", name: "Hospital Santa Clara", nome: "Hospital Santa Clara", fone: "(11) 3344-5566" }
    ]);
  }

  try {
    const snap = await db.collection("hospitals").where("groupId", "==", groupId).get();
    const hospitals = snap.docs
      .filter(doc => {
        const data = doc.data();
        return data.active !== false && data.status !== "removed";
      })
      .map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data, nome: data.name || data.nome };
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

    const pData: any = patient;
    report.cadastro = {
      ID: id,
      Nome: pData.name || pData.nome || "Sem Nome",
      Telefone: pData.phone || pData.fone || "",
      Idade: pData.age || pData.idade || "",
      Status: (pData.statusId && statusesMap.get(pData.statusId)) ? statusesMap.get(pData.statusId) : (pData.status || "Sem Status"),
      statusId: pData.statusId || "",
      hospitalName: hospitalsMap.get(pData.hospitalId) || pData.hospital || pData.hospitalId || "",
      hospitalId: pData.hospitalId || "",
      roomNumber: pData.roomNumber || pData.bed || "",
      surgery_type: pData.surgery_type || "",
      procedure: pData.procedure || "",
      codigoUsuario: pData.codigoUsuario ? pData.codigoUsuario.toString() : "",
      cpf: pData.cpf || pData.documento || "",
      documento: pData.documento || pData.cpf || ""
    };

    // Process Procedimentos linked to this patient
    try {
      let procDocs: any[] = [];
      const procSnap = await db.collection("procedimentos")
        .where("pacienteId", "==", id)
        .get();

      procDocs = procSnap.docs;

      if (procDocs.length === 0 && pData.codigoUsuario) {
        const procByCodeSnap = await db.collection("procedimentos")
          .where("codigoUsuario", "==", pData.codigoUsuario.toString().trim())
          .get();
        procDocs = procByCodeSnap.docs;
      }

      report.procedimentos = procDocs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt
        };
      }).sort((a, b) => {
        const dateA = a.data || "";
        const dateB = b.data || "";
        return dateB.localeCompare(dateA);
      });
    } catch (procErr) {
      console.warn("Error fetching procedimentos for patient-report:", procErr);
      report.procedimentos = [];
    }

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

// Get patient procedures from the procedimentos collection
app.get("/api/app/patients/:id/procedimentos", async (req, res) => {
  const { id } = req.params;
  const sort = req.query.sort === "asc" ? "asc" : "desc";

  try {
    const { groupId, patient } = await requirePatientAccess(req, id);

    let docs: any[] = [];
    // Primary query: pacienteId == id
    try {
      const procSnap = await db.collection("procedimentos")
        .where("pacienteId", "==", id)
        .get();
      docs = procSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    } catch (e) {
      console.warn("Error querying procedimentos by pacienteId:", e);
    }

    // Fallback: if empty, query by codigoUsuario if available
    const patObj: any = patient;
    if (docs.length === 0 && patObj.codigoUsuario) {
      try {
        const codeSnap = await db.collection("procedimentos")
          .where("codigoUsuario", "==", patObj.codigoUsuario.toString().trim())
          .get();
        docs = codeSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      } catch (e) {
        console.warn("Error querying procedimentos by codigoUsuario:", e);
      }
    }

    // Also check subcollection fallback for backward compatibility
    if (docs.length === 0) {
      try {
        const subSnap = await db.collection("patients").doc(id).collection("procedimentos").get();
        if (!subSnap.empty) {
          docs = subSnap.docs.map((d: any) => ({ id: d.id, ...d.data(), pacienteId: id }));
        }
      } catch (e) {
        // ignore
      }
    }

    // Format timestamps and sort in memory by data (or createdAt)
    const formattedDocs = docs.map(d => ({
      ...d,
      createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : d.createdAt,
      updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : d.updatedAt
    }));

    formattedDocs.sort((a, b) => {
      const dateA = a.data || a.createdAt || "";
      const dateB = b.data || b.createdAt || "";
      return sort === "asc" ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
    });

    res.json({ success: true, procedimentos: formattedDocs });
  } catch (error) {
    handleApiError(res, error, "Fetching patient procedures");
  }
});

// Import patients via CSV
app.post("/api/app/patients/import-csv", express.json({ limit: "50mb" }), async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  const { patients } = req.body;
  if (!Array.isArray(patients)) {
    return res.status(400).json({ error: "Lista de pacientes inválida." });
  }

  try {
    await requireGroupOwner(req, groupId).catch(() => requireGroupMember(req, groupId));

    let newPatients = 0;
    let updatedPatients = 0;
    let proceduresImported = 0;
    let proceduresIgnoredDuplicates = 0;
    let hospitalsFound = 0;
    let hospitalsCreated = 0;
    let statusesFound = 0;
    let statusesCreated = 0;
    let errorsCount = 0;
    const errorDetails: string[] = [];

    const existingSnap = await db.collection("patients").where("groupId", "==", groupId).get();
    const existingByCode = new Map<string, { id: string; data: any }>();
    const existingByCpf = new Map<string, { id: string; data: any }>();
    const existingByName = new Map<string, { id: string; data: any }>();

    existingSnap.docs.forEach(docSnap => {
      const dData = docSnap.data();
      const id = docSnap.id;
      const codes = Array.isArray(dData.codigosUsuario) 
        ? dData.codigosUsuario 
        : (dData.codigoUsuario ? [dData.codigoUsuario.toString().trim()] : []);
      codes.forEach((c: string) => {
        if (c) existingByCode.set(c, { id, data: dData });
      });
      if (dData.cpf) existingByCpf.set(dData.cpf.toString().trim(), { id, data: dData });
      if (dData.documento) existingByCpf.set(dData.documento.toString().trim(), { id, data: dData });
      if (dData.name) existingByName.set(dData.name.toString().trim().toLowerCase(), { id, data: dData });
      if (dData.nome) existingByName.set(dData.nome.toString().trim().toLowerCase(), { id, data: dData });
    });

    const [hospitalsSnap, statusesSnap] = await Promise.all([
      db.collection("hospitals").where("groupId", "==", groupId).get(),
      db.collection("patient_statuses").where("groupId", "==", groupId).get()
    ]);

    const hospitalNameToId = new Map<string, string>();
    hospitalsSnap.docs.forEach(d => {
      const data = d.data();
      const hName = (data.name || data.nome || "").toString().trim();
      if (hName) hospitalNameToId.set(hName.toLowerCase(), d.id);
    });

    const statusNameToId = new Map<string, string>();
    statusesSnap.docs.forEach(d => {
      const data = d.data();
      const sName = (data.name || data.nome || "").toString().trim();
      if (sName) statusNameToId.set(sName.toLowerCase(), d.id);
    });

    const parseNum = (val: any): number => {
      if (val === null || val === undefined) return 0;
      if (typeof val === "number") return isNaN(val) ? 0 : val;
      const str = val.toString().trim();
      if (!str) return 0;
      let clean = str.replace(/[^\d.,-]/g, "");
      if (!clean) return 0;
      const hasComma = clean.includes(",");
      const hasDot = clean.includes(".");
      if (hasComma && hasDot) {
        if (clean.lastIndexOf(",") > clean.lastIndexOf(".")) {
          clean = clean.replace(/\./g, "").replace(",", ".");
        } else {
          clean = clean.replace(/,/g, "");
        }
      } else if (hasComma) {
        clean = clean.replace(",", ".");
      }
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : num;
    };

    const tupleOccurrenceMap = new Map<string, number>();

    for (const patData of patients) {
      try {
        const codigoUsuario = (patData.codigoUsuario || "").toString().trim();
        if (!codigoUsuario) {
          errorsCount++;
          if (errorDetails.length < 20) errorDetails.push("Linha ignorada: Código do Usuário ausente.");
          continue;
        }

        const nome = (patData.nome || patData["Nome do Usuário"] || patData.nomeUsuario || "Sem Nome").toString().trim();
        const documento = (patData.documento || patData.Documento || "").toString().trim();
        const prestador = (patData.prestador || patData["Prestador Executante"] || patData.prestadorExecutante || "").toString().trim();
        
        let hospitalCsv = (patData.hospital || "").toString().trim();
        let statusCsv = (patData.status || "").toString().trim();

        // Strict sanitization: Nome do Usuário and Prestador Executante must NEVER be used as hospital or status
        if (hospitalCsv.toLowerCase() === nome.toLowerCase()) hospitalCsv = "";
        if (hospitalCsv.toLowerCase() === prestador.toLowerCase()) hospitalCsv = "";

        if (statusCsv.toLowerCase() === nome.toLowerCase()) statusCsv = "";
        if (statusCsv.toLowerCase() === prestador.toLowerCase()) statusCsv = "";

        // Temporary console.log during import as requested by user
        console.log({
          name: nome,
          codigoUsuario: codigoUsuario,
          hospital: hospitalCsv,
          status: statusCsv
        });

        const rows = Array.isArray(patData.rows) ? patData.rows : [];
        const rowAmbCodes: string[] = [];
        for (const row of rows) {
          const amb = (row["Código AMB"] || row["Codigo AMB"] || row["Cod. AMB"] || row.codigoAmb || row.codigoAMB || "").toString().trim();
          if (amb) rowAmbCodes.push(amb);
        }

        // 1. Resolve Hospital - ONLY from hospitalCsv! NEVER fall back to prestador!
        let resolvedHospitalId = "";
        let matchedHospitalName = "";
        const targetHospitalName = hospitalCsv;
        if (targetHospitalName) {
          const hKey = targetHospitalName.toLowerCase();
          if (hospitalNameToId.has(hKey)) {
            resolvedHospitalId = hospitalNameToId.get(hKey)!;
            matchedHospitalName = targetHospitalName;
            hospitalsFound++;
          } else {
            const newHRef = db.collection("hospitals").doc();
            await newHRef.set({
              name: targetHospitalName,
              groupId,
              active: true,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            resolvedHospitalId = newHRef.id;
            matchedHospitalName = targetHospitalName;
            hospitalNameToId.set(hKey, newHRef.id);
            hospitalsCreated++;
          }
        }

        // 2. Resolve Status - ONLY from statusCsv!
        let resolvedStatusId = "";
        let matchedStatusName = "";
        if (statusCsv) {
          const sKey = statusCsv.toLowerCase();
          if (statusNameToId.has(sKey)) {
            resolvedStatusId = statusNameToId.get(sKey)!;
            matchedStatusName = statusCsv;
            statusesFound++;
          } else {
            const newSRef = db.collection("patient_statuses").doc();
            await newSRef.set({
              name: statusCsv,
              groupId,
              sortOrder: statusesSnap.size + statusesCreated + 1,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            resolvedStatusId = newSRef.id;
            matchedStatusName = statusCsv;
            statusNameToId.set(sKey, newSRef.id);
            statusesCreated++;
          }
        }

        // 3. Upsert Patient (Match by code, cpf/documento, or name)
        let patientId = "";
        let existing = existingByCode.get(codigoUsuario);
        if (!existing && documento) {
          existing = existingByCpf.get(documento);
        }
        if (!existing && nome && nome !== "Sem Nome") {
          existing = existingByName.get(nome.toLowerCase());
        }

        if (existing) {
          patientId = existing.id;
          updatedPatients++;
          const updateFields: any = { 
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            recordStatus: "active",
            codigosUsuario: admin.firestore.FieldValue.arrayUnion(codigoUsuario),
          };
          if (rowAmbCodes.length > 0) {
            updateFields.codigosAMB = admin.firestore.FieldValue.arrayUnion(...rowAmbCodes);
          }
          if (nome && nome !== "Sem Nome") {
            updateFields.name = nome;
            updateFields.nome = nome;
          }
          if (documento && !existing.data.cpf) {
            updateFields.cpf = documento;
            updateFields.documento = documento;
          }
          if (resolvedHospitalId) {
            updateFields.hospitalId = resolvedHospitalId;
          }
          if (matchedHospitalName) {
            updateFields.hospitalName = matchedHospitalName;
          }
          if (resolvedStatusId) {
            updateFields.statusId = resolvedStatusId;
          }
          if (matchedStatusName) {
            updateFields.status = matchedStatusName;
            updateFields.statusName = matchedStatusName;
          }
          if (!existing.data.codigoUsuario) updateFields.codigoUsuario = codigoUsuario;
          await db.collection("patients").doc(patientId).update(updateFields);
          existingByCode.set(codigoUsuario, { id: patientId, data: existing.data });
        } else {
          const newRef = db.collection("patients").doc();
          patientId = newRef.id;
          await newRef.set({
            name: nome,
            nome: nome,
            codigoUsuario: codigoUsuario,
            codigosUsuario: [codigoUsuario],
            codigosAMB: rowAmbCodes,
            cpf: documento,
            documento: documento,
            hospitalId: resolvedHospitalId || "",
            hospitalName: matchedHospitalName || (targetHospitalName ? targetHospitalName : "Sem Hospital"),
            statusId: resolvedStatusId || "",
            statusName: matchedStatusName || (statusCsv ? statusCsv : "Sem Status"),
            status: matchedStatusName || (statusCsv ? statusCsv : "Sem Status"),
            groupId,
            recordStatus: "active",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          newPatients++;
          existingByCode.set(codigoUsuario, { id: patientId, data: { name: nome, codigoUsuario, codigosUsuario: [codigoUsuario] } });
          if (documento) existingByCpf.set(documento, { id: patientId, data: { name: nome, cpf: documento } });
          if (nome && nome !== "Sem Nome") existingByName.set(nome.toLowerCase(), { id: patientId, data: { name: nome } });
        }

        // 4. Insert Procedures
        for (const row of rows) {
          const periodo = (row["PERIODO"] || row["Periodo"] || row.periodo || "").toString().trim();
          const notaFiscal = (row["NOTA FISCAL"] || row["Nota Fiscal"] || row.notaFiscal || "").toString().trim();
          const relacaoNr = (row["Relação Nr"] || row["Relacao Nr"] || row["Relação Nº"] || row["Relacao Nº"] || row.relacaoNr || "").toString().trim();
          const dataProc = (row["Data"] || row["DATA"] || row.data || "").toString().trim();
          const rowDoc = (row["Documento"] || row["DOCUMENTO"] || row.documento || row["CPF"] || documento).toString().trim();
          const rawQt = row["Qt."] || row["Qt"] || row["Qtd"] || row["Quantidade"] || row.quantidade || "1";
          const quantidade = parseNum(rawQt) || 1;

          const codigoAmb = (row["Código AMB"] || row["Codigo AMB"] || row["Cod. AMB"] || row.codigoAmb || row.codigoAMB || "").toString().trim();
          const descricao = (row["Descrição"] || row["Descricao"] || row.descricao || "").toString().trim();

          const vlrHon = parseNum(row["Vlr.Hon."] || row["Vlr Hon"] || row["Valor Honorários"] || row.valorHonorarios || "0");
          const vlrOper = parseNum(row["Vlr.Oper."] || row["Vlr Oper"] || row.valorOperacional || "0");
          const vlrFilme = parseNum(row["Vlr.Filme"] || row["Vlr Filme"] || row.valorFilme || "0");
          const vlrTxAdm = parseNum(row["Vlr Tx Adm"] || row["Vlr. Tx. Adm."] || row.valorTaxaAdministrativa || "0");

          const prestadorExecutante = (row["Prestador Executante"] || row.prestadorExecutante || prestador || "").toString().trim();
          const prestadorPagamento = (row["Prestador Pagamento"] || row.prestadorPagamento || "").toString().trim();
          const prestadorProtocolo = (row["Prestador Protocolo"] || row.prestadorProtocolo || "").toString().trim();

          let rowHospital = (row["hospital"] || row.hospital || hospitalCsv || "").toString().trim();
          if (rowHospital.toLowerCase() === nome.toLowerCase() || rowHospital.toLowerCase() === prestadorExecutante.toLowerCase()) {
            rowHospital = "";
          }

          let rowStatus = (row["status"] || row.status || statusCsv || "").toString().trim();
          if (rowStatus.toLowerCase() === nome.toLowerCase() || rowStatus.toLowerCase() === prestadorExecutante.toLowerCase()) {
            rowStatus = "";
          }

          // importKey for deduplication
          const tupleBase = `${groupId}_${codigoUsuario}_${relacaoNr}_${rowDoc}_${codigoAmb}_${dataProc}_${notaFiscal}`;
          const occIndex = tupleOccurrenceMap.get(tupleBase) || 0;
          tupleOccurrenceMap.set(tupleBase, occIndex + 1);

          const deterministicKey = `${tupleBase}_occ${occIndex}`.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 120);

          const procDocRef = db.collection("procedimentos").doc(deterministicKey);
          const existingProcSnap = await procDocRef.get();

          if (existingProcSnap.exists) {
            proceduresIgnoredDuplicates++;
          }

          const procPayload: any = {
            pacienteId: patientId,
            codigoUsuario: codigoUsuario,
            nomeUsuario: nome, // Exclusively Nome do Usuário
            groupId: groupId,

            periodo: periodo,
            notaFiscal: notaFiscal,
            relacaoNr: relacaoNr,
            data: dataProc,
            documento: rowDoc,
            quantidade: quantidade,

            codigoAMB: codigoAmb,
            descricao: descricao,

            valorHonorarios: vlrHon,
            valorOperacional: vlrOper,
            valorFilme: vlrFilme,
            valorTaxaAdministrativa: vlrTxAdm,

            prestadorExecutante: prestadorExecutante,
            prestadorPagamento: prestadorPagamento,
            prestadorProtocolo: prestadorProtocolo,
            hospitalId: resolvedHospitalId || "",
            hospitalName: rowHospital || matchedHospitalName || "Sem Hospital",
            statusId: resolvedStatusId || "",
            statusName: rowStatus || matchedStatusName || "Sem Status",

            dadosOriginais: row, // Preserves ALL columns including Unnamed: ...
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };

          if (!existingProcSnap.exists) {
            procPayload.createdAt = admin.firestore.FieldValue.serverTimestamp();
          }

          await procDocRef.set(procPayload, { merge: true });

          // Mirror to subcollection
          try {
            await db.collection("patients").doc(patientId).collection("procedimentos").doc(deterministicKey).set(procPayload, { merge: true });
          } catch (e) {}

          proceduresImported++;
        }
      } catch (itemErr: any) {
        errorsCount++;
        if (errorDetails.length < 20) {
          errorDetails.push(`Paciente ${patData.codigoUsuario || "desconhecido"}: ${itemErr.message}`);
        }
      }
    }

    res.json({
      success: true,
      newPatients,
      updatedPatients,
      totalProcessed: newPatients + updatedPatients,
      proceduresImported,
      proceduresIgnoredDuplicates,
      hospitalsFound,
      hospitalsCreated,
      statusesFound,
      statusesCreated,
      errorsCount,
      errorDetails
    });
  } catch (error) {
    handleApiError(res, error, "Importing CSV patients");
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
        status: finalStatusName,
        statusName: finalStatusName,
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

// Batch remove patients and their procedures
app.post("/api/app/patients/batch-remove", express.json(), async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  const { patientIds } = req.body;
  if (!Array.isArray(patientIds) || patientIds.length === 0) {
    return res.status(400).json({ error: "Lista de IDs de pacientes inválida." });
  }

  try {
    await requireGroupMember(req, groupId);
    let deletedPatientsCount = 0;
    let deletedProcsCount = 0;

    for (const pId of patientIds) {
      if (!pId) continue;

      // 1. Delete procedures from root collection 'procedimentos'
      const procsSnap = await db.collection("procedimentos")
        .where("groupId", "==", groupId)
        .where("pacienteId", "==", pId)
        .get();

      // 2. Delete procedures from patient subcollection
      const subProcsSnap = await db.collection("patients").doc(pId).collection("procedimentos").get();

      const batch = db.batch();
      procsSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
        deletedProcsCount++;
      });
      subProcsSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      // 3. Delete patient document completely
      const patRef = db.collection("patients").doc(pId);
      batch.delete(patRef);

      await batch.commit();
      deletedPatientsCount++;
    }

    res.json({ 
      success: true, 
      count: deletedPatientsCount,
      proceduresDeleted: deletedProcsCount 
    });
  } catch (error) {
    handleApiError(res, error, "Batch removing patients");
  }
});

// Purge soft-deleted patients and orphaned procedures
app.post("/api/app/patients/purge-removed", express.json(), async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });

  try {
    await requireGroupMember(req, groupId);

    // 1. Find all patients marked as "removed"
    const removedPatientsSnap = await db.collection("patients")
      .where("groupId", "==", groupId)
      .where("recordStatus", "==", "removed")
      .get();

    let purgedPatients = 0;
    let purgedProcs = 0;

    for (const pDoc of removedPatientsSnap.docs) {
      const pId = pDoc.id;
      const subProcs = await db.collection("patients").doc(pId).collection("procedimentos").get();
      const rootProcs = await db.collection("procedimentos").where("pacienteId", "==", pId).get();

      const batch = db.batch();
      subProcs.docs.forEach(d => { batch.delete(d.ref); purgedProcs++; });
      rootProcs.docs.forEach(d => { batch.delete(d.ref); purgedProcs++; });
      batch.delete(pDoc.ref);
      await batch.commit();
      purgedPatients++;
    }

    // 2. Find any procedures whose patient doesn't exist
    const allActivePatientsSnap = await db.collection("patients").where("groupId", "==", groupId).get();
    const activePatientIds = new Set(
      allActivePatientsSnap.docs
        .filter(d => d.data().recordStatus !== "removed")
        .map(d => d.id)
    );

    const allGroupProcsSnap = await db.collection("procedimentos").where("groupId", "==", groupId).get();
    const orphanBatch = db.batch();
    let orphanCount = 0;

    allGroupProcsSnap.docs.forEach(d => {
      const pId = d.data().pacienteId;
      if (!pId || !activePatientIds.has(pId)) {
        orphanBatch.delete(d.ref);
        orphanCount++;
      }
    });

    if (orphanCount > 0) {
      await orphanBatch.commit();
    }

    res.json({
      success: true,
      purgedPatients,
      purgedProcedures: purgedProcs + orphanCount
    });
  } catch (error) {
    handleApiError(res, error, "Purging removed data");
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

  if (groupId === "demo-group-hospital") {
    return res.json([
      { id: "demo-stat-1", name: "UTI / Crítico", nome: "UTI / Crítico", color: "#EF4444", sortOrder: 1 },
      { id: "demo-stat-2", name: "Estável / Enfermaria", nome: "Estável / Enfermaria", color: "#10B981", sortOrder: 2 },
      { id: "demo-stat-3", name: "Observação / Cirúrgico", nome: "Observação / Cirúrgico", color: "#F59E0B", sortOrder: 3 }
    ]);
  }
  
  try {
    const statusesSnap = await db.collection("patient_statuses")
      .where("groupId", "==", groupId)
      .get();
    
    // Only return configured active statuses
    let statuses = statusesSnap.docs
      .filter(doc => {
        const data = doc.data();
        return data.active !== false && data.status !== "removed";
      })
      .map(doc => {
        const data = doc.data();
        return { id: doc.id, ...data, nome: data.name || data.nome };
      })
      .sort((a: any, b: any) => {
        const orderA = typeof a.sortOrder === "number" ? a.sortOrder : 999999;
        const orderB = typeof b.sortOrder === "number" ? b.sortOrder : 999999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.nome || "").localeCompare(b.nome || "");
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
  if (ext === "webp") return "image/webp";
  if (ext === "heic") return "image/heic";
  if (ext === "heif") return "image/heif";
  if (ext === "pdf") return "application/pdf";

  if (mime && mime !== "application/octet-stream" && mime !== "") {
    return mime;
  }

  return "application/octet-stream";
};

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

// Ensure Bucket CORS is properly configured for browser direct PUT uploads
const ensureBucketCors = async () => {
  try {
    const defaultBucket = getStorage().bucket(targetStorageBucket);
    await defaultBucket.setCorsConfiguration([
      {
        maxAgeSeconds: 3600,
        method: ["GET", "PUT", "POST", "HEAD", "OPTIONS"],
        origin: ["*"],
        responseHeader: ["*"]
      }
    ]);
    console.log("[Storage] Storage bucket CORS successfully configured for direct uploads.");
  } catch (err: any) {
    console.warn("[Storage] Warning configuring bucket CORS:", err?.message);
  }
};
ensureBucketCors().catch(() => {});

// Direct Signed Upload URL generator (bypasses Cloud Run 32MB payload limit and memory buffering)
app.post("/api/app/get-upload-url", express.json({ limit: "10mb" }), async (req, res) => {
  try {
    const {
      patientId,
      fileName,
      mimeType,
      size,
      description,
      isEncrypted,
      iv,
      originalContentType
    } = req.body || {};

    if (!patientId) {
      return res.status(400).json({ error: "PatientID é obrigatório." });
    }

    const authUser = await requireAuth(req);
    const { groupId } = await requirePatientAccess(req, patientId);

    const rawName = fileName || "file";
    const safeFileName = sanitizeFileName(rawName);
    const safeContentType = getSafeContentType(safeFileName, mimeType || "application/octet-stream");

    const mimeToCheck = isEncrypted ? (originalContentType || "") : safeContentType;
    const nameToCheck = isEncrypted ? (rawName || "") : safeFileName;

    let fileTypeResolved: "image" | "video" | "pdf" = "image";
    if (
      mimeToCheck.startsWith("image/") ||
      nameToCheck.endsWith(".heic") ||
      nameToCheck.endsWith(".jpeg") ||
      nameToCheck.endsWith(".jpg") ||
      nameToCheck.endsWith(".png") ||
      nameToCheck.endsWith(".webp")
    ) {
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
    }

    const fileSize = Number(size) || 0;
    if (fileTypeResolved === "image" && fileSize > 30 * 1024 * 1024) {
      return res.status(400).json({ error: "Esta imagem é muito grande (máximo 30MB). Escolha um arquivo menor." });
    }
    if (fileTypeResolved === "video" && fileSize > 150 * 1024 * 1024) {
      return res.status(400).json({ error: "Este vídeo é muito grande (máximo 150MB). Escolha um vídeo menor para anexar." });
    }
    if (fileTypeResolved === "pdf" && fileSize > 50 * 1024 * 1024) {
      return res.status(400).json({ error: "Este PDF é muito grande (máximo 50MB). Escolha um arquivo menor." });
    }

    const fileId = db.collection("files").doc().id;
    let storagePath = `patients/${patientId}/${Date.now()}-${safeFileName}`;
    if (groupId) {
      if (isEncrypted) {
        storagePath = `groups/${groupId}/encrypted-files/${fileId}/${safeFileName}.encrypted`;
      } else {
        storagePath = `groups/${groupId}/files/${fileId}/${safeFileName}`;
      }
    }

    const contentTypeToSave = isEncrypted ? "application/octet-stream" : safeContentType;
    const targetBucket = getStorage().bucket(targetStorageBucket);
    const fileObj = targetBucket.file(storagePath);

    const [uploadUrl] = await fileObj.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 30 * 60 * 1000, // 30 minutes
      contentType: contentTypeToSave
    });

    const publicUrl = `https://storage.googleapis.com/${targetStorageBucket}/${storagePath}`;

    console.log(`[get-upload-url] Generated signed upload URL for ${rawName} (${fileTypeResolved}, ${fileSize} bytes) -> ${storagePath}`);

    return res.json({
      success: true,
      fileId,
      uploadUrl,
      storagePath,
      downloadURL: publicUrl,
      publicUrl,
      contentType: contentTypeToSave,
      safeFileName,
      fileType: fileTypeResolved,
      groupId
    });
  } catch (error: any) {
    console.error("[get-upload-url] Error:", error);
    return res.status(500).json({ error: error.message || "Falha ao gerar URL de upload direto." });
  }
});

// Confirmation route after client successfully uploads file directly to Signed URL
app.post("/api/app/confirm-upload", express.json({ limit: "10mb" }), async (req, res) => {
  try {
    const {
      fileId,
      storagePath,
      patientId,
      fileName,
      mimeType,
      size,
      description,
      isEncrypted,
      iv,
      originalContentType,
      platform
    } = req.body || {};

    if (!fileId || !storagePath || !patientId) {
      return res.status(400).json({ error: "fileId, storagePath e patientId são obrigatórios." });
    }

    const authUser = await requireAuth(req);
    const { groupId } = await requirePatientAccess(req, patientId);

    const rawName = fileName || "file";
    const safeFileName = sanitizeFileName(rawName);
    const safeContentType = getSafeContentType(safeFileName, mimeType || "application/octet-stream");

    const mimeToCheck = isEncrypted ? (originalContentType || "") : safeContentType;
    const nameToCheck = isEncrypted ? (rawName || "") : safeFileName;

    let fileTypeResolved: "image" | "video" | "pdf" = "image";
    if (
      mimeToCheck.startsWith("image/") ||
      nameToCheck.endsWith(".heic") ||
      nameToCheck.endsWith(".jpeg") ||
      nameToCheck.endsWith(".jpg") ||
      nameToCheck.endsWith(".png") ||
      nameToCheck.endsWith(".webp")
    ) {
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
    }

    const targetBucket = getStorage().bucket(targetStorageBucket);
    const fileObj = targetBucket.file(storagePath);

    // Ensure public read access
    try {
      await fileObj.makePublic();
    } catch (pubErr) {
      console.warn("[confirm-upload] makePublic warning:", pubErr);
    }

    const publicUrl = `https://storage.googleapis.com/${targetStorageBucket}/${storagePath}`;
    const contentTypeToSave = isEncrypted ? "application/octet-stream" : safeContentType;
    const fileSize = Number(size) || 0;

    const fileRef = db.collection("files").doc(fileId);
    const metadata = {
      id: fileId,
      groupId: groupId || "",
      patientId: patientId,
      uploadedBy: authUser.uid,
      uploadedByEmail: authUser.email || "",
      originalName: rawName,
      originalFileName: rawName,
      safeFileName: safeFileName,
      contentType: contentTypeToSave,
      originalContentType: isEncrypted ? originalContentType : safeContentType,
      fileType: fileTypeResolved,
      size: fileSize,
      storagePath: storagePath,
      downloadURL: publicUrl,
      downloadUrl: publicUrl,
      description: description || rawName || "Arquivo",
      link: publicUrl,
      status: "active",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      encrypted: !!isEncrypted,
      ...(isEncrypted ? {
        encryption: {
          algorithm: "AES-GCM",
          iv: iv || "",
          originalContentType: originalContentType || "",
          encrypted: true
        }
      } : {})
    };

    await fileRef.set(metadata);
    console.log(`[confirm-upload] File ${fileId} confirmed and indexed in Firestore.`);

    return res.json({
      success: true,
      fileId,
      link: publicUrl,
      downloadURL: publicUrl,
      downloadUrl: publicUrl,
      fileType: fileTypeResolved,
      size: fileSize,
      name: rawName
    });
  } catch (error: any) {
    console.error("[confirm-upload] Error:", error);
    return res.status(500).json({ error: error.message || "Falha ao registrar arquivo no banco de dados." });
  }
});

// Upload image/document directly to Firebase Storage and link to Firestore (fallback / multipart route)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
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
    express.json({ limit: "100mb" })(req, res, next);
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
    if (fileTypeResolved === "image" && fileSize > 20 * 1024 * 1024) {
      return res.status(400).json({ error: "Esta imagem é muito grande (máximo 20MB). Escolha um arquivo menor." });
    }
    if (fileTypeResolved === "video" && fileSize > 100 * 1024 * 1024) {
      return res.status(400).json({ error: "Este vídeo é muito grande (máximo 100MB). Escolha um vídeo menor para anexar." });
    }
    if (fileTypeResolved === "pdf" && fileSize > 50 * 1024 * 1024) {
      return res.status(400).json({ error: "Este PDF é muito grande (máximo 50MB). Escolha um arquivo menor." });
    }

    // 2. Upload to Firebase Storage with organized path
    const fileId = db.collection("files").doc().id;
    const timestamp = Date.now();
    
    let destination = `patients/${patientId}/${timestamp}-${safeFileName}`;
    if (groupId) {
      if (isEncrypted) {
        destination = `groups/${groupId}/encrypted-files/${fileId}/${safeFileName}.encrypted`;
      } else {
        destination = `groups/${groupId}/files/${fileId}/${safeFileName}`;
      }
    }

    console.log("[Upload] storagePath", destination);

    const contentTypeToSave = isEncrypted ? "application/octet-stream" : safeContentType;

    // Resilient bucket upload
    const projectId = firebaseConfig.projectId || "parabolic-craft-277523";
    const bucketsToTry = [
      bucket.name,
      firebaseConfig.storageBucket,
      `${projectId}.firebasestorage.app`,
      `${projectId}.appspot.com`,
    ].filter((b, i, arr) => b && arr.indexOf(b) === i && b !== "[DEFAULT]");

    let lastUploadError: any = null;
    let successfulBucket = "";
    let fileObj: any = null;

    for (const bName of bucketsToTry) {
      try {
        console.log(`[Upload] Attempting to save to bucket: ${bName}`);
        const currentBucket = getStorage().bucket(bName);
        const currentFile = currentBucket.file(destination);
        await currentFile.save(buffer, {
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
        fileObj = currentFile;
        successfulBucket = bName;
        break;
      } catch (err: any) {
        lastUploadError = err;
        console.warn(`[Upload] Bucket ${bName} failed:`, err.message);
      }
    }

    if (!fileObj) {
      throw new Error(`Falha ao salvar no armazenamento: ${lastUploadError?.message || "Nenhum bucket disponível"}`);
    }

    // Attempt to make public (ignore failure if Uniform Bucket-Level Access prevents ACL)
    try {
      await fileObj.makePublic();
    } catch (pubErr) {
      console.warn("[Upload] makePublic warning:", pubErr);
    }

    const publicUrl = `https://storage.googleapis.com/${successfulBucket}/${destination}`;

    // 3. Save detailed metadata to Firestore (under files collection)
    const fileRef = db.collection("files").doc(fileId);
    const metadata = {
      id: fileId,
      groupId: groupId || "",
      patientId: patientId,
      uploadedBy: authUser.uid,
      uploadedByEmail: authUser.email || "",
      originalName: rawName,
      originalFileName: rawName,
      safeFileName: safeFileName,
      contentType: contentTypeToSave,
      originalContentType: isEncrypted ? originalContentType : safeContentType,
      fileType: fileTypeResolved,
      size: fileSize,
      storagePath: destination,
      downloadURL: publicUrl,
      downloadUrl: publicUrl,
      description: description || rawName || "Arquivo",
      link: publicUrl,
      status: "active",
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      encrypted: isEncrypted,
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

    res.json({
      success: true,
      fileId: fileId,
      link: publicUrl,
      downloadURL: publicUrl,
      downloadUrl: publicUrl,
      fileType: fileTypeResolved,
      size: fileSize,
      name: rawName
    });
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

// Global Express Error Handler: Always output JSON to avoid HTML error crashes
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("[API Unhandled Error]:", err);
  if (!res.headersSent) {
    res.status(500).json({
      error: err?.message || "Internal Server Error",
      code: err?.code || "INTERNAL_ERROR"
    });
  }
});

// --- Financial Management Endpoints ---

const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// 1. Closings
app.get("/api/app/financial/closings", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupMember(req, groupId);
    const snap = await db.collection("financial_closings").where("teamId", "==", groupId).get();
    const closings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(closings);
  } catch (err: any) {
    handleApiError(res, err, "Get Financial Closings");
  }
});

app.post("/api/app/financial/closings", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupOwner(req, groupId);
    const { nome, competencia, mes, ano, observacao } = req.body;
    if (!nome) return res.status(400).json({ error: "Nome do fechamento é obrigatório" });

    const docRef = db.collection("financial_closings").doc();
    const newClosing = {
      id: docRef.id,
      teamId: groupId,
      nome,
      competencia: competencia || nome,
      mes: mes ? Number(mes) : new Date().getMonth() + 1,
      ano: ano ? Number(ano) : new Date().getFullYear(),
      status: "ABERTO",
      observacao: observacao || "",
      createdBy: user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await docRef.set(newClosing);
    res.json(newClosing);
  } catch (err: any) {
    handleApiError(res, err, "Create Financial Closing");
  }
});

app.put("/api/app/financial/closings/:id", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupOwner(req, groupId);
    const { id } = req.params;
    const { status, observacao } = req.body;
    const docRef = db.collection("financial_closings").doc(id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Fechamento não encontrado" });

    const updateData: any = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (status) updateData.status = status;
    if (observacao !== undefined) updateData.observacao = observacao;
    if (status === "FECHADO") updateData.dataFechamento = new Date().toISOString();

    await docRef.update(updateData);
    res.json({ success: true, id, ...updateData });
  } catch (err: any) {
    handleApiError(res, err, "Update Financial Closing");
  }
});

// 2. Transaction Types
app.get("/api/app/financial/types", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupMember(req, groupId);
    const snap = await db.collection("financial_transaction_types").where("teamId", "==", groupId).get();
    let types = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (types.length === 0) {
      const defaultTypes = [
        "Integralização de Cota Parte", "Capitalização Cota-Parte", "Disponibilidade Médica - UTI",
        "Disponibilidade - Reumatologia", "Disponibilidade Ginecologia - Centro Obstétrico",
        "Sobreavisos", "Mensalidade PLAC", "Contribuição de Centro de Estudos",
        "Glosas - Clínica Cooperada - 11%", "Desconto Atendimentos Realizados - Recurso Próprio",
        "Consumo Clube do Médico - Restaurante", "Remuneração Bonificação Parto Normal"
      ];
      const batch = db.batch();
      types = defaultTypes.map((tName, idx) => {
        const ref = db.collection("financial_transaction_types").doc();
        const obj = {
          id: ref.id,
          teamId: groupId,
          nome: tName,
          categoria: "Geral",
          naturezaPadrao: tName.includes("Integralização") || tName.includes("Contribuição") || tName.includes("Glosas") || tName.includes("Desconto") || tName.includes("Consumo") || tName.includes("Mensalidade") ? "DEBITO" : "CREDITO",
          ativo: true,
          ordem: idx + 1,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        batch.set(ref, obj);
        return obj;
      });
      await batch.commit();
    }
    res.json(types);
  } catch (err: any) {
    handleApiError(res, err, "Get Financial Types");
  }
});

app.post("/api/app/financial/types", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupOwner(req, groupId);
    const { nome, categoria, naturezaPadrao } = req.body;
    if (!nome) return res.status(400).json({ error: "Nome do tipo é obrigatório" });

    const docRef = db.collection("financial_transaction_types").doc();
    const newType = {
      id: docRef.id,
      teamId: groupId,
      nome,
      categoria: categoria || "Geral",
      naturezaPadrao: naturezaPadrao || "CREDITO",
      ativo: true,
      ordem: 100,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await docRef.set(newType);
    res.json(newType);
  } catch (err: any) {
    handleApiError(res, err, "Create Financial Type");
  }
});

// 3. Transactions
app.get("/api/app/financial/transactions", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupMember(req, groupId);
    let isAdminUser = false;
    try {
      await requireGroupOwner(req, groupId);
      isAdminUser = true;
    } catch (e) {
      isAdminUser = false;
    }

    let query: admin.firestore.Query = db.collection("financial_transactions").where("teamId", "==", groupId);
    const fechamentoId = req.query.fechamentoId?.toString();
    const doctorId = req.query.doctorId?.toString();

    if (fechamentoId) query = query.where("fechamentoId", "==", fechamentoId);
    if (doctorId && isAdminUser) query = query.where("doctorId", "==", doctorId);

    const snap = await query.get();
    let transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!isAdminUser) {
      transactions = transactions.filter((t: any) => t.doctorId === user.uid || (t.doctorName && user.email && t.doctorName.toLowerCase().includes(user.email.split('@')[0].toLowerCase())));
    }

    res.json(transactions);
  } catch (err: any) {
    handleApiError(res, err, "Get Financial Transactions");
  }
});

app.post("/api/app/financial/transactions", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupOwner(req, groupId);
    const { doctorName, doctorId, tipoLancamentoId, tipoLancamentoNome, dataLancamento, valor, natureza, observacao, fechamentoId, fechamentoNome } = req.body;
    if (!doctorName || valor === undefined || !fechamentoId) {
      return res.status(400).json({ error: "DoctorName, valor e fechamentoId são obrigatórios" });
    }

    const numVal = Number(valor);
    const nat = natureza || (numVal >= 0 ? "CREDITO" : "DEBITO");

    const docRef = db.collection("financial_transactions").doc();
    const rawHash = `${groupId}_${doctorId || ''}_${doctorName}_${tipoLancamentoNome || ''}_${dataLancamento || ''}_${numVal}_${fechamentoId}`;
    const hash = crypto.createHash('md5').update(rawHash).digest('hex');

    const newTx = {
      id: docRef.id,
      teamId: groupId,
      doctorId: doctorId || "",
      doctorName,
      tipoLancamentoId: tipoLancamentoId || "",
      tipoLancamentoNome: tipoLancamentoNome || "Outros",
      dataLancamento: dataLancamento || new Date().toISOString().split('T')[0],
      valor: numVal,
      natureza: nat,
      observacao: observacao || "",
      fechamentoId,
      fechamentoNome: fechamentoNome || "",
      origem: "MANUAL",
      criadoManualmente: true,
      hashIdempotencia: hash,
      createdBy: user.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await docRef.set(newTx);
    res.json(newTx);
  } catch (err: any) {
    handleApiError(res, err, "Create Financial Transaction");
  }
});

// 4. Imports & PDF Parser via Gemini AI
app.get("/api/app/financial/imports", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupMember(req, groupId);
    const snap = await db.collection("financial_imports").where("teamId", "==", groupId).get();
    const imports = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json(imports);
  } catch (err: any) {
    handleApiError(res, err, "Get Financial Imports");
  }
});

app.post("/api/app/financial/import-pdf", uploadMemory.single("file"), async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    await requireGroupOwner(req, groupId);
    const file = req.file;
    const fechamentoId = req.body.fechamentoId;
    const fechamentoNome = req.body.fechamentoNome;

    if (!file) return res.status(400).json({ error: "Arquivo PDF não enviado" });
    if (!fechamentoId) return res.status(400).json({ error: "Fechamento ID é obrigatório" });

    const aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const prompt = `Analise este documento financeiro em PDF (Ocorrências Financeiras). 
Extraia todas as ocorrências financeiras agrupadas por médico/entidade (ex: CAMILA RIBEIRO DUTRA, LUAN JUNIOR VIGNATTI, HEART CIRURGIA CARDIOVASCULAR, etc.).
Para cada ocorrência, extraia:
- doctorName (string: Nome completo do médico ou entidade)
- tipoLancamentoNome (string: Tipo de lançamento, ex: Integralização de Cota Parte, Disponibilidade, Sobreavisos, etc.)
- dataLancamento (string: Data no formato YYYY-MM-DD)
- valor (number: Valor numérico positivo ou negativo, ex: -7500.00 ou 12769.67)
- observacao (string: Observações adicionais se houver)

Retorne estritamente um objeto JSON válido com o seguinte formato:
{
  "doctors": [
    {
      "doctorName": "NOME DO MEDICO",
      "transactions": [
        {
          "tipoLancamentoNome": "...",
          "dataLancamento": "YYYY-MM-DD",
          "valor": 0.00,
          "observacao": "..."
        }
      ]
    }
  ]
}`;

    const response = await aiClient.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: file.mimetype || "application/pdf",
                data: file.buffer.toString("base64")
              }
            },
            { text: prompt }
          ]
        }
      ]
    });

    const responseText = response.text || "";
    let jsonStr = responseText.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.replace(/^```json/, "").replace(/```$/, "").trim();
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```/, "").replace(/```$/, "").trim();
    }

    let parsedData: any;
    try {
      parsedData = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("Failed to parse Gemini JSON response:", responseText);
      throw new Error("A IA não conseguiu estruturar corretamente os dados do PDF. Tente novamente.");
    }

    const existingSnap = await db.collection("financial_transactions")
      .where("teamId", "==", groupId)
      .where("fechamentoId", "==", fechamentoId)
      .get();
    const existingHashes = new Set(existingSnap.docs.map(d => d.data().hashIdempotencia));

    const transactionsToPreview: any[] = [];
    let newCount = 0;
    let existingCount = 0;

    if (parsedData.doctors && Array.isArray(parsedData.doctors)) {
      for (const docGroup of parsedData.doctors) {
        const doctorName = docGroup.doctorName || "Desconhecido";
        if (docGroup.transactions && Array.isArray(docGroup.transactions)) {
          for (const tx of docGroup.transactions) {
            const numVal = Number(tx.valor || 0);
            const natureza = numVal >= 0 ? "CREDITO" : "DEBITO";
            const dataLancamento = tx.dataLancamento || new Date().toISOString().split('T')[0];
            const tipoLancamentoNome = tx.tipoLancamentoNome || "Outros";

            const rawHash = `${groupId}_${doctorName}_${tipoLancamentoNome}_${dataLancamento}_${numVal}_${fechamentoId}`;
            const hash = crypto.createHash('md5').update(rawHash).digest('hex');

            const isDuplicate = existingHashes.has(hash);
            if (isDuplicate) existingCount++;
            else newCount++;

            transactionsToPreview.push({
              doctorName,
              tipoLancamentoNome,
              dataLancamento,
              valor: numVal,
              natureza,
              observacao: tx.observacao || "",
              fechamentoId,
              fechamentoNome,
              origem: "PDF",
              origemArquivo: file.originalname,
              hashIdempotencia: hash,
              isDuplicate
            });
          }
        }
      }
    }

    res.json({
      fileName: file.originalname,
      fechamentoId,
      fechamentoNome,
      totalTransactions: transactionsToPreview.length,
      newCount,
      existingCount,
      transactions: transactionsToPreview
    });
  } catch (err: any) {
    handleApiError(res, err, "Import PDF Financial");
  }
});

app.post("/api/app/financial/import-pdf/confirm", async (req, res) => {
  const groupId = getGroupId(req);
  if (!groupId) return res.status(400).json({ error: "Active Group ID is required" });
  try {
    const { user } = await requireGroupOwner(req, groupId);
    const { fechamentoId, fechamentoNome, nomeArquivo, transactions } = req.body;
    if (!transactions || !Array.isArray(transactions) || !fechamentoId) {
      return res.status(400).json({ error: "Transactions e fechamentoId são obrigatórios" });
    }

    const batch = db.batch();
    let savedNew = 0;
    let skippedExisting = 0;
    let totalCreditos = 0;
    let totalDebitos = 0;

    for (const tx of transactions) {
      const rawHash = tx.hashIdempotencia || crypto.createHash('md5').update(`${groupId}_${tx.doctorName}_${tx.tipoLancamentoNome}_${tx.dataLancamento}_${tx.valor}_${fechamentoId}`).digest('hex');
      
      const checkSnap = await db.collection("financial_transactions")
        .where("teamId", "==", groupId)
        .where("hashIdempotencia", "==", rawHash)
        .get();

      if (!checkSnap.empty) {
        skippedExisting++;
        continue;
      }

      const docRef = db.collection("financial_transactions").doc();
      const txObj = {
        id: docRef.id,
        teamId: groupId,
        doctorId: "",
        doctorName: tx.doctorName,
        tipoLancamentoId: "",
        tipoLancamentoNome: tx.tipoLancamentoNome,
        dataLancamento: tx.dataLancamento,
        valor: tx.valor,
        natureza: tx.valor >= 0 ? "CREDITO" : "DEBITO",
        observacao: tx.observacao || "",
        fechamentoId,
        fechamentoNome: fechamentoNome || "",
        origem: "PDF",
        origemArquivo: nomeArquivo || "documento.pdf",
        hashIdempotencia: rawHash,
        createdBy: user.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };
      batch.set(docRef, txObj);
      savedNew++;

      if (tx.valor >= 0) totalCreditos += tx.valor;
      else totalDebitos += Math.abs(tx.valor);
    }

    const importRef = db.collection("financial_imports").doc();
    const importRecord = {
      id: importRef.id,
      teamId: groupId,
      tipoArquivo: "PDF",
      nomeArquivo: nomeArquivo || "documento.pdf",
      fechamentoId,
      fechamentoNome: fechamentoNome || "",
      quantidadeLancamentos: savedNew,
      valorTotalCreditos: totalCreditos,
      valorTotalDebitos: totalDebitos,
      valorTotal: totalCreditos - totalDebitos,
      status: "IMPORTADO",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };
    batch.set(importRef, importRecord);

    await batch.commit();
    res.json({ success: true, savedNew, skippedExisting, importId: importRef.id });
  } catch (err: any) {
    handleApiError(res, err, "Confirm PDF Import");
  }
});

async function startServer() {
  const distPath = path.join(process.cwd(), "dist");
  const publicPath = path.join(process.cwd(), "public");

  // Explicitly serve /icons with correct caching and mime types
  if (fs.existsSync(path.join(publicPath, "icons"))) {
    app.use("/icons", express.static(path.join(publicPath, "icons"), {
      maxAge: "1d",
      immutable: true
    }));
  }

  // Serve public static assets (favicons, etc)
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }

  // Explicitly serve manifest.json with standard PWA content-type and safety in both dev and prod
  app.get("/manifest.json", (req, res) => {
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    const prodPath = path.join(distPath, "manifest.json");
    const devPath = path.join(process.cwd(), "public", "manifest.json");
    if (fs.existsSync(prodPath)) {
      res.sendFile(prodPath);
    } else if (fs.existsSync(devPath)) {
      res.sendFile(devPath);
    } else {
      res.status(404).json({ error: "Manifest not found" });
    }
  });

  // Explicitly serve service-worker.js with correct Content-Type and no-cache in both dev and prod
  app.get("/service-worker.js", (req, res, next) => {
    const prodPath = path.join(distPath, "service-worker.js");
    if (fs.existsSync(prodPath)) {
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
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
