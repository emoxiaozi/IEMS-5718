// src/stores/cartStore.js
import { reactive } from "vue";
import { readCartMap, writeCartMap, clearCartMap } from "../utils/cartStorage";

async function fetchProduct(pid) {
  const res = await fetch(`/api/products/${encodeURIComponent(pid)}`);
  if (!res.ok) throw new Error(`Product ${pid} not found`);
  return res.json(); // { pid, name, price, ... }
}

export const cartStore = reactive({
  // map: { [pid]: qty }
  map: {},
  // items: [{ pid, qty, name, price, subtotal }]
  items: [],
  total: 0,
  count: 0,

  init() {
    this.map = readCartMap();
    this.count = Object.values(this.map).reduce((a, b) => a + Number(b || 0), 0);
  },

  async refresh() {
    // 1) read localStorage
    this.map = readCartMap();

    const entries = Object.entries(this.map)
      .map(([pid, qty]) => [Number(pid), Number(qty)])
      .filter(([pid, qty]) => Number.isFinite(pid) && pid > 0 && Number.isFinite(qty) && qty > 0);

    this.count = entries.reduce((s, [, qty]) => s + qty, 0);

    // empty cart
    if (entries.length === 0) {
      this.items = [];
      this.total = 0;
      return;
    }

    // 2) enrich with product info via AJAX
    const products = await Promise.all(
      entries.map(async ([pid, qty]) => {
        try {
          const p = await fetchProduct(pid);
          const price = Number(p.price) || 0;
          return {
            pid,
            qty,
            name: p.name || `#${pid}`,
            price,
            subtotal: price * qty,
          };
        } catch {
          // 如果商品不存在（被删了），也别让页面崩
          return {
            pid,
            qty,
            name: `#${pid} (missing)`,
            price: 0,
            subtotal: 0,
          };
        }
      })
    );

    this.items = products;
    this.total = products.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
  },

  async add(pid, qty = 1) {
    pid = Number(pid);
    qty = Number(qty);
    if (!Number.isFinite(pid) || pid <= 0) return;
    if (!Number.isFinite(qty) || qty <= 0) qty = 1;

    const map = readCartMap();
    map[pid] = Number(map[pid] || 0) + qty;
    writeCartMap(map);

    await this.refresh();
  },

  async setQty(pid, qty) {
    pid = Number(pid);
    qty = Number(qty);
    const map = readCartMap();
    if (!Number.isFinite(pid) || pid <= 0) return;

    if (!Number.isFinite(qty) || qty <= 0) {
      delete map[pid];
    } else {
      map[pid] = qty;
    }
    writeCartMap(map);
    await this.refresh();
  },

  async clear() {
    clearCartMap();
    await this.refresh();
  },
});