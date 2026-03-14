/**
 * 路由配置
 * 定义应用的所有路由规则
 */

import {
  createRouter,
  createWebHistory,
  isNavigationFailure,
  NavigationFailureType,
} from "vue-router";
import type { RouteRecordRaw } from "vue-router";
import { useUserStore } from "@/stores/user";
import { ElMessage } from "element-plus";
import NProgress from "nprogress";
import "nprogress/nprogress.css";

// 配置NProgress
NProgress.configure({
  showSpinner: false,
  minimum: 0.2,
  speed: 500,
});

// 路由定义
const routes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/chat",
  },
  {
    path: "/login",
    name: "Login",
    component: () => import("@/pages/Login.vue"),
    meta: {
      title: "登录",
      requiresAuth: false,
      hideForAuth: true, // 已登录用户隐藏
    },
  },
  {
    path: "/register",
    name: "Register",
    component: () => import("@/pages/Register.vue"),
    meta: {
      title: "注册",
      requiresAuth: false,
      hideForAuth: true,
    },
  },
  {
    path: "/chat",
    name: "Chat",
    component: () => import("@/pages/Chat.vue"),
    meta: {
      title: "聊天",
      requiresAuth: true,
    },
  },
  {
    path: "/contacts",
    name: "Contacts",
    component: () => import("@/pages/Friends.vue"), // 复用 Friends.vue 或重命名为 Contacts.vue
    meta: {
      title: "联系人",
      requiresAuth: true,
    },
  },
  {
    path: "/groups",
    name: "Groups",
    component: () => import("@/pages/Groups.vue"),
    meta: {
      title: "群组",
      requiresAuth: true,
    },
  },
  {
    path: "/profile",
    name: "Profile",
    component: () => import("@/pages/Profile.vue"),
    meta: {
      title: "个人资料",
      requiresAuth: true,
    },
  },
  {
    path: "/settings",
    name: "Settings",
    component: () => import("@/pages/Settings.vue"),
    meta: {
      title: "设置",
      requiresAuth: true,
    },
  },
  {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    component: () => import("@/pages/NotFound.vue"),
    meta: {
      title: "页面未找到",
      requiresAuth: false,
    },
  },
];

// 创建路由实例
const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  },
});

// 全局前置守卫
router.beforeEach(async (to, from, next) => {
  console.log("Navigating from:", from.fullPath, "to:", to.fullPath);
  // 开始进度条
  NProgress.start();

  const userStore = useUserStore();
  const requiresAuth = to.meta.requiresAuth;
  const hideForAuth = to.meta.hideForAuth;
  try {
    const isAuthed = await userStore.ensureAuthenticated();
    // 如果需要认证但用户未登录
    if (requiresAuth && !isAuthed) {
      ElMessage.warning("请先登录");
      next({ name: "Login", query: { redirect: to.fullPath } });
      return;
    }

    // 如果已登录用户访问登录/注册页面
    if (hideForAuth && isAuthed) {
      next({ name: "Chat" });
      return;
    }

    next();
  } catch (error) {
    console.error("路由守卫错误:", error);
    ElMessage.error("页面跳转失败");
    next(false);
  }
});

// 全局后置钩子
router.afterEach((to, from, failure) => {
  // 结束进度条
  NProgress.done();

  if (
    failure &&
    !isNavigationFailure(failure, NavigationFailureType.duplicated) &&
    !isNavigationFailure(failure, NavigationFailureType.cancelled)
  ) {
    console.error("路由跳转失败:", failure);
  }
});

// 路由错误处理
router.onError((error) => {
  console.error("路由错误:", error);
  ElMessage.error("页面加载失败");
  NProgress.done();
});

export default router;

// 导出路由相关类型
export type { RouteRecordRaw };
