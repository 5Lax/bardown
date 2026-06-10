@echo off
rem BARDOWN launcher — starts the local server and opens the game.
cd /d "%~dp0"
start "BARDOWN server" cmd /c "node tools\serve.js"
timeout /t 1 >nul
start "" http://localhost:8347
