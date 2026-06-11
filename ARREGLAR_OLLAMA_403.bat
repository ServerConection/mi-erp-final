@echo off
REM ============================================================
REM  Soluciona el 403 de Ollama via tunel:
REM  OLLAMA_HOST=0.0.0.0 permite peticiones con Host externo.
REM  Luego reinicia Ollama y re-prueba el tunel.
REM ============================================================
cd /d "%~dp0"

set "OLLAMA_HOST=0.0.0.0"
setx OLLAMA_HOST 0.0.0.0 >nul

taskkill /f /im "ollama app.exe" >nul 2>&1
taskkill /f /im ollama.exe >nul 2>&1
timeout /t 3 >nul

start "" "%LOCALAPPDATA%\Programs\Ollama\ollama app.exe"
timeout /t 10 >nul

node -e "(async()=>{const fs=require('fs');try{const r=await fetch('http://127.0.0.1:4040/api/tunnels');const d=await r.json();const t=(d.tunnels||[]).find(x=>x.proto==='tcp');if(!t){fs.writeFileSync('ollama_url.txt','ERROR: no hay tunel tcp');return}const url=t.public_url.replace('tcp://','http://');let estado='';try{const p=await fetch(url+'/api/tags',{signal:AbortSignal.timeout(15000)});estado=p.ok?'PRUEBA OK ('+p.status+')':'HTTP '+p.status;}catch(e){estado='FALLO PRUEBA: '+e.message}fs.writeFileSync('ollama_url.txt','OLLAMA_URL='+url+'\nESTADO='+estado+'\n');}catch(e){fs.writeFileSync('ollama_url.txt','ERROR API ngrok: '+e.message)}})()"

echo Listo. Revisa ollama_url.txt
timeout /t 3 >nul
