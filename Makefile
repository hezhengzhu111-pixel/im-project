BACKEND_DIR := backend
FRONTEND_DIR := frontend

.PHONY: backend-test frontend-install frontend-typecheck frontend-test frontend-build quality clean

backend-test:
	mvn -f $(BACKEND_DIR)/pom.xml test

frontend-install:
	npm --prefix $(FRONTEND_DIR) ci

frontend-typecheck:
	npm --prefix $(FRONTEND_DIR) run typecheck

frontend-test:
	npm --prefix $(FRONTEND_DIR) run test

frontend-build:
	npm --prefix $(FRONTEND_DIR) run build

quality: backend-test frontend-typecheck frontend-test frontend-build

clean:
	mvn -f $(BACKEND_DIR)/pom.xml clean
