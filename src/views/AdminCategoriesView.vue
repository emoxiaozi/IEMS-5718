<template>
<CartHeader>
  <template #right>
    <RouterLink to="/shop" class="back-link">
      ← Back to Shop
    </RouterLink>
  </template>
</CartHeader>
  <main class="content" style="max-width: 900px; margin: 0 auto;">
    <h1>Admin - Categories</h1>

    <section style="margin-top: 16px;">
      <h2>Add Category</h2>
      <form @submit.prevent="createCategory">
        <input
          v-model.trim="newName"
          placeholder="Category name (e.g., Coffee)"
          maxlength="50"
          required
          inputmode="text"
          pattern="^[A-Za-z0-9 \-_'&()\[\].,/:]{1,50}$"
          @input="newName = sanitizeName(newName)"
        />
        <button type="submit" style="margin-left: 8px;">Add</button>
      </form>
      <p v-if="msg" style="margin-top: 8px;">{{ msg }}</p>
      <p v-if="err" style="margin-top: 8px;">{{ err }}</p>
    </section>

    <section style="margin-top: 24px;">
      <h2>Existing Categories</h2>

      <table border="1" cellpadding="8" cellspacing="0" style="width: 100%; margin-top: 8px;">
        <thead>
          <tr>
            <th style="width: 80px;">catid</th>
            <th>name</th>
            <th style="width: 220px;">actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in categories" :key="c.catid">
            <td>{{ c.catid }}</td>
            <td>
              <input v-model.trim="editNames[c.catid]" maxlength="50" inputmode="text" pattern="^[A-Za-z0-9 \-_'&()\[\].,/:]{1,50}$" @input="editNames[c.catid] = sanitizeName(editNames[c.catid])" />
            </td>
            <td>
              <button @click="updateCategory(c.catid)">Save</button>
              <button @click="deleteCategory(c.catid)" style="margin-left: 8px;">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>

      <p style="margin-top: 8px; opacity: 0.8;">
        Tip: If a category has products, delete products first (backend blocks deletion).
      </p>
    </section>
  </main>
</template>

<script setup>
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import CartHeader from "../components/CartHeader.vue";

const router = useRouter();
const categories = ref([]);
const newName = ref("");
const msg = ref("");
const err = ref("");

const editNames = reactive({});
function sanitizeName(s) {
  return String(s || "").replace(/[<>\u0000-\u001F\u007F]/g, "").slice(0, 50);
}

async function fetchJSON(url, options = {}) {
  // Fetch CSRF token for state-changing requests
  if (options.method && ["POST", "PUT", "DELETE", "PATCH"].includes(options.method.toUpperCase())) {
    try {
      const csrfRes = await fetch("/api/csrf-token");
      const { csrfToken } = await csrfRes.json();
      options.headers = {
        ...options.headers,
        "X-CSRF-Token": csrfToken,
      };
    } catch (e) {
      console.error("Failed to fetch CSRF token", e);
    }
  }

  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

async function checkAdmin() {
  try {
    const data = await fetchJSON("/api/auth/me");
    if (!data.user || data.user.role !== "admin") {
      router.push("/");
    }
  } catch (e) {
    router.push("/");
  }
}

async function loadCategories() {
  err.value = "";
  categories.value = await fetchJSON("/api/categories");
  categories.value.forEach((c) => (editNames[c.catid] = c.name));
}

async function createCategory() {
  msg.value = "";
  err.value = "";
  try {
    await fetchJSON("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: sanitizeName(newName.value) }),
    });
    newName.value = "";
    msg.value = "Category added.";
    await loadCategories();
  } catch (e) {
    err.value = e.message || "Failed to add category";
  }
}

async function updateCategory(catid) {
  msg.value = "";
  err.value = "";
  try {
    await fetchJSON(`/api/categories/${catid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: sanitizeName(editNames[catid]) }),
    });
    msg.value = "Category updated.";
    await loadCategories();
  } catch (e) {
    err.value = e.message || "Failed to update category";
  }
}

async function deleteCategory(catid) {
  if (!confirm(`Delete category ${catid}?`)) return;
  msg.value = "";
  err.value = "";
  try {
    await fetchJSON(`/api/categories/${catid}`, { method: "DELETE" });
    msg.value = "Category deleted.";
    await loadCategories();
  } catch (e) {
    err.value = e.message || "Failed to delete category";
  }
}

onMounted(async () => {
  await checkAdmin();
  await loadCategories();
});
</script>