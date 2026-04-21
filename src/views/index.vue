    <template>
    
    <a class="skip-link" href="#main">Skip to main content</a>
<link rel="stylesheet" href="/css/styles.css" />
    <CartHeader />

    <div class="page-layout">

    <nav class="side-nav" aria-label="Category navigation" v-if="route.query.view !== 'orders'">
    <ul class="side-nav__list">
        <li v-for="c in categories" :key="c.catid">
        <button
            type="button"
            class="nav-link"
            :class="{ 'nav-link--active': c.catid === currentCatid }"
            @click="selectCategory(c.catid)"
        >
            {{ c.name }}
        </button>
        </li>
    </ul>
    </nav>

        <main id="main" class="content">

        <nav class="breadcrumb" aria-label="Breadcrumb">
            <ol class="breadcrumb__list">
            <li class="breadcrumb__item">
                <RouterLink to="/shop">Home</RouterLink>
            </li>
            <li class="breadcrumb__item" v-if="currentCategoryName" aria-current="page">
                {{ currentCategoryName }}
            </li>
            </ol>
        </nav>


        <section v-if="route.query.view === 'orders'">
          <h1 class="title">My Recent Orders</h1>
          <p v-if="paidMessage" style="margin-top: 0.75rem;">{{ paidMessage }}</p>
          <p v-if="ordersLoading" style="margin-top: 0.75rem;">Loading...</p>
          <p v-if="ordersError" style="margin-top: 0.75rem; color:#b00;">{{ ordersError }}</p>

          <div v-if="!ordersLoading && !ordersError && !myOrders.length" style="margin-top: 0.75rem;">
            No orders yet.
          </div>

          <div v-if="myOrders.length" style="margin-top: 0.75rem;">
            <div v-for="x in myOrders" :key="x.order.oid" style="border:1px solid #eee; border-radius:12px; padding:12px; margin-bottom:12px; background:#fff;">
              <div style="display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                <strong>Order #{{ x.order.oid }}</strong>
                <span style="opacity:.8;">{{ x.order.created_at }}</span>
              </div>
              <div style="margin-top:6px; display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                <span>Status: {{ x.order.payment_status }}</span>
                <span>Total: {{ x.order.currency }} {{ formatPrice(x.order.total) }}</span>
              </div>
              <ul style="margin:10px 0 0; padding-left:18px;">
                <li v-for="it in x.items" :key="it.pid + '-' + it.qty">
                  {{ it.name }} × {{ it.qty }} ({{ x.order.currency }} {{ formatPrice(it.price) }})
                </li>
              </ul>
            </div>
          </div>
        </section>

        <template v-else>
          <section class="current-category">
              <h1 class="title">{{ currentCategoryName || "All Products" }}</h1>
          </section>

          <section class="welcome" aria-labelledby="welcome-title" v-if="!currentCategoryName">
              <h2 id="welcome-title">Welcome</h2>
              <p>Select a category from the left to view products.</p>
          </section>


          <div class="categories">
              <section class="category" aria-labelledby="category-title" v-if="currentCategoryName">
              <h2 id="category-title">{{ currentCategoryName }}</h2>

              <ul class="product-list">
                  <li class="product-card" v-for="p in products" :key="p.pid">
                  <RouterLink class="product-thumb" :to="`/product/${p.pid}`">
          
                      <img :src="p.thumb_path || p.image_path" :alt="p.name" />
                  </RouterLink>

                  <h3 class="product-name">
                      <RouterLink :to="`/product/${p.pid}`">{{ p.name }}</RouterLink>
                  </h3>

                  <p class="product-price">${{ formatPrice(p.price) }}</p>

                 <button type="button" class="add-to-cart" @click="addToCartHandler(p.pid)">addToCart</button>
                  </li>
              </ul>
              </section>
          </div>

          <p v-if="loading" style="margin-top: 1rem;">Loading...</p>
          <p v-if="error" style="margin-top: 1rem;">{{ error }}</p>
        </template>
        </main>
    </div>

    <footer class="site-footer"></footer>
    </template>

    <script setup>
    import CartHeader from "../components/CartHeader.vue";
    import { computed, onMounted, ref, watch } from "vue";
    import { RouterLink,useRouter,useRoute } from "vue-router";
    import { cartStore } from "../stores/cartStore";
    const route = useRoute();
    const router = useRouter();
    const categories = ref([]);
    const products = ref([]);
    const myOrders = ref([]);
    const ordersLoading = ref(false);
    const ordersError = ref("");
    const paidMessage = ref("");
    const currentCatid = ref(route.query.catid ? Number(route.query.catid) : null);
 
    const loading = ref(false);
    const error = ref("");

    const currentCategoryName = computed(() => {
    const c = categories.value.find((x) => x.catid === currentCatid.value);
    return c?.name || "";
    });

    function formatPrice(v) {
    const n = Number(v);
    if (Number.isNaN(n)) return v;
    return n.toFixed(2);
    }

    async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
    }

    async function loadCategories() {
    categories.value = await fetchJSON("/api/categories");

    if (categories.value.length) {

        if (!currentCatid.value) {
        currentCatid.value = categories.value[0].catid;
        router.replace({ path: "/shop", query: { catid: currentCatid.value } });
        }
    }
    }

    async function loadProducts() {
    if (currentCatid.value == null) {
        products.value = [];
        return;
    }
    products.value = await fetchJSON(`/api/products?catid=${encodeURIComponent(currentCatid.value)}`);
    }

    async function selectCategory(catid) {
    currentCatid.value = catid;
    router.push({ path: "/shop", query: { catid } });

    loading.value = true;
    error.value = "";
    try {
        await loadProducts();
    } catch (e) {
        error.value = e?.message || "Failed to load products";
    } finally {
        loading.value = false;
    }
    }

    async function addToCartHandler(pid) {
  try {
   await cartStore.add(pid, 1);
  } catch (e) {
    alert(e.message);
  }
}

