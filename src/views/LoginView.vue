<template>
  <main class="content login-container">
    <div class="login-card">
      <h1>Login</h1>

      <form v-if="step === 'password'" @submit.prevent="startLogin" class="login-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            type="email"
            id="email"
            v-model.trim="email"
            required
            placeholder="admin@example.com"
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            type="password"
            id="password"
            v-model="password"
            required
            placeholder="password123"
            autocomplete="current-password"
          />
        </div>

        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? 'Sending code...' : 'Continue' }}
        </button>

        <p v-if="error" class="error-msg">{{ error }}</p>
        <p v-if="message" class="success-msg">{{ message }}</p>

        <div class="login-footer">
          <p>Don't have an account?</p>
          <RouterLink to="/register" class="register-link">Register Now</RouterLink>

          <div style="margin-top: 10px;">
            <RouterLink to="/forgot-password" class="register-link">Forgot password?</RouterLink>
          </div>
        </div>
      </form>

      <form v-else @submit.prevent="verifyCode" class="login-form">
        <p class="success-msg" style="margin:0;">
          Enter the verification code sent to {{ email }}.
        </p>

        <div class="form-group">
          <label for="code">Verification code</label>
          <input
            id="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            v-model.trim="code"
            required
            placeholder="6-digit code"
          />
        </div>

        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? 'Verifying...' : 'Verify & Login' }}
        </button>

        <button type="button" class="login-btn" style="background:#fff; color:#111; border:1px solid #ddd;" :disabled="loading" @click="resendCode">
          Resend code
        </button>

        <button type="button" class="login-btn" style="background:#fff; color:#111; border:1px solid #ddd;" :disabled="loading" @click="backToPassword">
          Back
        </button>

        <p v-if="error" class="error-msg">{{ error }}</p>
        <p v-if="message" class="success-msg">{{ message }}</p>
      </form>
    </div>
  </main>
</template>

<script setup>
import { ref } from "vue";
import { useRouter, RouterLink } from "vue-router";

const step = ref("password");

const email = ref("");
const password = ref("");
const code = ref("");

const loading = ref(false);
const error = ref("");
const message = ref("");
const router = useRouter();

async function getCsrfToken() {
  const res = await fetch("/api/csrf-token");
  const { csrfToken } = await res.json();
  return csrfToken;
}

function backToPassword() {
  step.value = "password";
  code.value = "";
  message.value = "";
  error.value = "";
}

async function startLogin() {
  loading.value = true;
  error.value = "";
  message.value = "";

  try {
    const token = await getCsrfToken();
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
      body: JSON.stringify({
        email: email.value,
        password: password.value,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Login failed");

    if (data.requires2fa) {
      step.value = "code";
      message.value = data.message || "Verification code sent.";
      return;
    }

    if (data.user && data.user.role === "admin") {
      router.push("/admin/categories");
    } else {
      router.push("/shop");
    }
  } catch (e) {
    error.value = e?.message || "Login failed";
  } finally {
    loading.value = false;
  }
}

async function verifyCode() {
  loading.value = true;
  error.value = "";
  message.value = "";

  try {
    const csrf = await getCsrfToken();
    const res = await fetch("/api/auth/login/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({ code: code.value }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Verification failed");

    if (data.user && data.user.role === "admin") {
      router.push("/admin/categories");
    } else {
      router.push("/shop");
    }
  } catch (e) {
    error.value = e?.message || "Verification failed";
  } finally {
    loading.value = false;
  }
}

async function resendCode() {
  loading.value = true;
  error.value = "";
  message.value = "";

  try {
    const csrf = await getCsrfToken();
    const res = await fetch("/api/auth/login/resend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Resend failed");

    message.value = data.message || "Verification code resent.";
  } catch (e) {
    error.value = e?.message || "Resend failed";
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80vh;
}
.login-card {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  border: 1px solid #eee;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-top: 1.5rem;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.form-group label {
  font-weight: 600;
}
.form-group input {
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
}
.login-btn {
  padding: 0.75rem;
  background: #111;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.error-msg {
  color: #d32f2f;
  font-size: 0.9rem;
  text-align: center;
  margin-top: 0.5rem;
}

.success-msg {
  color: #2e7d32;
  font-size: 0.9rem;
  text-align: center;
  margin-top: 0.5rem;
}

.login-footer {
  margin-top: 1.5rem;
  text-align: center;
  border-top: 1px solid #eee;
  padding-top: 1rem;
}

.login-footer p {
  margin: 0;
  color: #666;
  font-size: 0.9rem;
}

.register-link {
  display: inline-block;
  margin-top: 0.5rem;
  color: #111;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
</style>