// Quita UNA app de un dump.pm2 por cirugia de texto: el resto del archivo queda byte a byte igual
// (no se re-serializa: el dump tiene claves duplicadas como username/USERNAME que JSON.parse/stringify perderia).
// Uso: node remove-pm2-app.js <entrada> <nombre-app> <salida> [--aplicar]
// Sin --aplicar solo escribe <salida> (copia de trabajo) y valida; nunca modifica <entrada>.
const fs = require('fs');
const [,, inp, appName, out] = process.argv;
if (!inp || !appName || !out) { console.error('Uso: node remove-pm2-app.js <entrada> <app> <salida>'); process.exit(2); }
const txt = fs.readFileSync(inp, 'utf8');
const start = txt.indexOf('[');
if (start < 0 || txt.trimStart()[0] !== '[') { console.error('No es un arreglo JSON'); process.exit(3); }
// Segmentos de primer nivel respetando cadenas y escapes
const segs = []; let depth = 0, inStr = false, esc = false, objStart = -1;
for (let i = start; i < txt.length; i++) {
  const c = txt[i];
  if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
  if (c === '"') { inStr = true; continue; }
  if (c === '{') { if (depth === 1) objStart = i; depth++; }
  else if (c === '}') { depth--; if (depth === 1) segs.push({ s: objStart, e: i + 1 }); }
  else if (c === '[') depth++;
  else if (c === ']') { depth--; if (depth === 0) break; }
}
const nameOf = g => { const m = txt.slice(g.s, g.e).match(/"name"\s*:\s*"([^"]+)"/); return m ? m[1] : null; };
const names = segs.map(nameOf);
const idx = names.map((n, i) => n === appName ? i : -1).filter(i => i >= 0);
if (idx.length !== 1) { console.error(`Se esperaba exactamente 1 app "${appName}", hay ${idx.length}. Apps: ${names.join(', ')}`); process.exit(4); }
const k = idx[0]; let cutS = segs[k].s, cutE = segs[k].e;
if (k < segs.length - 1) cutE = segs[k + 1].s;            // elimina la coma y espacios posteriores
else if (k > 0) cutS = segs[k - 1].e;                      // ultimo: elimina la coma anterior
const res = txt.slice(0, cutS) + txt.slice(cutE);
// Validaciones
const parsed = JSON.parse(res);
const origN = segs.length;
if (!Array.isArray(parsed) || parsed.length !== origN - 1) { console.error('Validacion: conteo inesperado'); process.exit(5); }
for (let i = 0; i < segs.length; i++) if (i !== k) {
  const original = txt.slice(segs[i].s, segs[i].e);
  if (!res.includes(original)) { console.error('Validacion: un segmento restante cambio'); process.exit(6); }
}
fs.writeFileSync(out, res, 'utf8');
console.log(JSON.stringify({ antes: names, despues: names.filter((_, i) => i !== k), bytesAntes: Buffer.byteLength(txt), bytesDespues: Buffer.byteLength(res), restantesIdenticos: true }));
