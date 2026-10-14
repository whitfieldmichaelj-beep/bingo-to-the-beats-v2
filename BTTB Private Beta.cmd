@echo off
setlocal
title BTTB - keep this window open
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Complete the BTTB Windows setup first.
  pause
  popd
  exit /b 1
)
node scripts\start-private-beta.mjs %*
set "BTTB_EXIT=%ERRORLEVEL%"
if not "%BTTB_EXIT%"=="0" pause
popd
exit /b %BTTB_EXIT%
