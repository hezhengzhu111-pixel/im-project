import { createApp } from "vue";
import { createPinia } from "pinia";
import router from "./router";
import App from "./App.vue";

import "element-plus/theme-chalk/el-overlay.css";
import "element-plus/theme-chalk/el-message.css";
import "element-plus/theme-chalk/el-message-box.css";
import "@/styles/index.scss";
import "vue-virtual-scroller/dist/vue-virtual-scroller.css";
import { RecycleScroller } from "vue-virtual-scroller";
import { logger } from "@/utils/logger";
import { initCapacitorPlugins } from "@/services/platform/capacitor-init";

if (new URLSearchParams(window.location.search).get("rustE2eeSmoke") === "1") {
  void import("./dev/rustE2eeSmoke")
    .then(({ installRustE2eeSmokePage }) => installRustE2eeSmokePage())
    .catch((error) => {
      logger.error("rust e2ee smoke failed", { error });
      document.body.innerHTML = `<pre style="white-space: pre-wrap; padding: 16px; color: #b00020;">${String(
        error instanceof Error ? error.stack || error.message : error,
      )}</pre>`;
    });
} else {
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

  void initCapacitorPlugins();
}
