<template>
  <header class="site-header header-row">
    <div class="header-left">
      <RouterLink class="logo__link" to="/shop" aria-label="Go to homepage">Dummy Shop</RouterLink>
    </div>

    <div class="header-right">
      <slot name="right" />

      <!-- User Dropdown -->
      <div v-if="user" class="user-dropdown-container">
        <button @click="isUserDropdownOpen = !isUserDropdownOpen" class="user-avatar-btn">
          <div class="user-avatar">
            {{ user.email.charAt(0).toUpperCase() }}
          </div>
          <span class="user-email-text">{{ user.email }}</span>
          <span class="dropdown-arrow">▼</span>
        </button>
        
        <div v-if="isUserDropdownOpen" class="user-dropdown-menu">
          <RouterLink to="/change-password" @click="isUserDropdownOpen = false" class="dropdown-item">
            Change Password
          </RouterLink>
          <template v-if="user.role === 'admin'">
            <RouterLink to="/admin/categories" @click="isUserDropdownOpen = false" class="dropdown-item">
              Admin Categories
            </RouterLink>
            <RouterLink to="/admin/products" @click="isUserDropdownOpen = false" class="dropdown-item">
              Admin Products
            </RouterLink>
          </template>
          <hr class="dropdown-divider" />
          <button @click="handleLogout" class="dropdown-item logout-btn">
            Logout
          </button>
        </div>
      </div>
      <RouterLink class="top-nav__link" to="/" v-else>Login</RouterLink>
      
      <div class="cart" aria-label="Shopping cart">
        <button class="cart__btn" type="button" @click="toggleCart">
          🛒 <span class="cart__count">{{ cartStore.count }}</span>
        </button>

        <div v-if="cartOpen" class="cart__panel" role="dialog" aria-label="Cart preview">
  <p class="cart__title">Cart</p>

  <ul class="cart__items" v-if="cartStore.items.length">
    <li class="cart__item" v-for="it in cartStore.items" :key="it.pid">
      <span>{{ it.name }} × {{ it.qty }}</span>
      <span>${{ Number(it.subtotal).toFixed(2) }}</span>
    </li>
  </ul>
  <p v-else style="padding:8px 0;opacity:.75;">Your cart is empty.</p>

  <div class="cart__summary">
    <span>Total</span>
    <strong>${{ Number(cartStore.total).toFixed(2) }}</strong>
  </div>

  <RouterLink class="cart__checkout" to="/cart" @click="cartOpen=false">
    Go to cart
  </RouterLink>
</div>
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref, onMounted } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { cartStore } from "../stores/cartStore";

const router = useRouter();
const cartOpen = ref(false);
const user = ref(null);
const isUserDropdownOpen = ref(false);

async function toggleCart() {
  cartOpen.value = !cartOpen.value;
  if (cartOpen.value) await cartStore.refresh();
}

async function loadUser() {
  try {
    const res = await fetch("/api/auth/me");
    const data = await res.json();
    user.value = data.user;
  } catch (e) {
    user.value = null;
  }
}

async function handleLogout() {
  try {
    const res = await fetch("/api/csrf-token");
    const { csrfToken } = await res.json();
    
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken }
    });
    user.value = null;
    isUserDropdownOpen.value = false;
    router.push("/");
  } catch (e) {
    console.error("Logout failed", e);
  }
}

onMounted(async () => {
  await loadUser();
  await cartStore.init?.();
  await cartStore.refresh?.();
});
</script>

<style scoped>

.header-row{
  display:flex !important;
  align-items:center;
  gap:12px;
}


.header-right{
  margin-left:auto;          
  display:flex;
  align-items:center;
  gap:12px;
}

:deep(.back-link){
  text-decoration:none;
  padding:8px 14px;
  border:1px solid #ddd;
  border-radius:999px;
  font-weight:600;
  white-space:nowrap;
}


.cart{ position:relative; }
.cart__panel{
  position:absolute;
  right:0;
  top:calc(100% + 10px);
  z-index:50;
}
</style>