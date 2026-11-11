@echo off
rem Terminal 2: React frontend
cd frontend
if not exist node_modules call npm install
call npm run dev
