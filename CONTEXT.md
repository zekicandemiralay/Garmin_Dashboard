# Project Context for Claude Code

## What this project is
Self-hosted Garmin Venu 2 health dashboard. Pulls data from Garmin Connect API 
→ stores in PostgreSQL → FastAPI backend → React frontend with charts.
All runs on a home Linux server via Docker Compose.

## Current status
Phase 1 (data pipeline) is built. Files are ready to push to Git.

## Stack
- Sync service: Python + garth library (pulls from Garmin Connect)
- Database: PostgreSQL in Docker
- Backend (Phase 2 - next): FastAPI
- Frontend (Phase 3 - next): React + charts

## Server setup
- Home Linux server with Docker
- Workflow: develop on Windows → push to GitHub → pull on server

## What to do next
1. Review existing files in this directory
2. Continue with Phase 2: FastAPI backend
3. Then Phase 3: React dashboard