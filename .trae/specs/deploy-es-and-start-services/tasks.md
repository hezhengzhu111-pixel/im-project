# Tasks
- [x] Task 1: Start Docker Middleware
  - [x] SubTask 1.1: Verify `deploy/admin-infra/docker-compose.yml` has ES correctly configured.
  - [x] SubTask 1.2: Run `docker-compose up -d` in `deploy/admin-infra` to start ES and related middleware.
- [x] Task 2: Update Backend Startup Script
  - [x] SubTask 2.1: Add `"log-service"` and `"admin-service"` to the `$services` array in `backend/start_all_services.ps1`.
- [x] Task 3: Start Backend Services
  - [x] SubTask 3.1: Execute `backend/start_all_services.ps1` to start all backend services.
- [x] Task 4: Start Frontend Service
  - [x] SubTask 4.1: Start the frontend development server (`npm run dev`) in the `frontend` directory.
