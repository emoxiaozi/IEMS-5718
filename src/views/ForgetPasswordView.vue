<template>
  <main class="content login-container">
    <div class="login-card">
      <h1>Forgot Password</h1>

      <form @submit.prevent="submit" class="login-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            id="email"
            type="email"
            v-model.trim="email"
            required
            placeholder="user@example.com"
          />
        </div>

        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? "Sending..." : "Send reset link" }}
        </button>

        <p v-if="error" class="error-msg">{{ error }}</p>
        <p v-if="message" class="success-msg">{{ message }}</p>

        <div class="login-footer">
          <RouterLink to="/" class="register-link">Back to Login</RouterLink>
        </div>
      </form>
    </div>
  </main>
</template>

<script setup>
import { ref } from "vue";
import { RouterLink } from "vue-router";

const email = ref("");
const loading = ref(false);
const error = ref("");
const message = ref("");

async function getCsrfToken() {
  const res = await fetch("/api/csrf-token");
  const { csrfToken } = await res.json();
  return csrfToken;
}

async function submit() {
  loading.value = true;
  error.value = "";
  message.value = "";

  try {
    const token = await getCsrfToken();
    const res = await fetch("/api/auth/request-password-reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
      body: JSON.stringify({ email: email.value }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");

    message.value = "If the email exists, a password reset link has been sent.";
  } catch (e) {
    error.value = e?.message || "Request failed";
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
  max-width: 440px;
  padding: 2rem;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  border: 1px solid #eee;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  margin-top: 1.25rem;
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
  margin: 0;
}
.success-msg {
  color: #2e7d32;
  font-size: 0.9rem;
  text-align: center;
  margin: 0;
}
.login-footer {
  margin-top: 0.75rem;
  text-align: center;
}
.register-link {
  display: inline-block;
  color: #111;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
</style>