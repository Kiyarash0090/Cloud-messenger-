import express, { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import multer from "multer";
import { DatabaseSync } from "node:sqlite";
import { createServer as createViteServer } from "vite";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";

// --- ENVIRONMENT & CONFIGURATION ---
const isProd = process.env.NODE_ENV === "production";
const trustProxy = process.env.TRUST_PROXY === "1" || !isProd;
const PORT = 3000;

const app = express();
// Enable trust proxy when behind a proxy or in development sandbox
if (trustProxy) {
  app.set("trust proxy", 1);
}

// Ensure storage directories exist
const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const uploadDir = path.join(dataDir, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const dbPath = path.join(dataDir, "app.db");

// Maintenance mode flag for DB swaps
let isMaintenanceMode = false;

// --- DATABASE CONNECTION & PRAGMAS ---
let db: DatabaseSync;

function openDatabase(): DatabaseSync {
  const d = new DatabaseSync(dbPath);
  d.exec("PRAGMA journal_mode = WAL;");
  d.exec("PRAGMA busy_timeout = 5000;");
  d.exec("PRAGMA foreign_keys = ON;");
  return d;
}

// Transaction helper with BEGIN IMMEDIATE / COMMIT / ROLLBACK
export function withTransaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch (_) {}
    throw err;
  }
}

// Dynamic table column helper to safely upgrade old SQLite tables
function ensureTableColumns(tableName: string, colDefs: Record<string, string>) {
  try {
    const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(tableName);
    if (!tableExists) return;
    const existing = (db.prepare(`PRAGMA table_info(${tableName})`).all() as any[]).map((c) => c.name);
    for (const [col, def] of Object.entries(colDefs)) {
      if (!existing.includes(col)) {
        try {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${col} ${def};`);
        } catch (_) {}
      }
    }
  } catch (_) {}
}

// --- DATABASE SCHEMA INITIALIZATION & MIGRATIONS ---
function initDbSchemaAndAdmin() {
  // Ensure tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      username TEXT UNIQUE COLLATE NOCASE,
      displayName TEXT,
      photoURL TEXT,
      bio TEXT,
      _password TEXT,
      isAdmin INTEGER DEFAULT 0,
      isOnline INTEGER DEFAULT 0,
      lastSeen TEXT,
      lastSeenPrivacy TEXT DEFAULT 'everyone',
      defaultReaction TEXT DEFAULT '👍',
      chatWallpaper TEXT DEFAULT '',
      pinnedChatIds TEXT DEFAULT '[]',
      version INTEGER DEFAULT 1,
      createdAt TEXT,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS handles (
      handle TEXT PRIMARY KEY COLLATE NOCASE,
      ownerType TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private',
      handle TEXT UNIQUE COLLATE NOCASE,
      ownerUid TEXT NOT NULL,
      name TEXT,
      photoURL TEXT,
      description TEXT,
      bio TEXT,
      version INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL,
      lastMessageSenderId TEXT,
      lastMessageText TEXT,
      lastMessageType TEXT,
      lastMessageCreatedAt TEXT,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_members (
      chatId TEXT NOT NULL,
      uid TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      isMuted INTEGER DEFAULT 0,
      isBanned INTEGER DEFAULT 0,
      joinedAt TEXT NOT NULL,
      PRIMARY KEY (chatId, uid)
    );

    CREATE TABLE IF NOT EXISTS chat_invites (
      token TEXT PRIMARY KEY,
      chatId TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      expiresAt TEXT,
      maxUses INTEGER DEFAULT 1,
      uses INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chatId TEXT NOT NULL,
      senderId TEXT NOT NULL,
      text TEXT,
      type TEXT NOT NULL DEFAULT 'text',
      mediaUrl TEXT,
      fileName TEXT,
      replyTo TEXT,
      deleted INTEGER DEFAULT 0,
      edited INTEGER DEFAULT 0,
      reactions TEXT DEFAULT '{}',
      readBy TEXT DEFAULT '[]',
      createdAt TEXT NOT NULL,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS uploads (
      filename TEXT PRIMARY KEY,
      uploaderUid TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      contentType TEXT NOT NULL,
      refType TEXT NOT NULL,
      refId TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      uid TEXT NOT NULL,
      ip TEXT,
      userAgent TEXT,
      createdAt TEXT NOT NULL,
      lastActive TEXT NOT NULL,
      expiresAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
      blockerUid TEXT NOT NULL,
      blockedUid TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      PRIMARY KEY (blockerUid, blockedUid)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actorUid TEXT,
      action TEXT NOT NULL,
      targetType TEXT,
      targetId TEXT,
      ip TEXT,
      details TEXT,
      createdAt TEXT NOT NULL
    );
  `);

  // Ensure all columns exist before creating indexes
  ensureTableColumns("users", {
    uid: "TEXT",
    username: "TEXT",
    displayName: "TEXT",
    photoURL: "TEXT",
    bio: "TEXT",
    _password: "TEXT",
    isAdmin: "INTEGER DEFAULT 0",
    isOnline: "INTEGER DEFAULT 0",
    lastSeen: "TEXT",
    lastSeenPrivacy: "TEXT DEFAULT 'everyone'",
    defaultReaction: "TEXT DEFAULT '👍'",
    chatWallpaper: "TEXT DEFAULT ''",
    pinnedChatIds: "TEXT DEFAULT '[]'",
    version: "INTEGER DEFAULT 1",
    createdAt: "TEXT",
    data: "TEXT",
  });

  ensureTableColumns("chats", {
    id: "TEXT",
    type: "TEXT",
    visibility: "TEXT DEFAULT 'private'",
    handle: "TEXT",
    ownerUid: "TEXT",
    name: "TEXT",
    photoURL: "TEXT",
    description: "TEXT",
    bio: "TEXT",
    version: "INTEGER DEFAULT 1",
    createdAt: "TEXT",
    lastMessageSenderId: "TEXT",
    lastMessageText: "TEXT",
    lastMessageType: "TEXT",
    lastMessageCreatedAt: "TEXT",
    data: "TEXT",
  });

  ensureTableColumns("messages", {
    id: "TEXT",
    chatId: "TEXT",
    senderId: "TEXT",
    text: "TEXT",
    type: "TEXT DEFAULT 'text'",
    mediaUrl: "TEXT",
    fileName: "TEXT",
    replyTo: "TEXT",
    deleted: "INTEGER DEFAULT 0",
    edited: "INTEGER DEFAULT 0",
    reactions: "TEXT DEFAULT '{}'",
    readBy: "TEXT DEFAULT '[]'",
    createdAt: "TEXT",
    data: "TEXT",
  });

  // Create Indexes safely
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_chat_members_uid ON chat_members(uid);
    CREATE INDEX IF NOT EXISTS idx_chat_members_chatId ON chat_members(chatId);
    CREATE INDEX IF NOT EXISTS idx_messages_chatId_createdAt ON messages(chatId, createdAt);
    CREATE INDEX IF NOT EXISTS idx_uploads_uploaderUid ON uploads(uploaderUid);
    CREATE INDEX IF NOT EXISTS idx_sessions_uid ON sessions(uid);
  `);

  // Migrate existing data if necessary (e.g. from old schemas)
  runMigrations();

  // Seed default admin if not exists
  const adminCheck = db.prepare("SELECT * FROM users WHERE username = ?").get("admin") as any;
  if (!adminCheck) {
    const adminUid = "admin_user_id";
    const passwordHash = bcrypt.hashSync("popoopop", 10);
    const now = new Date().toISOString();
    const adminProfile = {
      uid: adminUid,
      username: "admin",
      displayName: "مدیر کل (Admin)",
      photoURL: "",
      bio: "System Administrator",
      isOnline: false,
      isAdmin: 1,
      lastSeen: now,
      lastSeenPrivacy: "everyone",
      createdAt: now,
    };

    withTransaction(() => {
      db.prepare(`
        INSERT INTO users (uid, username, displayName, photoURL, bio, _password, isAdmin, isOnline, lastSeen, lastSeenPrivacy, createdAt, data)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, 'everyone', ?, ?)
      `).run(
        adminUid,
        "admin",
        "مدیر کل (Admin)",
        "",
        "System Administrator",
        passwordHash,
        now,
        now,
        JSON.stringify(adminProfile)
      );

      db.prepare(`
        INSERT OR IGNORE INTO handles (handle, ownerType, ownerId, createdAt)
        VALUES (?, 'user', ?, ?)
      `).run("admin", adminUid, now);
    });
  }
}

function runMigrations() {
  withTransaction(() => {
    // 1. Check if old users need password hashing or handles registration
    const users = db.prepare("SELECT * FROM users").all() as any[];
    for (const u of users) {
      if (u._password && !u._password.startsWith("$2a$") && !u._password.startsWith("$2b$")) {
        const hashed = bcrypt.hashSync(u._password, 10);
        db.prepare("UPDATE users SET _password = ? WHERE uid = ?").run(hashed, u.uid);
      }
      if (u.username) {
        db.prepare("INSERT OR IGNORE INTO handles (handle, ownerType, ownerId, createdAt) VALUES (?, 'user', ?, ?)").run(
          u.username.toLowerCase(),
          u.uid,
          u.createdAt || new Date().toISOString()
        );
      }
    }

    // 2. Populate chat_members and handles from chats
    const chats = db.prepare("SELECT * FROM chats").all() as any[];
    for (const c of chats) {
      let chatObj: any = {};
      try {
        chatObj = c.data ? JSON.parse(c.data) : {};
      } catch (_) {}

      const ownerUid = c.ownerUid || chatObj.ownerUid || "admin_user_id";
      const members: string[] = chatObj.memberUids || (chatObj.members ? chatObj.members : [ownerUid]);
      const admins: string[] = chatObj.admins || [ownerUid];
      const banned: string[] = chatObj.bannedUids || [];
      const muted: string[] = chatObj.mutedUids || [];
      const joinedAt = c.createdAt || chatObj.createdAt || new Date().toISOString();

      if (c.handle) {
        db.prepare("INSERT OR IGNORE INTO handles (handle, ownerType, ownerId, createdAt) VALUES (?, 'chat', ?, ?)").run(
          c.handle.toLowerCase(),
          c.id,
          joinedAt
        );
      }

      for (const uid of members) {
        const role = uid === ownerUid ? "owner" : admins.includes(uid) ? "admin" : "member";
        const isBanned = banned.includes(uid) ? 1 : 0;
        const isMuted = muted.includes(uid) ? 1 : 0;
        db.prepare(`
          INSERT OR IGNORE INTO chat_members (chatId, uid, role, isMuted, isBanned, joinedAt)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(c.id, uid, role, isMuted, isBanned, joinedAt);
      }
    }

    // 3. Migrate messages (replace /uploads/ with /api/media/)
    const messages = db.prepare("SELECT * FROM messages").all() as any[];
    for (const m of messages) {
      let changed = false;
      let mediaUrl = m.mediaUrl;
      let data = m.data;
      if (mediaUrl && mediaUrl.startsWith("/uploads/")) {
        mediaUrl = mediaUrl.replace(/^\/uploads\//, "/api/media/");
        changed = true;
      }
      if (data && data.includes("/uploads/")) {
        data = data.replace(/\/uploads\//g, "/api/media/");
        changed = true;
      }
      if (changed) {
        db.prepare("UPDATE messages SET mediaUrl = ?, data = ? WHERE id = ?").run(mediaUrl, data, m.id);
      }
    }
  });
}

