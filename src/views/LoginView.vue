<template>
  <main class="content login-container">
    <div class="login-card">
      <h1>Login</h1>
      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label for="email">Email</label>
          <input 
            type="email" 
            id="email" 
            v-model.trim="email" 
            required 
            placeholder="admin@example.com"
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
          />
        </div>

        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? 'Logging in...' : 'Login' }}
        </button>

        <p v-if="error" class="error-msg">{{ error }}</p>

        <div class="login-footer">
          <p>Don't have an account?</p>
          <RouterLink to="/register" class="register-link">Register Now</RouterLink>
        </div>
      </form>
    </div>
  </main>
</template>

<script setup>
import { ref } from "vue";
import { useRouter, RouterLink } from "vue-router";

const email = ref("");
const password = ref("");
const loading = ref(false);
const error = ref("");
const router = useRouter();

async function getCsrfToken() {
  const res = await fetch("/api/csrf-token");
  const { csrfToken } = await res.json();
  return csrfToken;
}

async function handleLogin() {
  loading.value = true;
  error.value = "";
  
  try {
    const token = await getCsrfToken();
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token
      },
      body: JSON.stringify({
        email: email.value,
        password: password.value
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");

    // 根据角色进行重定向
    if (data.user && data.user.role === "admin") {
      router.push("/admin/categories");
    } else {
      router.push("/shop");
    }
  } catch (e) {
    error.value = e.message;
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