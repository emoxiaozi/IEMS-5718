import { createRouter, createWebHistory } from "vue-router";
import AdminCategoriesView from "../views/AdminCategoriesView.vue";
import AdminProductsView from "../views/AdminProductsView.vue";

import HomeView from "../views/index.vue";   
import ProductView from "../views/ProductView.vue"; 
import CartView from "../views/CartView.vue";
import LoginView from "../views/LoginView.vue";
import RegisterView from "../views/RegisterView.vue";
import ChangePasswordView from "../views/ChangePasswordView.vue";
import ForgetPasswordView from "../views/ForgetPasswordView.vue";
import ResetPasswordView from "../views/ResetPasswordView.vue";


const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "login",
      component: LoginView,
    },
    {
      path: "/register",
      name: "register",
      component: RegisterView,
    },
    {
      path: "/forgot-password",
      name: "forgot-password",
      component: ForgetPasswordView,
    },
    {
      path: "/reset-password",
      name: "reset-password",
      component: ResetPasswordView,
    },
    {
      path: "/change-password",
      name: "change-password",
      component: ChangePasswordView,
      meta: { requiresAuth: true }
    },
    {
      path: "/shop",
      name: "home",
      component: HomeView,
    },
    {
      path: "/:catKey(\\d+-[^/]+)/",
      name: "category-seo",
      component: HomeView,
    },
    {
      path: "/:catKey(\\d+-[^/]+)/:prodKey(\\d+-[^/]+)",
      name: "product-seo",
      component: ProductView,
    },
    {
      path: "/product/:pid",
      name: "product",
      component: ProductView,
      props: true, 
    },
    { 
      path: "/admin/categories", 
      name: "admin-categories", 
      component: AdminCategoriesView,
      meta: { requiresAdmin: true }
    },
    { 
      path: "/admin/products", 
      name: "admin-products", 
      component: AdminProductsView,
      meta: { requiresAdmin: true }
    },  
    {
      path: "/cart",
      name: "cart",
      component: CartView,
    },
  ],
});

router.beforeEach(async (to, from, next) => {
  if (to.meta.requiresAdmin || to.meta.requiresAuth) {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      
      if (to.meta.requiresAdmin) {
        if (data.user && data.user.role === "admin") {
          next();
        } else {
          const msg = data.user 
            ? "Access Denied: You do not have administrator privileges." 
            : "Authentication Required: Please login as an administrator.";
          alert(msg);
          next(data.user ? "/shop" : "/");
        }
      } else if (to.meta.requiresAuth) {
        if (data.user) {
          next();
        } else {
          next("/");
        }
      }
    } catch (e) {
      next("/");
    }
  } else {
    next();
  }
});

export default router;