function createAndInitDb() {
  try {
    db = openDatabase();
    initDbSchemaAndAdmin();
  } catch (err) {
    console.error("Database initialization error:", err);
    throw err;
  }
}

createAndInitDb();

// Audit log helper
export function logAudit(actorUid: string | null, action: string, targetType: string, targetId: string, ip: string | undefined, details: string) {
  try {
    db.prepare(`
      INSERT INTO audit_log (actorUid, action, targetType, targetId, ip, details, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(actorUid, action, targetType, targetId, ip || "", details, new Date().toISOString());
  } catch (e) {
    console.error("Failed to write audit log:", e);
  }
}

// --- RESERVED HANDLES & HANDLE VALIDATION ---
const RESERVED_HANDLES = new Set([
  "admin", "administrator", "system", "support", "root",
  "me", "api", "help", "official", "security"
]);

function isHandleReserved(handle: string): boolean {
  return RESERVED_HANDLES.has(handle.toLowerCase());
}

function isValidHandleFormat(handle: string): boolean {
  return /^[a-z0-9_]{3,32}$/i.test(handle);
}

function claimHandle(handle: string, ownerType: "user" | "chat", ownerId: string): boolean {
  const clean = handle.toLowerCase();
  const existing = db.prepare("SELECT * FROM handles WHERE handle = ?").get(clean) as any;
  if (existing) {
    if (existing.ownerType === ownerType && existing.ownerId === ownerId) {
      return true;
    }
    return false;
  }
  db.prepare("INSERT INTO handles (handle, ownerType, ownerId, createdAt) VALUES (?, ?, ?, ?)").run(
    clean, ownerType, ownerId, new Date().toISOString()
  );
  return true;
}

function releaseHandle(handle: string) {
  db.prepare("DELETE FROM handles WHERE handle = ?").run(handle.toLowerCase());
}

// --- INPUT SANITIZATION HELPERS ---
// Strip Unicode bidi controls (U+202A-U+202E, U+2066-U+2069), zero-width characters (U+200B-U+200D, U+FEFF), and C0/C1 controls
export function sanitizeText(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .replace(/[\u202A-\u202E\u2066-\u2069\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
}

export function sanitizeFileName(fileName: string | undefined | null): string {
  if (!fileName) return "file";
  let clean = sanitizeText(fileName).replace(/[/\\?%*:|"<>]/g, "_").trim();
  const ext = path.extname(clean).substring(0, 10);
  const base = path.basename(clean, ext).replace(/[^a-zA-Z0-9._ -]/g, "").substring(0, 80);
  return (base || "file") + ext;
}

// Validate Emoji Reactions
const EMOJI_REGEX = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji}\uFE0F)+$/u;
function isValidEmojiReaction(emoji: string): boolean {
  if (!emoji || emoji.length > 16) return false;
  return EMOJI_REGEX.test(emoji);
}

// --- FILE EXTENSIONS & MAGIC BYTES VERIFICATION ---
const EXT_TO_MIME: Record<string, string> = {
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".tiff": "image/tiff",
  ".tif": "image/tiff",

  // Audio
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".flac": "audio/flac",
  ".amr": "audio/amr",
  ".3gp": "audio/3gpp",

  // Video
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv",
  ".flv": "video/x-flv",
  ".m4v": "video/x-m4v",

  // Documents
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".rtf": "application/rtf",
  ".json": "application/json",
  ".xml": "application/xml",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".ts": "text/plain",

  // Archives
  ".zip": "application/zip",
  ".rar": "application/x-rar-compressed",
  ".7z": "application/x-7z-compressed",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
};

const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".php", ".py", ".vbs", ".ps1", ".dll", ".so", ".msi", ".jar", ".scr", ".com", ".pif", ".application", ".gadget", ".msp", ".hta", ".cpl", ".msc", ".ins", ".isp", ".vb", ".vbe", ".jse", ".ws", ".wsf", ".wsc", ".wsh", ".scf", ".lnk", ".inf", ".reg"
]);

function verifyMagicBytes(filePath: string, declaredMime: string, ext: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size === 0) return true; // Allow empty files if uploaded

    const buffer = Buffer.alloc(32);
    const fd = fs.openSync(filePath, "r");
    const bytesRead = fs.readSync(fd, buffer, 0, 32, 0);
    fs.closeSync(fd);

    // Reject executable binaries regardless of declared extension
    if (bytesRead >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) return false; // MZ header
    if (bytesRead >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) return false; // ELF

    const lowerExt = ext.toLowerCase();
    if (lowerExt === ".png" && bytesRead >= 4) {
      return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
    }
    if ((lowerExt === ".jpg" || lowerExt === ".jpeg") && bytesRead >= 3) {
      return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (lowerExt === ".gif" && bytesRead >= 3) {
      return buffer.toString("ascii", 0, 3) === "GIF";
    }
    if (lowerExt === ".webp" && bytesRead >= 12) {
      return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    }
    if (lowerExt === ".pdf" && bytesRead >= 4) {
      return buffer.toString("ascii", 0, 4) === "%PDF";
    }
    if ((lowerExt === ".zip" || lowerExt === ".docx" || lowerExt === ".xlsx" || lowerExt === ".pptx") && bytesRead >= 4) {
      return buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
    }
    return true;
  } catch (err) {
    return true; // Fail-open to avoid blocking valid media uploads
  }
}

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const randomHex = crypto.randomBytes(16).toString("hex");
    const rawExt = path.extname(file.originalname).toLowerCase().substring(0, 10);
    const safeExt = (rawExt && !DANGEROUS_EXTENSIONS.has(rawExt)) ? rawExt : ".bin";
    cb(null, `${Date.now()}_${randomHex}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
  fileFilter: (req, file, cb) => {
    const rawExt = path.extname(file.originalname).toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(rawExt)) {
      return cb(new Error("Executable or dangerous file types are not allowed"));
    }
    cb(null, true);
  },
});

const uploadDbStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, dataDir);
  },
  filename: (req, file, cb) => {
    cb(null, `temp_upload_${Date.now()}.db`);
  },
});

const uploadDb = multer({
  storage: uploadDbStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".db") {
      return cb(new Error("Only .db SQLite database files are allowed"));
    }
    cb(null, true);
  },
});

// --- HELMET & SECURITY HEADERS ---
app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false, // Allows iframe embedding for AI Studio preview
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

app.use(cookieParser());

// --- RATE LIMITERS ---
const rateLimitValidateConfig = {
  keyGeneratorIpFallback: false,
  xForwardedForHeader: false,
  forwardedHeader: false,
  trustProxy: false,
};

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidateConfig,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: "Too many login attempts, please try again after 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidateConfig,
});

const uploadRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyGenerator: (req: any) => req.session?.uid || req.ip || "unknown",
  message: { error: "Upload limit reached. Please wait before uploading more files." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidateConfig,
});

const messageRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  keyGenerator: (req: any) => req.session?.uid || req.ip || "unknown",
  message: { error: "Message sending limit reached. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
  validate: rateLimitValidateConfig,
});

// Maintenance Mode Middleware
app.use((req, res, next) => {
  if (isMaintenanceMode && !req.path.startsWith("/api/admin")) {
    return res.status(503).json({ error: "System is in maintenance mode. Please retry in a few seconds." });
  }
  next();
});

// JSON body parser only for /api routes with 100kb limit
app.use("/api", (req, res, next) => {
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    if (req.headers["content-type"]?.includes("multipart/form-data")) {
      return next();
    }
    express.json({ limit: "100kb" })(req, res, next);
  } else {
    next();
  }
});

// Attach Global API rate limiter
app.use("/api", apiLimiter);

// --- SESSION & AUTHENTICATION MIDDLEWARE ---
export interface AuthUser {
  uid: string;
  username: string;
  isAdmin: boolean;
  token: string;
}

declare global {
  namespace Express {
    interface Request {
      session?: AuthUser;
    }
  }
}

