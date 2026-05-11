<template>
  <main class="content login-container">
    <div class="login-card">
      <h1>Reset Password</h1>

      <p v-if="!token" class="error-msg" style="margin-top: 0.75rem;">
        Missing token. Please use the link from your email.
      </p>

      <form v-else @submit.prevent="submit" class="login-form">
        <div class="form-group">
          <label for="newPassword">New Password</label>
          <input
            id="newPassword"
            type="password"
            v-model="newPassword"
            minlength="6"
            required
          />
        </div>

        <div class="form-group">
          <label for="confirmNewPassword">Confirm New Password</label>
          <input
            id="confirmNewPassword"
            type="password"
            v-model="confirmNewPassword"
            minlength="6"
            required
          />
        </div>

        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? "Resetting..." : "Reset password" }}
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
import { computed, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";

const route = useRoute();

const token = computed(() => String(route.query.token || "").trim());

const newPassword = ref("");
const confirmNewPassword = ref("");
const loading = ref(false);
const error = ref("");
const message = ref("");

async function getCsrfToken() {
  const res = await fetch("/api/csrf-token");
  const { csrfToken } = await res.json();
  return csrfToken;
}

async function submit() {
  if (newPassword.value !== confirmNewPassword.value) {
    error.value = "Passwords do not match";
    return;
  }

  loading.value = true;
  error.value = "";
  message.value = "";

  try {
    const csrf = await getCsrfToken();
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
      },
      body: JSON.stringify({
        token: token.value,
        newPassword: newPassword.value,
        confirmNewPassword: confirmNewPassword.value,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Reset failed");

    message.value = "Password reset successfully. Please login again.";
    newPassword.value = "";
    confirmNewPassword.value = "";
  } catch (e) {
    error.value = e?.message || "Reset failed";
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