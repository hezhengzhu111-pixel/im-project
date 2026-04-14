import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import App from "./App.vue";

import "@/styles/index.scss";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";
import { logger } from "@/utils/logger";

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