const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const SESSION_IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function createSessionToken(uid: string, req: Request): string {
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
  const ip = req.ip || (req.socket ? req.socket.remoteAddress : "") || "";
  const userAgent = req.headers["user-agent"] || "";

  db.prepare(`
    INSERT INTO sessions (token, uid, ip, userAgent, createdAt, lastActive, expiresAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(token, uid, ip, userAgent, now.toISOString(), now.toISOString(), expiresAt);

  return token;
}

export function setSessionCookie(res: Response, token: string) {
  const cookieName = "cm_session";
  res.cookie(cookieName, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: SESSION_LIFETIME_MS,
    path: "/",
  });
  // Also set a non-httpOnly CSRF token cookie for double submit
  const csrfToken = crypto.randomBytes(16).toString("hex");
  res.cookie("cm_csrf", csrfToken, {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: SESSION_LIFETIME_MS,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie("cm_session", { path: "/", secure: isProd, sameSite: isProd ? "none" : "lax" });
  res.clearCookie("cm_csrf", { path: "/", secure: isProd, sameSite: isProd ? "none" : "lax" });
}

// Session validation middleware
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const cookieName = isProd ? "__Host-cm_session" : "cm_session";
  let token = req.cookies[cookieName] || req.cookies["cm_session"] || (req.headers["authorization"]?.startsWith("Bearer ") ? req.headers["authorization"].substring(7) : null) || (typeof req.query.token === "string" ? req.query.token : null);
  if (token === "undefined" || token === "null" || token === "") {
    token = null;
  }

  const now = new Date();

  if (token) {
    const sessionRow = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token) as any;
    if (sessionRow) {
      const expiresAt = new Date(sessionRow.expiresAt);
      const lastActive = new Date(sessionRow.lastActive);

      if (now <= expiresAt && now.getTime() - lastActive.getTime() <= SESSION_IDLE_TIMEOUT_MS) {
        // Touch lastActive
        db.prepare("UPDATE sessions SET lastActive = ? WHERE token = ?").run(now.toISOString(), token);

        const userRow = db.prepare("SELECT uid, username, isAdmin FROM users WHERE uid = ?").get(sessionRow.uid) as any;
        if (userRow) {
          req.session = {
            uid: userRow.uid,
            username: userRow.username,
            isAdmin: Boolean(userRow.isAdmin),
            token,
          };
          return next();
        }
      }
      // If session expired or user missing, delete invalid session
      db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      clearSessionCookie(res);
    }
  }

  // Fallback: If token was missing or invalid, check if request presents a valid user ID (e.g. from X-User-Id or simulated_user_id)
  const fallbackUid = (req.headers["x-user-id"] as string) || (req.headers["x-simulated-user-id"] as string) || (typeof req.query.uid === "string" ? req.query.uid : null);
  if (fallbackUid) {
    const userRow = db.prepare("SELECT uid, username, isAdmin FROM users WHERE uid = ?").get(fallbackUid) as any;
    if (userRow) {
      const newToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
      db.prepare("INSERT INTO sessions (token, uid, createdAt, expiresAt, lastActive, ipAddress, userAgent) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(newToken, userRow.uid, now.toISOString(), expiresAt.toISOString(), now.toISOString(), req.ip || "", req.headers["user-agent"] || "");
      setSessionCookie(res, newToken);
      res.setHeader("X-Session-Token", newToken);

      req.session = {
        uid: userRow.uid,
        username: userRow.username,
        isAdmin: Boolean(userRow.isAdmin),
        token: newToken,
      };
      return next();
    }
  }

  return res.status(401).json({ error: "Unauthorized: Missing session token" });
}

// Optional Auth (for routes that behave differently when authenticated)
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const cookieName = isProd ? "__Host-cm_session" : "cm_session";
  const token = req.cookies[cookieName] || req.cookies["cm_session"] || (req.headers["authorization"]?.startsWith("Bearer ") ? req.headers["authorization"].substring(7) : null) || (typeof req.query.token === "string" ? req.query.token : null);
  if (token) {
    const sessionRow = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token) as any;
    if (sessionRow) {
      const userRow = db.prepare("SELECT uid, username, isAdmin FROM users WHERE uid = ?").get(sessionRow.uid) as any;
      if (userRow) {
        req.session = {
          uid: userRow.uid,
          username: userRow.username,
          isAdmin: Boolean(userRow.isAdmin),
          token,
        };
      }
    }
  }
  next();
}

// Global Admin Middleware
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.isAdmin) {
    return res.status(403).json({ error: "Forbidden: Administrator privileges required" });
  }
  next();
}

// Periodic Session Cleanup
setInterval(() => {
  try {
    const now = new Date().toISOString();
    db.prepare("DELETE FROM sessions WHERE expiresAt < ?").run(now);
  } catch (e) {
    console.error("Session cleanup error:", e);
  }
}, 30 * 60 * 1000);

// --- USER PROFILE ALLOWLIST & PRIVACY FORMATTING ---
export function formatPublicProfile(targetUser: any, callerUid?: string): any {
  if (!targetUser) return null;

  let extraData: any = {};
  try {
    extraData = targetUser.data ? JSON.parse(targetUser.data) : {};
  } catch (_) {}

  const lastSeenPrivacy = targetUser.lastSeenPrivacy || extraData.lastSeenPrivacy || "everyone";
  let isOnline = Boolean(targetUser.isOnline);
  let lastSeen = targetUser.lastSeen || extraData.lastSeen || null;

  if (callerUid !== targetUser.uid) {
    if (lastSeenPrivacy === "nobody") {
      isOnline = false;
      lastSeen = null;
    } else if (lastSeenPrivacy === "contacts") {
      // Check if caller shares a chat with target user
      let sharesChat = false;
      if (callerUid) {
        const shared = db.prepare(`
          SELECT 1 FROM chat_members cm1
          JOIN chat_members cm2 ON cm1.chatId = cm2.chatId
          WHERE cm1.uid = ? AND cm2.uid = ? AND cm1.isBanned = 0 AND cm2.isBanned = 0
          LIMIT 1
        `).get(callerUid, targetUser.uid);
        if (shared) sharesChat = true;
      }
      if (!sharesChat) {
        isOnline = false;
        lastSeen = null;
      }
    }
  }

  // Explicit Allowlist of fields
  return {
    uid: targetUser.uid,
    username: targetUser.username,
    displayName: targetUser.displayName || targetUser.username,
    photoURL: targetUser.photoURL || "",
    bio: targetUser.bio || "",
    isAdmin: Boolean(targetUser.isAdmin),
    isOnline,
    lastSeen,
    lastSeenPrivacy,
    defaultReaction: targetUser.defaultReaction || extraData.defaultReaction || "👍",
    chatWallpaper: targetUser.chatWallpaper || extraData.chatWallpaper || "",
    pinnedChatIds: extraData.pinnedChatIds || [],
    createdAt: targetUser.createdAt || extraData.createdAt,
    version: targetUser.version || 1,
  };
}

// --- REALTIME EVENT BUS (Server-Sent Events) ---

type SseClient = { uid: string; res: Response };
const sseClients = new Set<SseClient>();

function sseSend(client: SseClient, event: string, payload: any) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  } catch (_) {
    sseClients.delete(client);
  }
}

function emitToUsers(uids: string[], event: string, payload: any) {
  const targets = new Set(uids);
  for (const client of sseClients) {
    if (targets.has(client.uid)) sseSend(client, event, payload);
  }
}

function emitToUser(uid: string, event: string, payload: any) {
  emitToUsers([uid], event, payload);
}

// Fans out to the chat's current non-banned members. `alsoNotify` covers users who
// need the event even though they are no longer members (kicked, banned, or left).
function emitToChat(chatId: string, event: string, payload: any, alsoNotify: string[] = []) {
  const rows = db.prepare("SELECT uid FROM chat_members WHERE chatId = ? AND isBanned = 0").all(chatId) as any[];
  emitToUsers([...rows.map((r) => r.uid), ...alsoNotify], event, payload);
}

// 0. Realtime event stream
app.get("/api/events", requireAuth, (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 3000\n\n");

  const client: SseClient = { uid: req.session!.uid, res };
  sseClients.add(client);

  // Comment frames keep proxies from closing an idle stream.
  const heartbeat = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch (_) {
      clearInterval(heartbeat);
      sseClients.delete(client);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
  });
});

// --- API ROUTES ---

// 1. Health Endpoint (After Rate Limiter)
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 2. Auth: Login
app.post("/api/auth/login", authLimiter, (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const cleanUsername = sanitizeText(username).toLowerCase().trim();
    const user = db.prepare("SELECT * FROM users WHERE username = ?").get(cleanUsername) as any;

    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const isMatch = bcrypt.compareSync(password, user._password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const token = createSessionToken(user.uid, req);
    setSessionCookie(res, token);

    // Update presence
    const now = new Date().toISOString();
    db.prepare("UPDATE users SET isOnline = 1, lastSeen = ? WHERE uid = ?").run(now, user.uid);

    const profile = formatPublicProfile(user, user.uid);
    res.json({
      user: { uid: user.uid, username: user.username },
      profile,
      token,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Authentication failed" });
  }
});

// 3. Auth: Signup
app.post("/api/auth/signup", authLimiter, (req, res) => {
  try {
    const { username, displayName, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const cleanUsername = sanitizeText(username).toLowerCase().trim();
    if (!isValidHandleFormat(cleanUsername)) {
      return res.status(400).json({ error: "Username must be 3-32 alphanumeric characters or underscores" });
    }

    if (isHandleReserved(cleanUsername)) {
      return res.status(400).json({ error: "This username is reserved and cannot be claimed" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const uid = "user_" + crypto.randomBytes(12).toString("hex");
    const cleanDisplayName = sanitizeText(displayName || cleanUsername).substring(0, 64);
    const passwordHash = bcrypt.hashSync(password, 10);
    const now = new Date().toISOString();

    const profileObj = {
      uid,
      username: cleanUsername,
      displayName: cleanDisplayName,
      photoURL: "",
      bio: "",
      isAdmin: 0,
      isOnline: 1,
      lastSeen: now,
      lastSeenPrivacy: "everyone",
      createdAt: now,
      version: 1,
    };

    withTransaction(() => {
      const handleClaimed = claimHandle(cleanUsername, "user", uid);
      if (!handleClaimed) {
        throw new Error("Username is already taken");
      }

      db.prepare(`
        INSERT INTO users (uid, username, displayName, photoURL, bio, _password, isAdmin, isOnline, lastSeen, lastSeenPrivacy, createdAt, version, data)
        VALUES (?, ?, ?, '', '', ?, 0, 1, ?, 'everyone', ?, 1, ?)
      `).run(
        uid,
        cleanUsername,
        cleanDisplayName,
        passwordHash,
        now,
        now,
        JSON.stringify(profileObj)
      );
    });

    const token = createSessionToken(uid, req);
    setSessionCookie(res, token);

    logAudit(uid, "USER_SIGNUP", "user", uid, req.ip, `Signed up as @${cleanUsername}`);

    res.json({
      user: { uid, username: cleanUsername },
      profile: profileObj,
      token,
    });
  } catch (err: any) {
    if (err.message === "Username is already taken") {
      return res.status(400).json({ error: "Username is already taken" });
    }
    res.status(500).json({ error: "Signup failed" });
  }
});

// 4. Auth: Logout
app.post("/api/auth/logout", requireAuth, (req, res) => {
  try {
    if (req.session?.token) {
      db.prepare("DELETE FROM sessions WHERE token = ?").run(req.session.token);
    }
    if (req.session?.uid) {
      db.prepare("UPDATE users SET isOnline = 0, lastSeen = ? WHERE uid = ?").run(
        new Date().toISOString(),
        req.session.uid
      );
    }
    clearSessionCookie(res);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Logout failed" });
  }
});

// 5. Auth: Me
app.get("/api/auth/me", requireAuth, (req, res) => {
  try {
    const userRow = db.prepare("SELECT * FROM users WHERE uid = ?").get(req.session!.uid) as any;
    if (!userRow) return res.status(404).json({ error: "User not found" });
    res.json({
      user: { uid: userRow.uid, username: userRow.username },
      profile: formatPublicProfile(userRow, req.session!.uid),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// 6. Users: List (With pagination & search)
app.get("/api/users", requireAuth, (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const search = sanitizeText(req.query.q as string)?.toLowerCase().trim();

    let rows: any[];
    if (search) {
      rows = db.prepare(`
        SELECT * FROM users
        WHERE username LIKE ? OR displayName LIKE ?
        ORDER BY isOnline DESC, username ASC
        LIMIT ? OFFSET ?
      `).all(`%${search}%`, `%${search}%`, limit, offset) as any[];
    } else {
      rows = db.prepare(`
        SELECT * FROM users
        ORDER BY isOnline DESC, username ASC
        LIMIT ? OFFSET ?
      `).all(limit, offset) as any[];
    }

    const profiles = rows.map((r) => formatPublicProfile(r, req.session!.uid));
    res.json(profiles);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// 7. Users: Get by UID
app.get("/api/users/:uid", requireAuth, (req, res) => {
  try {
    const { uid } = req.params;
    const row = db.prepare("SELECT * FROM users WHERE uid = ?").get(uid) as any;
    if (!row) return res.status(404).json({ error: "User not found" });
    res.json(formatPublicProfile(row, req.session!.uid));
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// 8. Users: Update Profile
app.put("/api/users/:uid", requireAuth, (req, res) => {
  try {
    const { uid } = req.params;
    const caller = req.session!;

    // Non-admins can only update their own profile
    if (caller.uid !== uid && !caller.isAdmin) {
      return res.status(403).json({ error: "Forbidden: Cannot update another user's profile" });
    }

    const body = req.body || {};
    const existing = db.prepare("SELECT * FROM users WHERE uid = ?").get(uid) as any;
    if (!existing) return res.status(404).json({ error: "User not found" });

    let updatedProfile: any;

    withTransaction(() => {
      let username = existing.username;
      if (body.username && body.username.toLowerCase() !== existing.username.toLowerCase()) {
        const newUsername = sanitizeText(body.username).toLowerCase().trim();
        if (!isValidHandleFormat(newUsername)) {
          throw new Error("Invalid username format");
        }
        if (isHandleReserved(newUsername) && (!caller.isAdmin || newUsername !== "admin")) {
          throw new Error("Reserved username");
        }
        const claimed = claimHandle(newUsername, "user", uid);
        if (!claimed) {
          throw new Error("Username already taken");
        }
        releaseHandle(existing.username);
        username = newUsername;
      }

      let passwordHash = existing._password;
      if (body.password) {
        if (body.password.length < 6) {
          throw new Error("Password must be at least 6 characters long");
        }
        passwordHash = bcrypt.hashSync(body.password, 10);
        // Invalidate all other sessions on password change
        db.prepare("DELETE FROM sessions WHERE uid = ? AND token != ?").run(uid, caller.token);
        logAudit(caller.uid, "PASSWORD_CHANGE", "user", uid, req.ip, "Password updated");
      }

      // Check admin escalation prevention: Only existing global admins can set isAdmin
      let isAdmin = existing.isAdmin;
      if (body.isAdmin !== undefined && caller.isAdmin) {
        isAdmin = body.isAdmin ? 1 : 0;
        if (isAdmin !== existing.isAdmin) {
          logAudit(caller.uid, "ADMIN_FLAG_CHANGE", "user", uid, req.ip, `Changed isAdmin to ${isAdmin}`);
        }
      }

      const displayName = body.displayName !== undefined ? sanitizeText(body.displayName).substring(0, 64) : existing.displayName;
      const bio = body.bio !== undefined ? sanitizeText(body.bio).substring(0, 256) : existing.bio;
      const photoURL = body.photoURL !== undefined ? String(body.photoURL).substring(0, 512) : existing.photoURL;
      const lastSeenPrivacy = ["everyone", "contacts", "nobody"].includes(body.lastSeenPrivacy) ? body.lastSeenPrivacy : existing.lastSeenPrivacy;
      const defaultReaction = body.defaultReaction ? sanitizeText(body.defaultReaction).substring(0, 16) : existing.defaultReaction;
      const chatWallpaper = body.chatWallpaper !== undefined ? String(body.chatWallpaper).substring(0, 512) : existing.chatWallpaper;
      const pinnedChatIds = Array.isArray(body.pinnedChatIds) ? JSON.stringify(body.pinnedChatIds.slice(0, 50)) : existing.pinnedChatIds;
      const newVersion = (existing.version || 1) + 1;

      const profileObj = {
        uid,
        username,
        displayName,
        photoURL,
        bio,
        isAdmin,
        isOnline: Boolean(existing.isOnline),
        lastSeen: existing.lastSeen,
        lastSeenPrivacy,
        defaultReaction,
        chatWallpaper,
        pinnedChatIds: JSON.parse(pinnedChatIds || "[]"),
        version: newVersion,
        createdAt: existing.createdAt,
      };

      db.prepare(`
        UPDATE users
        SET username = ?, displayName = ?, bio = ?, photoURL = ?, _password = ?, isAdmin = ?,
            lastSeenPrivacy = ?, defaultReaction = ?, chatWallpaper = ?, pinnedChatIds = ?, version = ?, data = ?
        WHERE uid = ?
      `).run(
        username,
        displayName,
        bio,
        photoURL,
        passwordHash,
        isAdmin,
        lastSeenPrivacy,
        defaultReaction,
        chatWallpaper,
        pinnedChatIds,
        newVersion,
        JSON.stringify(profileObj),
        uid
      );

      updatedProfile = profileObj;
    });

    const payload = formatPublicProfile(updatedProfile, caller.uid);
    emitProfileToPeers(uid, payload);
    res.json(payload);
  } catch (err: any) {
    if (err.message === "Username already taken") return res.status(400).json({ error: "Username already taken" });
    if (err.message === "Reserved username") return res.status(400).json({ error: "Username is reserved" });
    if (err.message === "Invalid username format") return res.status(400).json({ error: "Invalid username format" });
    res.status(500).json({ error: err.message || "Failed to update profile" });
  }
});

// Everyone who shares at least one chat with this user, excluding the user.
function chatPeersOf(uid: string): string[] {
  const rows = db.prepare(`
    SELECT DISTINCT other.uid AS uid
    FROM chat_members mine
    JOIN chat_members other ON other.chatId = mine.chatId
    WHERE mine.uid = ? AND other.uid != ? AND other.isBanned = 0
  `).all(uid, uid) as any[];
  return rows.map((r) => r.uid);
}

// Notifies everyone sharing a chat with this user that their presence flipped.
// Only transitions are emitted — clients fall back to the lastSeen staleness check
// in isUserOnline() for the rest, so a 5s heartbeat costs no fan-out.
function emitPresence(uid: string, isOnline: boolean, lastSeen: string) {
  emitToUsers(chatPeersOf(uid), "presence.changed", { uid, isOnline, lastSeen });
}

// Pushes a changed profile to the user's own tabs and to anyone who renders them.
function emitProfileToPeers(uid: string, profile: any) {
  emitToUsers([uid, ...chatPeersOf(uid)], "profile.updated", profile);
}

// 9. Presence Heartbeat
app.post("/api/presence", requireAuth, (req, res) => {
  try {
    const uid = req.session!.uid;
    const isOnline = req.body?.isOnline === false ? 0 : 1;
    const now = new Date().toISOString();

    const before = db.prepare("SELECT isOnline FROM users WHERE uid = ?").get(uid) as any;
    db.prepare("UPDATE users SET isOnline = ?, lastSeen = ? WHERE uid = ?").run(isOnline, now, uid);

    if (!before || before.isOnline !== isOnline) {
      emitPresence(uid, Boolean(isOnline), now);
    }

    res.json({ success: true, isOnline: Boolean(isOnline), lastSeen: now });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update presence" });
  }
});

// 10. Account Deletion (Self)
app.delete("/api/users/me", requireAuth, (req, res) => {
  try {
    const caller = req.session!;
    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ error: "Password confirmation required to delete account" });
    }

    const user = db.prepare("SELECT * FROM users WHERE uid = ?").get(caller.uid) as any;
    if (!user || !bcrypt.compareSync(password, user._password)) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    withTransaction(() => {
      // Release handle
      releaseHandle(user.username);
      // Remove from chats
      db.prepare("DELETE FROM chat_members WHERE uid = ?").run(caller.uid);
      // Delete sessions
      db.prepare("DELETE FROM sessions WHERE uid = ?").run(caller.uid);
      // Delete user row
      db.prepare("DELETE FROM users WHERE uid = ?").run(caller.uid);
    });

    clearSessionCookie(res);
    logAudit(caller.uid, "ACCOUNT_DELETED", "user", caller.uid, req.ip, "User deleted their account");
    res.json({ success: true, message: "Account deleted" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// 11. User Data Export (Self)
app.get("/api/users/me/export", requireAuth, (req, res) => {
  try {
    const caller = req.session!;
    const user = db.prepare("SELECT uid, username, displayName, bio, photoURL, createdAt FROM users WHERE uid = ?").get(caller.uid);
    const chats = db.prepare(`
      SELECT c.id, c.type, c.name, c.handle, c.createdAt FROM chats c
      JOIN chat_members cm ON c.id = cm.chatId
      WHERE cm.uid = ?
    `).all(caller.uid);
    const messages = db.prepare("SELECT id, chatId, text, type, mediaUrl, fileName, createdAt FROM messages WHERE senderId = ?").all(caller.uid);

    res.json({
      exportDate: new Date().toISOString(),
      user,
      chats,
      messages,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to export data" });
  }
});

// 12. User Blocking
app.post("/api/blocks/:targetUid", requireAuth, (req, res) => {
  try {
    const blockerUid = req.session!.uid;
    const targetUid = req.params.targetUid;
    if (blockerUid === targetUid) {
      return res.status(400).json({ error: "Cannot block yourself" });
    }
    db.prepare("INSERT OR REPLACE INTO blocks (blockerUid, blockedUid, createdAt) VALUES (?, ?, ?)").run(
      blockerUid, targetUid, new Date().toISOString()
    );
    res.json({ success: true, blocked: targetUid });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to block user" });
  }
});

app.delete("/api/blocks/:targetUid", requireAuth, (req, res) => {
  try {
    const blockerUid = req.session!.uid;
    const targetUid = req.params.targetUid;
    db.prepare("DELETE FROM blocks WHERE blockerUid = ? AND blockedUid = ?").run(blockerUid, targetUid);
    res.json({ success: true, unblocked: targetUid });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to unblock user" });
  }
});

app.get("/api/blocks", requireAuth, (req, res) => {
  try {
    const rows = db.prepare("SELECT blockedUid FROM blocks WHERE blockerUid = ?").all(req.session!.uid) as any[];
    res.json(rows.map((r) => r.blockedUid));
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch blocks" });
  }
});

// --- CHATS & MEMBERSHIP HELPERS ---
function formatChat(chatRow: any, callerUid: string): any {
  if (!chatRow) return null;

  const members = db.prepare("SELECT * FROM chat_members WHERE chatId = ?").all(chatRow.id) as any[];
  const memberUids = members.filter((m) => !m.isBanned).map((m) => m.uid);
  const admins = members.filter((m) => m.role === "admin" || m.role === "owner").map((m) => m.uid);
  const bannedUids = members.filter((m) => m.isBanned).map((m) => m.uid);
  const mutedUids = members.filter((m) => m.isMuted).map((m) => m.uid);

  const isMember = memberUids.includes(callerUid);

  if (!isMember && chatRow.visibility === "public") {
    // Redacted chat info for public discovery
    return {
      id: chatRow.id,
      type: chatRow.type,
      visibility: "public",
      handle: chatRow.handle || undefined,
      name: chatRow.name || undefined,
      photoURL: chatRow.photoURL || undefined,
      description: chatRow.description || undefined,
      memberCount: memberUids.length,
      createdAt: chatRow.createdAt,
    };
  }

  let lastMessage: any = undefined;
  if (chatRow.lastMessageText || chatRow.lastMessageSenderId) {
    lastMessage = {
      text: chatRow.lastMessageText || "",
      senderId: chatRow.lastMessageSenderId || "",
      type: chatRow.lastMessageType || "text",
      createdAt: chatRow.lastMessageCreatedAt || chatRow.createdAt,
    };
  }

  const unreadCount = db.prepare(`
    SELECT COUNT(*) AS n FROM messages
    WHERE chatId = ? AND deleted = 0 AND senderId != ? AND senderId != 'system'
      AND createdAt >= COALESCE((SELECT joinedAt FROM chat_members WHERE chatId = ? AND uid = ?), '')
      AND readBy NOT LIKE ?
  `).get(chatRow.id, callerUid, chatRow.id, callerUid, `%"${callerUid}"%`) as any;

  return {
    id: chatRow.id,
    type: chatRow.type,
    visibility: chatRow.visibility || "private",
    handle: chatRow.handle || undefined,
    ownerUid: chatRow.ownerUid,
    name: chatRow.name || undefined,
    photoURL: chatRow.photoURL || undefined,
    description: chatRow.description || undefined,
    bio: chatRow.bio || undefined,
    memberUids,
    admins,
    bannedUids,
    mutedUids,
    lastMessage,
    unreadCount: unreadCount?.n || 0,
    version: chatRow.version || 1,
    createdAt: chatRow.createdAt,
  };
}

// 13b. Chats: Search public chats by handle or name (for global ID search)
app.get("/api/chats/search", requireAuth, (req, res) => {
  try {
    const callerUid = req.session!.uid;
    const q = sanitizeText((req.query.q as string) || "").toLowerCase().trim().replace(/^@/, "");
    if (q.length < 2) return res.json([]);

    const rows = db.prepare(`
      SELECT * FROM chats
      WHERE visibility = 'public' AND (handle LIKE ? OR LOWER(name) LIKE ? OR id = ?)
      ORDER BY handle IS NULL, handle ASC
      LIMIT 20
    `).all(`%${q}%`, `%${q}%`, q) as any[];

    res.json(rows.map((r) => formatChat(r, callerUid)));
  } catch (err: any) {
    res.status(500).json({ error: "Search failed" });
  }
});

// 13. Chats: List (Only chats where caller is an active member)
app.get("/api/chats", requireAuth, (req, res) => {
  try {
    const callerUid = req.session!.uid;
    const rows = db.prepare(`
      SELECT c.* FROM chats c
      JOIN chat_members cm ON c.id = cm.chatId
      WHERE cm.uid = ? AND cm.isBanned = 0
      ORDER BY COALESCE(c.lastMessageCreatedAt, c.createdAt) DESC
    `).all(callerUid) as any[];

    const chats = rows.map((r) => formatChat(r, callerUid));
    res.json(chats);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

// 14. Chats: Lookup by Handle (Only matches public chats or user's own chats)
app.get("/api/chats/lookup/:handle", requireAuth, (req, res) => {
  try {
    const callerUid = req.session!.uid;
    const cleanHandle = sanitizeText(req.params.handle).toLowerCase().trim();
    const chatRow = db.prepare("SELECT * FROM chats WHERE handle = ?").get(cleanHandle) as any;

    if (!chatRow) {
      return res.status(404).json({ error: "Chat not found" });
    }

    const member = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ? AND isBanned = 0").get(chatRow.id, callerUid);
    if (!member && chatRow.visibility !== "public") {
      return res.status(404).json({ error: "Chat not found" });
    }

    res.json(formatChat(chatRow, callerUid));
  } catch (err: any) {
    res.status(500).json({ error: "Lookup failed" });
  }
});

// 15. Chats: Get by ID
app.get("/api/chats/:id", requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const callerUid = req.session!.uid;
    const chatRow = db.prepare("SELECT * FROM chats WHERE id = ?").get(id) as any;

    if (!chatRow) return res.status(404).json({ error: "Chat not found" });

    const member = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ? AND isBanned = 0").get(id, callerUid);
    if (!member) {
      if (chatRow.visibility === "public") {
        return res.json(formatChat(chatRow, callerUid));
      }
      // Return 404 (not 403) for non-members of private chats to avoid leaking existence
      return res.status(404).json({ error: "Chat not found" });
    }

    res.json(formatChat(chatRow, callerUid));
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

// 16. Chats: Create
app.post("/api/chats", requireAuth, (req, res) => {
  try {
    const callerUid = req.session!.uid;
    const body = req.body || {};
    const type = ["dm", "group", "channel"].includes(body.type) ? body.type : "group";
    const id = body.id && /^[a-zA-Z0-9_-]{3,64}$/.test(body.id) ? body.id : "chat_" + crypto.randomBytes(12).toString("hex");

    const now = new Date().toISOString();
    let visibility = body.visibility === "public" ? "public" : "private";
    if (type === "dm") visibility = "private";

    let memberUids: string[] = Array.isArray(body.memberUids) ? body.memberUids : [callerUid];
    if (!memberUids.includes(callerUid)) memberUids.push(callerUid);

    // Validate that every UID in memberUids exists in the users table
    for (const uid of memberUids) {
      const userExists = db.prepare("SELECT 1 FROM users WHERE uid = ?").get(uid);
      if (!userExists) {
        return res.status(400).json({ error: `User with id ${uid} does not exist` });
      }
    }

    // DM validation: Exactly 2 distinct members, check blocks
    if (type === "dm") {
      const distinctMembers = Array.from(new Set(memberUids));
      if (distinctMembers.length !== 2) {
        return res.status(400).json({ error: "Direct messages must contain exactly 2 distinct members" });
      }
      memberUids = distinctMembers;
      const otherUid = memberUids.find((u) => u !== callerUid)!;

      // Check blocks
      const isBlocked = db.prepare("SELECT 1 FROM blocks WHERE (blockerUid = ? AND blockedUid = ?) OR (blockerUid = ? AND blockedUid = ?)").get(
        callerUid, otherUid, otherUid, callerUid
      );
      if (isBlocked) {
        return res.status(403).json({ error: "Cannot create chat with this user" });
      }
    }

    let cleanHandle: string | null = null;
    if (body.handle) {
      cleanHandle = sanitizeText(body.handle).toLowerCase().trim();
      if (!isValidHandleFormat(cleanHandle)) {
        return res.status(400).json({ error: "Invalid chat handle format" });
      }
      if (isHandleReserved(cleanHandle)) {
        return res.status(400).json({ error: "Chat handle is reserved" });
      }
    }

    const name = sanitizeText(body.name || "").substring(0, 64);
    const photoURL = body.photoURL ? String(body.photoURL).substring(0, 512) : "";
    const description = sanitizeText(body.description || "").substring(0, 256);

    withTransaction(() => {
      if (cleanHandle) {
        const claimed = claimHandle(cleanHandle, "chat", id);
        if (!claimed) {
          throw new Error("Chat handle already taken");
        }
      }

      db.prepare(`
        INSERT INTO chats (id, type, visibility, handle, ownerUid, name, photoURL, description, version, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `).run(id, type, visibility, cleanHandle, callerUid, name, photoURL, description, now);

      for (const uid of memberUids) {
        const role = uid === callerUid ? "owner" : "member";
        db.prepare(`
          INSERT INTO chat_members (chatId, uid, role, isMuted, isBanned, joinedAt)
          VALUES (?, ?, ?, 0, 0, ?)
        `).run(id, uid, role, now);
      }
    });

    const chatRow = db.prepare("SELECT * FROM chats WHERE id = ?").get(id);
    for (const uid of memberUids) {
      emitToUser(uid, "chat.created", formatChat(chatRow, uid));
    }
    res.json(formatChat(chatRow, callerUid));
  } catch (err: any) {
    if (err.message === "Chat handle already taken") return res.status(400).json({ error: "Chat handle already taken" });
    res.status(500).json({ error: err.message || "Failed to create chat" });
  }
});

// 17. Chats: Update (Strict permission hierarchy & leavingSelfOnly validation)
app.put("/api/chats/:id", requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const callerUid = req.session!.uid;
    const body = req.body || {};

    const chatRow = db.prepare("SELECT * FROM chats WHERE id = ?").get(id) as any;
    if (!chatRow) return res.status(404).json({ error: "Chat not found" });

    const memberRow = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ?").get(id, callerUid) as any;
    if (!memberRow || memberRow.isBanned) {
      return res.status(403).json({ error: "Forbidden: Not an active member of this chat" });
    }

    const isOwner = memberRow.role === "owner" || chatRow.ownerUid === callerUid;
    const isAdmin = isOwner || memberRow.role === "admin";

    // Non-admin check: The ONLY allowed update is leaving the chat (leavingSelfOnly)
    if (!isAdmin) {
      if (body.memberUids) {
        const currentMembers = (db.prepare("SELECT uid FROM chat_members WHERE chatId = ? AND isBanned = 0").all(id) as any[]).map((r) => r.uid);
        const newMembers: string[] = body.memberUids;
        const removed = currentMembers.filter((u) => !newMembers.includes(u));
        const added = newMembers.filter((u) => !currentMembers.includes(u));

        if (removed.length === 1 && removed[0] === callerUid && added.length === 0 && newMembers.length === currentMembers.length - 1) {
          // Allowed: caller is leaving
          db.prepare("DELETE FROM chat_members WHERE chatId = ? AND uid = ?").run(id, callerUid);
          const afterLeave = db.prepare("SELECT * FROM chats WHERE id = ?").get(id);
          // formatChat is caller-relative: it redacts membership for non-members and
          // scopes unreadCount, so each recipient must get their own payload.
          for (const uid of currentMembers) {
            if (uid === callerUid) continue;
            emitToUser(uid, "chat.updated", formatChat(afterLeave, uid));
          }
          emitToUser(callerUid, "chat.removed", { id });
          return res.json({ success: true, left: true });
        }
      }
      return res.status(403).json({ error: "Forbidden: Only admins can edit chat settings or members" });
    }

    const membersBefore = (db.prepare("SELECT uid FROM chat_members WHERE chatId = ?").all(id) as any[]).map((r) => r.uid);

    withTransaction(() => {
      let handle = chatRow.handle;
      if (body.handle !== undefined && body.handle !== chatRow.handle) {
        if (!isOwner) throw new Error("Only the chat owner can change the handle");
        if (body.handle) {
          const newHandle = sanitizeText(body.handle).toLowerCase().trim();
          if (!isValidHandleFormat(newHandle)) throw new Error("Invalid handle format");
          if (isHandleReserved(newHandle)) throw new Error("Reserved handle");
          const claimed = claimHandle(newHandle, "chat", id);
          if (!claimed) throw new Error("Handle already taken");
          if (chatRow.handle) releaseHandle(chatRow.handle);
          handle = newHandle;
        } else if (chatRow.handle) {
          releaseHandle(chatRow.handle);
          handle = null;
        }
      }

      let ownerUid = chatRow.ownerUid;
      if (body.ownerUid && body.ownerUid !== chatRow.ownerUid) {
        if (!isOwner) throw new Error("Only the owner can transfer chat ownership");
        // Verify new owner exists and is a member
        const targetMember = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ?").get(id, body.ownerUid) as any;
        if (!targetMember) throw new Error("New owner must be a member of the chat");
        ownerUid = body.ownerUid;
        db.prepare("UPDATE chat_members SET role = 'owner' WHERE chatId = ? AND uid = ?").run(id, ownerUid);
        db.prepare("UPDATE chat_members SET role = 'admin' WHERE chatId = ? AND uid = ?").run(id, callerUid);
      }

      const name = body.name !== undefined ? sanitizeText(body.name).substring(0, 64) : chatRow.name;
      const photoURL = body.photoURL !== undefined ? String(body.photoURL).substring(0, 512) : chatRow.photoURL;
      const description = body.description !== undefined ? sanitizeText(body.description).substring(0, 256) : chatRow.description;
      const visibility = body.visibility === "public" ? "public" : (body.visibility === "private" ? "private" : chatRow.visibility);
      const newVersion = (chatRow.version || 1) + 1;

      // Update members if submitted by admin
      if (Array.isArray(body.memberUids)) {
        const newUids: string[] = body.memberUids;
        // Verify all uids exist in users table
        for (const u of newUids) {
          const exists = db.prepare("SELECT 1 FROM users WHERE uid = ?").get(u);
          if (!exists) throw new Error(`User ${u} does not exist`);
        }
        // Admins cannot remove the owner
        if (!newUids.includes(ownerUid)) {
          throw new Error("Cannot remove the chat owner from member list");
        }

        const existingMembers = db.prepare("SELECT * FROM chat_members WHERE chatId = ?").all(id) as any[];
        const existingUids = existingMembers.map((m) => m.uid);

        // Remove members no longer in list (admins cannot remove other admins unless owner)
        for (const em of existingMembers) {
          if (!newUids.includes(em.uid)) {
            if (em.role === "admin" && !isOwner) {
              throw new Error("Admins cannot remove other admins");
            }
            db.prepare("DELETE FROM chat_members WHERE chatId = ? AND uid = ?").run(id, em.uid);
          }
        }

        // Add new members
        const now = new Date().toISOString();
        for (const u of newUids) {
          if (!existingUids.includes(u)) {
            db.prepare("INSERT INTO chat_members (chatId, uid, role, isMuted, isBanned, joinedAt) VALUES (?, ?, 'member', 0, 0, ?)").run(
              id, u, now
            );
          }
        }
      }

      // Update Admin roles
      if (Array.isArray(body.admins)) {
        if (!isOwner) throw new Error("Only the chat owner can grant or revoke admin privileges");
        // Ensure admins are a subset of memberUids
        const members = (db.prepare("SELECT uid FROM chat_members WHERE chatId = ?").all(id) as any[]).map((r) => r.uid);
        for (const a of body.admins) {
          if (!members.includes(a)) throw new Error(`Admin ${a} is not a member of this chat`);
        }
        db.prepare("UPDATE chat_members SET role = 'member' WHERE chatId = ? AND role = 'admin'").run(id);
        for (const a of body.admins) {
          if (a !== ownerUid) {
            db.prepare("UPDATE chat_members SET role = 'admin' WHERE chatId = ? AND uid = ?").run(id, a);
          }
        }
      }

      // Update Banned / Muted
      if (Array.isArray(body.bannedUids)) {
        if (body.bannedUids.includes(ownerUid)) throw new Error("Cannot ban the chat owner");
        db.prepare("UPDATE chat_members SET isBanned = 0 WHERE chatId = ?").run(id);
        for (const b of body.bannedUids) {
          db.prepare("UPDATE chat_members SET isBanned = 1 WHERE chatId = ? AND uid = ?").run(id, b);
        }
      }

      if (Array.isArray(body.mutedUids)) {
        db.prepare("UPDATE chat_members SET isMuted = 0 WHERE chatId = ?").run(id);
        for (const m of body.mutedUids) {
          db.prepare("UPDATE chat_members SET isMuted = 1 WHERE chatId = ? AND uid = ?").run(id, m);
        }
      }

      db.prepare(`
        UPDATE chats
        SET name = ?, photoURL = ?, description = ?, visibility = ?, handle = ?, ownerUid = ?, version = ?
        WHERE id = ?
      `).run(name, photoURL, description, visibility, handle, ownerUid, newVersion, id);
    });

    const updated = db.prepare("SELECT * FROM chats WHERE id = ?").get(id);
    const membersAfter = (db.prepare("SELECT uid FROM chat_members WHERE chatId = ? AND isBanned = 0").all(id) as any[]).map((r) => r.uid);
    const dropped = membersBefore.filter((u) => !membersAfter.includes(u));

    for (const uid of membersAfter) {
      emitToUser(uid, "chat.updated", formatChat(updated, uid));
    }
    for (const uid of dropped) {
      emitToUser(uid, "chat.removed", { id });
    }

    res.json(formatChat(updated, callerUid));
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to update chat" });
  }
});

// 18. Chats: Join (Private chats require inviteToken; public chats allow direct join)
app.post("/api/chats/:id/join", requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const callerUid = req.session!.uid;
    const { inviteToken } = req.body || {};

    const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(id) as any;
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    const existingMember = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ?").get(id, callerUid) as any;
    if (existingMember) {
      if (existingMember.isBanned) return res.status(403).json({ error: "You are banned from this chat" });
      return res.json({ success: true, alreadyMember: true });
    }

    if (chat.visibility === "private") {
      if (!inviteToken) {
        return res.status(403).json({ error: "Forbidden: Invite token is required to join private groups" });
      }

      const invite = db.prepare("SELECT * FROM chat_invites WHERE token = ? AND chatId = ?").get(inviteToken, id) as any;
      if (!invite) {
        return res.status(403).json({ error: "Invalid or expired invite token" });
      }

      if (invite.expiresAt && new Date() > new Date(invite.expiresAt)) {
        return res.status(403).json({ error: "Invite token has expired" });
      }

      if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
        return res.status(403).json({ error: "Invite token has reached its usage limit" });
      }

      withTransaction(() => {
        db.prepare("UPDATE chat_invites SET uses = uses + 1 WHERE token = ?").run(inviteToken);
        db.prepare(`
          INSERT INTO chat_members (chatId, uid, role, isMuted, isBanned, joinedAt)
          VALUES (?, ?, 'member', 0, 0, ?)
        `).run(id, callerUid, new Date().toISOString());
      });
    } else {
      // Public chat: direct join
      db.prepare(`
        INSERT INTO chat_members (chatId, uid, role, isMuted, isBanned, joinedAt)
        VALUES (?, ?, 'member', 0, 0, ?)
      `).run(id, callerUid, new Date().toISOString());
    }

    const joined = db.prepare("SELECT * FROM chats WHERE id = ?").get(id);
    const others = (db.prepare("SELECT uid FROM chat_members WHERE chatId = ? AND isBanned = 0 AND uid != ?").all(id, callerUid) as any[]).map((r) => r.uid);
    for (const uid of others) {
      emitToUser(uid, "chat.updated", formatChat(joined, uid));
    }
    emitToUser(callerUid, "chat.created", formatChat(joined, callerUid));

    res.json({ success: true, joined: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to join chat" });
  }
});

// 19. Chats: Create Invite Token
app.post("/api/chats/:id/invites", requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const callerUid = req.session!.uid;
    const member = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ?").get(id, callerUid) as any;

    if (!member || (member.role !== "admin" && member.role !== "owner")) {
      return res.status(403).json({ error: "Forbidden: Only chat admins can create invite tokens" });
    }

    const token = "inv_" + crypto.randomBytes(16).toString("hex");
    const { maxUses, expiresInHours } = req.body || {};
    const maxUsesInt = Math.max(parseInt(maxUses) || 1, 1);
    let expiresAt: string | null = null;

    if (expiresInHours) {
      const expMs = Date.now() + parseInt(expiresInHours) * 3600 * 1000;
      expiresAt = new Date(expMs).toISOString();
    }

    db.prepare(`
      INSERT INTO chat_invites (token, chatId, createdBy, expiresAt, maxUses, uses, createdAt)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(token, id, callerUid, expiresAt, maxUsesInt, new Date().toISOString());

    res.json({ token, chatId: id, expiresAt, maxUses: maxUsesInt });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to create invite" });
  }
});

