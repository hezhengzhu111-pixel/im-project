import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";

export default defineConfig(({ command, mode }) => {
  return {
    plugins: [vue()],
    resolve: {
      alias: [
        {
          find: "@",
          replacement: resolve(__dirname, "../web/src"),
        },
      ],
    },
    root: resolve(__dirname, "../web"),
    build: {
      outDir: resolve(__dirname, "dist"),
      emptyOutDir: true,
      target: "es2020",
      assetsDir: "assets",
      sourcemap: false,
      minify: "esbuild",
      rollupOptions: {
        input: resolve(__dirname, "../web/index.html"),
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
      strictPort: true,
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern-compiler",
          silenceDeprecations: ["legacy-js-api"],
          additionalData: `@use "@styles/variables.scss" as *;`,
        },
      },
    },
  };
});
