// Uso: node cdp.mjs "<expresion JS>" [--shot ruta.png]
const port = 9333;
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const expr = process.argv[2];
const shotIdx = process.argv.indexOf('--shot');
if (expr && expr !== '-') {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result.result.value ?? r.result.exceptionDetails ?? r.result, null, 1));
}
if (shotIdx > 0) {
  await send('Page.bringToFront'); await new Promise(r=>setTimeout(r,500)); const r = await send('Page.captureScreenshot', { format: 'png' });
  (await import('node:fs')).writeFileSync(process.argv[shotIdx + 1], Buffer.from(r.result.data, 'base64'));
  console.log('shot ok');
}
ws.close();
