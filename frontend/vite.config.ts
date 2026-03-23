import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const gatewayHost = env.VITE_GATEWAY_HOST || env.GATEWAY_HOST || "127.0.0.1";
  const gatewayPort = env.VITE_GATEWAY_PORT || env.GATEWAY_PORT || "8082";
  const apiTarget = `http://${gatewayHost}:${gatewayPort}`;
  const wsTarget = `ws://${gatewayHost}:${gatewayPort}`;

  return {
    plugins: [
      vue(),
      AutoImport({
        imports: ["vue", "vue-router", "pinia", "@vueuse/core"],
        resolvers: [ElementPlusResolver({ importStyle: "css" })],
        dts: true,
      }),
      Components({
        resolvers: [ElementPlusResolver({ importStyle: "css" })],
        dts: true,
      }),
    ],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      open: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/websocket": {
          target: wsTarget,
          ws: true,
          changeOrigin: true,
        },
      },
      allowedHosts: ["413io39937.zicp.vip"],
    },
    build: {
      target: "es2015",
      outDir: "dist",
      assetsDir: "assets",
      sourcemap: false,
      rollupOptions: {
        output: {
          chunkFileNames: "js/[name]-[hash].js",
          entryFileNames: "js/[name]-[hash].js",
          assetFileNames: "[ext]/[name]-[hash].[ext]",
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              return;
            }
            if (
              id.includes("/vue/") ||
              id.includes("/vue-router/") ||
              id.includes("/pinia/")
            ) {
              return "vue-vendor";
            }
            if (id.includes("/element-plus/")) {
              return "element-plus";
            }
            if (id.includes("/@element-plus/icons-vue/")) {
              return "element-plus-icons";
            }
            if (
              id.includes("/axios/") ||
              id.includes("/dayjs/") ||
              id.includes("/crypto-js/") ||
              id.includes("/qs/")
            ) {
              return "utils";
            }
            return "vendor";
          },
        },
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
          silenceDeprecations: ["legacy-js-api"],
          additionalData: `@use "@/styles/variables.scss" as *;`,
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["src/test/setup.ts"],
      clearMocks: true,
      restoreMocks: true,
      server: {
        deps: {
          inline: ["element-plus", "nprogress"],
        },
      },
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "json-summary"],
        include: [
          "src/router/**",
          "src/stores/chat.ts",
          "src/stores/user.ts",
          "src/stores/websocket.ts",
          "src/utils/request.ts",
          "src/utils/messageNormalize.ts",
          "src/utils/messageRepo.ts",
          "src/pages/Friends.vue",
        ],
      },
    },
  };
});
