@echo off
title NeoGeo GHMC Performance Dashboard & Excel Integration
echo ========================================================
echo  Launching NeoGeo GHMC Dashboard with Excel Push Engine
echo ========================================================
echo.
cd /d "%~dp0"
start "" "http://localhost:3000"
python server.py
pause
