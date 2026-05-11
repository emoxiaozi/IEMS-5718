<template>
  <a class="skip-link" href="#main">Skip to main content</a>
   <link rel="stylesheet" href="/css/styles.css" />
 <CartHeader>
  <template #right>
    <RouterLink v-if="product" class="back-link" :to="categoryPath">
      ← Back to {{ categoryName }}
    </RouterLink>
    <RouterLink v-else class="back-link" to="/shop">
      ← Back
    </RouterLink>
  </template>
</CartHeader>

  <main id="main" class="content">
    <!-- Breadcrumb -->
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <ol class="breadcrumb__list">
        <li class="breadcrumb__item">
          <RouterLink to="/shop">Home</RouterLink>
        </li>

        <li class="breadcrumb__item" v-if="product">
          <RouterLink :to="categoryPath">{{ categoryName }}</RouterLink>
        </li>

        <li class="breadcrumb__item" aria-current="page">
          {{ product?.name || "Loading..." }}
        </li>
      </ol>
    </nav>

    <!-- Product detail -->
    <article class="product-detail" aria-labelledby="product-title">
      <!-- LEFT: Swiper gallery -->
      <div class="product-gallery">
        <div class="swiper product-swiper" ref="swiperEl">
          <div class="swiper-wrapper">
            <div class="swiper-slide" v-for="(img, idx) in images" :key="img">
              <img :src="img" :alt="`${product?.name || 'Product'} - image ${idx + 1}`" />
            </div>
          </div>

          <!-- Pagination -->
          <div class="swiper-pagination"></div>
        </div>
      </div>

    
      <div class="product-detail__info">
        <h1 id="product-title" class="product-detail__title">
          {{ product?.name || "Loading..." }}
        </h1>

        <p class="product-detail__desc">
          {{ product?.description || "" }}
        </p>

        <p class="product-detail__price" aria-label="Price">
          ${{ product ? formatPrice(product.price) : "0.00" }}
        </p>

       <button
  type="button"
  class="add-to-cart"
  :disabled="!product"
  @click="addToCartHandler(product.pid)"
>
  addToCart
</button>

        <p v-if="error" style="margin-top: 1rem;">{{ error }}</p>
      </div>
    </article>
  </main>

  <footer class="site-footer"></footer>
</template>

<script setup>
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { addToCart } from "../api/cart";
import { cartStore } from "../stores/cartStore";
import CartHeader from "../components/CartHeader.vue";
const route = useRoute();

const product = ref(null);
const categories = ref([]);
const error = ref("");
const swiperEl = ref(null);
let swiperInstance = null;

function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

const categoryName = computed(() => {
  if (!product.value) return "Category";
  const c = categories.value.find((x) => x.catid === Number(product.value.catid));
  return c?.name || "Category";
});

const categoryPath = computed(() => {
  if (!product.value) return "/shop";
  return `/${Number(product.value.catid)}-${slugify(categoryName.value)}/`;
});


const images = computed(() => {
  if (!product.value) return [];
  if (Array.isArray(product.value.images) && product.value.images.length) {
    return product.value.images;
  }
 
  if (product.value.image_path) {
    return [product.value.image_path];
  }
  
  return ["/assets/coffee_1.jpeg", "/assets/coffee_2.jpeg", "/assets/coffee_3.jpeg"];
});

function formatPrice(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return n.toFixed(2);
}

async function loadCategories() {
  try {
    const res = await fetch("/api/categories");
    const data = await res.json();
    categories.value = Array.isArray(data) ? data : [];
  } catch {
    categories.value = [];
  }
}

function getPidFromRoute() {
  const raw = String(route.params.prodKey || route.params.pid || "");
  const n = Number(raw.split("-")[0]);
  return Number.isFinite(n) && n > 0 ? String(n) : "";
}

async function loadProduct() {
  error.value = "";
  product.value = null;

  const pid = getPidFromRoute();
  if (!pid) {
    error.value = "Invalid product id";
    return;
  }

  try {
    const res = await fetch(`/api/products/${encodeURIComponent(pid)}`);
    if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    product.value = await res.json();
  } catch (e) {
    error.value = e?.message || "Failed to load product";
  }
}

function initSwiperIfReady() {
  
  if (!window.Swiper) return;


  if (swiperInstance) {
    swiperInstance.destroy(true, true);
    swiperInstance = null;
  }

  if (!swiperEl.value || images.value.length === 0) return;

  swiperInstance = new window.Swiper(swiperEl.value, {
    loop: true,
    spaceBetween: 16,
    pagination: {
      el: ".swiper-pagination",
      clickable: true,
    },
  });
}

async function addToCartHandler(pid) {
  if (!pid) return;
  try {
    await cartStore.add(pid, 1);

  } catch (e) {
    alert(e.message || "Failed to add to cart");
  }
}

onMounted(async () => {
  
  if (!document.querySelector('link[data-swiper="css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css";
    link.setAttribute("data-swiper", "css");
    document.head.appendChild(link);
  }

  if (!document.querySelector('script[data-swiper="js"]')) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js";
      script.async = true;
      script.setAttribute("data-swiper", "js");
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }

  await loadCategories();
  await loadProduct();
  await nextTick();
  initSwiperIfReady();
});


watch(
  () => [route.params.pid, route.params.prodKey],
  async () => {
    await loadProduct();
    await nextTick();
    initSwiperIfReady();
  }
);

onBeforeUnmount(() => {
  if (swiperInstance) {
    swiperInstance.destroy(true, true);
    swiperInstance = null;
  }
});
</script>