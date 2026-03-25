    <template>
    
    <a class="skip-link" href="#main">Skip to main content</a>
<link rel="stylesheet" href="/css/styles.css" />
    <CartHeader />

    <div class="page-layout">

    <nav class="side-nav" aria-label="Category navigation">
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
        </main>
    </div>

    <footer class="site-footer"></footer>
    </template>

    <script setup>
    import CartHeader from "../components/CartHeader.vue";
    import { computed, onMounted, ref } from "vue";
    import { RouterLink,useRouter,useRoute } from "vue-router";
    import { cartStore } from "../stores/cartStore";
    const route = useRoute();
    const router = useRouter();
    const categories = ref([]);
    const products = ref([]);
    const user = ref(null);
    const isUserDropdownOpen = ref(false);
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

   onMounted(async () => {
  try { await cartStore.init(); } catch {}
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
    

const cartOpen = ref(false);

async function toggleCart() {
  cartOpen.value = !cartOpen.value;
  if (cartOpen.value) {
    try {
      await cartStore.refresh();  
    } catch (e) {
      console.error(e);
    }
  }
}
    </script>
    <style scoped>
    .top-nav {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-left: auto; 
    margin-right: 16px;
    }

    .user-status {
      font-size: 0.9rem;
      color: #666;
      margin-right: 8px;
    }

    .top-nav__link {
    text-decoration: none;
    padding: 8px 10px;
    border: 1px solid #ddd;
    border-radius: 10px;
    font-weight: 600;
    }

    .top-nav__link.router-link-active {
    border-color: #aaa;
    }

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