async function getCsrfToken() {
  const res = await fetch("/api/csrf-token");
  const data = await res.json();
  return data.csrfToken;
}

async function captureIfNeeded() {
  const token = String(route.query.token || "");
  if (!token) return;

  try {
    const csrf = await getCsrfToken();
    const res = await fetch(`/api/paypal/capture?orderId=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "X-CSRF-Token": csrf },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Capture failed");

    paidMessage.value = "Payment completed.";
    const next = { ...route.query };
    delete next.token;
    delete next.PayerID;
    delete next.payerId;
    next.paid = "1";
    router.replace({ path: "/shop", query: next });
  } catch (e) {
    paidMessage.value = e?.message || "Payment capture failed.";
  }
}

async function loadMyOrders() {
  ordersLoading.value = true;
  ordersError.value = "";
  try {
    const data = await fetchJSON("/api/member/orders/recent");
    myOrders.value = Array.isArray(data.orders) ? data.orders : [];
  } catch (e) {
    ordersError.value = e?.message || "Failed to load orders";
    myOrders.value = [];
  } finally {
    ordersLoading.value = false;
  }
}

watch(
  () => route.query.view,
  async (v) => {
    if (v === "orders") await loadMyOrders();
  },
  { immediate: true }
);

watch(
  () => route.query.token,
  async () => {
    await captureIfNeeded();
  },
  { immediate: true }
);

onMounted(async () => {
  try { await cartStore.init(); } catch {}

  if (route.query.view === "orders") return;

  loading.value = true;
  error.value = "";
  try {
    await loadCategories();
    await loadProducts();
  } catch (e) {
    error.value = e?.message || "Failed to load data";
  } finally {
    loading.value = false;
  }
});
    </script>
    <style scoped>
    .nav-link {
    width: 100%;
    text-align: left;
    cursor: pointer;
    background: transparent;
    }

    .nav-link--active {
    border-width: 2px;
    }
    </style>