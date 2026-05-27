import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";
import { resolve } from "path";

const webSrc = resolve(__dirname, "../web/src");

export default defineConfig({
  root: __dirname,
  publicDir: resolve(__dirname, "../web/public"),
  resolve: {
    alias: {
      "@": webSrc,
    },
  },
  plugins: [
    vue(),
    AutoImport({
      imports: ["vue", "vue-router", "pinia", "@vueuse/core"],
      resolvers: [ElementPlusResolver()],
      dts: false,
    }),
    Components({
      resolvers: [ElementPlusResolver()],
      dts: false,
    }),
  ],
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "es2020",
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
      output: {
        chunkFileNames: "js/[name]-[hash].js",
        entryFileNames: "js/[name]-[hash].js",
        assetFileNames: "[ext]/[name]-[hash].[ext]",
        manualChunks: {
          vue: ["vue", "vue-router", "pinia"],
          element: ["element-plus", "@element-plus/icons-vue"],
          utilities: ["axios", "dayjs", "mitt", "qs"],
          pinyin: ["pinyin-pro"],
          virtualScroller: ["vue-virtual-scroller"],
        },
      },
    },
  },
  server: {
    port: 3001,
    host: "127.0.0.1",
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8082",
        changeOrigin: true,
      },
      "/websocket": {
        target: "ws://127.0.0.1:8082",
        ws: true,
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
        additionalData: `@use "${webSrc.replace(/\\/g, "/")}/styles/variables.scss" as *;`,
      },
    },
  },
});
