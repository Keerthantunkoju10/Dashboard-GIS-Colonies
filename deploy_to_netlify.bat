@echo off
title Deploy NeoGeo GHMC Dashboard to Netlify
echo ========================================================
echo  Deploying NeoGeo GHMC Dashboard to Netlify
echo ========================================================
echo.
cd /d "%~dp0"

echo [Step 1/2] Checking Netlify Authentication...
echo A browser window will open if you need to authorize Netlify.
call netlify login
if %ERRORLEVEL% NEQ 0 (
    echo Retrying with npx netlify-cli...
    call npx netlify-cli login
)

echo.
echo [Step 2/2] Deploying project to Netlify Production...
echo (If this is your first deploy, choose "Create & configure a new site")
echo.
call netlify deploy --prod --dir=.
if %ERRORLEVEL% NEQ 0 (
    call npx netlify-cli deploy --prod --dir=.
)

echo.
echo ========================================================
echo  Deployment finished!
echo  Visit your Netlify Live URL displayed above.
echo ========================================================
pause
