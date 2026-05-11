    <template>
    
    <a class="skip-link" href="#main">Skip to main content</a>
<link rel="stylesheet" href="/css/styles.css" />
    <CartHeader />

    <section v-if="route.query.view !== 'orders'" class="social-top" aria-label="Social media">
      <div class="social-top-inner">
        <iframe
          class="social-top-embed"
          title="X (Twitter) Follow"
          :src="xFollowSrc"
          width="240"
          height="28"
          style="border:none; overflow:hidden"
          scrolling="no"
          frameborder="0"
        ></iframe>
      </div>
    </section>

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
                  <RouterLink class="product-thumb" :to="productPath(p)">
          
                      <img :src="p.thumb_path || p.image_path" :alt="p.name" />
                  </RouterLink>

                  <h3 class="product-name">
                      <RouterLink :to="productPath(p)">{{ p.name }}</RouterLink>
                  </h3>

                  <p class="product-price">${{ formatPrice(p.price) }}</p>

                 <button type="button" class="add-to-cart" @click="addToCartHandler(p.pid)">addToCart</button>
                  </li>
              </ul>
              </section>
          </div>

          <p v-if="loading" style="margin-top: 1rem;">Loading...</p>
          <p v-if="error" style="margin-top: 1rem;">{{ error }}</p>

          <div style="margin-top: 12px;">
            <p v-if="loadMoreErr" style="margin:0; color:#b00;">{{ loadMoreErr }}</p>
            <div ref="sentinelEl" style="height: 1px;"></div>
            <div v-if="loadingMore" style="margin-top: 10px; opacity:.8;">Loading more...</div>
            <button
              v-if="!loading && !loadingMore && hasMore"
              type="button"
              class="add-to-cart"
              style="margin-top: 10px;"
              @click="loadMoreProducts(false)"
            >
              Load more
            </button>
          </div>
        </template>
        </main>
    </div>

    <footer class="site-footer"></footer>
    </template>

    <script setup>
    import CartHeader from "../components/CartHeader.vue";
    import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
    import { RouterLink,useRouter,useRoute } from "vue-router";
    import { cartStore } from "../stores/cartStore";
    const route = useRoute();
    const router = useRouter();
    const categories = ref([]);
    const products = ref([]);
    const page = ref(1);
    const pageSize = ref(12);
    const hasMore = ref(true);
    const loadingMore = ref(false);
    const loadMoreErr = ref("");
    const sentinelEl = ref(null);
    let io = null;
    let lastAutoLoadAt = 0;

    async function maybeAutoLoad() {
      if (!hasMore.value || loading.value || loadingMore.value) return;
      const now = Date.now();
      if (now - lastAutoLoadAt < 500) return;
      lastAutoLoadAt = now;
      await loadMoreProducts(false);
    }

    function handleScrollFallback() {
      if (!hasMore.value || loading.value || loadingMore.value) return;
      const el = sentinelEl.value;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 800) {
        void maybeAutoLoad();
      }
    }

    async function setupAutoLoad() {
      if (io) {
        io.disconnect();
        io = null;
      }

      await nextTick();

      if (typeof IntersectionObserver !== "undefined") {
        io = new IntersectionObserver(
          async (entries) => {
            if (!entries?.[0]?.isIntersecting) return;
            await maybeAutoLoad();
          },
          { root: null, rootMargin: "800px 0px", threshold: 0 }
        );
        if (sentinelEl.value) io.observe(sentinelEl.value);
      }

      window.addEventListener("scroll", handleScrollFallback, { passive: true });
      window.addEventListener("resize", handleScrollFallback);
      setTimeout(handleScrollFallback, 0);
    }

    function teardownAutoLoad() {
      if (io) {
        io.disconnect();
        io = null;
      }
      window.removeEventListener("scroll", handleScrollFallback);
      window.removeEventListener("resize", handleScrollFallback);
    }

    const myOrders = ref([]);
    const ordersLoading = ref(false);
    const ordersError = ref("");
    const paidMessage = ref("");

    function slugify(s) {
      return String(s || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "item";
    }

    function parseCatidFromRoute() {
      const catKey = String(route.params.catKey || "");
      if (catKey) {
        const n = Number(catKey.split("-")[0]);
        return Number.isFinite(n) && n > 0 ? n : null;
      }
      const q = Number(route.query.catid);
      return Number.isFinite(q) && q > 0 ? q : null;
    }

    function categoryPath(catid, name) {
      return `/${catid}-${slugify(name)}/`;
    }

    function productPath(p) {
      const catName = categories.value.find((c) => c.catid === Number(p?.catid))?.name || currentCategoryName.value || "Category";
      const catKey = `${Number(p?.catid)}-${slugify(catName)}`;
      const prodKey = `${Number(p?.pid)}-${slugify(p?.name)}`;
      return `/${catKey}/${prodKey}`;
    }

    const currentCatid = ref(parseCatidFromRoute());
 
    const xFollowSrc = ref("https://platform.twitter.com/widgets/follow_button.html?screen_name=TwitterDev&show_screen_name=true&show_count=false");

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

    const parsed = parseCatidFromRoute();
    if (parsed) currentCatid.value = parsed;

    if (categories.value.length) {
      const exists = categories.value.some((c) => c.catid === currentCatid.value);
      if (!exists) currentCatid.value = categories.value[0].catid;

      const current = categories.value.find((c) => c.catid === currentCatid.value);
      if (current && !route.params.catKey) {
        router.replace(categoryPath(current.catid, current.name));
      }
    }
    }

    async function loadMoreProducts(reset = false) {
    if (currentCatid.value == null) {
      products.value = [];
      hasMore.value = false;
      return;
    }

    if (loadingMore.value) return;

    if (reset) {
      products.value = [];
      page.value = 1;
      hasMore.value = true;
      loadMoreErr.value = "";
    }

    if (!hasMore.value) return;

    loadingMore.value = true;
    loadMoreErr.value = "";

    try {
      const url = `/api/products?catid=${encodeURIComponent(currentCatid.value)}&page=${encodeURIComponent(page.value)}&pageSize=${encodeURIComponent(pageSize.value)}`;
      const data = await fetchJSON(url);
      const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];

      products.value = [...products.value, ...items];

      if (Array.isArray(data)) {
        hasMore.value = false;
      } else {
        hasMore.value = Boolean(data.hasMore);
        if (items.length > 0) page.value = page.value + 1;
      }
    } catch (e) {
      loadMoreErr.value = e?.message || "Failed to load more products";
      hasMore.value = false;
    } finally {
      loadingMore.value = false;
    }
    }

    async function loadProducts() {
      await loadMoreProducts(true);
    }

    async function selectCategory(catid) {
    currentCatid.value = catid;
    const c = categories.value.find((x) => x.catid === catid);
    if (c) router.push(categoryPath(c.catid, c.name));
    else router.push({ path: "/shop", query: { catid } });

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
  () => route.params.catKey,
  async () => {
    if (route.query.view === "orders") return;
    const parsed = parseCatidFromRoute();
    if (parsed) currentCatid.value = parsed;
    await loadProducts();
    await setupAutoLoad();
  }
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
    await setupAutoLoad();
  } catch (e) {
    error.value = e?.message || "Failed to load data";
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  teardownAutoLoad();
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

    .social-top {
      width: 100%;
      background: #fff;
      border-bottom: 1px solid #eee;
    }

    .social-top-inner {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 10px;
      padding: 10px 16px;
    }

    .social-top-title {
      font-size: 13px;
      font-weight: 600;
      color: #333;
      padding: 4px 10px;
      border: 1px solid #eee;
      border-radius: 999px;
      background: #fafafa;
    }

    .social-top-embed {
      display: block;
      height: 28px;
    }
    </style>