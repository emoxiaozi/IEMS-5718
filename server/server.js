const path = require("path");
const fs = require("fs");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const sharp = require("sharp");
const nodemailer = require("nodemailer");

const http = require("http");
const https = require("https");
const { URL } = require("url");

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

async function fetchCompat(input, init = {}) {
  const url = input instanceof URL ? input : new URL(String(input));
  const lib = url.protocol === "https:" ? https : http;
  const method = String(init.method || "GET").toUpperCase();
  const headers = init.headers || {};
  const body = init.body;

  return await new Promise((resolve, reject) => {
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const text = async () => buf.toString("utf8");
          const json = async () => {
            const t = await text();
            if (!t) return {};
            return JSON.parse(t);
          };

          resolve({
            ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300,
            status: res.statusCode || 0,
            statusText: res.statusMessage || "",
            headers: res.headers,
            text,
            json,
          });
        });
      }
    );

    req.on("error", reject);
    if (body != null) req.write(body);
    req.end();
  });
}

const fetch = global.fetch ? global.fetch.bind(global) : fetchCompat;

const app = express();
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
const session = require("express-session");

const PAYPAL_BASE = process.env.PAYPAL_BASE || "https://api-m.sandbox.paypal.com";
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || "AbYyGa1FydSQRduZuKjmfCXfQBTVWrN7EfphMNXxdvG0qv0_v4xAMh15w9hzl3MbV5yJBooDP6yCzO9b";
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || "EKcdvqQ_XNgpvxGl6GeZ_s7pnOnOC4qmg42hPpJ26v30R4rjRYm8NKj6vXKJdv0bpHf5HTV317qFNwdg";
const PAYPAL_CURRENCY = process.env.PAYPAL_CURRENCY || "HKD";
const PAYPAL_MERCHANT_EMAIL = process.env.PAYPAL_MERCHANT_EMAIL || "sb-9n5wb50757871@business.example.com";
const PAYPAL_WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || "98657034E7825460U";
const PAYPAL_RETURN_URL = process.env.PAYPAL_RETURN_URL || "https://s39.iems5718.iecuhk.cc/shop";
const PAYPAL_CANCEL_URL = process.env.PAYPAL_CANCEL_URL || "https://s39.iems5718.iecuhk.cc/cart";

let paypalTokenCache = null;

async function getPayPalAccessToken() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error("PayPal credentials are not configured");
  }

  const now = Date.now();
  if (paypalTokenCache && paypalTokenCache.expiresAt - now > 60 * 1000) {
    return paypalTokenCache.accessToken;
  }

  const basicToken = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const tokenText = await tokenRes.text();
  let tokenData = null;
  try {
    tokenData = JSON.parse(tokenText);
  } catch {
    tokenData = { raw: tokenText };
  }

  if (!tokenRes.ok || !tokenData?.access_token) {
    const msg =
      tokenData?.error_description ||
      tokenData?.message ||
      tokenData?.name ||
      `PayPal token request failed (${tokenRes.status})`;
    throw new Error(msg);
  }

  const expiresIn = Number(tokenData.expires_in || 0);
  paypalTokenCache = {
    accessToken: tokenData.access_token,
    expiresAt: now + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 8 * 60 * 1000),
  };

  return paypalTokenCache.accessToken;
}

