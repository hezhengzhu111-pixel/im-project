.PHONY: dev prod wasm size report clean help

FLUTTER := flutter
ROOT_BUILD_DIR := ../../build/flutter/web
BUILD_DIR := $(ROOT_BUILD_DIR)
DEBUG_INFO_DIR := ../../build/flutter/debug-info

help: ## 显示帮助信息
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

dev: ## 开发构建 (dart2js, CanvasKit, debug)
	$(FLUTTER) build web --debug --output-dir=$(ROOT_BUILD_DIR)

prod: ## 生产构建 (dart2js, CanvasKit, obfuscated)
	$(FLUTTER) build web --release --obfuscate --split-debug-info=$(DEBUG_INFO_DIR) --output-dir=$(ROOT_BUILD_DIR)

wasm: ## WASM 构建 (dart2wasm, skwasm)
	$(FLUTTER) build web --wasm --output-dir=$(ROOT_BUILD_DIR)

size: ## 输出构建产物大小
	@echo "=== 构建产物大小 ==="
	@du -sh $(BUILD_DIR) 2>/dev/null || echo "构建目录不存在，请先运行 make dev/prod/wasm"
	@if [ -f "$(BUILD_DIR)/main.dart.js" ]; then \
		echo "main.dart.js: $$(du -h $(BUILD_DIR)/main.dart.js | cut -f1)"; \
	fi
	@if [ -f "$(BUILD_DIR)/main.dart.wasm" ]; then \
		echo "main.dart.wasm: $$(du -h $(BUILD_DIR)/main.dart.wasm | cut -f1)"; \
	fi
	@echo "=== Deferred chunks ==="
	@ls -lh $(BUILD_DIR)/part_*.js 2>/dev/null || echo "无 deferred chunks"

report: ## 构建 + 分析体积
	$(FLUTTER) build web --release --analyze-size --output-dir=$(ROOT_BUILD_DIR)
	@echo "=== 体积分析完成 ==="
	@du -sh $(BUILD_DIR)

clean: ## 清理构建产物
	$(FLUTTER) clean
	rm -rf $(BUILD_DIR) $(DEBUG_INFO_DIR)
