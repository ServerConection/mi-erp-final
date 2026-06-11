@echo off
REM ============================================================
REM  UN agente ngrok con AMBOS tuneles:
REM   - app3000 (http) -> tu dominio fijo, igual que siempre
REM   - ollama  (tcp)  -> direccion propia para el Asistente
REM  Prueba la conexion y deja el resultado en ollama_url.txt
REM ============================================================
cd /d "%~dp0"

set "NGROK=%LOCALAPPDATA%\Microsoft\WindowsApps\ngrok.exe"
if not exist "%NGROK%" set "NGROK=ngrok"

echo verificando... > ollama_url.txt

taskkill /f /im ngrok.exe >nul 2>&1
timeout /t 2 >nul
start "ngrok-dual" cmd /k ""%NGROK%" start --all --config "%LOCALAPPDATA%\ngrok\ngrok.yml" --config "%~dp0ngrok_tunnels.yml""

timeout /t 12 >nul

REM ── Obtener URL tcp del tunel ollama y PROBARLA end-to-end ──
node -e "(async()=>{const fs=require('fs');try{const r=await fetch('http://127.0.0.1:4040/api/tunnels');const d=await r.json();const t=(d.tunnels||[]).find(x=>x.proto==='tcp');if(!t){fs.writeFileSync('ollama_url.txt','ERROR: no hay tunel tcp. Tunels: '+JSON.stringify(d.tunnels?.map(x=>x.public_url)));return}const url=t.public_url.replace('tcp://','http://');let estado='';try{const p=await fetch(url+'/api/tags',{signal:AbortSignal.timeout(15000)});estado=p.ok?'PRUEBA OK ('+p.status+')':'HTTP '+p.status;}catch(e){estado='FALLO PRUEBA: '+e.message}fs.writeFileSync('ollama_url.txt','OLLAMA_URL='+url+'\nESTADO='+estado+'\n');}catch(e){fs.writeFileSync('ollama_url.txt','ERROR API ngrok: '+e.message)}})()"

echo Listo. Revisa ollama_url.txt (NO cierres la ventana ngrok-dual)
timeout /t 3 >nul
