@echo off
setlocal
set "AGENT_COCKPIT_CODEX_THREAD="
set "AGENT_COCKPIT_CODEX_ONLY=1"
pushd "%~dp0"
start "" "%~dp0Codex-Observatory.exe" -w
popd
