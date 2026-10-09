@echo off
cd /d "%~dp0"
echo Life Manager: http://127.0.0.1:4173
echo Keep this window open while using the app. Press Ctrl+C to stop.
node scripts\serve.mjs --open
pause
