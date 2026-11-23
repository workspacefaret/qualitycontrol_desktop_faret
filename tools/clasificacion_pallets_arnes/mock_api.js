// Datos y respuestas simuladas de la API de clasificación de pallets (forma exacta del contrato). Lo usan harness.html y harness_app.html.
// Requiere que la página defina antes: ESC, hoy, log, sleep.
// ───────── datos simulados (forma exacta del contrato de la API) ─────────
const PROCESOS = [{ id: 3, nombre: "Troquelado" }, { id: 4, nombre: "Emplacado" }, { id: 5, nombre: "Corrugado" }, { id: 6, nombre: "Pegado" }, { id: 7, nombre: "Paletizado" }];
const MAQUINAS = [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ id: i, nombre: "Máquina " + i, procesoId: PROCESOS[i % 5].id }));
const DEFECTOS = [{ id: 1, nombre: "Descalse", criticidad: "mayor" }, { id: 2, nombre: "Aplastado", criticidad: "critico" }, { id: 3, nombre: "Humedad", criticidad: "mayor" }, { id: 4, nombre: "Mala paletización", criticidad: "menor" }, { id: 5, nombre: "Rayado superficial de la lámina", criticidad: "menor" }];
const INSPECTORES = ["Marcela Soto", "Jorge Pérez", "Camila Rojas", "Luis Montoya"];
const FOTO = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'><rect width='100%' height='100%' fill='#cbd5e1'/><text x='50%' y='50%' text-anchor='middle' font-size='28' fill='#334155'>FOTO PALLET</text></svg>");
const FOTO_ROTA = "https://invalido.invalid/uploads/x.jpg?exp=1&sig=2";

function pad(n) { return String(n).padStart(2, "0"); }
function construirEventos(cantidad) {
  const eventos = [];
  let id = 1;
  const secuencia = ["VERDE", "VERDE", "AZUL", "ROJO", "VERDE", "AZUL", "VERDE", "ROJO", "VERDE", "VERDE"];
  for (let i = 1; i <= cantidad; i++) {
    const dia = window.DateUtils.sumarDias(hoy, -(i % 40));
    const maq = MAQUINAS[i % 8];
    const proc = PROCESOS.find(p => p.id === maq.procesoId);
    const base = {
      palletCodigo: `${460000 + i}-${(i % 5) + 1}`, recordKey: 460000 + i, nEtiqueta: (i % 5) + 1,
      inspeccion: { usuarioId: 10 + (i % 4), inspector: INSPECTORES[i % 4], procesoId: proc.id, proceso: proc.nombre, maquinaId: maq.id, maquina: maq.nombre, np: String(3900 + (i % 12)), turno: "AB"[i % 2], area: "CALIDAD INNPACK", estadoValidacion: "Pendiente" },
      fps: { verificado: i % 17 !== 0, ordenFabricacion: String(22000 + i), npFaret: String(22000 + i), npInnpack: String(3900 + (i % 12)), cliente: "CLIENTE " + (i % 6), itemNp: "1", codigoProducto: "PT-" + (1000 + i), producto: "PLIEGO TROQUELADO " + (i % 9), proceso: "TROQUEL", maquina: maq.nombre, operador: "OPERADOR " + (i % 5), fechaTarja: dia + "T08:15:00", cantidadUnidades: 800 + i * 10, totalEtiquetas: 25 },
    };
    const colores = [secuencia[i % 10]];
    if (i % 7 === 0) colores.push("ROJO");           // reclasificación AZUL/VERDE → ROJO
    if (i % 11 === 0) colores.push("VERDE");
    colores.forEach((color, k) => {
      const nd = color === "VERDE" ? 0 : 1 + ((i + k) % 2);
      eventos.push({
        id: id++, registroId: 3000 + i, ...base, color, observacion: color === "ROJO" ? "golpe en esquina #" + i : (color === "AZUL" ? "revisar humedad" : null),
        fotoUrl: i % 5 === 0 ? null : (i % 13 === 0 ? FOTO_ROTA : FOTO),
        clasificadoEn: `${dia}T${pad(7 + k * 3)}:${pad((i * 7) % 60)}:00`,
        anulado: false, anuladoEn: null, anuladoPor: null, motivoAnulacion: null,
        defectos: DEFECTOS.slice(0, nd).map((d, j) => DEFECTOS[(i + j) % 5]).filter((d, j, a) => a.findIndex(x => x.id === d.id) === j),
      });
    });
  }
  // Una clasificación anulada (el primer ROJO del pallet 3, para ver la fila "Anulada" en eventos)
  const anul = eventos.find(e => e.color === "ROJO");
  Object.assign(anul, { anulado: true, anuladoEn: hoy + "T09:00:00", anuladoPor: "Jefe de Calidad", motivoAnulacion: "Pallet mal escaneado" });
  return eventos;
}
let EVENTOS = ESC === "vacio" ? [] : construirEventos(70);
// XSS: un registro con HTML en campos de texto libre
if (EVENTOS.length) { EVENTOS[1].observacion = "<img src=x onerror=\"window.__xss=1\">"; EVENTOS[1].defectos = [{ id: 99, nombre: "<b id=xssb>x</b>", criticidad: "mayor" }]; }

