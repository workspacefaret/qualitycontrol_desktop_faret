// Fase 32 — Conciliación PNC (Data Faret) ↔ gestión (Mejora Continua) ↔ Inicio ↔ Evaluación por Operador,
// con DATOS REALES y SIN CREDENCIALES EN ESTE SCRIPT.
//
// Uso (lo ejecuta una persona):
//   1) set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333
//      dotnet run -c Release            (o el ejecutable publicado)
//   2) En la ventana: elegir FARET e iniciar sesión con SU PROPIA cuenta (ADMIN_TI o con VER en el módulo).
//   3) node tools/faret_validacion_real/conciliacion_real.mjs <carpeta_salida>
//
// Solo invoca acciones de LECTURA del puente real (faret.data.list, faret.nc.list, faret.dashboard.resumen,
// faret.evaluacionOperadores.resumen). No escribe nada. La salida trae conteos, ids y códigos; los nombres de
// operador se reemplazan por un hash corto (no se versiona la salida).
import { createHash } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

const out = process.argv[2] || ".";
mkdirSync(out, { recursive: true });
const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const page = list.find(t => t.type === "page");
if (!page) throw new Error("No hay ventana Photino con depuración remota en el puerto 9333.");
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
await new Promise(r => (ws.onopen = r));
const cdp = (method, params = {}) => new Promise(r => { const i = ++seq; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const send = async (action, data = {}, modulo = "faret") => {
  // Payload plano, igual que los controllers; `_modulo` lo agrega el puente con el módulo abierto.
  const expr = `window.PhotinoBridge.send(${JSON.stringify({ action, ...data })}).then(r=>JSON.stringify(r)).catch(e=>JSON.stringify({ok:false,error:String(e)}))`;
  const r = await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  return JSON.parse(r.result.result.value);
};
const seud = s => (s ? "OP-" + createHash("sha256").update(String(s).trim().toUpperCase()).digest("hex").slice(0, 6) : null);
const norm = s => String(s ?? "").trim().toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const sesion = JSON.parse((await cdp("Runtime.evaluate", { expression: `JSON.stringify({empresa:sessionStorage.getItem('empresa'),rol:sessionStorage.getItem('faretRol'),perm:(window.App&&App.permisos)||null})`, returnByValue: true })).result.result.value);
if (sesion.empresa !== "FARET") throw new Error("La ventana no tiene una sesión FARET iniciada.");

// 1) Data completa (paginada). Si una página falla, se aborta: nunca se informan parciales como totales.
const data = []; let total = null;
for (let p = 1; p <= 200; p++) {
  const r = await send("faret.data.list", { page: p, pageSize: 500 }, "faret-nc");
  if (!r.ok) throw new Error(`faret.data.list página ${p}: ${r.error}`);
  const d = r.data?.items ? r.data : r.data?.data;
  total ??= d.totalCount; data.push(...d.items);
  if (d.items.length === 0 || data.length >= total) break;
}
if (data.length !== total) throw new Error(`Data incompleta: ${data.length} de ${total}.`);

// 2) Gestión (Mejora Continua)
const rn = await send("faret.nc.list", {}, "faret-nc");
if (!rn.ok) throw new Error("faret.nc.list: " + rn.error);
const ncs = Array.isArray(rn.data) ? rn.data : rn.data?.items || rn.data?.data || [];

// 3) Conciliación
const dataIds = new Set(data.map(d => String(d.id)));
const porOrigen = new Map();
for (const n of ncs) if (n.sistemaOrigen === "DATA_FARET" && n.origenId) {
  const k = String(n.origenId); (porOrigen.get(k) || porOrigen.set(k, []).get(k)).push(n);
}
const cerrada = n => norm(n.estadoGestion) === "CERRADA";
const esCritico = d => norm(d.nivel).startsWith("CRITIC");
const sinGestion = data.filter(d => !porOrigen.has(String(d.id)));
const enGestionAbierta = ncs.filter(n => !cerrada(n) && (n.sistemaOrigen !== "DATA_FARET" || dataIds.has(String(n.origenId))));
const duplicadas = [...porOrigen].filter(([, v]) => v.length > 1).map(([k, v]) => ({ dataId: k, nc: v.map(x => x.codigo) }));
const huerfanas = [...porOrigen.keys()].filter(k => !dataIds.has(k));
const criticasSinCerrar = data.filter(esCritico).map(d => {
  const v = porOrigen.get(String(d.id)) || [];
  const estado = v.length === 0 ? "SIN_GESTION" : v.every(cerrada) ? "CERRADA" : v.find(x => !cerrada(x)).estadoGestion;
  return { dataId: d.id, npNv: d.npNv, tipoPnc: d.tipoPnc, fechaIngreso: d.fechaIngreso, estado, nc: v.map(x => x.codigo) };
}).filter(x => x.estado !== "CERRADA");
const rechazoClienteAbierto = criticasSinCerrar.filter(x => norm(x.tipoPnc) === "RECHAZO CLIENTE");
const ncManualesAbiertas = ncs.filter(n => n.sistemaOrigen !== "DATA_FARET" && !cerrada(n)).map(n => n.codigo);
const sinFechaFab = data.filter(d => !d.fechaFabricacion).length;

// 4) Inicio (backend real) y Evaluación (backend real)
const rd = await send("faret.dashboard.resumen", {}, "faret");
const k = rd.ok ? rd.data.kpis : null;
const re = await send("faret.evaluacionOperadores.resumen", {}, "faret-evaluacion-operadores");
const ev = re.ok ? re.data.resultado : null;

const esperado = { pncSinGestion: sinGestion.length, ncEnGestionAbiertas: enGestionAbierta.length,
  pendientesCierre: sinGestion.length + enGestionAbierta.length, criticasSinCerrar: criticasSinCerrar.length };
const checks = [];
const chk = (n, ok, det) => checks.push({ prueba: n, ok: !!ok, det });
chk("Inicio responde", rd.ok, rd.error);
if (k) {
  chk("Inicio dataDisponible", k.dataDisponible === true, k.dataDisponible);
  chk("Inicio pncSinGestion = conciliación", k.pncSinGestion === esperado.pncSinGestion, [k.pncSinGestion, esperado.pncSinGestion]);
  chk("Inicio NC abiertas en gestión = conciliación", k.ncAbiertas === esperado.ncEnGestionAbiertas, [k.ncAbiertas, esperado.ncEnGestionAbiertas]);
  chk("Inicio pendientes de cierre = conciliación (sin duplicar)", k.pncPendientesCierre === esperado.pendientesCierre, [k.pncPendientesCierre, esperado.pendientesCierre]);
  chk("Inicio críticas sin cerrar = conciliación", k.criticasAbiertas === esperado.criticasSinCerrar, [k.criticasAbiertas, esperado.criticasSinCerrar]);
}
chk("Evaluación responde", re.ok, re.error);
if (ev) {
  chk("Evaluación: universo = filas de Data", ev.totales.registradas === data.length, [ev.totales.registradas, data.length]);
  chk("Evaluación: evaluables + excluidas = registradas", ev.totales.evaluables + ev.totales.excluidas === ev.totales.registradas, ev.totales);
  chk("Evaluación: sin fecha de fabricación coincide", ev.totales.sinFechaFabricacion === sinFechaFab, [ev.totales.sinFechaFabricacion, sinFechaFab]);
  chk("Evaluación: FPS informado como no disponible (sin atribución)", re.data.fps && re.data.fps.disponible === false, re.data.fps);
  // Detalle trazable de un operador (el primero con PNC evaluables)
  const op = ev.porOperador?.[0]?.operador;
  if (op) {
    const rdet = await send("faret.evaluacionOperadores.resumen", { operador: op }, "faret-evaluacion-operadores");
    const det = rdet.ok ? rdet.data.resultado.detalle || [] : [];
    chk("Evaluación: detalle por operador con NP/NV y id Data existentes", det.length > 0 && det.every(x => dataIds.has(String(x.id))), det.length);
    chk("Evaluación: puntos del detalle = puntos del operador", det.reduce((a, x) => a + (x.puntos || 0), 0) === ev.porOperador[0].puntos, null);
  }
}

const resumen = {
  fecha: new Date().toISOString(), rol: sesion.rol, nivelModulo: sesion.perm?.["faret-evaluacion-operadores"] ?? null,
  data: { total: data.length, criticas: data.filter(esCritico).length, sinFechaFabricacion: sinFechaFab },
  gestion: { total: ncs.length, vinculadasData: [...porOrigen.values()].reduce((a, v) => a + v.length, 0),
    cerradas: ncs.filter(cerrada).length, abiertasEnGestion: enGestionAbierta.length, manualesAbiertas: ncManualesAbiertas },
  esperado, duplicadas, huerfanas,
  pncSinGestion: sinGestion.map(d => ({ dataId: d.id, npNv: d.npNv, tipoPnc: d.tipoPnc, nivel: d.nivel, fechaIngreso: d.fechaIngreso })),
  criticasSinCerrar, rechazoClienteCriticoAbierto: rechazoClienteAbierto,
  inicio: k, evaluacion: ev && { totales: ev.totales, operadores: (ev.porOperador || []).length, maquinas: (ev.opciones?.maquinas || []).length,
    areas: ev.opciones?.areas || [], nombresVisibles: re.data.nombresVisibles,
    muestraOperadores: (ev.porOperador || []).slice(0, 5).map(o => ({ ...o, operador: re.data.nombresVisibles ? seud(o.operador) : o.operador })) },
  checks,
};
writeFileSync(`${out}/conciliacion_real.json`, JSON.stringify(resumen, null, 2));
for (const c of checks) console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.prueba}${c.ok ? "" : "  → " + JSON.stringify(c.det)}`);
console.log(`\nData ${data.length} · gestión ${ncs.length} · sin gestión ${sinGestion.length} · críticas sin cerrar ${criticasSinCerrar.length} · rechazo cliente crítico abierto ${rechazoClienteAbierto.length}`);
console.log(`Duplicadas ${duplicadas.length} · NC huérfanas ${huerfanas.length} · salida: ${out}/conciliacion_real.json`);
ws.close();
process.exit(checks.every(c => c.ok) ? 0 : 1);
