<template>
  <!-- 引入全局样式，确保头像下拉框正常显示 -->
  <link rel="stylesheet" href="/css/styles.css" />

  <!-- 全局导航栏组件：包含 Logo、用户头像、下拉菜单和购物车 -->
  <CartHeader>
    <template #right>
      <RouterLink to="/shop" class="back-link">← Back to Shop</RouterLink>
    </template>
  </CartHeader>

  <main class="content change-pw-container">
    <div class="change-pw-card">
      <h1>Change Password</h1>
      <form @submit.prevent="handleChangePassword" class="change-pw-form">
        <div class="form-group">
          <label for="currentPassword">Current Password</label>
          <input 
            type="password" 
            id="currentPassword" 
            v-model="currentPassword" 
            required 
          />
        </div>
        
        <div class="form-group">
          <label for="newPassword">New Password</label>
          <input 
            type="password" 
            id="newPassword" 
            v-model="newPassword" 
            required 
            minlength="6"
          />
        </div>

        <div class="form-group">
          <label for="confirmNewPassword">Confirm New Password</label>
          <input 
            type="password" 
            id="confirmNewPassword" 
            v-model="confirmNewPassword" 
            required 
          />
        </div>

        <button type="submit" class="change-btn" :disabled="loading">
          {{ loading ? 'Updating...' : 'Update Password' }}
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
import CartHeader from "../components/CartHeader.vue";

const currentPassword = ref("");
const newPassword = ref("");
const confirmNewPassword = ref("");
const loading = ref(false);
const error = ref("");
const message = ref("");
const router = useRouter();

async function getCsrfToken() {
  const res = await fetch("/api/csrf-token");
  const { csrfToken } = await res.json();
  return csrfToken;
}

async function handleChangePassword() {
  if (newPassword.value !== confirmNewPassword.value) {
    error.value = "New passwords do not match";
    return;
  }

  loading.value = true;
  error.value = "";
  message.value = "";
  
  try {
    const token = await getCsrfToken();
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token
      },
      body: JSON.stringify({
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
        confirmNewPassword: confirmNewPassword.value
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Update failed");

    message.value = "Password updated successfully. Logging out...";
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
.change-pw-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 70vh;
}
.change-pw-card {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
.form-group {
  margin-bottom: 1rem;
}
.form-group label {
  display: block;
  margin-bottom: 0.5rem;
}
.form-group input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.change-btn {
  width: 100%;
  padding: 0.75rem;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.change-btn:disabled {
  background: #95a5a6;
}
.error-msg {
  color: #e74c3c;
  margin-top: 1rem;
  font-size: 0.9rem;
}
.success-msg {
  color: #27ae60;
  margin-top: 1rem;
  font-size: 0.9rem;
}
</style>