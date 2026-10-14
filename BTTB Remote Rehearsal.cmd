@echo off
cd /d "%~dp0"
title BTTB Remote Rehearsal - keep open
node scripts/start-remote-rehearsal.mjs --share
if errorlevel 1 pause
