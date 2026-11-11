// FPS SIMULADO (datos sintéticos, solo local). Imita GET /sesiones-documentos con el mismo shape que fps-api.
// Control: /__cfg?latency=ms&mode=ok|500|404 ; /__stats ; /__reset
const http = require('http');
const fs = require('fs');
const tpl = JSON.parse(fs.readFileSync(__dirname + '/plantilla.json', 'utf8')).data;
const SESIONES_POR_NP = 26; // promedio real observado (5.900 sesiones / 229 NP)
let cfg = { latency: 0, mode: 'ok', pnc: 354 };
let st = { total: 0, inflight: 0, maxInflight: 0, bytes: 0, sesiones: 0, dataTotal: 0 };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__cfg') { cfg = { latency: +(u.searchParams.get('latency') || 0), mode: u.searchParams.get('mode') || 'ok', pnc: +(u.searchParams.get('pnc') || 354) }; return res.end('ok'); }
  if (u.pathname === '/__stats') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(st)); }
  if (u.pathname === '/__reset') { st = { total: 0, inflight: 0, maxInflight: 0, bytes: 0, sesiones: 0, dataTotal: 0 }; return res.end('ok'); }
  if (u.pathname === '/api/importaciones/pnc') { // Data Faret simulada (mismo shape que la API)
    st.dataTotal++;
    const page = +(u.searchParams.get('page') || 1), size = +(u.searchParams.get('pageSize') || 500);
    const items = [];
    for (let i = (page - 1) * size; i < Math.min(cfg.pnc, page * size); i++) {
      items.push({ id: i + 1, nivel: ['Crítico', 'Mayor', 'Menor'][i % 3], operador: 'Op ' + (i % 30), maquina: 'MAQ ' + (i % 40), fechaFabricacion: '2026-10-' + String(1 + i % 28).padStart(2, '0'), area: 'Pegado', npNv: String(1000 + Math.floor(i / 1.55)) });
    }
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ success: true, data: { items, totalCount: cfg.pnc } }));
  }
  if (u.pathname !== '/sesiones-documentos') { res.statusCode = 404; return res.end('Cannot GET'); }
  st.total++; st.inflight++; st.maxInflight = Math.max(st.maxInflight, st.inflight);
  const done = () => st.inflight--;
  setTimeout(() => {
    if (cfg.mode === '500') { res.statusCode = 500; res.end(JSON.stringify({ ok: false, message: 'FPS_NO_DISPONIBLE' })); return done(); }
    if (cfg.mode === '404') { res.statusCode = 404; res.end('Cannot GET /sesiones-documentos'); return done(); }
    const nps = (u.searchParams.get('np') || '').split(',').filter(Boolean).map(Number);
    if (nps.length > 50) { res.statusCode = 400; res.end(JSON.stringify({ ok: false })); return done(); }
    const ordenes = [], sesiones = [];
    let rk = 1;
    for (const np of nps) {
      const ot = np * 10;
      ordenes.push({ ...tpl.ordenes[0], OrdenTrabajo: ot, NotaVentaFaret: np, NotaVentaInnpack: null });
      for (let i = 0; i < SESIONES_POR_NP; i++) {
        const t = tpl.sesiones[i % tpl.sesiones.length];
        sesiones.push({ ...t, RecordKey: ot * 100 + i, OrdenTrabajo: ot, IdOperador: 100 + (np + i) % 35, IdMaquina: 200 + (np + i) % 40, Maquina: 'MAQ ' + ((np + i) % 40) });
      }
    }
    const body = JSON.stringify({ ok: true, consultadoEn: new Date().toISOString(), data: { nps, ordenes, sesiones } });
    st.bytes += body.length; st.sesiones += sesiones.length;
    res.setHeader('content-type', 'application/json'); res.end(body); done();
  }, cfg.latency);
}).listen(+process.argv[2] || 39500, '127.0.0.1', () => console.log('mock listo'));
