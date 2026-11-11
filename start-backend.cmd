@echo off
rem Terminal 1: FastAPI backend (from repo root)
call .venv\Scripts\activate.bat
python -m uvicorn app.main:app --app-dir backend --port 8000 --reload
