import { createApp } from "vue";
import { createPinia } from "pinia";
import NProgress from "nprogress";
import router from "./router";
import App from "./App.vue";

import "@/styles/index.scss";
import "nprogress/nprogress.css";

NProgress.configure({
  showSpinner: false,
  trickleSpeed: 200,
});

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.config.errorHandler = (err, _vm, info) => {
  console.error("Global error:", err, info);
};

app.config.warnHandler = (msg, _vm, trace) => {
  console.warn("Global warning:", msg, trace);
};

app.mount("#app");