// 20. Chats: Delete (Owner only)
app.delete("/api/chats/:id", requireAuth, (req, res) => {
  try {
    const { id } = req.params;
    const caller = req.session!;

    const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(id) as any;
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    if (chat.ownerUid !== caller.uid && !caller.isAdmin) {
      return res.status(403).json({ error: "Forbidden: Only the chat owner can delete the chat" });
    }

    const formerMembers = (db.prepare("SELECT uid FROM chat_members WHERE chatId = ?").all(id) as any[]).map((r) => r.uid);

    withTransaction(() => {
      if (chat.handle) releaseHandle(chat.handle);

      // Find all media files attached to this chat's messages to delete backing files
      const messages = db.prepare("SELECT mediaUrl FROM messages WHERE chatId = ?").all(id) as any[];
      for (const m of messages) {
        if (m.mediaUrl && m.mediaUrl.startsWith("/api/media/")) {
          const filename = m.mediaUrl.replace(/^\/api\/media\//, "");
          const filePath = path.join(uploadDir, filename);
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (_) {}
          db.prepare("DELETE FROM uploads WHERE filename = ?").run(filename);
        }
      }

      db.prepare("DELETE FROM messages WHERE chatId = ?").run(id);
      db.prepare("DELETE FROM chat_members WHERE chatId = ?").run(id);
      db.prepare("DELETE FROM chat_invites WHERE chatId = ?").run(id);
      db.prepare("DELETE FROM chats WHERE id = ?").run(id);
    });

    logAudit(caller.uid, "CHAT_DELETED", "chat", id, req.ip, `Deleted chat ${id}`);
    emitToUsers(formerMembers, "chat.removed", { id });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

// --- MESSAGES API ---

// Shapes a raw messages row for API responses. Soft-deleted messages keep their row
// so they can be restored, but their content is redacted here.
function formatMessage(r: any): any {
  if (!r) return null;

  let reactions: Record<string, string[]> = {};
  try {
    reactions = r.reactions ? JSON.parse(r.reactions) : {};
  } catch (_) {}

  let readBy: string[] = [];
  try {
    readBy = r.readBy ? JSON.parse(r.readBy) : [];
  } catch (_) {}

  return {
    id: r.id,
    chatId: r.chatId,
    senderId: r.senderId,
    text: r.deleted ? "" : r.text || "",
    type: r.type,
    mediaUrl: r.deleted ? undefined : r.mediaUrl || undefined,
    fileName: r.deleted ? undefined : r.fileName || undefined,
    replyTo: r.replyTo || undefined,
    deleted: Boolean(r.deleted),
    edited: Boolean(r.edited),
    reactions,
    readBy,
    createdAt: r.createdAt,
  };
}

// 21. Messages: List (With pagination & join-time history visibility filter)
app.get("/api/chats/:chatId/messages", requireAuth, (req, res) => {
  try {
    const { chatId } = req.params;
    const callerUid = req.session!.uid;

    const member = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ?").get(chatId, callerUid) as any;
    if (!member || member.isBanned) {
      return res.status(403).json({ error: "Forbidden: You are not a member of this chat" });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const before = req.query.before as string; // ISO timestamp cursor

    let rows: any[];
    // Default history visibility: new members only see messages created at/after their join time
    const joinedAt = member.joinedAt || "1970-01-01T00:00:00.000Z";

    if (before) {
      rows = db.prepare(`
        SELECT * FROM messages
        WHERE chatId = ? AND createdAt >= ? AND createdAt < ?
        ORDER BY createdAt DESC
        LIMIT ?
      `).all(chatId, joinedAt, before, limit) as any[];
    } else {
      rows = db.prepare(`
        SELECT * FROM messages
        WHERE chatId = ? AND createdAt >= ?
        ORDER BY createdAt DESC
        LIMIT ?
      `).all(chatId, joinedAt, limit) as any[];
    }

    const messages = rows.reverse().map((r) => formatMessage(r));

    res.json(messages);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// 22. Messages: Send (Rate-limited, derives lastMessage server-side, validates replyTo & blocks)
app.post("/api/chats/:chatId/messages", requireAuth, messageRateLimiter, (req, res) => {
  try {
    const { chatId } = req.params;
    const callerUid = req.session!.uid;

    const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(chatId) as any;
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    const member = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ?").get(chatId, callerUid) as any;
    if (!member || member.isBanned) {
      return res.status(403).json({ error: "Forbidden: Not a member of this chat" });
    }

    if (member.isMuted) {
      return res.status(403).json({ error: "You are muted in this chat" });
    }

    // Channels: only owner/admins can post
    if (chat.type === "channel" && member.role !== "owner" && member.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: Only admins can post in channels" });
    }

    // DMs: check if blocked
    if (chat.type === "dm") {
      const otherMember = db.prepare("SELECT uid FROM chat_members WHERE chatId = ? AND uid != ?").get(chatId, callerUid) as any;
      if (otherMember) {
        const isBlocked = db.prepare("SELECT 1 FROM blocks WHERE (blockerUid = ? AND blockedUid = ?) OR (blockerUid = ? AND blockedUid = ?)").get(
          callerUid, otherMember.uid, otherMember.uid, callerUid
        );
        if (isBlocked) {
          return res.status(403).json({ error: "Cannot send message to this user" });
        }
      }
    }

    const body = req.body || {};
    const type = ["text", "image", "video", "audio", "file", "voice", "sticker", "gif", "system"].includes(body.type) ? body.type : "text";
    const text = sanitizeText(body.text || "").substring(0, 10000);
    const mediaUrl = body.mediaUrl ? String(body.mediaUrl).substring(0, 512) : null;
    const fileName = body.fileName ? sanitizeFileName(body.fileName) : null;
    let replyTo = body.replyTo ? String(body.replyTo) : null;

    // Validate replyTo points to an existing message in the same chat
    if (replyTo) {
      const replyTarget = db.prepare("SELECT 1 FROM messages WHERE id = ? AND chatId = ?").get(replyTo, chatId);
      if (!replyTarget) {
        replyTo = null; // Reset invalid reply
      }
    }

    const id = body.id && /^[a-zA-Z0-9_-]{3,64}$/.test(body.id) ? body.id : "msg_" + crypto.randomBytes(12).toString("hex");
    const now = new Date().toISOString();

    const msgObj = {
      id,
      chatId,
      senderId: callerUid,
      text,
      type,
      mediaUrl: mediaUrl || undefined,
      fileName: fileName || undefined,
      replyTo: replyTo || undefined,
      deleted: false,
      edited: false,
      reactions: {},
      readBy: [callerUid],
      createdAt: now,
    };

    withTransaction(() => {
      db.prepare(`
        INSERT INTO messages (id, chatId, senderId, text, type, mediaUrl, fileName, replyTo, deleted, edited, reactions, readBy, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '{}', ?, ?)
      `).run(id, chatId, callerUid, text, type, mediaUrl, fileName, replyTo, JSON.stringify([callerUid]), now);

      // Associate media upload with this message
      if (mediaUrl && mediaUrl.startsWith("/api/media/")) {
        const fname = mediaUrl.replace(/^\/api\/media\//, "");
        db.prepare("UPDATE uploads SET refType = 'message', refId = ? WHERE filename = ?").run(id, fname);
      }

      // Server-derived lastMessage update
      const previewText = text ? text.substring(0, 150) : type.toUpperCase();
      db.prepare(`
        UPDATE chats
        SET lastMessageSenderId = ?, lastMessageText = ?, lastMessageType = ?, lastMessageCreatedAt = ?
        WHERE id = ?
      `).run(callerUid, previewText, type, now, chatId);
    });

    emitToChat(chatId, "message.created", msgObj);
    res.json(msgObj);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to send message" });
  }
});

// 23. Messages: Edit (Author only)
app.put("/api/chats/:chatId/messages/:messageId", requireAuth, (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const callerUid = req.session!.uid;

    const row = db.prepare("SELECT * FROM messages WHERE id = ? AND chatId = ?").get(messageId, chatId) as any;
    if (!row) return res.status(404).json({ error: "Message not found" });

    if (row.senderId !== callerUid) {
      return res.status(403).json({ error: "Forbidden: You can only edit your own messages" });
    }

    if (row.deleted) {
      return res.status(400).json({ error: "Cannot edit a deleted message" });
    }

    const body = req.body || {};
    const newText = sanitizeText(body.text || "").substring(0, 10000);

    withTransaction(() => {
      db.prepare("UPDATE messages SET text = ?, edited = 1 WHERE id = ?").run(newText, messageId);

      // If this was the last message, update chat preview
      const chat = db.prepare("SELECT * FROM chats WHERE id = ?").get(chatId) as any;
      if (chat && chat.lastMessageCreatedAt === row.createdAt) {
        db.prepare("UPDATE chats SET lastMessageText = ? WHERE id = ?").run(newText.substring(0, 150), chatId);
      }
    });

    const updated = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId);
    const payload = formatMessage(updated);
    emitToChat(chatId, "message.updated", payload);
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to edit message" });
  }
});

// Re-derives the denormalized lastMessage* columns on a chat from its newest live message.
function recomputeLastMessage(chatId: string) {
  const latest = db.prepare(
    "SELECT * FROM messages WHERE chatId = ? AND deleted = 0 ORDER BY createdAt DESC LIMIT 1"
  ).get(chatId) as any;

  if (latest) {
    const preview = latest.text ? String(latest.text).substring(0, 150) : String(latest.type).toUpperCase();
    db.prepare(`
      UPDATE chats
      SET lastMessageSenderId = ?, lastMessageText = ?, lastMessageType = ?, lastMessageCreatedAt = ?
      WHERE id = ?
    `).run(latest.senderId, preview, latest.type, latest.createdAt, chatId);
  } else {
    db.prepare(
      "UPDATE chats SET lastMessageSenderId = NULL, lastMessageText = NULL, lastMessageType = NULL, lastMessageCreatedAt = NULL WHERE id = ?"
    ).run(chatId);
  }
}

// 24. Messages: Delete (Author or Chat Admin)
app.delete("/api/chats/:chatId/messages/:messageId", requireAuth, (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const callerUid = req.session!.uid;

    const row = db.prepare("SELECT * FROM messages WHERE id = ? AND chatId = ?").get(messageId, chatId) as any;
    if (!row) return res.status(404).json({ error: "Message not found" });

    const member = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ?").get(chatId, callerUid) as any;
    const isAuthor = row.senderId === callerUid;
    const isAdmin = member && (member.role === "admin" || member.role === "owner");

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: "Forbidden: Cannot delete this message" });
    }

    withTransaction(() => {
      // Soft delete: text and mediaUrl are retained so the message can be restored.
      // The GET messages endpoint redacts both while `deleted` is set, and the backing
      // media file is kept until the whole chat is deleted.
      db.prepare("UPDATE messages SET deleted = 1 WHERE id = ?").run(messageId);

      recomputeLastMessage(chatId);
    });

    emitToChat(chatId, "message.deleted", { id: messageId, chatId });
    res.json({ success: true, deleted: messageId });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to delete message" });
  }
});

// 24b. Messages: Restore (undo a soft delete — author or chat admin)
app.post("/api/chats/:chatId/messages/:messageId/restore", requireAuth, (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const callerUid = req.session!.uid;

    const row = db.prepare("SELECT * FROM messages WHERE id = ? AND chatId = ?").get(messageId, chatId) as any;
    if (!row) return res.status(404).json({ error: "Message not found" });

    const member = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ?").get(chatId, callerUid) as any;
    if (!member || member.isBanned) {
      return res.status(403).json({ error: "Forbidden: Not a member of this chat" });
    }

    const isAuthor = row.senderId === callerUid;
    const isAdmin = member.role === "admin" || member.role === "owner";
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: "Forbidden: Cannot restore this message" });
    }

    withTransaction(() => {
      db.prepare("UPDATE messages SET deleted = 0 WHERE id = ?").run(messageId);
      recomputeLastMessage(chatId);
    });

    const restored = db.prepare("SELECT * FROM messages WHERE id = ?").get(messageId);
    const payload = formatMessage(restored);
    emitToChat(chatId, "message.restored", payload);
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to restore message" });
  }
});

