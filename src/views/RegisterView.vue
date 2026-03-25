<template>
  <header class="site-header">

  </header>

  <main class="content register-container">
    <div class="register-card">
      <h1>Register</h1>
      <form @submit.prevent="handleRegister" class="register-form">
        <div class="form-group">
          <label for="email">Email</label>
          <div class="input-with-btn">
            <input 
              type="email" 
              id="email" 
              v-model.trim="email" 
              required 
              placeholder="your@email.com"
            />
            <button type="button" class="send-btn" @click="sendCode" :disabled="timer > 0 || !email">
              {{ timer > 0 ? `${timer}s` : 'Send' }}
            </button>
          </div>
        </div>

        <div class="form-group">
          <label for="code">Verification Code</label>
          <input 
            type="text" 
            id="code" 
            v-model.trim="code" 
            required 
            maxlength="6"
            placeholder="6-digit code"
          />
        </div>
        
        <div class="form-group">
          <label for="password">Password</label>
          <input 
            type="password" 
            id="password" 
            v-model="password" 
            required 
            minlength="6"
            placeholder="At least 6 characters"
          />
        </div>

        <div class="form-group">
          <label for="confirmPassword">Confirm Password</label>
          <input 
            type="password" 
            id="confirmPassword" 
            v-model="confirmPassword" 
            required 
            placeholder="Re-type your password"
          />
        </div>

        <div class="form-group">
          <label for="adminKey">Admin Key (Optional)</label>
          <input 
            type="password" 
            id="adminKey" 
            v-model="adminKey" 
            placeholder="Enter key to register as admin"
          />
        </div>

        <button type="submit" class="register-btn" :disabled="loading">
          {{ loading ? 'Registering...' : 'Register' }}
        </button>

        <p v-if="error" class="error-msg">{{ error }}</p>
        <p v-if="success" class="success-msg">{{ success }}</p>

        <p class="login-prompt">
          Already have an account? <RouterLink to="/">Login here</RouterLink>
        </p>
      </form>
    </div>
  </main>
</template>

<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";

const email = ref("");
const code = ref("");
const password = ref("");
const confirmPassword = ref("");
const adminKey = ref("");
const loading = ref(false);
const timer = ref(0);
const error = ref("");
const success = ref("");
const router = useRouter();

async function getCsrfToken() {
  const res = await fetch("/api/csrf-token");
  const { csrfToken } = await res.json();
  return csrfToken;
}

async function sendCode() {
  if (!email.value) return;
  error.value = "";
  
  try {
    const token = await getCsrfToken();
    const res = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token
      },
      body: JSON.stringify({ email: email.value })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to send code");

    success.value = "Verification code sent! Please check the server console.";
    
    // Start 60s countdown
    timer.value = 60;
    const interval = setInterval(() => {
      timer.value--;
      if (timer.value <= 0) clearInterval(interval);
    }, 1000);
  } catch (e) {
    error.value = e.message;
  }
}

async function handleRegister() {
  loading.value = true;
  error.value = "";
  success.value = "";
  
  // 1. 前端一致性验证
  if (password.value !== confirmPassword.value) {
    error.value = "Passwords do not match";
    loading.value = false;
    return;
  }

  try {
    const token = await getCsrfToken();
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token
      },
      body: JSON.stringify({
        email: email.value,
        password: password.value,
        confirmPassword: confirmPassword.value,
        code: code.value,
        adminKey: adminKey.value
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");

    success.value = "Account created! Redirecting to login...";
    setTimeout(() => {
      router.push("/");
    }, 2000);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.register-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 80vh;
}
.register-card {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  border: 1px solid #eee;
}
.register-form {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
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
.input-with-btn {
  display: flex;
  gap: 0.5rem;
}
.input-with-btn input {
  flex: 1;
}
.send-btn {
  padding: 0 1rem;
  background: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  font-size: 0.9rem;
  font-weight: 600;
}
.send-btn:disabled {
  background: #eee;
  cursor: not-allowed;
  color: #999;
}
.register-btn {
  padding: 0.75rem;
  background: #111;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.register-btn:disabled {
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
.login-prompt {
  text-align: center;
  font-size: 0.9rem;
  margin-top: 1rem;
}
.login-prompt a {
  color: #111;
  font-weight: 600;
  text-decoration: underline;
}
</style>