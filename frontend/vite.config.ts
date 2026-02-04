import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { ElementPlusResolver } from "unplugin-vue-components/resolvers";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // 自动导入
    AutoImport({
      imports: ["vue", "vue-router", "pinia", "@vueuse/core"],
      resolvers: [ElementPlusResolver({ importStyle: "css" })],
      dts: true,
    }),
    // 自动导入组件
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
      // 后端业务API代理到backend服务
      "/api": {
        // 直接转发到后端服务
        target: "http://127.0.0.1:8082",
        changeOrigin: true,
      },
      // WebSocket连接代理到im-server
      "/websocket": {
        target: "ws://127.0.0.1:8083",
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
        manualChunks: {
          "vue-vendor": ["vue", "vue-router", "pinia"],
          "element-plus": ["element-plus"],
          "utils": ["dayjs", "axios", "crypto-js"],
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
});