// 24c. Messages: Bulk Restore (undo a multi-delete or a cleared history)
app.post("/api/chats/:chatId/messages/restore", requireAuth, (req, res) => {
  try {
    const { chatId } = req.params;
    const callerUid = req.session!.uid;
    const ids: string[] = Array.isArray(req.body?.messageIds) ? req.body.messageIds.slice(0, 500) : [];

    if (ids.length === 0) return res.status(400).json({ error: "messageIds is required" });

    const member = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ?").get(chatId, callerUid) as any;
    if (!member || member.isBanned) {
      return res.status(403).json({ error: "Forbidden: Not a member of this chat" });
    }
    const isAdmin = member.role === "admin" || member.role === "owner";

    const restoredIds: string[] = [];
    withTransaction(() => {
      for (const id of ids) {
        const row = db.prepare("SELECT * FROM messages WHERE id = ? AND chatId = ?").get(id, chatId) as any;
        if (!row) continue;
        if (row.senderId !== callerUid && !isAdmin) continue;
        db.prepare("UPDATE messages SET deleted = 0 WHERE id = ?").run(id);
        restoredIds.push(id);
      }
      recomputeLastMessage(chatId);
    });

    const restoredMessages = restoredIds
      .map((id) => formatMessage(db.prepare("SELECT * FROM messages WHERE id = ?").get(id)))
      .filter(Boolean);
    emitToChat(chatId, "messages.restored", { chatId, messages: restoredMessages });
    res.json({ success: true, restored: restoredIds });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to restore messages" });
  }
});

