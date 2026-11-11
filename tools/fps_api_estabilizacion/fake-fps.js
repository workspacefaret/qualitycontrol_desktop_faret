// Servidor simulado para pruebas locales: imita /api/health de fps-api. Uso: node fake-fps.js <puerto> [ok|mudo|otro]
const http = require('http');
const port = +process.argv[2];
const mode = process.argv[3] || 'ok';
http.createServer((q, r) => {
  if (mode === 'mudo') return; // acepta y no responde (colgado)
  r.setHeader('content-type', 'application/json');
  r.end(JSON.stringify(mode === 'otro' ? { ok: true, service: 'OTRA API' } : { ok: true, service: 'FPS API', status: 'running' }));
}).listen(port, '127.0.0.1', () => console.log('fake listo ' + port));
