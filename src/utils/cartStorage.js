const KEY = "dummyshop_cart_v1";

export function readCartMap() {
  try {
    const obj = JSON.parse(localStorage.getItem(KEY) || "{}");
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function writeCartMap(map) {
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function clearCartMap() {
  localStorage.removeItem(KEY);
}
