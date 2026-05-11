<template>
<CartHeader>
  <template #right>
    <RouterLink to="/shop" class="back-link">
      ← Back to Shop
    </RouterLink>
  </template>
</CartHeader>
  <main class="content" style="max-width: 1100px; margin: 0 auto;">
    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
      <h1>Admin - Products</h1>
      <div style="display:flex; gap:10px; align-items:center;">
        <RouterLink to="/shop" class="btn">← Back to Shop</RouterLink>
        <button class="btn" @click="openCreate">+ Add Product</button>
      </div>
    </div>

    <p v-if="msg" style="margin-top: 8px;">{{ msg }}</p>
    <p v-if="err" style="margin-top: 8px;">{{ err }}</p>

    <section style="margin-top: 16px;">
      <table border="1" cellpadding="8" cellspacing="0" style="width: 100%;">
        <thead>
          <tr>
            <th style="width:70px;">pid</th>
            <th style="width:90px;">catid</th>
            <th>name</th>
            <th style="width:110px;">price</th>
            <th style="width:220px;">image</th>
            <th style="width:220px;">actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in products" :key="p.pid">
            <td>{{ p.pid }}</td>
            <td>{{ p.catid }}</td>
            <td>{{ p.name }}</td>
            <td>${{ formatPrice(p.price) }}</td>
            <td>
              <div style="display:flex; gap:8px; align-items:center;">
                <img
                  v-if="p.thumb_path"
                  :src="p.thumb_path"
                  :alt="p.name"
                  style="width:48px; height:48px; object-fit:cover; border:1px solid #ddd; border-radius:6px;"
                />
                <span style="font-size:12px; opacity:.8;">{{ p.thumb_path || "(none)" }}</span>
              </div>
            </td>
            <td>
              <button class="btn" @click="openEdit(p)">Edit</button>
              <button class="btn btn-danger" style="margin-left:8px;" @click="deleteProduct(p.pid)">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- Modal -->
    <div v-if="modal.open" class="modal-mask" @click.self="closeModal">
      <div class="modal">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <h2 style="margin:0;">{{ modal.mode === 'create' ? 'Add Product' : `Edit Product #${modal.pid}` }}</h2>
          <button class="btn" @click="closeModal">✕</button>
        </div>

        <form @submit.prevent="submitModal" style="margin-top:12px; display:grid; gap:10px;">
          <label>
            Category
            <select v-model.number="form.catid" required>
              <option disabled value="">Select category</option>
              <option v-for="c in categories" :key="c.catid" :value="c.catid">
                {{ c.name }} ({{ c.catid }})
              </option>
            </select>
          </label>

          <label>
            Name
            <input v-model.trim="form.name" maxlength="100" required inputmode="text" pattern="^[A-Za-z0-9 \-_'&()\[\].,/:]{1,100}$" @input="form.name = sanitizeText(form.name, 100)" />
          </label>

          <label>
            Price
            <input v-model.number="form.price" type="number" min="0" step="0.01" required />
          </label>

          <label>
            Description
            <textarea v-model.trim="form.description" maxlength="2000" rows="3" @input="form.description = sanitizeText(form.description, 2000)"></textarea>
          </label>

          <label>
            Upload Image (JPEG/PNG/WEBP, ≤10MB)
            <input ref="fileInputEl" type="file" accept="image/jpeg,image/png,image/webp" style="display:none;" @change="onFileChange" />

            <div
              class="dropzone"
              :class="{ 'dropzone--active': isDragging }"
              role="button"
              tabindex="0"
              @click="openFilePicker"
              @keydown.enter.prevent="openFilePicker"
              @keydown.space.prevent="openFilePicker"
              @dragenter.prevent="onDragEnter"
              @dragover.prevent="onDragOver"
              @dragleave.prevent="onDragLeave"
              @drop.prevent="onDrop"
            >
              <div v-if="previewUrl" class="dropzone__preview">
                <img :src="previewUrl" alt="Preview" class="dropzone__img" />
                <div class="dropzone__meta">
                  <div class="dropzone__hint">Selected: {{ previewName }}</div>
                  <button type="button" class="btn" @click.stop="clearSelectedFile">Remove</button>
                </div>
              </div>
              <div v-else class="dropzone__empty">
                <div class="dropzone__title">Drop an image here</div>
                <div class="dropzone__hint">or click to choose a file</div>
              </div>
            </div>
          </label>

          <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:6px;">
            <button class="btn" type="button" @click="closeModal">Cancel</button>
            <button class="btn" type="submit" :disabled="saving">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </div>

          <p v-if="modalError" style="margin:0;">{{ modalError }}</p>
        </form>
      </div>
    </div>
  </main>
</template>

<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import CartHeader from "../components/CartHeader.vue";

const router = useRouter();
const categories = ref([]);
const products = ref([]);
const msg = ref("");
const err = ref("");
const saving = ref(false);
const modalError = ref("");

const modal = reactive({
  open: false,
  mode: "create", // create | edit
  pid: null,
});

const form = reactive({
  catid: "",
  name: "",
  price: 0,
  description: "",
});

function sanitizeText(s, maxLen) {
  const t = String(s || "").replace(/[<>\u0000-\u001F\u007F]/g, "");
  return maxLen ? t.slice(0, maxLen) : t;
}

let fileToUpload = null;
const fileInputEl = ref(null);
const isDragging = ref(false);
const previewUrl = ref("");
const previewName = ref("");

function clearPreview() {
  if (previewUrl.value) {
    try { URL.revokeObjectURL(previewUrl.value); } catch {}
  }
  previewUrl.value = "";
  previewName.value = "";
}

