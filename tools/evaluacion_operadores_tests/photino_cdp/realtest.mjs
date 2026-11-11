// Prueba en la VENTANA PHOTINO REAL (CDP): UI real + backend real; la respuesta de la API la inyecta un stub
// del puente con salidas del calculador real (datos sinteticos). Uso: node realtest.mjs
import fs from 'node:fs';
const S = process.argv[2] || '.';
const port = 9333;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result.result.value; };
const shot = async (name) => { await send('Page.bringToFront'); await new Promise(r=>setTimeout(r,700)); const r = await Promise.race([send('Page.captureScreenshot', { format: 'png' }), new Promise(r=>setTimeout(()=>r({result:{data:''}}),8000))]); fs.writeFileSync(`${S}/${name}.png`, Buffer.from(r.result.data, 'base64')); };

await send('Page.bringToFront'); console.log('conectado');
const maps = {};
for (const [k, f] of Object.entries({ none: 'd_none', mar: 'd_mar', combo: 'd_combo', y2030: 'd_2030', ana: 'd_ana' })) maps[k] = JSON.parse(fs.readFileSync(`${S}/${f}.json`, 'utf8').replace(/^﻿/, ''));
console.log('instalando stub');
await ev(`(()=>{ window.__orig = window.__orig || window.PhotinoBridge.send.bind(window.PhotinoBridge); window.__errs=[]; window.addEventListener('error',e=>window.__errs.push(e.message)); const oc=console.error; console.error=(...a)=>{window.__errs.push('console.error:'+a.join(' '));oc(...a)}; window.__calls=[]; window.__maps=${JSON.stringify(maps)}; window.__mode='ok';
 window.PhotinoBridge.send = async (p)=>{ if(p.action!=='evaluacionOperadores.resumen') return {ok:false,error:'stub: otra accion'}; window.__calls.push({anio:p.anio,mes:p.mes,maquina:p.maquina,operador:p.operador});
   if(window.__mode==='throw') throw new Error('x'); if(window.__mode==='fail') return {ok:false,error:'Timeout de la API'};
   const k = p.anio===2030?'y2030':(p.anio===2026&&p.mes===4&&p.maquina==='M2'&&p.operador==='Luis Soto')?'combo':(p.anio===2026&&p.mes===3&&!p.maquina&&!p.operador)?'mar':(p.operador==='Ana Perez'&&!p.anio&&!p.mes&&!p.maquina)?'ana':(!p.anio&&!p.mes&&!p.maquina&&!p.operador)?'none':null;
   return k? window.__maps[k] : {ok:false,error:'combinacion no simulada '+JSON.stringify(p)}; }; })()`);

const snap = () => ev(`(()=>{const t=id=>document.getElementById(id)?.textContent.trim(); const vis=id=>{const e=document.getElementById(id);return !!e&&e.style.display!=='none'&&e.offsetParent!==null};
 const over=[...document.querySelectorAll('.evop-module *')].filter(e=>e.offsetParent&&e.getBoundingClientRect().right>innerWidth+1&&!e.closest('.table-container')).length;
 return JSON.stringify({estado:vis('evop-estado')?t('evop-estado'):null, contenido:vis('evop-contenido'), reg:t('evop-k-registradas'), eval:t('evop-k-evaluables'), excl:t('evop-k-excluidas'), cr:t('evop-k-criticas'), ma:t('evop-k-mayores'), me:t('evop-k-menores'), pts:t('evop-k-puntos'), filas:document.querySelectorAll('#evop-tbody tr').length, adv:document.querySelectorAll('.evop-adv').length, charts:Object.keys(window.EvaluacionOperadoresController?{}:{}).length, canvases:[...document.querySelectorAll('.evop-canvas canvas')].filter(c=>c.width>0&&c.height>0).length, scrollOverflow: document.documentElement.scrollWidth>innerWidth, cortados: over, errs: window.__errs, calls: window.__calls.length})})()`);
