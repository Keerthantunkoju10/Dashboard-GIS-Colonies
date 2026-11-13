@echo off
title Deploy to Netlify
echo ========================================================
echo  Deploying NeoGeo GHMC Dashboard to Netlify
echo ========================================================
echo.
cd /d "%~dp0"
echo Step 1: Authorizing with Netlify (Browser window will open)...
call npx netlify login
echo.
echo Step 2: Deploying to Netlify Production...
call npx netlify deploy --prod --dir=.
echo.
echo ========================================================
echo  Deployment complete! Check the Netlify live URL above.
echo ========================================================
pause