async function paypalJson(method, apiPath, body) {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${PAYPAL_BASE}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body == null || method === "GET" ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const msg = data?.message || data?.error_description || data?.name || `PayPal API error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function verifyPayPalWebhookSignature(req) {
  if (!PAYPAL_WEBHOOK_ID) return false;

  const transmissionId = String(req.headers["paypal-transmission-id"] || "");
  const transmissionTime = String(req.headers["paypal-transmission-time"] || "");
  const certUrl = String(req.headers["paypal-cert-url"] || "");
  const authAlgo = String(req.headers["paypal-auth-algo"] || "");
  const transmissionSig = String(req.headers["paypal-transmission-sig"] || "");

  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    return false;
  }

  const out = await paypalJson("POST", "/v1/notifications/verify-webhook-signature", {
    auth_algo: authAlgo,
    cert_url: certUrl,
    transmission_id: transmissionId,
    transmission_sig: transmissionSig,
    transmission_time: transmissionTime,
    webhook_id: PAYPAL_WEBHOOK_ID,
    webhook_event: req.body,
  });

  return String(out?.verification_status || "").toUpperCase() === "SUCCESS";
}

app.use(
  session({
    name: "iems5718_session_id",
    secret: "iems5718-secure-session-secret-2024", 
    resave: false,
    saveUninitialized: false, 
    cookie: {
      httpOnly: true,
      secure: true, 
      sameSite: "lax",
      maxAge: 2 * 24 * 60 * 60 * 1000 
    }
  })
);

// CSRF Middleware
function csrfTokenMiddleware(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString("hex");
  }
  
  if (req.path === "/api/paypal/webhook") {
    return next();
  }

  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const clientToken = req.headers["x-csrf-token"] || req.body?._csrf;
    if (!clientToken || clientToken !== req.session.csrfToken) {
      return res.status(403).json({ error: "Invalid CSRF token" });
    }
  }
  next();
}

app.use(csrfTokenMiddleware);


app.get("/api/csrf-token", (req, res) => {
  res.json({ csrfToken: req.session.csrfToken });
});

app.use(async (req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  if (!req.session?.userId) return next();

  const sid = String(req.sessionID || "");
  if (!sid) return next();

  try {
    const active = await isSessionActive(sid);
    if (!active) {
      req.session.destroy(() => {
        res.clearCookie("iems5718_session_id");
        res.status(401).json({ error: "Session revoked" });
      });
      return;
    }

    const now = Date.now();
    const last = sessionTouchAt.get(sid) || 0;
    if (now - last > 30 * 1000) {
      sessionTouchAt.set(sid, now);
      const db = openDb();
      try {
        await ensureSessionsSchema(db);
        await dbRun(db, "UPDATE user_sessions SET last_seen = datetime('now') WHERE sid = ?", [sid]);
      } finally {
        db.close();
      }
    }

    next();
  } catch (e) {
    next();
  }
});

// --- Auth APIs ---

// Admin Authorization Middleware
function isAdmin(req, res, next) {
  if (req.session.userId && req.session.role === "admin") {
    return next();
  }
  res.status(403).json({ error: "Access denied. Admin privileges required." });
}

function generateLoginOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const db = openDb();
  try {
    const user = await dbGet(db, "SELECT userid, email, password, role FROM users WHERE email = ?", [email]);
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid email or password" });

    const now = Date.now();
    const existing = req.session.login2fa;
    if (existing && existing.userId === user.userid && Number(existing.expiresAt || 0) > now) {
      const lastSentAt = Number(existing.lastSentAt || 0);
      if (now - lastSentAt < 30 * 1000) {
        return res.json({ ok: true, requires2fa: true, message: "Verification code already sent" });
      }
    }

    const code = generateLoginOtp();
    req.session.login2fa = {
      userId: user.userid,
      email: user.email,
      role: user.role,
      code,
      expiresAt: now + 5 * 60 * 1000,
      attemptsLeft: 5,
      lastSentAt: now,
    };

    const mailOptions = {
      from: '"Dummy Shop" <2210530985@qq.com>',
      to: user.email,
      subject: "Your login verification code - Dummy Shop",
      text: `Your login verification code is: ${code}. It will expire in 5 minutes.`,
      html: `<p>Your login verification code is:</p><p style="font-size:20px;font-weight:700;letter-spacing:2px;">${code}</p><p>This code will expire in 5 minutes.</p>`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ ok: true, requires2fa: true, message: "Verification code sent" });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "An internal server error occurred. Please try again later." });
  } finally {
    db.close();
  }
});

app.post("/api/auth/login/verify", async (req, res) => {
  const code = String(req.body?.code || "").trim();
  if (!code) return res.status(400).json({ error: "code is required" });

  const pending = req.session.login2fa;
  if (!pending) return res.status(400).json({ error: "No pending login" });

  const now = Date.now();
  const exp = Number(pending.expiresAt || 0);
  if (!Number.isFinite(exp) || now > exp) {
    req.session.login2fa = null;
    return res.status(400).json({ error: "Verification code expired" });
  }

  const attemptsLeft = Number(pending.attemptsLeft || 0);
  if (!Number.isFinite(attemptsLeft) || attemptsLeft <= 0) {
    req.session.login2fa = null;
    return res.status(400).json({ error: "Too many attempts" });
  }

  if (code !== String(pending.code || "")) {
    pending.attemptsLeft = attemptsLeft - 1;
    req.session.login2fa = pending;
    return res.status(401).json({ error: "Invalid verification code" });
  }

  const oldSession = { ...req.session };
  const userForSession = { userid: pending.userId, email: pending.email, role: pending.role };

  req.session.regenerate((err) => {
    if (err) {
      console.error("Session regeneration error:", err);
      return res.status(500).json({ error: "Login failed due to session error" });
    }

    if (oldSession.csrfToken) {
      req.session.csrfToken = oldSession.csrfToken;
    }

    req.session.userId = userForSession.userid;
    req.session.userEmail = userForSession.email;
    req.session.role = userForSession.role;

    recordSessionLogin(req, userForSession)
      .then(() => {
        res.json({ ok: true, user: { email: userForSession.email, role: userForSession.role } });
      })
      .catch((e) => {
        console.error("Session record error:", e);
        res.json({ ok: true, user: { email: userForSession.email, role: userForSession.role } });
      });
  });
});

app.post("/api/auth/login/resend", async (req, res) => {
  const pending = req.session.login2fa;
  if (!pending) return res.status(400).json({ error: "No pending login" });

  const now = Date.now();
  const exp = Number(pending.expiresAt || 0);
  if (!Number.isFinite(exp) || now > exp) {
    req.session.login2fa = null;
    return res.status(400).json({ error: "Verification code expired" });
  }

  const lastSentAt = Number(pending.lastSentAt || 0);
  if (Number.isFinite(lastSentAt) && now - lastSentAt < 30 * 1000) {
    return res.json({ ok: true, requires2fa: true, message: "Please wait before resending" });
  }

  const code = generateLoginOtp();
  pending.code = code;
  pending.expiresAt = now + 5 * 60 * 1000;
  pending.attemptsLeft = 5;
  pending.lastSentAt = now;
  req.session.login2fa = pending;

  try {
    const mailOptions = {
      from: '"Dummy Shop" <2210530985@qq.com>',
      to: String(pending.email || ""),
      subject: "Your login verification code - Dummy Shop",
      text: `Your login verification code is: ${code}. It will expire in 5 minutes.`,
      html: `<p>Your login verification code is:</p><p style="font-size:20px;font-weight:700;letter-spacing:2px;">${code}</p><p>This code will expire in 5 minutes.</p>`,
    };
    await transporter.sendMail(mailOptions);
    res.json({ ok: true, requires2fa: true, message: "Verification code resent" });
  } catch (e) {
    console.error("Resend login code error:", e);
    res.status(500).json({ error: "Failed to resend verification code" });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password, confirmPassword, code, adminKey } = req.body;


  if (!email || !password || !confirmPassword || !code) {
    return res.status(400).json({ error: "All fields are required" });
  }

  const ADMIN_REGISTRATION_SECRET = "iems5718-admin-secret";
  const role = adminKey === ADMIN_REGISTRATION_SECRET ? "admin" : "user";

  const sessionCode = req.session.emailCode;
  if (!sessionCode || sessionCode.email !== email.trim().toLowerCase() || sessionCode.code !== code) {
    return res.status(400).json({ error: "Invalid verification code" });
  }
  if (Date.now() > sessionCode.expires) {
    return res.status(400).json({ error: "Verification code expired" });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }


  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long" });
  }

  const db = openDb();
  try {
    const existing = await dbGet(db, "SELECT userid FROM users WHERE email = ?", [email.trim().toLowerCase()]);
    if (existing) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const hashedPw = await bcrypt.hash(password, 10);
    await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO users (email, password, role) VALUES (?, ?, ?)",
        [email.trim().toLowerCase(), hashedPw, role],
        (err) => (err ? reject(err) : resolve())
      );
    });

    res.status(201).json({ ok: true, message: `Account registered successfully as ${role}` });
  } catch (e) {
    console.error("Registration error:", e);
    res.status(500).json({ error: "Failed to register user" });
  } finally {
    db.close();
  }
});

app.post("/api/auth/logout", (req, res) => {
  const sid = String(req.sessionID || "");
  req.session.destroy(async (err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }

    try {
      await recordSessionLogoutBySid(sid);
    } catch (e) {
      console.error("Session revoke error:", e);
    }

    res.clearCookie("iems5718_session_id");
    res.json({ ok: true });
  });
});

app.post("/api/auth/change-password", async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  const userId = req.session.userId;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).json({ error: "New passwords do not match" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }

  const db = openDb();
  try {
    const user = await dbGet(db, "SELECT password FROM users WHERE userid = ?", [userId]);
    if (!user) return res.status(404).json({ error: "User not found" });

    // 1. 验证当前密码
    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ error: "Current password incorrect" });

    // 2. 更新数据库
    const hashedPw = await bcrypt.hash(newPassword, 10);
    await db.run("UPDATE users SET password = ? WHERE userid = ?", [hashedPw, userId]);

    // 3. 修改后强制登出
    const sid = String(req.sessionID || "");
    req.session.destroy(async (err) => {
      if (err) {
        console.error("Session destruction error:", err);
        return res.status(500).json({ error: "Password changed but logout failed" });
      }

      try {
        await recordSessionLogoutBySid(sid);
      } catch (e) {
        console.error("Session revoke error:", e);
      }

      res.clearCookie("iems5718_session_id");
      res.json({ ok: true, message: "Password updated successfully. Please login again." });
    });
  } catch (e) {
    console.error("Change password error:", e);
    res.status(500).json({ error: "Failed to change password" });
  } finally {
    db.close();
  }
});

// --- Email Configuration (QQ Mail) ---
const transporter = nodemailer.createTransport({
  service: "qq",
  port: 465,
  secure: true, // 使用 SSL
  auth: {
    user: "2210530985@qq.com", 
    pass: "fgfpwxqfbpgfeaii"        
  }
});

// --- Email Verification Code ---

const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:5173";

app.post("/api/auth/request-password-reset", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email || !validateEmail(email)) {
    return res.status(400).json({ error: "A valid email is required" });
  }

  const db = openDb();
  try {
    await ensurePasswordResetsSchema(db);

    const user = await dbGet(db, "SELECT userid, email, role FROM users WHERE email = ?", [email]);
    if (!user) {
      return res.json({ ok: true });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = sha256Hex(token);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await dbRun(
      db,
      "INSERT INTO password_resets (user_id, email, token_hash, expires_at) VALUES (?, ?, ?, ?)",
      [user.userid, user.email, tokenHash, expiresAt]
    );

    const link = `${APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;

    const mailOptions = {
      from: '"Dummy Shop" <2210530985@qq.com>',
      to: user.email,
      subject: "Password Reset - Dummy Shop",
      text: `Use this link to reset your password (valid for 15 minutes): ${link}`,
      html: `<p>Click to reset your password (valid for 15 minutes):</p><p><a href="${link}">${link}</a></p>`,
    };

    await transporter.sendMail(mailOptions);
    res.json({ ok: true });
  } catch (e) {
    console.error("Request password reset error:", e);
    res.status(500).json({ error: "Failed to request password reset" });
  } finally {
    db.close();
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const newPassword = String(req.body?.newPassword || "");
  const confirmNewPassword = String(req.body?.confirmNewPassword || "");

  if (!token) return res.status(400).json({ error: "token is required" });
  if (!newPassword || !confirmNewPassword) return res.status(400).json({ error: "All fields are required" });
  if (newPassword.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters" });
  if (newPassword !== confirmNewPassword) return res.status(400).json({ error: "Passwords do not match" });

  const db = openDb();
  try {
    await ensurePasswordResetsSchema(db);

    const tokenHash = sha256Hex(token);
    const row = await dbGet(
      db,
      "SELECT rid, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?",
      [tokenHash]
    );

    if (!row || row.used_at) return res.status(400).json({ error: "Invalid or used token" });

    const exp = Date.parse(String(row.expires_at || ""));
    if (!Number.isFinite(exp) || Date.now() > exp) {
      return res.status(400).json({ error: "Token expired" });
    }

    const hashedPw = await bcrypt.hash(newPassword, 10);
    await dbRun(db, "UPDATE users SET password = ? WHERE userid = ?", [hashedPw, row.user_id]);
    await dbRun(db, "UPDATE password_resets SET used_at = datetime('now') WHERE rid = ?", [row.rid]);

    try {
      await ensureSessionsSchema(db);
      await dbRun(db, "UPDATE user_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL", [row.user_id]);
    } catch {}

    res.json({ ok: true });
  } catch (e) {
    console.error("Reset password error:", e);
    res.status(500).json({ error: "Failed to reset password" });
  } finally {
    db.close();
  }
});

app.post("/api/auth/send-code", async (req, res) => {
  const { email } = req.body;
  if (!email || !validateEmail(email)) {
    return res.status(400).json({ error: "A valid email is required" });
  }

  const db = openDb();
  try {
    // 检查邮箱是否已存在
    const existing = await dbGet(db, "SELECT userid FROM users WHERE email = ?", [email.trim().toLowerCase()]);
    if (existing) {
      return res.status(400).json({ error: "Email already exists. Please use a different email or login." });
    }

    // 生成 6 位数字验证码
    const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  // 存储到 Session，设置 5 分钟有效期
  req.session.emailCode = {
    email: email.trim().toLowerCase(),
    code: code,
    expires: Date.now() + 5 * 60 * 1000
  };

 
    const mailOptions = {
      from: '"Dummy Shop" <2210530985@qq.com>', 
      to: email,
      subject: "Your Verification Code - Dummy Shop",
      text: `Your verification code is: ${code}. It will expire in 5 minutes.`,
      html: `<b>Your verification code is: <span style="font-size: 20px; color: #3498db;">${code}</span></b><p>It will expire in 5 minutes.</p>`
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${email}`);
      res.json({ ok: true, message: "Verification code sent to your email." });
    } catch (mailErr) {
      console.error("Mail sending failed:", mailErr);
      res.status(500).json({ error: "Failed to send email. Please try again later." });
    }
  } catch (e) {
    console.error("Send code error:", e);
    res.status(500).json({ error: "An internal error occurred." });
  } finally {
    db.close();
  }
});

app.get("/api/auth/me", (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  res.json({
    user: {
      email: req.session.userEmail,
      role: req.session.role
    }
  });
});
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://localhost:3000 http://localhost:5173 ws://localhost:5173; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; frame-src 'self' https://www.facebook.com https://platform.twitter.com; form-action 'self'; upgrade-insecure-requests"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});
const DB_PATH = path.join(__dirname, "db", "app.db");
const INIT_SQL_PATH = path.join(__dirname, "db", "init.sql");

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use("/uploads", express.static(UPLOAD_DIR));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Only JPEG/PNG/WEBP allowed"), ok);
  },
});

// --- helpers ---
function openDb() {
  const db = new sqlite3.Database(DB_PATH);
  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");
  });
  return db;
}

function runSqlFile(db, sqlFilePath) {
  const sql = fs.readFileSync(sqlFilePath, "utf-8");
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function sanitizeText(s, maxLen) {
  const t = String(s || "").replace(/[<>\u0000-\u001F\u007F]/g, "").trim();
  return maxLen ? t.slice(0, maxLen) : t;
}
function validateEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

async function ensureOrdersSchema(db) {
  const cols = await dbAll(db, "PRAGMA table_info(orders)");
  const names = new Set((cols || []).map((c) => c.name));

  const addCol = async (name, typeAndDefault) => {
    if (names.has(name)) return;
    await dbRun(db, `ALTER TABLE orders ADD COLUMN ${name} ${typeAndDefault}`);
    names.add(name);
  };

  await addCol("user_email", "TEXT");
  await addCol("currency", "TEXT");
  await addCol("merchant_email", "TEXT");
  await addCol("salt", "TEXT");
  await addCol("digest", "TEXT");
  await addCol("paypal_order_id", "TEXT");
  await addCol("capture_id", "TEXT");
  await addCol("payment_status", "TEXT NOT NULL DEFAULT 'CREATED'");

  await dbRun(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_paypal_order_id ON orders(paypal_order_id)");
  await dbRun(db, "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_capture_id ON orders(capture_id)");

  await dbRun(
    db,
    "CREATE TABLE IF NOT EXISTS paypal_events (event_id TEXT PRIMARY KEY, event_type TEXT, paypal_order_id TEXT, capture_id TEXT, processed_at TEXT NOT NULL DEFAULT (datetime('now')))"
  );
}

async function ensureSessionsSchema(db) {
  await dbRun(
    db,
    "CREATE TABLE IF NOT EXISTS user_sessions (sid TEXT PRIMARY KEY, user_id INTEGER NOT NULL, user_email TEXT NOT NULL, role TEXT NOT NULL, ip TEXT, user_agent TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_seen TEXT NOT NULL DEFAULT (datetime('now')), revoked_at TEXT, FOREIGN KEY(user_id) REFERENCES users(userid) ON DELETE CASCADE)"
  );
  await dbRun(db, "CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)");
  await dbRun(db, "CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked ON user_sessions(revoked_at)");
}

async function ensurePasswordResetsSchema(db) {
  await dbRun(
    db,
    "CREATE TABLE IF NOT EXISTS password_resets (rid INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, email TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL, used_at TEXT, FOREIGN KEY(user_id) REFERENCES users(userid) ON DELETE CASCADE)"
  );
  await dbRun(db, "CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id)");
  await dbRun(db, "CREATE INDEX IF NOT EXISTS idx_password_resets_used_at ON password_resets(used_at)");
}

function sha256Hex(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest("hex");
}

function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xf) ? xf[0] : String(xf || "");
  const ip = raw.split(",")[0].trim();
  return ip || String(req.ip || "");
}

const sessionTouchAt = new Map();

async function recordSessionLogin(req, user) {
  const sid = String(req.sessionID || "");
  if (!sid || !user) return;

  const db = openDb();
  try {
    await ensureSessionsSchema(db);
    const ip = getClientIp(req).slice(0, 80);
    const ua = String(req.headers["user-agent"] || "").slice(0, 200);
    await dbRun(
      db,
      "INSERT OR REPLACE INTO user_sessions (sid, user_id, user_email, role, ip, user_agent, created_at, last_seen, revoked_at) VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM user_sessions WHERE sid = ?), datetime('now')), datetime('now'), NULL)",
      [sid, user.userid, user.email, user.role, ip, ua, sid]
    );
  } finally {
    db.close();
  }
}

async function recordSessionLogoutBySid(sid) {
  const s = String(sid || "");
  if (!s) return;
  const db = openDb();
  try {
    await ensureSessionsSchema(db);
    await dbRun(db, "UPDATE user_sessions SET revoked_at = datetime('now') WHERE sid = ?", [s]);
  } finally {
    db.close();
  }
}

async function isSessionActive(sid) {
  const s = String(sid || "");
  if (!s) return false;
  const db = openDb();
  try {
    await ensureSessionsSchema(db);
    const row = await dbGet(db, "SELECT sid FROM user_sessions WHERE sid = ? AND revoked_at IS NULL", [s]);
    return Boolean(row);
  } finally {
    db.close();
  }
}

function buildOrderDigest({ currency, merchantEmail, salt, items, total }) {
  const sorted = [...items].sort((a, b) => a.pid - b.pid);
  const parts = [
    `currency=${currency}`,
    `merchant=${merchantEmail}`,
    `salt=${salt}`,
    ...sorted.map((x) => `pid=${x.pid},qty=${x.qty},price=${x.unitPrice.toFixed(2)}`),
    `total=${total.toFixed(2)}`,
  ];
  return crypto.createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

// --- init DB if missing ---
async function ensureDbInitialized() {
  const firstTime = !fs.existsSync(DB_PATH);
  const db = openDb();
  try {
    if (firstTime) {
      await runSqlFile(db, INIT_SQL_PATH);
      console.log("✅ SQLite initialized from init.sql");
      
      // 动态插入默认用户，确保哈希值正确
      const defaultPassword = "password123";
      const hashedPw = await bcrypt.hash(defaultPassword, 10);
      
      await new Promise((resolve, reject) => {
        db.run(
          "INSERT OR REPLACE INTO users (email, password, role) VALUES (?, ?, ?), (?, ?, ?)",
          [
            "admin@example.com", hashedPw, "admin",
            "user@example.com", hashedPw, "user"
          ],
          (err) => (err ? reject(err) : resolve())
        );
      });
      console.log("✅ Default users (admin@example.com / user@example.com) created with password: 'password123'");
    } else {
      // 检查管理员角色是否正确（防止部署时角色丢失）
      const admin = await dbGet(db, "SELECT role FROM users WHERE email = ?", ["admin@example.com"]);
      if (admin && admin.role !== "admin") {
        await db.run("UPDATE users SET role = 'admin' WHERE email = ?", ["admin@example.com"]);
        console.log("✅ Fixed admin role for admin@example.com");
      }
    }

    await ensureSessionsSchema(db);
    await ensurePasswordResetsSchema(db);
  } finally {
    db.close();
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// 1) categories list
app.get("/api/categories", async (req, res) => {
  const db = openDb();
  try {
    const rows = await dbAll(db, "SELECT catid, name FROM categories ORDER BY catid ASC");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    db.close();
  }
});

// 2) products by category
app.get("/api/products", async (req, res) => {
  const catid = Number(req.query.catid);
  if (!Number.isInteger(catid) || catid <= 0) {
    return res.status(400).json({ error: "catid is required and must be a positive integer" });
  }

  const hasPagingParams =
    req.query.page != null ||
    req.query.pageSize != null ||
    req.query.limit != null ||
    req.query.offset != null;

  let page = Number(req.query.page);
  let pageSize = Number(req.query.pageSize);
  let limit = Number(req.query.limit);
  let offset = Number(req.query.offset);

  if (!Number.isFinite(page) || page <= 0) page = 1;
  if (!Number.isFinite(pageSize) || pageSize <= 0) pageSize = 12;

  if (Number.isFinite(limit) && limit > 0) {
    pageSize = limit;
    if (Number.isFinite(offset) && offset >= 0) {
      page = Math.floor(offset / pageSize) + 1;
    }
  } else {
    limit = pageSize;
    offset = (page - 1) * pageSize;
  }

  const maxPageSize = 50;
  if (limit > maxPageSize) {
    limit = maxPageSize;
    pageSize = maxPageSize;
  }

  const db = openDb();
  try {
    if (!hasPagingParams) {
      const rows = await dbAll(
        db,
        "SELECT pid, catid, name, price, description, image_path, thumb_path FROM products WHERE catid = ? ORDER BY pid ASC",
        [catid]
      );
      return res.json(rows);
    }

    const totalRow = await dbGet(db, "SELECT COUNT(1) AS cnt FROM products WHERE catid = ?", [catid]);
    const total = Number(totalRow?.cnt || 0);

    const rows = await dbAll(
      db,
      "SELECT pid, catid, name, price, description, image_path, thumb_path FROM products WHERE catid = ? ORDER BY pid ASC LIMIT ? OFFSET ?",
      [catid, limit, offset]
    );

    const hasMore = offset + rows.length < total;
    res.json({ items: rows, total, page, pageSize, hasMore });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    db.close();
  }
});

// 3) product detail by pid
app.get("/api/products/:pid", async (req, res) => {
  const pid = Number(req.params.pid);
  if (!Number.isInteger(pid) || pid <= 0) {
    return res.status(400).json({ error: "pid must be a positive integer" });
  }

  const db = openDb();
  try {
    const row = await dbGet(
      db,
      "SELECT pid, catid, name, price, description, image_path, thumb_path FROM products WHERE pid = ?",
      [pid]
    );

    if (!row) return res.status(404).json({ error: "Product not found" });

    row.images = row.image_path ? [row.image_path] : [];
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    db.close();
  }
});

// ------- CRUD: Categories -------

// Create category
app.post("/api/categories", isAdmin, async (req, res) => {
  const raw = String(req.body?.name || "");
  const name = sanitizeText(raw, 50);
  if (!name) return res.status(400).json({ error: "name is required" });

  const db = openDb();
  try {
    await new Promise((resolve, reject) => {
      db.run("INSERT INTO categories (name) VALUES (?)", [name], function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      });
    });

    const rows = await dbAll(db, "SELECT catid, name FROM categories ORDER BY catid ASC");
    res.status(201).json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    db.close();
  }
});

// Update category
app.put("/api/categories/:catid", isAdmin, async (req, res) => {
  const catid = Number(req.params.catid);
  const raw = String(req.body?.name || "");
  const name = sanitizeText(raw, 50);

  if (!Number.isInteger(catid) || catid <= 0) return res.status(400).json({ error: "invalid catid" });
  if (!name) return res.status(400).json({ error: "name is required" });

  const db = openDb();
  try {
    await new Promise((resolve, reject) => {
      db.run("UPDATE categories SET name = ? WHERE catid = ?", [name, catid], function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });

    const rows = await dbAll(db, "SELECT catid, name FROM categories ORDER BY catid ASC");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    db.close();
  }
});

// Delete category (block if products exist)
app.delete("/api/categories/:catid", isAdmin, async (req, res) => {
  const catid = Number(req.params.catid);
  if (!Number.isInteger(catid) || catid <= 0) return res.status(400).json({ error: "invalid catid" });

  const db = openDb();
  try {
    const cnt = await dbGet(db, "SELECT COUNT(*) AS c FROM products WHERE catid = ?", [catid]);
    if (cnt?.c > 0) {
      return res.status(409).json({ error: "category has products; delete products first" });
    }

    await new Promise((resolve, reject) => {
      db.run("DELETE FROM categories WHERE catid = ?", [catid], function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });

    const rows = await dbAll(db, "SELECT catid, name FROM categories ORDER BY catid ASC");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    db.close();
  }
});

// ------- CRUD: Products -------

function validateProductInput(body) {
  const catid = Number(body?.catid);
  const name = sanitizeText(String(body?.name || ""), 100);
  const price = Number(body?.price);
  const description = sanitizeText(String(body?.description || ""), 2000);

  if (!Number.isInteger(catid) || catid <= 0) return { ok: false, error: "catid must be positive integer" };
  if (!name) return { ok: false, error: "name is required" };
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: "price must be a non-negative number" };
  const image_path = Object.prototype.hasOwnProperty.call(body, "image_path") ? body.image_path : undefined;
  const thumb_path = Object.prototype.hasOwnProperty.call(body, "thumb_path") ? body.thumb_path : undefined;

  return { ok: true, data: { catid, name, price, description, image_path, thumb_path } };
}

// Create product
app.post("/api/products", isAdmin, async (req, res) => {
  const v = validateProductInput(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });

  const db = openDb();
  try {
    const cat = await dbGet(db, "SELECT catid FROM categories WHERE catid = ?", [v.data.catid]);
    if (!cat) return res.status(400).json({ error: "catid not found" });

    const pid = await new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO products (catid, name, price, description, image_path, thumb_path) VALUES (?, ?, ?, ?, ?, ?)",
        [
          v.data.catid,
          v.data.name,
          v.data.price,
          v.data.description,
          v.data.image_path ?? null,
          v.data.thumb_path ?? null,
        ],
        function (err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });

    const row = await dbGet(
      db,
      "SELECT pid, catid, name, price, description, image_path, thumb_path FROM products WHERE pid = ?",
      [pid]
    );
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    db.close();
  }
});

app.put("/api/products/:pid", isAdmin, async (req, res) => {
  const pid = Number(req.params.pid);
  if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: "invalid pid" });

  const v = validateProductInput(req.body);
  if (!v.ok) return res.status(400).json({ error: v.error });

  const db = openDb();
  try {
    const exists = await dbGet(
      db,
      "SELECT pid, image_path, thumb_path FROM products WHERE pid = ?",
      [pid]
    );
    if (!exists) return res.status(404).json({ error: "product not found" });

    const nextImage = v.data.image_path ?? exists.image_path;
    const nextThumb = v.data.thumb_path ?? exists.thumb_path;

    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE products SET catid = ?, name = ?, price = ?, description = ?, image_path = ?, thumb_path = ? WHERE pid = ?",
        [
          v.data.catid,
          v.data.name,
          v.data.price,
          v.data.description,
          nextImage,
          nextThumb,
          pid,
        ],
        function (err) {
          if (err) return reject(err);
          resolve(this.changes);
        }
      );
    });

    const row = await dbGet(
      db,
      "SELECT pid, catid, name, price, description, image_path, thumb_path FROM products WHERE pid = ?",
      [pid]
    );
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    db.close();
  }
});


app.delete("/api/products/:pid", isAdmin, async (req, res) => {
  const pid = Number(req.params.pid);
  if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: "invalid pid" });

  const db = openDb();
  try {
    const exists = await dbGet(db, "SELECT pid FROM products WHERE pid = ?", [pid]);
    if (!exists) return res.status(404).json({ error: "product not found" });

    const row = await dbGet(db, "SELECT image_path, thumb_path FROM products WHERE pid = ?", [pid]);

    await new Promise((resolve, reject) => {
      db.run("DELETE FROM products WHERE pid = ?", [pid], function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      });
    });

    function safeUnlinkUploads(urlPath) {
      try {
        if (!urlPath || typeof urlPath !== "string") return;
        if (!urlPath.startsWith("/uploads/")) return;
        const filePath = path.join(UPLOAD_DIR, path.basename(urlPath));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }

    safeUnlinkUploads(row?.image_path);
    safeUnlinkUploads(row?.thumb_path);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  } finally {
    db.close();
  }
});


app.post("/api/products/:pid/image", isAdmin, upload.single("image"), async (req, res) => {
  const pid = Number(req.params.pid);
  if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: "invalid pid" });
  if (!req.file) return res.status(400).json({ error: "image file is required (field name: image)" });

  const db = openDb();
  try {
    const exists = await dbGet(db, "SELECT pid FROM products WHERE pid = ?", [pid]);
    if (!exists) return res.status(404).json({ error: "product not found" });

    const bigName = `${pid}.jpg`;
    const thumbName = `${pid}_thumb.jpg`;
    const bigPath = path.join(UPLOAD_DIR, bigName);
    const thumbPath = path.join(UPLOAD_DIR, thumbName);

    await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside" })
      .jpeg({ quality: 85 })
      .toFile(bigPath);

    await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 320, height: 320, fit: "cover" })
      .jpeg({ quality: 80 })
      .toFile(thumbPath);

    const image_path = `/uploads/${bigName}`;
    const thumb_path = `/uploads/${thumbName}`;

    await new Promise((resolve, reject) => {
      db.run(
        "UPDATE products SET image_path = ?, thumb_path = ? WHERE pid = ?",
        [image_path, thumb_path, pid],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const row = await dbGet(
      db,
      "SELECT pid, catid, name, price, description, image_path, thumb_path FROM products WHERE pid = ?",
      [pid]
    );
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  } finally {
    db.close();
  }
});

const PORT = 3000;

ensureDbInitialized()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ API listening on http://localhost:${PORT}`);
      console.log("Try: http://localhost:3000/api/categories");
    });
  })
  .catch((err) => {
    console.error("❌ Failed to init DB:", err);
    process.exit(1);
  });
  app.post("/api/orders", async (req, res) => {
    const body = req.body || {};
    const customer_name = sanitizeText(String(body.customer_name || ""), 100);
    const customer_email = String(body.customer_email || "").trim();
    const address = sanitizeText(String(body.address || ""), 300);
    const items = Array.isArray(body.items) ? body.items : [];
  
    if (!customer_name) return res.status(400).json({ error: "customer_name is required" });
    if (customer_email && !validateEmail(customer_email)) return res.status(400).json({ error: "invalid email" });
    if (!address) return res.status(400).json({ error: "address is required" });
    if (items.length === 0) return res.status(400).json({ error: "items is required" });
  
    for (const it of items) {
      const pid = Number(it.pid);
      const qty = Number(it.qty);
      if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: "invalid pid" });
      if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: "invalid qty" });
    }
  
    const db = openDb();
    try {
      const detailed = [];
      for (const it of items) {
        const row = await dbGet(
          db,
          "SELECT pid, name, price FROM products WHERE pid = ?",
          [Number(it.pid)]
        );
        if (!row) return res.status(400).json({ error: `pid not found: ${it.pid}` });
        const qty = Number(it.qty);
        detailed.push({
          pid: row.pid,
          name: row.name,
          price: Number(row.price),
          qty,
          subtotal: Number(row.price) * qty,
        });
      }
  
      const total = detailed.reduce((s, x) => s + x.subtotal, 0);
  

      const oid = await new Promise((resolve, reject) => {
        db.run(
          "INSERT INTO orders (customer_name, customer_email, address, total) VALUES (?, ?, ?, ?)",
          [customer_name, customer_email || null, address, total],
          function (err) {
            if (err) return reject(err);
            resolve(this.lastID);
          }
        );
      });
  
    
      for (const x of detailed) {
        await new Promise((resolve, reject) => {
          db.run(
            "INSERT INTO order_items (oid, pid, name, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
            [oid, x.pid, x.name, x.price, x.qty, x.subtotal],
            (err) => (err ? reject(err) : resolve())
          );
        });
      }
  
      res.status(201).json({ oid, total });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    } finally {
      db.close();
    }
  });
  app.get("/api/orders/:oid", isAdmin, async (req, res) => {
    const oid = Number(req.params.oid);
    if (!Number.isInteger(oid) || oid <= 0) return res.status(400).json({ error: "invalid oid" });
  
    const db = openDb();
    try {
      const order = await dbGet(db, "SELECT * FROM orders WHERE oid = ?", [oid]);
      if (!order) return res.status(404).json({ error: "order not found" });
  
      const items = await dbAll(
        db,
        "SELECT pid, name, price, qty, subtotal FROM order_items WHERE oid = ? ORDER BY itemid ASC",
        [oid]
      );
  
      res.json({ order, items });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    } finally {
      db.close();
    }
  });

  function getSessionCart(req) {
    if (!req.session.cart) req.session.cart = {}; // { pid: qty }
    return req.session.cart;
  }
  

  app.get("/api/cart", async (req, res) => {
    const cart = getSessionCart(req);
    const pids = Object.keys(cart).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
  
    const db = openDb();
    try {
      const items = [];
      for (const pid of pids) {
        const row = await dbGet(
          db,
          "SELECT pid, name, price, thumb_path, image_path FROM products WHERE pid = ?",
          [pid]
        );
        if (!row) continue; 
        const qty = Number(cart[pid]);
        const price = Number(row.price);
        items.push({
          pid: row.pid,
          name: row.name,
          price,
          qty,
          subtotal: price * qty,
          thumb_path: row.thumb_path,
          image_path: row.image_path,
        });
      }
      const total = items.reduce((s, x) => s + x.subtotal, 0);
      res.json({ items, total });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    } finally {
      db.close();
    }
  });
  
  
  app.post("/api/cart/add", (req, res) => {
    const pid = Number(req.body?.pid);
    const qty = req.body?.qty == null ? 1 : Number(req.body.qty);
  
    if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: "invalid pid" });
    if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: "invalid qty" });
  
    const cart = getSessionCart(req);
    cart[pid] = (cart[pid] || 0) + qty;
  
    res.json({ ok: true, cart });
  });
  app.post("/api/cart/set", (req, res) => {
    const pid = Number(req.body?.pid);
    const qty = Number(req.body?.qty);
  
    if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: "invalid pid" });
    if (!Number.isInteger(qty) || qty < 0) return res.status(400).json({ error: "invalid qty" });
  
    const cart = getSessionCart(req);
    if (qty === 0) delete cart[pid];
    else cart[pid] = qty;
  
    res.json({ ok: true, cart });
  });
  

  app.post("/api/cart/clear", (req, res) => {
    req.session.cart = {};
    res.json({ ok: true });
  });

  app.post("/api/checkout/create-order", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Please login before checkout" });
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
      return res.status(500).json({ error: "PayPal credentials are not configured" });
    }
    if (!PAYPAL_MERCHANT_EMAIL) {
      return res.status(500).json({ error: "PayPal merchant email is not configured" });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: "Cart is empty" });

    const db = openDb();
    try {
      await ensureOrdersSchema(db);

      const normalized = [];
      for (const it of items) {
        const pid = Number(it?.pid);
        const qty = Number(it?.qty);
        if (!Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: "invalid pid" });
        if (!Number.isInteger(qty) || qty <= 0) return res.status(400).json({ error: "invalid qty" });

        const row = await dbGet(db, "SELECT pid, name, price FROM products WHERE pid = ?", [pid]);
        if (!row) return res.status(400).json({ error: `pid not found: ${pid}` });

        normalized.push({
          pid: row.pid,
          name: row.name,
          qty,
          unitPrice: Number(row.price),
          subtotal: Number(row.price) * qty,
        });
      }

      const total = normalized.reduce((sum, x) => sum + x.subtotal, 0);
      const salt = crypto.randomBytes(16).toString("hex");
      const digest = buildOrderDigest({
        currency: PAYPAL_CURRENCY,
        merchantEmail: PAYPAL_MERCHANT_EMAIL,
        salt,
        items: normalized,
        total,
      });

      const userEmail = String(req.session.userEmail || "");
      const address = "PAYPAL";

      const ins = await dbRun(
        db,
        "INSERT INTO orders (customer_name, customer_email, address, total, user_email, currency, merchant_email, salt, digest, payment_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [userEmail || "Member", userEmail || null, address, total, userEmail || null, PAYPAL_CURRENCY, PAYPAL_MERCHANT_EMAIL, salt, digest, "CREATED"]
      );
      const oid = ins.lastID;

      for (const x of normalized) {
        await dbRun(
          db,
          "INSERT INTO order_items (oid, pid, name, price, qty, subtotal) VALUES (?, ?, ?, ?, ?, ?)",
          [oid, x.pid, x.name, x.unitPrice, x.qty, x.subtotal]
        );
      }

      const basicToken = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
      const tokenRes = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          "Authorization": `Basic ${basicToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        return res.status(500).json({ error: "Failed to get PayPal access token" });
      }

      const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokenData.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            amount: {
              currency_code: PAYPAL_CURRENCY,
              value: total.toFixed(2),
              breakdown: { item_total: { currency_code: PAYPAL_CURRENCY, value: total.toFixed(2) } },
            },
            items: normalized.map((x) => ({
              name: x.name,
              sku: String(x.pid),
              quantity: String(x.qty),
              unit_amount: { currency_code: PAYPAL_CURRENCY, value: x.unitPrice.toFixed(2) },
            })),
          }],
          application_context: { return_url: PAYPAL_RETURN_URL, cancel_url: PAYPAL_CANCEL_URL },
        }),
      });

      const orderData = await orderRes.json();
      if (!orderRes.ok) return res.status(500).json({ error: orderData?.message || "Failed to create PayPal order" });

      const approveUrl = (orderData.links || []).find((x) => x.rel === "approve")?.href;
      if (!approveUrl) return res.status(500).json({ error: "PayPal approve URL not found" });

      await dbRun(db, "UPDATE orders SET paypal_order_id = ? WHERE oid = ?", [orderData.id, oid]);

      res.json({ ok: true, oid, digest, orderId: orderData.id, approveUrl });
    } catch (e) {
      console.error("Create checkout order error:", e);
      res.status(500).json({ error: "Failed to create checkout order" });
    } finally {
      db.close();
    }
  });

  app.post("/api/paypal/capture", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: "Unauthorized" });
    const orderId = String(req.body?.orderId || req.query?.orderId || req.query?.token || "");
    if (!orderId) return res.status(400).json({ error: "orderId is required" });

    const db = openDb();
    try {
      await ensureOrdersSchema(db);
      const row = await dbGet(db, "SELECT oid, payment_status FROM orders WHERE paypal_order_id = ?", [orderId]);
      if (!row) return res.status(404).json({ error: "order not found" });
      if (row.payment_status === "COMPLETED") return res.json({ ok: true });

      const captureData = await paypalJson("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {});
      const cap = captureData?.purchase_units?.[0]?.payments?.captures?.[0];
      const captureId = cap?.id || null;
      await dbRun(db, "UPDATE orders SET payment_status = ?, capture_id = COALESCE(capture_id, ?) WHERE oid = ?", ["CAPTURED", captureId, row.oid]);

      res.json({ ok: true, captureId });
    } catch (e) {
      console.error("PayPal capture error:", e);
      res.status(500).json({ error: "Failed to capture PayPal order" });
    } finally {
      db.close();
    }
  });

  app.post("/api/paypal/webhook", async (req, res) => {
    const proto = req.headers["x-forwarded-proto"];
    if (process.env.NODE_ENV === "production" && proto !== "https" && !req.secure) {
      return res.status(400).send("HTTPS required");
    }

    let verified = false;
    try {
      verified = await verifyPayPalWebhookSignature(req);
    } catch (e) {
      console.error("PayPal webhook verify error:", e);
      return res.status(500).send("Webhook verification failed");
    }

    if (!verified) return res.status(400).send("Invalid signature");

    const eventId = String(req.body?.id || "");
    const eventType = String(req.body?.event_type || "");
    const resource = req.body?.resource || {};

    const paypalOrderId =
      resource?.supplementary_data?.related_ids?.order_id ||
      resource?.id ||
      "";

    const captureId = resource?.id || null;

    if (!eventId || !paypalOrderId) return res.status(200).json({ ok: true });

    const db = openDb();
    try {
      await ensureOrdersSchema(db);

      const done = await dbGet(db, "SELECT event_id FROM paypal_events WHERE event_id = ?", [eventId]);
      if (done) return res.json({ ok: true });

      const orderRow = await dbGet(
        db,
        "SELECT oid, digest, salt, merchant_email, currency, payment_status FROM orders WHERE paypal_order_id = ?",
        [paypalOrderId]
      );

      const ppOrder = await paypalJson("GET", `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`);
      const pu = ppOrder?.purchase_units?.[0];
      const currency = String(pu?.amount?.currency_code || orderRow?.currency || PAYPAL_CURRENCY);
      const ppItems = Array.isArray(pu?.items) ? pu.items : [];

      const normalized = [];
      for (const it of ppItems) {
        const pid = Number(it?.sku);
        const qty = Number(it?.quantity);
        const unitPrice = Number(it?.unit_amount?.value);
        if (!Number.isInteger(pid) || pid <= 0) continue;
        if (!Number.isInteger(qty) || qty <= 0) continue;
        if (!Number.isFinite(unitPrice) || unitPrice < 0) continue;
        normalized.push({ pid, qty, unitPrice });
      }

      const total = normalized.reduce((s, x) => s + x.unitPrice * x.qty, 0);

      let status = "IGNORED";
      if (orderRow && orderRow.salt && orderRow.digest) {
        const digest = buildOrderDigest({
          currency,
          merchantEmail: String(orderRow.merchant_email || PAYPAL_MERCHANT_EMAIL),
          salt: String(orderRow.salt),
          items: normalized,
          total,
        });

        if (digest === orderRow.digest) {
          status = "COMPLETED";
          await dbRun(
            db,
            "UPDATE orders SET payment_status = ?, capture_id = COALESCE(capture_id, ?), currency = ? WHERE oid = ?",
            ["COMPLETED", captureId, currency, orderRow.oid]
          );
        } else {
          status = "DIGEST_MISMATCH";
          await dbRun(db, "UPDATE orders SET payment_status = ? WHERE oid = ?", [status, orderRow.oid]);
        }
      }

      await dbRun(
        db,
        "INSERT INTO paypal_events (event_id, event_type, paypal_order_id, capture_id) VALUES (?, ?, ?, ?)",
        [eventId, eventType, paypalOrderId, captureId]
      );

      res.json({ ok: true, status });
    } catch (e) {
      console.error("PayPal webhook error:", e);
      res.status(500).json({ error: "Webhook processing failed" });
    } finally {
      db.close();
    }
  });

  app.get("/api/admin/sessions", isAdmin, async (req, res) => {
    const db = openDb();
    try {
      await ensureSessionsSchema(db);
      const rows = await dbAll(
        db,
        "SELECT sid, user_email, role, ip, user_agent, created_at, last_seen FROM user_sessions WHERE revoked_at IS NULL ORDER BY last_seen DESC"
      );
      res.json({ sessions: rows, currentSid: String(req.sessionID || "") });
    } catch (e) {
      res.status(500).json({ error: "Failed to load sessions" });
    } finally {
      db.close();
    }
  });

  app.post("/api/admin/sessions/:sid/revoke", isAdmin, async (req, res) => {
    const sid = String(req.params.sid || "");
    if (!sid) return res.status(400).json({ error: "sid is required" });

    try {
      await recordSessionLogoutBySid(sid);
      req.sessionStore?.destroy?.(sid, () => {});
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to revoke session" });
    }
  });

  app.get("/api/admin/orders", isAdmin, async (req, res) => {
    const db = openDb();
    try {
      await ensureOrdersSchema(db);
      const orders = await dbAll(
        db,
        "SELECT oid, created_at, customer_name, customer_email, total, user_email, currency, paypal_order_id, capture_id, payment_status FROM orders ORDER BY oid DESC LIMIT 50"
      );

      const result = [];
      for (const o of orders) {
        const items = await dbAll(
          db,
          "SELECT pid, name, price, qty, subtotal FROM order_items WHERE oid = ? ORDER BY itemid ASC",
          [o.oid]
        );
        result.push({ order: o, items });
      }

      res.json({ orders: result });
    } catch (e) {
      res.status(500).json({ error: "Failed to load orders" });
    } finally {
      db.close();
    }
  });

  app.get("/api/member/orders/recent", async (req, res) => {
    const userEmail = String(req.session.userEmail || "");
    if (!req.session.userId || !userEmail) return res.status(401).json({ error: "Unauthorized" });

    const db = openDb();
    try {
      await ensureOrdersSchema(db);
      const orders = await dbAll(
        db,
        "SELECT oid, created_at, total, currency, paypal_order_id, payment_status FROM orders WHERE user_email = ? ORDER BY oid DESC LIMIT 5",
        [userEmail]
      );

      const result = [];
      for (const o of orders) {
        const items = await dbAll(
          db,
          "SELECT pid, name, price, qty, subtotal FROM order_items WHERE oid = ? ORDER BY itemid ASC",
          [o.oid]
        );
        result.push({ order: o, items });
      }

      res.json({ orders: result });
    } catch (e) {
      res.status(500).json({ error: "Failed to load orders" });
    } finally {
      db.close();
    }
  });