const wait = ms => new Promise(r => setTimeout(r, ms));
const setSel = (id, v) => ev(`(()=>{const s=document.getElementById('${id}'); s.value='${v}'; s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
const out = {}; const check = (n, ok, d = '') => { out[n] = ok ? 'PASS' : 'FAIL ' + d; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' -> ' + d)); };

console.log('stub ok');
await ev(`(()=>{App.loadModule('evaluacion-operadores');return 1})()`); await wait(1800);
let s = JSON.parse(await snap()); console.log('snap1'); await shot('real_ok'); console.log('shot1');
check('Abre y renderiza (8 reg, 4 evaluables, 21 pts)', s.contenido && s.reg === '8' && s.eval === '4' && s.pts === '21', JSON.stringify(s));
check('Tabla con 2 operadores, 3 gráficos con canvas, advertencias visibles', s.filas === 2 && s.canvases === 3 && s.adv >= 5, JSON.stringify(s));
check('Sin desborde horizontal ni elementos cortados', !s.scrollOverflow && s.cortados === 0, JSON.stringify(s));
check('Sin errores JS', s.errs.length === 0, JSON.stringify(s.errs));
check('Opciones de filtro pobladas', await ev(`document.getElementById('evop-anio').options.length>1 && document.getElementById('evop-maquina').options.length===3 && document.getElementById('evop-operador').options.length===3`));

// 2) filtros y combinaciones
await setSel('evop-anio', '2026'); await setSel('evop-mes', '3'); await wait(1200);
s = JSON.parse(await snap());
check('Año+mes=2026/03 → 2 registradas, 15 puntos... (mar: 2 reg)', s.reg === '2' && s.pts === '15', JSON.stringify(s));
await setSel('evop-mes', ''); await setSel('evop-anio', ''); await setSel('evop-operador', 'Ana Perez'); await wait(1200);
s = JSON.parse(await snap()); check('Filtro operador', s.contenido && s.filas === 1, JSON.stringify(s));
await ev(`document.getElementById('evop-limpiar').click()`); await wait(1200);
s = JSON.parse(await snap());
check('Limpiar restablece filtros y cifras', s.reg === '8' && await ev(`['evop-anio','evop-mes','evop-maquina','evop-operador'].every(i=>document.getElementById(i).value==='')`), JSON.stringify(s));
await setSel('evop-anio', '2026'); await setSel('evop-mes', '4'); await setSel('evop-maquina', 'M2'); await setSel('evop-operador', 'Luis Soto'); await wait(1500);
const calls = await ev(`JSON.stringify(window.__calls.slice(-1))`);
s = JSON.parse(await snap());
check('Filtros combinados llegan juntos al backend', calls.includes('"anio":2026') && calls.includes('"mes":4') && calls.includes('M2') && calls.includes('Luis Soto'), calls);
check('Combinados → 2 registradas, 1 evaluable', s.reg === '2' && s.eval === '1', JSON.stringify(s));

// 3) sin resultados / error
await setSel('evop-mes', ''); await setSel('evop-maquina', ''); await setSel('evop-operador', ''); await setSel('evop-anio', '2026');
await ev(`window.__maps.y2030 = window.__maps.y2030`); // 2030 no existe en las opciones: se fuerza como valor
await ev(`(()=>{const s=document.getElementById('evop-anio'); const o=document.createElement('option');o.value='2030';o.textContent='2030';s.appendChild(o); s.value='2030'; s.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(1200);
s = JSON.parse(await snap()); await shot('real_sin_resultados');
check('Sin resultados por filtros: mensaje y sin ceros engañosos', /Sin resultados/.test(s.estado || '') , JSON.stringify(s));
await setSel('evop-anio', ''); await wait(800);
await ev(`window.__mode='throw'`); await setSel('evop-mes', '3'); await wait(1000); s = JSON.parse(await snap()); await shot('real_error');
check('Error de conexión: mensaje de error y contenido oculto (no ceros)', /Error de conexión/.test(s.estado || '') && !s.contenido, JSON.stringify(s));
await ev(`window.__mode='fail'`); await setSel('evop-mes', '4'); await wait(1000); s = JSON.parse(await snap());
check('Error de API: mensaje de error y contenido oculto', /Error al cargar/.test(s.estado || '') && !s.contenido, JSON.stringify(s));
await ev(`window.__mode='ok'`); await setSel('evop-mes', ''); await wait(1000);

// 4) navegar a otras secciones y volver
await ev(`(()=>{App.loadModule('no-conformidades');return 1})()`); await wait(1500);
const enNC = await ev(`document.querySelector('#app-content')?.firstElementChild?.className`);
await ev(`(()=>{App.loadModule('evaluacion-operadores');return 1})()`); await wait(1800);
s = JSON.parse(await snap());
check('Navegar a No Conformidades y volver: módulo sano, sin errores (' + enNC + ')', s.contenido && s.reg === '8' && s.canvases === 3, JSON.stringify(s));
check('Sin errores JS al final', (await ev(`window.__errs.filter(e=>!/stub|Photino|Failed to fetch/i.test(e)).length`)) === 0, await ev(`JSON.stringify(window.__errs)`));
// tamaños de ventana
console.log('viewport', await ev(`innerWidth+'x'+innerHeight`));
fs.writeFileSync(`${S}/realtest_result.json`, JSON.stringify(out, null, 1));
ws.close();
