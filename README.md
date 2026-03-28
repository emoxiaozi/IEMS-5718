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

## 📦 Deployment & Execution

1.  **Install Dependencies**: `npm install`
2.  **Build Frontend**: `npm run build`
3.  **Start Backend**: `node server/server.js` (Recommended to use PM2 for production)
4.  **Access URL**: `http://localhost:3000` (or your GCP VM External IP)

---
*Developed for IEMS 5718 Course Assignment.*