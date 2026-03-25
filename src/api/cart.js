// src/api/cart.js
import { cartStore } from "../stores/cartStore";

export async function addToCart(pid, qty = 1) {
  await cartStore.add(pid, qty);
  return true;
}

export async function setCartQty(pid, qty) {
  await cartStore.setQty(pid, qty);
  return true;
}

export async function removeFromCart(pid) {
  await cartStore.remove(pid);
  return true;
}

export async function clearCart() {
  await cartStore.clear();
  return true;
}