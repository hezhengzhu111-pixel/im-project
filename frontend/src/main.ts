import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import App from "./App.vue";

// 样式
import "element-plus/dist/index.css";
import "@/styles/index.scss";

// 图标
import * as ElementPlusIconsVue from "@element-plus/icons-vue";

// 进度条
import NProgress from "nprogress";
import "nprogress/nprogress.css";

// 配置进度条
NProgress.configure({
  showSpinner: false,
  trickleSpeed: 200,
});

const app = createApp(App);

// 注册图标组件
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

// 使用插件
app.use(createPinia());
app.use(router);

// 挂载应用
app.mount("#app");

// 全局错误处理
app.config.errorHandler = (err, vm, info) => {
  console.error("全局错误:", err, info);
};

// 全局警告处理
app.config.warnHandler = (msg, vm, trace) => {
  console.warn("全局警告:", msg, trace);
};
