@echo off
title NSG Tactical Video Analytics Launcher
echo ==========================================================
echo       NATIONAL SECURITY GUARD - AI/ML SURVEILLANCE
echo                TACTICAL SYSTEMS LAUNCHER
echo ==========================================================
echo.

:: 1. Verify and Install Python Backend Dependencies
echo [1/4] Verifying Python library environment...
python -c "import sys, os; user_site = os.path.expanduser(r'~\AppData\Roaming\Python\Python310\site-packages'); sys.path.insert(0, user_site) if os.path.exists(user_site) else None; import fastapi, sqlalchemy, cv2, ultralytics" >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo WARNING: Missing Python dependencies. Installing now...
    python -m pip install -r backend\requirements.txt --user --default-timeout=600
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Failed to install Python dependencies. Please verify your internet connection.
        pause
        exit /b 1
    )
) else (
    echo   Python libraries verified.
)

:: 2. Initialize Database and folders
echo [2/4] Initializing Database and AI weights...
cd backend
python setup_project.py
cd ..

:: 3. Verify and Install Frontend Dependencies
echo [3/4] Checking Node.js dashboard modules...
if not exist "frontend\node_modules" (
    echo.
    echo WARNING: frontend/node_modules folder not found.
    echo Running 'npm install' inside the frontend folder...
    cd frontend
    call npm install
    cd ..
) else (
    echo   Node.js modules verified.
)

:: 4. Start Servers
echo.
echo [4/4] Activating Tactical Surveillance Console...
echo Starting FastAPI AI Server on Port 8000...
start "NSG Tactical API (Backend)" cmd /k "cd backend && python -m uvicorn app.main:app --reload --port 8000"

echo Starting Vite/React Frontend Panel on Port 5173...
start "NSG Tactical Dashboard (Frontend)" cmd /k "cd frontend && npm run dev"

echo.
echo Syncing streams, standby for interface launch...
timeout /t 5 >nul

echo Opening browser console...
start http://localhost:5173

echo.
echo ==========================================================
echo System Active. Close the opened terminal windows to stop.
echo ==========================================================
pause
