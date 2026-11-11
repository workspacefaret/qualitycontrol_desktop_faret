const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => (await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })).result.result.value;
const wait = ms => new Promise(r => setTimeout(r, ms));
await ev(`(()=>{window.__e=[];window.addEventListener('error',e=>window.__e.push(e.message));window.addEventListener('unhandledrejection',e=>window.__e.push('rej:'+(e.reason&&e.reason.message||e.reason)));return 1})()`);
console.log('version sidebar:', await ev(`document.querySelector('.version')?.textContent`));
for (const m of ['inicio','no-conformidades','nc-internas','trazabilidad','muestra-laboratorio','registros-control','dashboard','maquinas-seguimiento','evaluacion-operadores','no-conformidades']) {
  await ev(`(()=>{window.__e=[];App.loadModule('${m}');return 1})()`); await wait(1800);
  const r = await ev(`JSON.stringify({cls:document.querySelector('#app-content')?.firstElementChild?.className, errs:window.__e})`);
  console.log(m.padEnd(24), r);
}
ws.close();
