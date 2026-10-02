@echo off
rem Lanceur du deploiement. Windows bloque les .ps1 par defaut : on passe donc
rem par ce .cmd, qui autorise le script uniquement pour cet appel.
rem Meme principe que ds.cmd et deepseek.cmd.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deployer.ps1" %*
