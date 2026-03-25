<script setup></script>

<template>
  <RouterView />
</template>
<script setup>
import { onMounted } from "vue";
import { cartStore } from "./stores/cartStore";

onMounted(() => {
  cartStore.init(); 
});
</script>
<style scoped></style>
