import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "../web/src/App.vue";
import router from "../web/src/router";

import "element-plus/theme-chalk/el-overlay.css";
import "element-plus/theme-chalk/el-message.css";
import "element-plus/theme-chalk/el-message-box.css";
import "../web/src/styles/index.scss";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";
import { RecycleScroller } from "vue-virtual-scroller";
import { logger } from "../web/src/utils/logger";
import { registerAdapters } from "./adapters";

// Register desktop-specific platform adapters
registerAdapters();

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.component("RecycleScroller", RecycleScroller);

app.config.errorHandler = (err, _vm, info) => {
  logger.error("global error", { err, info });
};

app.config.warnHandler = (msg, _vm, trace) => {
  logger.warn("global warning", { msg, trace });
};

app.mount("#app");
