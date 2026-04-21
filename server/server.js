const path = require("path");
const fs = require("fs");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const sharp = require("sharp");
const nodemailer = require("nodemailer");

const crypto = require("crypto");
const bcrypt = require("bcryptjs");

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

app.use(
  session({
    name: "iems5718_session_id",
    secret: "iems5718-secure-session-secret-2024", 
    resave: false,
    saveUninitialized: false, // 只有在有数据时才保存，提高安全性
    cookie: {
      httpOnly: true,
      secure: false, // 在本地开发环境下（HTTP）需设置为 false，生产环境（HTTPS）应为 true
      sameSite: "lax",
      maxAge: 2 * 24 * 60 * 60 * 1000 // 2天有效期，满足 0 < 过期时间 < 3天
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

  // 对于修改数据的请求进行校验
  if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
    const clientToken = req.headers["x-csrf-token"] || req.body?._csrf;
    if (!clientToken || clientToken !== req.session.csrfToken) {
      return res.status(403).json({ error: "Invalid CSRF token" });
    }
  }
  next();
}

app.use(csrfTokenMiddleware);

// 获取当前 Token 的接口
app.get("/api/csrf-token", (req, res) => {
  res.json({ csrfToken: req.session.csrfToken });
});

// --- Auth APIs ---

// Admin Authorization Middleware
function isAdmin(req, res, next) {
  if (req.session.userId && req.session.role === "admin") {
    return next();
  }
  res.status(403).json({ error: "Access denied. Admin privileges required." });
}

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const db = openDb();
  try {
    const user = await dbGet(db, "SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()]);
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid email or password" });

    // 防止 Session Fixation：登录成功后重新生成 session ID
    const oldSession = { ...req.session };
    req.session.regenerate((err) => {
      if (err) {
        console.error("Session regeneration error:", err);
        return res.status(500).json({ error: "Login failed due to session error" });
      }
      
      // 重新填充用户信息
      req.session.userId = user.userid;
      req.session.userEmail = user.email;
      req.session.role = user.role;
      
      // 保持 CSRF Token (如果之前已生成)
      if (oldSession.csrfToken) {
        req.session.csrfToken = oldSession.csrfToken;
      }

      res.json({ ok: true, user: { email: user.email, role: user.role } });
    });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "An internal server error occurred. Please try again later." });
  } finally {
    db.close();
  }
});

app.post("/api/auth/register", async (req, res) => {
  const { email, password, confirmPassword, code, adminKey } = req.body;

  // 1. 基本非空校验
  if (!email || !password || !confirmPassword || !code) {
    return res.status(400).json({ error: "All fields are required" });
  }

  // 预设的管理员注册秘钥
  const ADMIN_REGISTRATION_SECRET = "iems5718-admin-secret";
  const role = adminKey === ADMIN_REGISTRATION_SECRET ? "admin" : "user";

  // 2. 验证码校验
  const sessionCode = req.session.emailCode;
  if (!sessionCode || sessionCode.email !== email.trim().toLowerCase() || sessionCode.code !== code) {
    return res.status(400).json({ error: "Invalid verification code" });
  }
  if (Date.now() > sessionCode.expires) {
    return res.status(400).json({ error: "Verification code expired" });
  }

  // 3. 邮箱格式校验
  if (!validateEmail(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  // 3. 密码一致性校验 (后端验证)
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "Passwords do not match" });
  }

  // 4. 密码强度校验 (简单示例：至少6位)
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long" });
  }

  const db = openDb();
  try {
    // 5. 唯一性检查
    const existing = await dbGet(db, "SELECT userid FROM users WHERE email = ?", [email.trim().toLowerCase()]);
    if (existing) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // 6. 加盐哈希并存储
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
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.clearCookie("iems5718_session_id"); // 清除浏览器中的 Cookie
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
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destruction error:", err);
        return res.status(500).json({ error: "Password changed but logout failed" });
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
    user: "2210530985@qq.com", // 需替换为你的QQ邮箱
    pass: "fgfpwxqfbpgfeaii"         // 需替换为你的QQ邮箱授权码 (不是登录密码)
  }
});

// --- Email Verification Code ---

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
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://localhost:3000 http://localhost:5173 ws://localhost:5173; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; upgrade-insecure-requests");
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

  const db = openDb();
  try {
    const rows = await dbAll(
      db,
      "SELECT pid, catid, name, price, description, image_path, thumb_path FROM products WHERE catid = ? ORDER BY pid ASC",
      [catid]
    );
    res.json(rows);
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

    const verified = await verifyPayPalWebhookSignature(req);
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