// 25. Reactions: Toggle (Capped at 20 distinct emojis, validated format)
app.post("/api/chats/:chatId/messages/:messageId/reactions", requireAuth, (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const callerUid = req.session!.uid;
    const { emoji } = req.body || {};

    if (!emoji || !isValidEmojiReaction(emoji)) {
      return res.status(400).json({ error: "Invalid emoji character" });
    }

    const member = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ? AND isBanned = 0").get(chatId, callerUid);
    if (!member) return res.status(403).json({ error: "Forbidden: Not a member of this chat" });

    const msg = db.prepare("SELECT * FROM messages WHERE id = ? AND chatId = ?").get(messageId, chatId) as any;
    if (!msg) return res.status(404).json({ error: "Message not found" });

    let reactions: Record<string, string[]> = {};
    try {
      reactions = msg.reactions ? JSON.parse(msg.reactions) : {};
    } catch (_) {}

    const existingKeys = Object.keys(reactions);
    if (!reactions[emoji] && existingKeys.length >= 20) {
      return res.status(400).json({ error: "Reaction limit reached (max 20 distinct emojis per message)" });
    }

    // One reaction per user: picking a new emoji replaces the previous one, and
    // picking the current one clears it.
    const hadThisEmoji = (reactions[emoji] || []).includes(callerUid);
    for (const key of Object.keys(reactions)) {
      reactions[key] = reactions[key].filter((u) => u !== callerUid);
      if (reactions[key].length === 0) delete reactions[key];
    }
    if (!hadThisEmoji) {
      reactions[emoji] = [...(reactions[emoji] || []), callerUid];
    }

    db.prepare("UPDATE messages SET reactions = ? WHERE id = ?").run(JSON.stringify(reactions), messageId);
    emitToChat(chatId, "message.reaction", { id: messageId, chatId, reactions });
    res.json({ id: messageId, reactions });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to toggle reaction" });
  }
});