function vigentes(lista) {
  const ultimo = new Map();
  lista.filter(e => !e.anulado).forEach(e => { const p = ultimo.get(e.palletCodigo); if (!p || e.id > p.id) ultimo.set(e.palletCodigo, e); });
  return [...ultimo.values()];
}
function marcar(lista) { const v = new Set(vigentes(EVENTOS).map(e => e.id)); return lista.map(e => ({ ...e, vigente: v.has(e.id) })); }
function filtrar(d) {
  let l = d.vista === "eventos" ? EVENTOS.filter(e => d.incluirAnuladas || !e.anulado) : vigentes(EVENTOS);
  if (d.desde) l = l.filter(e => e.clasificadoEn.slice(0, 10) >= d.desde);
  if (d.hasta) l = l.filter(e => e.clasificadoEn.slice(0, 10) <= d.hasta);
  if (d.color) l = l.filter(e => e.color === d.color);
  if (d.procesoId) l = l.filter(e => e.inspeccion.procesoId === d.procesoId);
  if (d.maquinaId) l = l.filter(e => e.inspeccion.maquinaId === d.maquinaId);
  if (d.np) l = l.filter(e => e.inspeccion.np === d.np);
  if (d.palletCodigo) l = l.filter(e => e.palletCodigo === d.palletCodigo);
  if (d.defectoId) l = l.filter(e => e.defectos.some(x => x.id === d.defectoId));
  return marcar(l.slice().sort((a, b) => b.id - a.id));
}
// La API real devuelve NULL (no 0) en azul/rojo/verde cuando no hay filas (SUM sobre un conjunto vacío): el simulador lo reproduce.
function totales(l) { const c = k => (l.length ? l.filter(e => e.color === k).length : null); return { azul: c("AZUL"), rojo: c("ROJO"), verde: c("VERDE"), total: l.length }; }
function agrupar(l, idK, nomK) {
  const m = new Map();
  l.forEach(e => { const id = e.inspeccion[idK]; const o = m.get(id) || { id, nombre: e.inspeccion[nomK], azul: 0, rojo: 0, verde: 0, total: 0 }; o[e.color.toLowerCase()]++; o.total++; m.set(id, o); });
  return [...m.values()];
}
const OFFLINE = { v: ESC === "error" };
let retardo = 0;
async function responderMock(msg) {
  const d = msg.data || {};
  log.push({ action: msg.action, data: JSON.parse(JSON.stringify(d)) });
  if (retardo) await sleep(typeof retardo === "function" ? retardo(msg) : retardo);
  if (OFFLINE.v) return { ok: false, error: "No se pudo completar la consulta." };
  switch (msg.action) {
    case "clasificacionPallets.list": {
      const l = filtrar(d); const lim = d.limite || 50, pag = d.pagina || 1;
      return { ok: true, data: { total: l.length, pagina: pag, limite: lim, items: l.slice((pag - 1) * lim, pag * lim) } };
    }
    case "clasificacionPallets.resumen": {
      const l = filtrar(d);
      const porDia = new Map();
      l.forEach(e => { const k = e.clasificadoEn.slice(0, 10); const o = porDia.get(k) || { dia: k, azul: 0, rojo: 0, verde: 0, total: 0 }; o[e.color.toLowerCase()]++; o.total++; porDia.set(k, o); });
      return { ok: true, data: { vista: d.vista, totales: totales(l), porProceso: agrupar(l, "procesoId", "proceso"), porMaquina: agrupar(l, "maquinaId", "maquina"), porDia: [...porDia.values()] } };
    }
    case "clasificacionPallets.defectos": {
      const l = filtrar(d); const m = new Map(); const sin = {};
      l.forEach(e => { if (!e.defectos.length) sin[e.color] = (sin[e.color] || 0) + 1; e.defectos.forEach(x => { const k = e.color + x.id; const o = m.get(k) || { color: e.color, defectoId: x.id, nombre: x.nombre, criticidad: x.criticidad, cantidad: 0 }; o.cantidad++; m.set(k, o); }); });
      return { ok: true, data: { porDefecto: [...m.values()], sinDefecto: Object.entries(sin).map(([color, cantidad]) => ({ color, cantidad })) } };
    }
    case "clasificacionPallets.detalle": {
      const e = marcar(EVENTOS).find(x => x.id === d.id);
      if (!e) return { ok: false, error: "Clasificación no encontrada." };
      return { ok: true, data: { ...e, historial: marcar(EVENTOS.filter(x => x.palletCodigo === e.palletCodigo)) } };
    }
    case "clasificacionPallets.anular": {
      const e = EVENTOS.find(x => x.id === d.id);
      if (!e || e.anulado) return { ok: false, error: "Clasificación no encontrada o ya anulada." };
      if (d.motivo === "FORZAR_403") return { ok: false, error: "No tienes permiso para anular." };
      Object.assign(e, { anulado: true, anuladoEn: hoy + "T12:00:00", anuladoPor: "Prueba", motivoAnulacion: d.motivo });
      return { ok: true, data: { id: e.id } };
    }
  }
  return { ok: false, error: "acción no soportada " + msg.action };
}
