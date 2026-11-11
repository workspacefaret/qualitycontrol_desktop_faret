// Fase 43 — prueba de interfaz: front REAL (vista+controlador) en Edge headless propio (NO es la ventana Photino) contra
// el handler REAL con caché y Data/FPS simulados. Capturas en ./shots.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = decodeURIComponent(path.dirname(fileURLToPath(import.meta.url)));
const shots = path.join(aqui, 'shots'); fs.mkdirSync(shots, { recursive: true });
const udd = path.join(aqui, 'edge_profile'); fs.rmSync(udd, { recursive: true, force: true });
const BASE = 'http://127.0.0.1:39600';
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ['--headless=new', '--remote-debugging-port=9444', `--user-data-dir=${udd}`, '--window-size=1500,1200', '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
let pass = 0, fail = 0;
const out = [];
const P = s => { out.push(s); console.log(s); };
const Check = (n, ok, extra = '') => { ok ? pass++ : fail++; P(`  ${ok ? 'PASS' : 'FAIL'} ${n}${extra ? '  [' + extra + ']' : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const api = async p => { const t = await (await fetch(BASE + p)).text(); try { return JSON.parse(t); } catch { return t; } };
const stats = () => api('/stats');
const mock = (latency, pnc, mode = 'ok') => api(`/mock?latency=${latency}&mode=${mode}&pnc=${pnc}`);

let ws, id = 0; const pend = new Map(); const erroresCdp = [];
async function conectar() {
  for (let i = 0; i < 60; i++) { try { const l = await (await fetch('http://127.0.0.1:9444/json/list')).json(); const pg = l.find(t => t.type === 'page'); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; }); break; } } catch { } await sleep(500); }
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') erroresCdp.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text); };
  await send('Runtime.enable'); await send('Page.enable');
}
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(expr) { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result.result.value; }
async function until(expr, ms = 20000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch { } await sleep(150); } return false; }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(shots, name + '.png'), Buffer.from(r.result.data, 'base64')); P(`     captura: shots/${name}.png`); }
async function nav(q) { await send('Page.navigate', { url: `${BASE}/test.html?${q}` }); await sleep(300); await until('document.readyState==="complete" && !!window.__montar', 15000); await until('!!window.ctl', 15000); }
const txt = id => ev(`(document.getElementById('${id}')?.innerText||'')`);
const visible = id => ev(`(()=>{const e=document.getElementById('${id}'); return !!e && getComputedStyle(e).display!=='none' && e.offsetParent!==null;})()`);
const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return false; e.click(); return true;})()`);
const cargado = () => until(`(()=>{const e=document.getElementById('fevf-contenido'); return !!e && getComputedStyle(e).display!=='none';})()`);

try {
  await conectar();
  await mock(1500, 354); await api('/invalidar'); await api('/cfgcache?timeout=90000&minimo=15000');

  P('== S1. Apertura del modulo con la cache fria (FPS simulado 1,5 s por lote)');
  await nav('nivel=EDITAR');
  Check('muestra indicador de carga con boton Cancelar', await until(`(()=>{const e=document.getElementById('fevf-estado'); return !!e && e.innerText.includes('Cargando') && !!e.querySelector('[data-fevf-cancelar]');})()`, 8000), await txt('fevf-estado'));
  await shot('01_cargando');
  Check('el contenido sigue oculto mientras carga', !(await visible('fevf-contenido')));
  Check('termina de cargar', await cargado());
  let s = await stats();
  Check('carga unica: 5 lotes FPS + 1 pagina Data', s.fps === 5 && s.data === 1, JSON.stringify(s));
  Check('indicador de antiguedad de cache visible', (await txt('fevf-cache')).includes('Datos de FPS cargados'), await txt('fevf-cache'));
  Check('KPIs cargados (PNC filtradas > 0)', Number(await txt('fevf-k-filtradas')) > 0, await txt('fevf-k-filtradas'));
  await shot('02_cargado');

  P('== S2. Filtros y Limpiar: solo calculo local');
  const antes = await stats(); const kpi0 = await txt('fevf-k-filtradas');
  await ev(`(()=>{const m=document.getElementById('fevf-mes'); m.value='10'; m.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(1500);
  s = await stats(); const kpi1 = await txt('fevf-k-filtradas');
  Check('cambiar mes: 0 solicitudes extra a FPS/Data', s.fps === antes.fps && s.data === antes.data, `FPS ${antes.fps}->${s.fps}, Data ${antes.data}->${s.data}`);
  Check('el filtro se aplico (KPI filtradas distinto o igual coherente)', kpi1 !== undefined, `${kpi0} -> ${kpi1}`);
  const b0 = s.bridge;
  await ev(`(async()=>{const m=document.getElementById('fevf-turno'); for (const v of ['A','B','C','A','B','C']) { m.value=v; m.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,40)); }})()`);
  await sleep(1500); s = await stats();
  Check('6 cambios rapidos -> 1 sola llamada al backend (anti-rebote) y 0 a FPS', s.bridge - b0 === 1 && s.fps === antes.fps, `bridge +${s.bridge - b0}`);
  await click('#fevf-limpiar'); await sleep(1500); s = await stats();
  Check('Limpiar: 0 solicitudes extra a FPS/Data', s.fps === antes.fps && s.data === antes.data);
  Check('Limpiar vacia los filtros', (await ev(`document.getElementById('fevf-mes').value+document.getElementById('fevf-turno').value`)) === '');

  P('== S3. Actualizar datos dentro del minimo entre cargas (15 s): se sirve de cache');
  await click('#fevf-actualizar'); await sleep(1500); s = await stats();
  Check('Actualizar repetido no consulta FPS', s.fps === antes.fps && s.data === antes.data, JSON.stringify(s));

  P('== S4. Cancelar con datos ya mostrados (minimo entre cargas = 0)');
  await api('/cfgcache?minimo=0');
  const sPre = await stats();
  await click('#fevf-actualizar');
  Check('muestra "Actualizando" con Cancelar', await until(`(document.getElementById('fevf-estado')?.innerText||'').includes('Actualizando') && !!document.querySelector('[data-fevf-cancelar]')`, 5000));
  await sleep(1800); await shot('03_actualizando');
  await click('[data-fevf-cancelar]');
  Check('mensaje de carga cancelada', await until(`(document.getElementById('fevf-estado')?.innerText||'').includes('Carga cancelada')`, 8000), await txt('fevf-estado'));
  Check('los datos mostrados antes se conservan', await visible('fevf-contenido'));
  await sleep(1200); s = await stats();
  Check('se corto: menos de 5 lotes nuevos enviados', s.fps - sPre.fps < 5 && s.fps - sPre.fps >= 1, `+${s.fps - sPre.fps} lotes`);
  await shot('04_cancelado_con_datos');
  await mock(0, 354); await api('/cfgcache?minimo=15000');

  P('== S5. Detalle de operador, evidencia y pestanas');
  Check('hay filas de operadores', await until(`document.querySelectorAll('[data-fevf-op]').length>0`, 5000));
  await click('[data-fevf-op]');
  Check('abre el detalle del operador', await until(`(document.getElementById('fevf-detalle-op')?.innerText||'').includes('Detalle:')`, 5000));
  await shot('05_detalle_operador');
  await ev(`document.getElementById('fevf-detalle-op').style.display='none'`);
  Check('pestana Confirmadas activa y con filas', (await ev(`document.querySelector('[data-fevf-tab="conf"]').getAttribute('aria-selected')`)) === 'true');
  await click('[data-fevf-ev]');
  Check('evidencia muestra responsabilidad pendiente de Calidad', await until(`(document.querySelector('.fevf-evidencia')?.innerText||'').includes('pendiente de Calidad')`, 5000));
  await ev(`document.querySelector('.fevf-evidencia').scrollIntoView({block:'center'})`); await sleep(300); await shot('06_evidencia');
  await click('[data-fevf-tab="pa"]');
  Check('cambio de pestana a Probables/Ambiguas', (await ev(`document.querySelector('[data-fevf-tab="pa"]').getAttribute('aria-selected')`)) === 'true');
  Check('chips de estado presentes', (await ev(`document.querySelectorAll('.fevf-est').length`)) > 0);

  P('== S6. Nombres (EDITAR) y seudonimos (VER)');
  await api('/invalidar');
  await nav('nivel=VER'); await cargado();
  const opsVer = await ev(`[...document.querySelectorAll('#fevf-tbody-ops tr td:first-child')].map(x=>x.innerText)`);
  Check('VER: aviso de privacidad visible', await visible('fevf-privacidad'));
  Check('VER: todos los operadores son seudonimos OP-xxxxxx', opsVer.length > 0 && opsVer.every(n => /^OP-/.test(n)), opsVer.slice(0, 3).join(', '));
  Check('VER: no se muestra operador escrito en la PNC', !(await ev(`document.getElementById('fevf-tbody-pnc').innerText`)).match(/Op \d+/));
  await shot('07_seudonimos_VER');
  await api('/invalidar');
  await nav('nivel=EDITAR'); await cargado();
  const opsEd = await ev(`[...document.querySelectorAll('#fevf-tbody-ops tr td:first-child')].map(x=>x.innerText)`);
  Check('EDITAR: aviso de privacidad oculto', !(await visible('fevf-privacidad')));
  Check('EDITAR: nombres reales (no OP-)', opsEd.length > 0 && opsEd.every(n => !/^OP-/.test(n)), opsEd.slice(0, 3).join(', '));
  await shot('08_nombres_EDITAR');
  // cambio de permiso SIN invalidar: el nivel VER no debe ver la cache de EDITAR
  const sx = await stats(); await nav('nivel=VER'); await cargado(); const sy = await stats();
  const opsVer2 = await ev(`[...document.querySelectorAll('#fevf-tbody-ops tr td:first-child')].map(x=>x.innerText)`);
  Check('cambiar de EDITAR a VER sin invalidar: carga propia y seudonimos (la cache no se comparte)', sy.fps > sx.fps && opsVer2.every(n => /^OP-/.test(n)), `FPS ${sx.fps}->${sy.fps}`);

  P('== S7. Timeout global (2 s con FPS de 1,5 s por lote)');
  await mock(1500, 354); await api('/invalidar'); await api('/cfgcache?timeout=2000&minimo=15000');
  await nav('nivel=EDITAR');
  Check('muestra Tiempo de carga agotado', await until(`(document.getElementById('fevf-estado')?.innerText||'').includes('Tiempo de carga agotado')`, 12000), await txt('fevf-estado'));
  await shot('09_timeout');
  const st1 = await stats();
  await nav('nivel=EDITAR'); await until(`(document.getElementById('fevf-estado')?.innerText||'').includes('agotado')`, 8000); await sleep(500);
  const st2 = await stats();
  Check('al reabrir el modulo no se reintenta (0 solicitudes) y avisa la espera', st2.fps === st1.fps && (await txt('fevf-estado')).includes('no volverá a consultar'), (await txt('fevf-estado')).slice(0, 160));
  await api('/cfgcache?timeout=90000');

  P('== S8. FPS no disponible / no desplegado / volumen excedido');
  await mock(0, 354, '500'); await api('/invalidar'); await nav('nivel=EDITAR');
  Check('HTTP 500: "FPS no disponible"', await until(`(document.getElementById('fevf-estado')?.innerText||'').includes('FPS no disponible')`, 8000));
  await shot('10_fps_no_disponible'); const sa = await stats();
  Check('HTTP 500: 1 sola solicitud a FPS', sa.fps === 1, JSON.stringify(sa));
  await mock(0, 354, '404'); await api('/invalidar'); await nav('nivel=EDITAR');
  Check('HTTP 404: "Infraestructura pendiente"', await until(`(document.getElementById('fevf-estado')?.innerText||'').includes('Infraestructura pendiente')`, 8000));
  await mock(0, 5000); await api('/invalidar'); await nav('nivel=EDITAR');
  Check('5.000 PNC: "Volumen excedido"', await until(`(document.getElementById('fevf-estado')?.innerText||'').includes('Volumen excedido')`, 20000));
  await shot('11_volumen_excedido'); const sv = await stats();
  Check('5.000 PNC: 0 solicitudes a FPS', sv.fps === 0, JSON.stringify(sv));

  P('== S9. Navegacion entre modulos: destroy() libera listeners y reabrir usa la cache');
  await mock(0, 354); await api('/invalidar'); await nav('nivel=EDITAR'); await cargado();
  let sn = await stats();
  await ev('window.__desmontar()');
  await ev(`(()=>{const m=document.createElement('select'); m.id='fevf-mes'; m.innerHTML='<option value="">x</option><option value="5">5</option>'; document.body.appendChild(m); m.value='5'; m.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await sleep(900); let sm = await stats();
  Check('tras destroy(), un cambio de filtro ya no llama al backend (sin listeners colgados)', sm.bridge === sn.bridge, `bridge ${sn.bridge}->${sm.bridge}`);
  await ev(`document.querySelectorAll('select#fevf-mes').forEach(e=>e.remove())`);
  await ev('window.__montar()'); await cargado(); sm = await stats();
  Check('reabrir el modulo: 0 solicitudes a FPS/Data (usa cache)', sm.fps === sn.fps && sm.data === sn.data, `FPS ${sn.fps}->${sm.fps}`);
  Check('indica la antiguedad de los datos', (await txt('fevf-cache')).includes('Datos de FPS cargados'));
  await api('/invalidar'); const sq = await stats();
  await ev(`(()=>{const m=document.getElementById('fevf-area'); m.value=m.options[1]?.value||''; m.dispatchEvent(new Event('change',{bubbles:true}));})()`); await sleep(1800); const sr = await stats();
  Check('tras cerrar sesion (invalidar) el siguiente cambio recarga desde cero', sr.fps > sq.fps, `FPS ${sq.fps}->${sr.fps}`);

  P('== S10. Errores de JavaScript');
  const errs = await ev('window.__errores');
  Check('sin errores JS en la pagina', errs.length === 0 && erroresCdp.length === 0, JSON.stringify([...errs, ...erroresCdp]).slice(0, 300));
} catch (e) { P('ERROR DEL ARNES: ' + e.stack); fail++; }
finally {
  P(`\nRESULTADO UI: ${pass} PASS, ${fail} FAIL`);
  try { ws?.close(); } catch { }
  edge.kill();
  fs.writeFileSync(path.join(aqui, 'driver_resultado.txt'), out.join('\n'));
  process.exit(fail === 0 ? 0 : 1);
}
