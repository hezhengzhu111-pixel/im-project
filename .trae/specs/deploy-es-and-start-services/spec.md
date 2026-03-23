# Deploy ES in Docker Middleware and Start Services Spec

## Why
The project requires Elasticsearch (ES) running within the Docker middleware environment to support the newly implemented centralized log management and aggregation features. In addition, the frontend and backend services must be properly started to verify the entire system's functionality and logging pipeline.

## What Changes
- Deploy and start Elasticsearch and its dependencies (like Kibana, Filebeat, Kafka, Zookeeper) via `docker-compose`.
- Ensure the ES service is reachable and healthy.
- Update `backend/start_all_services.ps1` to include the newly created `log-service` and `admin-service`.
- Start all backend services.
- Start the frontend service.

## Impact
- Affected specs: Infrastructure deployment, local development setup.
- Affected code: `backend/start_all_services.ps1`.

## ADDED Requirements
### Requirement: Middleware Deployment
The system SHALL provide a docker-compose setup to easily start ES and related logging middleware.

### Requirement: Service Startup
The system SHALL support starting all backend microservices (including the new `log-service` and `admin-service`) and the frontend via existing scripts or commands.
