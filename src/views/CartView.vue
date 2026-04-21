<template>
  <link rel="stylesheet" href="/css/styles.css" />

  <a class="skip-link" href="#main">Skip to main content</a>

  <CartHeader>
    <template #right>
      <RouterLink class="back-link" to="/shop">← Back</RouterLink>
    </template>
  </CartHeader>

  <main id="main" class="content">
    <h1 class="title">Cart</h1>

    <p v-if="loading">Loading...</p>
    <p v-if="error" style="color: #b00;">{{ error }}</p>

    <div v-if="!loading && !cartItems.length" style="margin-top: 12px;">
      Your cart is empty.
    </div>

    <form v-if="cartItems.length" style="margin-top: 12px;" @submit.prevent="handleCheckout">
      <ul class="cart-page-list">
        <li class="cart-page-row" v-for="it in cartItems" :key="it.pid">
          <div class="cart-page-left">
            <img
              v-if="it.thumb_path || it.image_path"
              class="cart-page-thumb"
              :src="it.thumb_path || it.image_path"
              :alt="it.name"
            />
            <div>
              <div class="cart-page-name">{{ it.name || ("PID " + it.pid) }}</div>
              <div class="cart-page-price">${{ formatPrice(it.price) }}</div>
            </div>
          </div>

          <div class="cart-page-right">
            <div class="qty">
              <button type="button" @click="dec(it.pid)">-</button>
              <input
                type="number"
                min="0"
                step="1"
                inputmode="numeric"
                pattern="[0-9]*"
                :value="it.qty"
                @input="onQtyInput(it.pid, $event.target.value)"
              />
              <button type="button" @click="inc(it.pid)">+</button>
            </div>

            <div class="cart-page-subtotal">
              ${{ formatPrice(it.subtotal) }}
            </div>

            <button class="cart-page-remove" type="button" @click="remove(it.pid)">
              Remove
            </button>
          </div>
        </li>
      </ul>

      <div class="cart-page-summary">
        <div>Total</div>
        <strong>${{ formatPrice(total) }}</strong>
      </div>

      <div style="margin-top: 12px; display:flex; gap: 12px; justify-content:center;">
        <button type="button" class="add-to-cart" @click="clearAll">
          Clear cart
        </button>
        <button type="submit" class="add-to-cart" :disabled="checkoutLoading">
          {{ checkoutLoading ? "Creating PayPal Order..." : "Checkout with PayPal" }}
        </button>
      </div>
    </form>
  </main>

  <footer class="site-footer"></footer>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { cartStore } from "../stores/cartStore";
import { setCartQty, removeFromCart, clearCart } from "../api/cart";
import CartHeader from "../components/CartHeader.vue";

const loading = ref(false);
const checkoutLoading = ref(false);
const error = ref("");

const cartItems = ref([]); // 展示用（带 name/price/subtotal）
const total = computed(() => cartItems.value.reduce((s, it) => s + (Number(it.subtotal) || 0), 0));

function formatPrice(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

async function fetchProduct(pid) {
  const res = await fetch(`/api/products/${encodeURIComponent(pid)}`);
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function refreshDetails() {
  loading.value = true;
  error.value = "";
  try {
    await cartStore.refresh(); // 从 localStorage 重读
    const entries = Object.entries(cartStore.map); // [ [pid, qty], ... ]

    const results = [];
    for (const [pidStr, qtyStr] of entries) {
      const pid = Number(pidStr);
      const qty = Number(qtyStr);
      try {
        const p = await fetchProduct(pid);
        const price = Number(p.price) || 0;
        results.push({
          pid,
          qty,
          name: p.name || "",
          price,
          image_path: p.image_path || "",
          thumb_path: p.thumb_path || "",
          subtotal: price * qty,
        });
      } catch (e) {
        // 商品被删了/404 也能显示，但用 pid 占位
        results.push({
          pid,
          qty,
          name: "",
          price: 0,
          image_path: "",
          thumb_path: "",
          subtotal: 0,
        });
      }
    }

    cartItems.value = results;

    // 同步 store.items / store.total（可选，但对 Header 下拉预览有用）
    cartStore.items = results;
    cartStore.total = total.value;
  } catch (e) {
    error.value = e?.message || "Failed to load cart";
  } finally {
    loading.value = false;
  }
}

async function inc(pid) {
  const it = cartItems.value.find((x) => x.pid === pid);
  const next = (it?.qty || 0) + 1;
  await setCartQty(pid, next);
  await refreshDetails();
}

async function dec(pid) {
  const it = cartItems.value.find((x) => x.pid === pid);
  const next = (it?.qty || 0) - 1;
  await setCartQty(pid, next);
  await refreshDetails();
}

async function onQtyInput(pid, v) {
  const qty = Math.max(0, Math.trunc(Number(v) || 0));
  await setCartQty(pid, qty);
  await refreshDetails();
}

async function remove(pid) {
  await removeFromCart(pid);
  await refreshDetails();
}

async function clearAll() {
  await clearCart();
  await refreshDetails();
}

async function getCsrfToken() {
  const res = await fetch("/api/csrf-token");
  const data = await res.json();
  return data.csrfToken;
}

async function handleCheckout() {
  if (!cartItems.value.length) return;
  checkoutLoading.value = true;
  error.value = "";
  try {
    const token = await getCsrfToken();
    const items = cartItems.value.map((it) => ({ pid: it.pid, qty: it.qty }));
    const res = await fetch("/api/checkout/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token,
      },
      body: JSON.stringify({ items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create PayPal order");
    if (!data.approveUrl) throw new Error("Missing PayPal approval URL");

    await clearCart();
    window.location.href = data.approveUrl;
  } catch (e) {
    error.value = e?.message || "Checkout failed";
  } finally {
    checkoutLoading.value = false;
  }
}

onMounted(async () => {
  await refreshDetails();
});
</script>

<style scoped>
.cart-page-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.cart-page-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px solid #eee;
}
.cart-page-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.cart-page-thumb {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid #eee;
}
.cart-page-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.qty {
  display: flex;
  align-items: center;
  gap: 8px;
}
.qty input {
  width: 64px;
}
.cart-page-subtotal {
  min-width: 90px;
  text-align: right;
  font-weight: 700;
}
.cart-page-remove {
  border: 1px solid #ddd;
  border-radius: 10px;
  padding: 8px 10px;
  background: transparent;
  cursor: pointer;
}
.cart-page-summary {
  display: flex;
  justify-content: space-between;
  padding-top: 12px;
  font-size: 18px;
}
</style>