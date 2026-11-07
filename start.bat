@echo off
rem GearForge 起動スクリプト（Windows）。ダブルクリックで起動し、ブラウザーを開く。このウィンドウを閉じると止まる。
rem ポートを変えるとき：start.bat 8780
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "PORT=8767"
if not "%~1"=="" set "PORT=%~1"
set "URL=http://127.0.0.1:%PORT%/"
title GearForge
rem Node.js 22 以上を探す：PATH の node → nvm-windows で入れた版（一番新しいもの。いつもの版は切り替えない）
set "NODE="
node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)" >nul 2>nul && set "NODE=node"
rem 古い nvm-windows は node64.exe の名前で入れることがあるので、両方を見る
if not defined NODE if defined NVM_HOME for /d %%d in ("%NVM_HOME%\v*") do for %%e in (node.exe node64.exe) do if exist "%%d\%%e" "%%d\%%e" -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)" >nul 2>nul && set "NODE=%%d\%%e"
if not defined NODE (
  echo Node.js 22 以上が必要です。
  where node >nul 2>nul && (<nul set /p "=今の Node： " & node -v)
  if defined NVM_HOME (
    echo nvm が入っているので、端末で「nvm install 22」を実行してから、もう一度開いてください。
    echo いつも使う Node を切り替える「nvm use」は不要です（GearForge が自動で見つけます）。
  ) else (
    echo https://nodejs.org/ から LTS 版を入れるか、端末で「winget install OpenJS.NodeJS.LTS」を実行してから、もう一度開いてください。
  )
  pause
  exit /b 1
)
curl -s -o nul --max-time 1 "%URL%" >nul 2>nul
if not errorlevel 1 (
  echo GearForge はすでに起動しています → %URL%
  start "" "%URL%"
  exit /b 0
)
echo GearForge を起動します → %URL%
echo このウィンドウを閉じると止まります。
start "" /min cmd /d /c "timeout /t 2 /nobreak >nul & start "" %URL%"
"%NODE%" server.mjs
if errorlevel 1 pause
