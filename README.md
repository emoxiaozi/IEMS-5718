# Dummy Shop - IEMS 5718 Assignment

This is a simple e-commerce system built with Vue 3, Express, and SQLite, featuring a comprehensive security hardening and authentication system.

## 🚀 Testing Accounts

For ease of verification, the following test accounts are pre-configured in the system:

| Role | Email | Password | Permissions Description |
| :--- | :--- | :--- | :--- |
| **Administrator** | `admin@example.com` | `password123` | Full access to Admin Panel, category/product management, and order viewing. |
| **Regular User** | `user@example.com` | `password123` | Shopping access, cart management, and personal password modification. |

---

## 🛡️ Implemented Security Features

1.  **XSS Protection**:
    *   Strict **Content Security Policy (CSP)** deployed globally.
    *   Server-side sanitization and escaping of all user-generated content (e.g., product names, descriptions).
2.  **SQL Injection Prevention**:
    *   All database queries utilize **Parameterized SQL (Prepared Statements)**. String concatenation is strictly prohibited.
3.  **CSRF Protection**:
    *   Implemented a custom **`X-CSRF-Token`** validation mechanism for all state-changing requests (POST/PUT/DELETE).
    *   Session cookies configured with the **`SameSite: Lax`** attribute.
4.  **Session & Cookie Security**:
    *   Cookies are set with the **`HttpOnly`** flag to prevent access via client-side scripts.
    *   **Session Fixation Prevention**: New session IDs are generated immediately upon successful login.
    *   Cookie expiration set to 2 days (fulfilling the requirement of $0 < \text{duration} < 3$ days).
5.  **Password Security**:
    *   Passwords are stored using **`bcryptjs`** for salting and hashing. No plain-text passwords are saved in the database.
6.  **Role-Based Access Control (RBAC)**:
    *   Backend API protected by `isAdmin` middleware. Frontend secured with global navigation guards.
    *   Unauthorized users are blocked from accessing `/admin/*` routes and redirected with error messages.

---

## 🛠️ Feature Highlights

*   **Email Verification**: Integrated with QQ Mail SMTP service for real-time 6-digit verification codes during registration.
*   **Secure Password Change**: Authenticated users can change their passwords, triggering an automatic logout for security.
*   **User Avatar & Dropdown**: A unified global navigation header featuring user avatars, email display, and quick-access dropdown menus.
*   **Admin Panel**: Full CRUD operations for products and categories, including automatic thumbnail generation for image uploads.

---

## ✅ Quick Start (Local Dev)

1. **Install dependencies**
   - Frontend: `npm install`
   - Backend: `cd server && npm install`

2. **Start backend API (port 3000)**
   - `cd server && npm start`
   - On first run, SQLite DB will be created at `server/db/app.db` and seeded from `server/db/init.sql`.

3. **Start frontend dev server (port 5173)**
   - In project root: `npm run dev`

4. **Open in browser**: `http://localhost:5173`

---

## ⚙️ Configuration

### PayPal (Sandbox)
Set these environment variables before starting the backend (recommended for deployment):

- `PAYPAL_BASE` (default: `https://api-m.sandbox.paypal.com`)
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_CURRENCY` (default: `HKD`)
- `PAYPAL_MERCHANT_EMAIL`
- `PAYPAL_WEBHOOK_ID`
- `PAYPAL_RETURN_URL`
- `PAYPAL_CANCEL_URL`

### Email (Verification Codes)
Email verification uses QQ Mail SMTP. Update the SMTP credentials in `server/server.js` (Nodemailer transporter config) to match your sender mailbox.

---

## 🚀 Production / Deployment

- Build frontend: `npm run build` (outputs `dist/`)
- Serve `dist/` with a static server (recommended: Nginx), and proxy the backend:
  - `/api` -> `http://127.0.0.1:3000`
  - `/uploads` -> `http://127.0.0.1:3000`
- Start backend: `cd server && npm start`

---

## 📦 Packaging (Submission)

- Exclude generated folders/files: `node_modules/`, `server/node_modules/`, `server/db/app.db`, `dist/` (unless your submission requires built assets).
- Keep source and configs: `src/`, `server/`, `package*.json`, `vite.config.js`.

Example (macOS) zip command:

```bash
cd /Users/nibaba/Desktop/assignment/iems-5718-assignment
zip -r iems5718-assignment.zip . \
  -x "node_modules/*" \
  -x "server/node_modules/*" \
  -x "server/db/app.db" \
  -x "dist/*" \
  -x ".git/*"
```

---
*Developed for IEMS 5718 Course Assignment.*