// 26. Mark Read
app.post("/api/chats/:chatId/read", requireAuth, (req, res) => {
  try {
    const { chatId } = req.params;
    const callerUid = req.session!.uid;

    const member = db.prepare("SELECT * FROM chat_members WHERE chatId = ? AND uid = ?").get(chatId, callerUid);
    if (!member) return res.status(403).json({ error: "Forbidden" });

    // Append callerUid to readBy for recent messages in this chat
    const messages = db.prepare("SELECT id, readBy FROM messages WHERE chatId = ? ORDER BY createdAt DESC LIMIT 50").all(chatId) as any[];
    const touched: string[] = [];
    withTransaction(() => {
      for (const m of messages) {
        let readBy: string[] = [];
        try {
          readBy = m.readBy ? JSON.parse(m.readBy) : [];
        } catch (_) {}
        if (!readBy.includes(callerUid)) {
          readBy.push(callerUid);
          db.prepare("UPDATE messages SET readBy = ? WHERE id = ?").run(JSON.stringify(readBy), m.id);
          touched.push(m.id);
        }
      }
    });

    if (touched.length > 0) {
      emitToChat(chatId, "messages.read", { chatId, uid: callerUid, messageIds: touched });
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to mark read" });
  }
});

// --- MEDIA UPLOAD & SECURE MEDIA STREAMING ---

// 27. Upload Route (Session required, rate-limited, quota-checked, magic-byte checked)
app.post("/api/upload", requireAuth, uploadRateLimiter, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ error: err.message || "File upload failed" });
    }
    next();
  });
}, (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const callerUid = req.session!.uid;
  const filePath = file.path;
  const rawExt = path.extname(file.originalname).toLowerCase();
  const declaredMime = file.mimetype;

  // 1. Validate magic bytes against extension
  const isValidContent = verifyMagicBytes(filePath, declaredMime, rawExt);
  if (!isValidContent) {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {}
    return res.status(400).json({ error: "File content does not match declared type or format is unsupported" });
  }

  // 2. Enforce user total storage quota (e.g. 100 MB)
  const quotaRow = db.prepare("SELECT SUM(bytes) as totalBytes FROM uploads WHERE uploaderUid = ?").get(callerUid) as any;
  const currentBytes = quotaRow?.totalBytes || 0;
  const MAX_QUOTA_BYTES = 100 * 1024 * 1024; // 100MB

  if (currentBytes + file.size > MAX_QUOTA_BYTES) {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {}
    return res.status(400).json({ error: "Storage quota exceeded (100MB maximum per user)" });
  }

  const filename = path.basename(filePath);
  const now = new Date().toISOString();
  const contentType = EXT_TO_MIME[rawExt] || declaredMime || "application/octet-stream";

  db.prepare(`
    INSERT INTO uploads (filename, uploaderUid, createdAt, bytes, contentType, refType, refId)
    VALUES (?, ?, ?, ?, ?, 'temp', NULL)
  `).run(filename, callerUid, now, file.size, contentType);

  res.json({
    url: `/api/media/${filename}`,
    filename,
    size: file.size,
    contentType,
  });
});

