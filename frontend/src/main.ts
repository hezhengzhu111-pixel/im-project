import { createApp } from "vue";
import { createPinia } from "pinia";
import NProgress from "nprogress";
import router from "./router";
import App from "./App.vue";

import "@/styles/index.scss";
import "nprogress/nprogress.css";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";
import { logger } from "@/utils/logger";

NProgress.configure({
  showSpinner: false,
  trickleSpeed: 200,
});

const app = createApp(App);

app.use(createPinia());
app.use(router);

app.config.errorHandler = (err, _vm, info) => {
  logger.error("global error", { err, info });
};

app.config.warnHandler = (msg, _vm, trace) => {
  logger.warn("global warning", { msg, trace });
};

app.mount("#app");