function clearSelectedFile() {
  fileToUpload = null;
  clearPreview();
  if (fileInputEl.value) fileInputEl.value.value = "";
}

function setSelectedFile(f) {
  if (!f) {
    clearSelectedFile();
    return;
  }

  if (!f.type || !["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
    modalError.value = "Only JPEG/PNG/WEBP images are allowed";
    clearSelectedFile();
    return;
  }
  if (f.size > 10 * 1024 * 1024) {
    modalError.value = "Image must be ≤ 10MB";
    clearSelectedFile();
    return;
  }

  modalError.value = "";
  fileToUpload = f;

  clearPreview();
  previewUrl.value = URL.createObjectURL(f);
  previewName.value = f.name || "image";
}

function openFilePicker() {
  if (fileInputEl.value) fileInputEl.value.click();
}

function onDragEnter() {
  isDragging.value = true;
}

function onDragOver() {
  isDragging.value = true;
}

function onDragLeave() {
  isDragging.value = false;
}

function onDrop(e) {
  isDragging.value = false;
  const f = e?.dataTransfer?.files?.[0] || null;
  setSelectedFile(f);
}

function formatPrice(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : v;
}

async function fetchJSON(url, options = {}) {
  if (options.method && ["POST", "PUT", "DELETE", "PATCH"].includes(String(options.method).toUpperCase())) {
    try {
      const csrfRes = await fetch("/api/csrf-token");
      const { csrfToken } = await csrfRes.json();
      options.headers = {
        ...options.headers,
        "X-CSRF-Token": csrfToken,
      };
    } catch (e) {
      throw new Error("Failed to fetch CSRF token");
    }
  }

  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

async function reload() {
  msg.value = "";
  err.value = "";
  modalError.value = "";

  categories.value = await fetchJSON("/api/categories");

  const all = [];
  for (const c of categories.value) {
    const rows = await fetchJSON(`/api/products?catid=${c.catid}`);
    all.push(...rows);
  }
  products.value = all;
}

function openCreate() {
  modal.open = true;
  modal.mode = "create";
  modal.pid = null;
  form.catid = "";
  form.name = "";
  form.price = 0;
  form.description = "";
  clearSelectedFile();
  modalError.value = "";
}

function openEdit(p) {
  modal.open = true;
  modal.mode = "edit";
  modal.pid = p.pid;
  form.catid = p.catid;
  form.name = p.name;
  form.price = Number(p.price);
  form.description = p.description || "";
  clearSelectedFile();
  modalError.value = "";
}

function closeModal() {
  modal.open = false;
  isDragging.value = false;
  clearSelectedFile();
}

function onFileChange(e) {
  const f = e.target.files?.[0] || null;
  setSelectedFile(f);
}

async function uploadImage(pid) {
  if (!fileToUpload) return;
  const fd = new FormData();
  fd.append("image", fileToUpload);
  await fetchJSON(`/api/products/${pid}/image`, { method: "POST", body: fd });
}

async function submitModal() {
  saving.value = true;
  modalError.value = "";
  msg.value = "";
  err.value = "";

  try {
    if (modal.mode === "create") {
      const created = await fetchJSON("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catid: form.catid,
          name: form.name,
          price: form.price,
          description: form.description,
          image_path: null,
          thumb_path: null,
        }),
      });


      await uploadImage(created.pid);

      msg.value = "Product created.";
      closeModal();
      await reload();
    } else {
      // edit
      const pid = modal.pid;

   
      await fetchJSON(`/api/products/${pid}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catid: form.catid,
          name: form.name,
          price: form.price,
          description: form.description,
          image_path: null,
          thumb_path: null,
        }),
      });

      await uploadImage(pid);

      msg.value = `Product ${pid} updated.`;
      closeModal();
      await reload();
    }
  } catch (e) {
    modalError.value = e.message || "Failed";
  } finally {
    saving.value = false;
  }
}

async function deleteProduct(pid) {
  if (!confirm(`Delete product #${pid}?`)) return;
  msg.value = "";
  err.value = "";
  try {
    await fetchJSON(`/api/products/${pid}`, { method: "DELETE" });
    msg.value = `Product ${pid} deleted.`;
    await reload();
  } catch (e) {
    err.value = e.message || "Failed to delete";
  }
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

onMounted(async () => {
  try {
    await checkAdmin();
    await reload();
  } catch (e) {
    err.value = e.message || "Failed to load";
  }
});

onBeforeUnmount(() => {
  clearPreview();
});
</script>

<style scoped>
.btn {
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 10px;
  background: white;
  cursor: pointer;
  text-decoration: none;
  font-weight: 600;
}
.btn-danger { border-color: #f2b8b5; }
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.modal {
  width: 100%;
  max-width: 560px;
  background: white;
  border-radius: 16px;
  padding: 14px 16px;
  border: 1px solid #eee;
}

.dropzone {
  margin-top: 8px;
  border: 2px dashed #ddd;
  border-radius: 14px;
  background: #fafafa;
  padding: 12px;
  cursor: pointer;
}

.dropzone--active {
  border-color: #111;
  background: #fff;
}

.dropzone__empty {
  display: grid;
  gap: 4px;
  justify-items: start;
}

.dropzone__title {
  font-weight: 700;
}

.dropzone__hint {
  font-size: 12px;
  opacity: .8;
}

.dropzone__preview {
  display: flex;
  align-items: center;
  gap: 12px;
}

.dropzone__img {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid #ddd;
  background: #fff;
}

.dropzone__meta {
  display: grid;
  gap: 8px;
}
</style>