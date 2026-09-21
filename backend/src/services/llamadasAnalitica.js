const { createHash } = require('node:crypto');
const MAX_ROWS = 100000;
const sha = value => createHash('sha256').update(value).digest('hex');
const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
const invalid = message => Object.assign(new Error(message), { status: 400 });

// Strict CSV state machine: preserves phone strings and does not coerce local dates.
function csv(text) {
  const rows=[]; let row=[],field='',quoted=false,closed=false;
  function cell() { row.push(field); field=''; closed=false; }
  function line() { cell(); if(row.some(v=>v.trim())) rows.push(row); row=[]; if(rows.length>MAX_ROWS+1) throw invalid('Máximo 100.000 filas por archivo.'); }
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(quoted) { if(c==='"') { if(text[i+1]==='"'){field+='"';i++;} else {quoted=false;closed=true;} } else field+=c; }
    else if(c==='"') { if(field || closed) throw invalid('Comillas CSV inválidas.'); quoted=true; }
    else if(c===',') cell();
    else if(c==='\n' || c==='\r') { if(c==='\r' && text[i+1]==='\n') i++; line(); }
    else { if(closed) throw invalid('Contenido después del cierre de comillas.'); field+=c; }
    if(field.length>4096 || row.length>30) throw invalid('CSV con campos demasiado largos o demasiadas columnas.');
  }
  if(quoted) throw invalid('Comillas CSV sin cerrar.');
  if(field || row.length || closed) line();
  return rows;
}
function validDate(value, time=false) {
  const pattern=time ? /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
  if(!pattern.test(value)) return false;
  const d=new Date(time ? value.replace(' ','T')+'Z' : value+'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,time?19:10).replace('T',' ')===value;
}
function parseFile(file) {
  const name=file.originalname;
  const match=/^(?:cdr_)?(inbound|outbound)_(Netlife|Ecuanet)_(\d{8})_(\d{8})\.csv$/i.exec(name);
  if(!match) throw invalid('Nombre inválido: use inbound_Netlife_YYYYMMDD_YYYYMMDD.csv (o outbound/Ecuanet, con cdr_ opcional).');
  if(file.buffer.length>10*1024*1024) throw invalid('Máximo 10 MB por archivo.');
  const empresa=match[2].toUpperCase(),direccion=match[1].toLowerCase();
  const text=new TextDecoder('utf-8',{fatal:true}); let decoded;
  try {decoded=text.decode(file.buffer);} catch {throw invalid('El CSV debe estar codificado en UTF-8.');}
  const table=csv(decoded),headers=table.shift()?.map(normal);
  const required=['FECHA','NOMBRE AGENTE',direccion==='inbound'?'ORIGEN':'DESTINO','DURACION','SEGUNDOS FACTURADOS','DISPOSICION','COSTO',...(direccion==='inbound'?['TIEMPO ESPERA']:[])];
  if(!headers || new Set(headers).size!==headers.length || required.some(h=>!headers.includes(h))) throw invalid('Columnas incompletas o duplicadas para '+direccion+'.');
  const rows=[],errores=[]; let rechazadas=0;
  for(const [i,values] of table.entries()) {
    try {
      if(values.length!==headers.length) throw invalid('Cantidad de columnas incorrecta');
      const raw=Object.fromEntries(headers.map((h,j)=>[h,values[j].trim()]));
      if(!validDate(raw.FECHA,true)) throw invalid('Fecha inválida');
      const agente=normal(raw['NOMBRE AGENTE']) || 'SIN AGENTE';
      if(agente.length>200) throw invalid('Agente demasiado largo');
      let telefono=raw[direccion==='inbound'?'ORIGEN':'DESTINO'].replace(/[+\s()\-]/g,'');
      if(!/^\d{1,40}$/.test(telefono)) throw invalid('Teléfono inválido');
      if(/^5930\d{9}$/.test(telefono)) telefono='593'+telefono.slice(4);
      else if(/^0\d{9}$/.test(telefono)) telefono='593'+telefono.slice(1);
      function num(key,integer=true) {
        const val=raw[key];
        if(!/^\d+(?:\.\d+)?$/.test(val)) throw invalid(key+' inválido');
        const n=Number(val);
        if(!Number.isFinite(n) || n>1e9 || (integer&&!Number.isInteger(n))) throw invalid(key+' fuera de rango');
        return n;
      }
      const estado=normal(raw.DISPOSICION);
      if(!estado || estado.length>80) throw invalid('Disposición inválida');
      const row={empresa,direccion,fecha:raw.FECHA,agente,telefono,duracion:num('DURACION'),facturados:num('SEGUNDOS FACTURADOS'),espera:direccion==='inbound'?num('TIEMPO ESPERA'):null,estado,costo:num('COSTO',false)};
      row.huella=sha(JSON.stringify(row)); rows.push(row);
    } catch(e) {rechazadas++;if(errores.length<25) errores.push({fila:i+2,error:e.message});}
  }
  return {archivo:name,empresa,direccion,hash:sha(file.buffer),rows,rechazadas,errores,total:table.length};
}
function validateFilters(query={}) {
  const f={};
  for(const key of ['empresa','direccion','desde','hasta','agente','estado']) {
    if(query[key]!==undefined && typeof query[key]!=='string') throw invalid('Filtro inválido: '+key);
    f[key]=(query[key]||'').trim();
  }
  if(f.empresa && !['NETLIFE','ECUANET'].includes(f.empresa)) throw invalid('Empresa inválida.');
  if(f.direccion && !['inbound','outbound'].includes(f.direccion)) throw invalid('Dirección inválida.');
  if(['desde','hasta'].some(k=>f[k]&&!validDate(f[k]))) throw invalid('Fecha inválida.');
  if(f.desde&&f.hasta&&f.desde>f.hasta) throw invalid('El inicio debe ser anterior al fin.');
  if(f.agente.length>200 || f.estado.length>80) throw invalid('Filtro demasiado largo.');
  const page=query.pagina??'1';
  if(!/^\d+$/.test(String(page)) || Number(page)<1 || Number(page)>100000) throw invalid('Página inválida.');
  f.pagina=Number(page); return f;
}
function summarize(rows) {
  function metric(items) {
    const total=items.length,answered=items.filter(r=>r.estado==='ANSWERED');
    const phones=new Set(items.map(r=>r.telefono));
    const waits=items.filter(r=>r.espera!==null && r.espera!==undefined);
    const sum=(list,key)=>list.reduce((a,r)=>a+Number(r[key]||0),0);
    return {numerosAtipicos:items.filter(r=>!/^\d{8,15}$/.test(r.telefono)).length,total,contestadas:answered.length,tasa:total?100*answered.length/total:0,telefonos:phones.size,telefonosContestados:new Set(answered.map(r=>r.telefono)).size,intentosPorTelefono:phones.size?total/phones.size:0,segundosFacturados:sum(items,'facturados'),duracion:sum(items,'duracion'),esperaMedia:waits.length?sum(waits,'espera')/waits.length:null,costo:sum(items,'costo')};
  }
  function group(key) {const groups=new Map();for(const row of rows){const k=key(row);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);} return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([grupo,items])=>({grupo,...metric(items)}));}
  return {resumen:metric(rows),diario:group(r=>r.fecha.slice(0,10)),agentes:group(r=>r.agente),horas:group(r=>r.fecha.slice(11,13)),mapa:group(r=>new Date(r.fecha.slice(0,10)+'T00:00:00Z').getUTCDay()+'-'+r.fecha.slice(11,13)),estados:group(r=>r.estado),empresas:group(r=>r.empresa)};
}
module.exports={parseFile,summarize,validateFilters,invalid,MAX_ROWS};
