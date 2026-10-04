@echo off
REM Starts the AssetFlow API and Angular dev server in two separate windows.
REM Double-click this file, or run it from a terminal in the assetflow-angular folder.

echo Starting AssetFlow API (port 3000) and Angular (port 4200)...

start "AssetFlow API"  cmd /k "cd /d %~dp0server && npm start"
start "AssetFlow Web"  cmd /k "cd /d %~dp0 && npm start"

echo.
echo Two windows opened:
echo   - "AssetFlow API"  -> http://localhost:3000
echo   - "AssetFlow Web"  -> http://localhost:4200
echo Open http://localhost:4200 in your browser once "AssetFlow Web" says it is listening.