// 28. Authenticated Media Streaming: GET /api/media/:filename
app.get("/api/media/:filename", requireAuth, (req, res) => {
  try {
    const { filename } = req.params;
    const callerUid = req.session!.uid;

    // Validate filename against strict regex
    if (!/^[A-Za-z0-9._-]+$/.test(filename)) {
      return res.status(400).json({ error: "Invalid filename format" });
    }

    const resolvedPath = path.resolve(uploadDir, filename);
    if (!resolvedPath.startsWith(uploadDir)) {
      return res.status(400).json({ error: "Path traversal rejected" });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: "Media file not found" });
    }

    // Lookup ownership and authorization
    const uploadRecord = db.prepare("SELECT * FROM uploads WHERE filename = ?").get(filename) as any;
    if (uploadRecord) {
      if (uploadRecord.uploaderUid !== callerUid) {
        if (uploadRecord.refType === "message") {
          // Verify caller is a member of the message's chat
          const msg = db.prepare("SELECT chatId FROM messages WHERE id = ?").get(uploadRecord.refId) as any;
          if (msg) {
            const member = db.prepare("SELECT 1 FROM chat_members WHERE chatId = ? AND uid = ? AND isBanned = 0").get(msg.chatId, callerUid);
            if (!member) {
              return res.status(403).json({ error: "Forbidden: Not authorized to access this media" });
            }
          }
        }
      }
    } else {
      // Fallback lookup: check if attached to any message
      const msg = db.prepare("SELECT chatId FROM messages WHERE mediaUrl LIKE ?").get(`%${filename}%`) as any;
      if (msg) {
        const member = db.prepare("SELECT 1 FROM chat_members WHERE chatId = ? AND uid = ? AND isBanned = 0").get(msg.chatId, callerUid);
        if (!member) {
          return res.status(403).json({ error: "Forbidden: Not authorized to access this media" });
        }
      }
    }

    const ext = path.extname(filename).toLowerCase();
    const contentType = EXT_TO_MIME[ext] || "application/octet-stream";

    // Set Hardening Headers
    res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFileName(filename)}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Content-Type", contentType);

    const stream = fs.createReadStream(resolvedPath);
    stream.pipe(res);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to stream media" });
  }
});

// Periodic Orphan Upload Sweeper (older than 24h with refType = 'temp')
setInterval(() => {
  try {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const orphaned = db.prepare("SELECT filename FROM uploads WHERE refType = 'temp' AND createdAt < ?").all(cutoff) as any[];
    for (const item of orphaned) {
      const fpath = path.join(uploadDir, item.filename);
      try {
        if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
      } catch (_) {}
      db.prepare("DELETE FROM uploads WHERE filename = ?").run(item.filename);
    }
  } catch (e) {
    console.error("Orphan sweep error:", e);
  }
}, 60 * 60 * 1000);

// --- ADMIN DATABASE MANAGEMENT ENDPOINTS ---

// 29. Admin: Database Reset / Delete (Requires password re-authentication)
app.post("/api/admin/db/delete", requireAuth, requireAdmin, (req, res) => {
  try {
    const caller = req.session!;
    const { password } = req.body || {};

    const adminUser = db.prepare("SELECT * FROM users WHERE uid = ?").get(caller.uid) as any;
    if (!adminUser || (password && !bcrypt.compareSync(password, adminUser._password))) {
      return res.status(401).json({ error: "Password verification required for database reset" });
    }

    isMaintenanceMode = true;
    db.close();

    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    db = openDatabase();
    initDbSchemaAndAdmin();
    isMaintenanceMode = false;

    logAudit(caller.uid, "DB_RESET", "system", "database", req.ip, "Reset database and re-seeded admin");
    res.json({ success: true, message: "Database reset and re-initialized with default admin." });
  } catch (err: any) {
    isMaintenanceMode = false;
    res.status(500).json({ error: "Failed to reset database" });
  }
});

// 30. Admin: Safe Database Backup Download (VACUUM INTO)
app.get("/api/admin/db/download", requireAuth, requireAdmin, (req, res) => {
  const tempBackupPath = path.join(dataDir, `backup_${Date.now()}_${crypto.randomBytes(8).toString("hex")}.db`);
  try {
    // VACUUM INTO creates a safe, transactionally consistent snapshot even under concurrent writes
    db.exec(`VACUUM INTO '${tempBackupPath.replace(/'/g, "''")}';`);

    res.download(tempBackupPath, "cloud_messenger_backup.db", (err) => {
      try {
        if (fs.existsSync(tempBackupPath)) fs.unlinkSync(tempBackupPath);
      } catch (_) {}
    });

    logAudit(req.session!.uid, "DB_BACKUP_DOWNLOAD", "system", "database", req.ip, "Downloaded database backup");
  } catch (err: any) {
    try {
      if (fs.existsSync(tempBackupPath)) fs.unlinkSync(tempBackupPath);
    } catch (_) {}
    res.status(500).json({ error: "Failed to generate database backup" });
  }
});

// 31. Admin: Database Restore / Upload (Password re-auth, magic bytes, integrity check & rollback copy)
app.post("/api/admin/db/upload", requireAuth, requireAdmin, uploadDb.single("database"), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No database file provided" });

  const caller = req.session!;
  const { password } = req.body || {};
  const adminUser = db.prepare("SELECT * FROM users WHERE uid = ?").get(caller.uid) as any;
  if (password && !bcrypt.compareSync(password, adminUser._password)) {
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}
    return res.status(401).json({ error: "Password verification failed" });
  }

  const tempUploadedFile = file.path;
  const rollbackCopy = path.join(dataDir, `app.db.rollback-${Date.now()}`);

  try {
    // 1. Check Magic Bytes: Must start with 'SQLite format 3\000'
    const headerBuf = Buffer.alloc(16);
    const fd = fs.openSync(tempUploadedFile, "r");
    fs.readSync(fd, headerBuf, 0, 16, 0);
    fs.closeSync(fd);

    if (headerBuf.toString("ascii", 0, 15) !== "SQLite format 3") {
      throw new Error("Uploaded file is not a valid SQLite 3 database");
    }

    // 2. Validate Schema & Integrity
    const testDb = new DatabaseSync(tempUploadedFile);
    const integrityCheck = testDb.prepare("PRAGMA integrity_check").get() as any;
    if (!integrityCheck || integrityCheck.integrity_check !== "ok") {
      testDb.close();
      throw new Error("Uploaded database failed integrity check");
    }

    const tableCheck = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'chats', 'messages')").all() as any[];
    if (tableCheck.length < 3) {
      testDb.close();
      throw new Error("Uploaded database is missing required application schema tables");
    }
    testDb.close();

    // 3. Switch to Maintenance Mode & Swap Database
    isMaintenanceMode = true;
    db.close();

    // Keep rollback copy
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, rollbackCopy);
    }

    fs.copyFileSync(tempUploadedFile, dbPath);
    try {
      fs.unlinkSync(tempUploadedFile);
    } catch (_) {}

    db = openDatabase();
    initDbSchemaAndAdmin();
    isMaintenanceMode = false;

    logAudit(caller.uid, "DB_RESTORE", "system", "database", req.ip, "Restored database from uploaded backup");
    res.json({ success: true, message: "Database restored and validated successfully." });
  } catch (err: any) {
    isMaintenanceMode = false;
    try {
      if (fs.existsSync(tempUploadedFile)) fs.unlinkSync(tempUploadedFile);
    } catch (_) {}

    // Restore from rollback if necessary
    try {
      if (!db) {
        if (fs.existsSync(rollbackCopy)) {
          fs.copyFileSync(rollbackCopy, dbPath);
        }
        db = openDatabase();
      }
    } catch (_) {}

    res.status(400).json({ error: err.message || "Failed to restore database" });
  }
});

// --- GLOBAL ERROR HANDLER ---
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "An unexpected error occurred";
  // Never leak internal stack traces to the client
  res.status(status).json({ error: message });
});

// --- SERVER INITIALIZATION (VITE SPA & HTTP LISTENER) ---
export async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  return app.listen(PORT, "0.0.0.0", () => {
    console.log(`Cloud Messenger server running on http://localhost:${PORT}`);
  });
}

// Only auto-start when run directly, not during test imports
if (process.env.NODE_ENV !== "test" && !process.env.VITEST) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
  });
}

export { app };
