@echo off
title Push Project to GitHub
echo ========================================================
echo  Pushing NeoGeo GHMC Dashboard to GitHub
echo ========================================================
echo.
cd /d "%~dp0"

echo Current Git Status:
git status -s
echo.

set /p REPO_URL="Enter your GitHub Repository URL (e.g. https://github.com/Keerthantunkoju10/GHMC-Colony-Performance-Dashboard.git): "
if "%REPO_URL%"=="" (
    echo [ERROR] No repository URL provided. Aborting.
    pause
    exit /b 1
)

echo.
echo [1/3] Configuring remote origin to: %REPO_URL%
git remote remove origin 2>nul
git remote add origin %REPO_URL%

echo [2/3] Ensuring branch is 'main'...
git branch -M main

echo [3/3] Pushing to GitHub...
git push -u origin main

echo.
if %ERRORLEVEL% EQU 0 (
    echo ========================================================
    echo  SUCCESS: Pushed to GitHub!
    echo ========================================================
    echo Next: Connect this GitHub repo to Netlify for automatic
    echo continuous deployment:
    echo 1. Go to https://app.netlify.com/
    echo 2. Click "Add new site" -> "Import an existing project"
    echo 3. Choose "GitHub" and select this repository!
    echo ========================================================
) else (
    echo ========================================================
    echo  Push encountered an issue.
    echo  Ensure the repository exists on GitHub and that you
    echo  are authenticated with GitHub credentials.
    echo ========================================================
)
echo.
pause
