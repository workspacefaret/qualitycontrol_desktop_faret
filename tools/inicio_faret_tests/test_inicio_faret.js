const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(process.argv[2] || path.join(__dirname, "../../src/UI/www/modules/faret/faret.controller.js"), "utf8");
let html = ""; const handlers = {};
const el = { set innerHTML(v){ html = v; }, get innerHTML(){ return html; },
  querySelectorAll(sel){ const cls = sel.slice(1); const out = [];
    const re = new RegExp('class="[^"]*' + cls + '[^"]*"[^>]*data-(?:modulo|doc-id)="([^"]+)"', "g"); let m;
    while ((m = re.exec(html))) { const v = m[1]; out.push({ dataset: { modulo: v, docId: v }, addEventListener: (e, f) => { handlers[cls + ":" + v] = f; } }); }
    return out; } };
global.sessionStorage = { _m: {}, setItem(k, v){ this._m[k] = v; }, getItem(k){ return this._m[k] ?? null; }, removeItem(k){ delete this._m[k]; } };
global.document = { getElementById: id => id === "fh-alertas-activas" ? el : null };
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const hace = n => { const d = new Date(); d.setDate(d.getDate()-n); return iso(d); };
global.window = { DateUtils: { hoyISO: () => iso(new Date()), formatear: v => String(v).split("-").reverse().join("-") } };
eval(src); const C = window.FaretController;
let fallos = 0; const ok = (n, c) => { console.log((c ? "PASS " : "FAIL ") + n); if (!c) fallos++; };
function nuevo(permisos, respuestas, dash) {
  window.App = { nivelModulo: m => (permisos[m] || "EDITAR") };
  const c = new C(); c._escape = s => String(s); c._datos = { dashboard: dash };
  c._fetch = async (a, p) => { const r = respuestas[a === "controlDocumental.list" ? a + ":" + p.alcanceEmpresa : a]; return r === undefined ? null : r; };
  return c;
}
const dashOk = (det) => ({ kpis: { dataDisponible: true }, criticasAbiertasDetalle: det });
(async () => {
  // PNC: solo dataId>0 cuenta (manuales excluidas), sin límite de antigüedad
  let c = nuevo({}, {}, dashOk([
    { dataId: 5, estadoGestion: "SIN_GESTION", fechaIngreso: "01-01-2025" },
    { dataId: 6, estadoGestion: "PENDIENTE", fechaIngreso: "10-11-2026" },
    { dataId: 0, estadoGestion: "ABIERTA", fechaIngreso: "10-11-2026" }]));
  let a = c._alertaPnc();
  ok("PNC: 2 críticas Data (manual excluida), 1 sin gestión, antigua visible", a.cantidad === 2 && /1 sin gestión/.test(a.texto) && /hace \d{3,} días/.test(a.texto));
  ok("PNC: cero críticas => null", nuevo({}, {}, dashOk([]))._alertaPnc() === null);
  ok("PNC: solo manual => null", nuevo({}, {}, dashOk([{dataId:0}]))._alertaPnc() === null);
  ok("PNC: Data no disponible => error (no 0)", nuevo({}, {}, { kpis: { dataDisponible: false } })._alertaPnc() === "error");
  ok("PNC: sin permiso => null", nuevo({ "faret-nc": "SIN_ACCESO" }, {}, dashOk([{dataId:1}]))._alertaPnc() === null);
  // NC internas: >15 días
  const nci = items => nuevo({}, { "noConformidades.list": { items } }, null)._alertaNcInternas();
  const r = await nci([
    { estadoGestion: "PENDIENTE", fechaDeteccion: hace(15) },        // exactamente 15 -> NO
    { estadoGestion: "PENDIENTE", fechaDeteccion: hace(16) },        // 16 -> SI
    { estadoGestion: "EN_GESTION", fechaDeteccion: hace(40) + "T00:00:00" }, // SI
    { estadoGestion: "CERRADA", fechaDeteccion: hace(90) },          // cerrada -> NO
    { estadoGestion: "PENDIENTE", fechaDeteccion: "0001-01-01" },    // inválida -> NO
    { estadoGestion: "PENDIENTE", fechaDeteccion: null },            // NO
    { estadoGestion: "PENDIENTE", fechaDeteccion: hace(3) }]);       // reciente -> NO
  ok("NCI: cuenta solo abiertas con >15 días (=2)", r.cantidad === 2);
  ok("NCI: todas recientes => null", (await nci([{ estadoGestion: "PENDIENTE", fechaDeteccion: hace(5) }])) === null);
  ok("NCI: error de carga => error", (await nuevo({}, {}, null)._alertaNcInternas()) === "error");
  ok("NCI: sin permiso => null", (await nuevo({ "faret-nc-internas": "SIN_ACCESO" }, {}, null)._alertaNcInternas()) === null);
  // Documentos
  const doc = (f, am) => nuevo({}, { "controlDocumental.list:FARET": f, "controlDocumental.list:AMBAS": am }, null)._alertaDocumentos();
  const d = await doc({ items: [
    { estado: "VIGENTE", versionProximaRevision: hace(1) },          // SI
    { estado: "OBSOLETO", versionProximaRevision: hace(50) },        // NO
    { estado: "VIGENTE", versionProximaRevision: null },             // NO
    { estado: "VIGENTE", versionProximaRevision: "0001-01-01" },     // NO
    { estado: "EN_REVISION", versionProximaRevision: iso(new Date()) }] }, // hoy => NO
    { items: [{ estado: "VIGENTE", versionProximaRevision: hace(10) }] });  // SI
  ok("DOC: cuenta 2 vencidos (FARET+AMBAS, no obsoletos/nulos/hoy)", d.cantidad === 2);
  ok("DOC: un lado falla => error", (await doc({ items: [] }, undefined)) === "error");
  ok("DOC: sin vencidos => null", (await doc({ items: [] }, { items: [] })) === null);
  ok("DOC: sin permiso (CONSULTA) => null y sin consultar", (await nuevo({ "faret-control-documental": "SIN_ACCESO" }, {}, null)._alertaDocumentos()) === null);
  // Render
  c = nuevo({}, {}, null);
  c._alertas = { pnc: null, nci: null, doc: null }; c._renderAlertas();
  ok("Render: 0 alertas => mensaje sin alertas", /sin alertas activas/.test(html));
  c._alertas = { pnc: "error", nci: null, doc: null }; c._renderAlertas();
  ok("Render: error NO muestra 'sin alertas' y avisa", !/sin alertas activas/.test(html) && /No se pudieron calcular 1 aviso/.test(html));
  c._alertas = { pnc: { texto: "X", modulo: "faret-nc" }, nci: undefined, doc: undefined }; c._renderAlertas();
  ok("Render: aviso listo + otros cargando => muestra aviso con Ver", /fh-alerta-ver/.test(html));
  c._alertas = { pnc: null, nci: undefined, doc: undefined }; c._renderAlertas();
  ok("Render: pendientes sin avisos => Cargando (no 'sin alertas')", /Cargando/.test(html) && !/sin alertas/.test(html));
  // Documentos: filas ordenadas, con datos y botón Revisar
  const d2 = await doc({ items: [
    { id: 7, codigoBase: "REG-DSG", nombre: "Registro DSG", estado: "VIGENTE", versionProximaRevision: hace(30) },
    { id: 9, codigoBase: "REG-TEX", nombre: "Registro TEX", estado: "VIGENTE", versionProximaRevision: hace(300) }] }, { items: [] });
  ok("DOC filas: más atrasado primero con días", d2.filas[0].codigo === "REG-TEX" && d2.filas[0].dias >= 299 && d2.filas[1].id === 7);
  const calls = [];
  c = nuevo({}, {}, null); window.App.loadModule = m => calls.push(m);
  c._alertas = { pnc: null, nci: null, doc: d2 }; c._renderAlertas();
  ok("Render: lista cada documento con código, nombre, fecha y Revisar", /REG-TEX/.test(html) && /Registro DSG/.test(html) && /hace \d+ días/.test(html) && /fh-alerta-revisar/.test(html));
  handlers["fh-alerta-revisar:9"]?.();
  ok("Revisar: guarda el id y abre Control Documental", sessionStorage.getItem("fcdAbrirDocumento") === "9" && calls.includes("faret-control-documental"));
  const muchos = { cantidad: 8, texto: "8 documentos con revisión vencida", modulo: "faret-control-documental", filas: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, codigo: "D" + i, nombre: "", fecha: hace(10), dias: 10 })) };
  c._alertas = { pnc: null, nci: null, doc: muchos }; c._renderAlertas();
  ok("Render: más de 5 => muestra 5 y 'y 3 más'", (html.match(/fh-alerta-revisar/g) || []).length === 5 && /y 3 más/.test(html));
  // ---- Tiempo de cierre NC: mediana 90 días, % en ≤15 días ----
  c = nuevo({}, {}, null);
  const cer = (det, cie, estado = "CERRADA") => ({ estadoGestion: estado, fechaDeteccion: det, fechaCierre: cie });
  const HOY = "2026-11-13";
  // Caso real (13-11-2026): 54 cierres masivos del 20-22 jul (detección feb-mar) + 3 cierres operativos recientes
  const bulk = Array.from({ length: 54 }, (_, i) => cer("2026-03-0" + (1 + (i % 9)), "2026-07-2" + (i % 3)));
  const reales = [cer("2026-09-03T00:00:00", "2026-09-09T00:00:00"), cer("2026-09-01", "2026-09-08"), cer("2026-07-13", "2026-09-08")];
  let rc = c._calcularTiempoCierreNc([...bulk, ...reales], HOY);
  ok("Cierre real: el cierre masivo queda fuera de la ventana de 90 días", rc.n === 3);
  ok("Cierre real: mediana = 7 días (antes mostraba 68,1)", rc.mediana === 7);
  ok("Cierre real: 2 de 3 dentro de 15 días = 67%", rc.enPlazo === 2 && rc.pctEnPlazo === 67);
  ok("Cierre real: 3 casos => información limitada", rc.limitada === true);
  // El promedio simple antiguo, para dejar constancia de lo que se corrigió
  const prom = [...bulk, ...reales].reduce((a, n) => a + Math.max(0, c._diasEntre(c._fechaIso(n.fechaDeteccion), c._fechaIso(n.fechaCierre))), 0) / 57;
  ok("Cierre real: el promedio histórico simple era >60 días (distorsionado)", prom > 60);
  // Bordes
  ok("Sin datos => n=0, mediana null (no 0)", (rc = c._calcularTiempoCierreNc([], HOY)).n === 0 && rc.mediana === null && rc.limitada);
  ok("Solo cierres fuera de ventana => n=0", c._calcularTiempoCierreNc(bulk, HOY).n === 0);
  ok("Ventana: cierre hace 90 días entra, hace 91 no", c._calcularTiempoCierreNc([cer("2026-08-01", "2026-08-15")], HOY).n === 1 && c._calcularTiempoCierreNc([cer("2026-08-01", "2026-08-14")], HOY).n === 0);
  ok("Descarta no cerradas, fechas inválidas, cierre futuro y cierre anterior a detección",
    c._calcularTiempoCierreNc([cer("2026-10-01", "2026-10-05", "PENDIENTE"), cer("0001-01-01", "2026-10-05"), cer("2026-10-01", null),
      cer("2026-10-01", "2026-12-01"), cer("2026-10-10", "2026-10-05")], HOY).n === 0);
  rc = c._calcularTiempoCierreNc([cer("2026-10-01", "2026-10-03"), cer("2026-10-01", "2026-10-05"), cer("2026-10-01", "2026-10-07"),
    cer("2026-10-01", "2026-10-09"), cer("2026-10-01", "2026-10-31"), cer("2026-10-01", "2026-10-11")], HOY);
  ok("6 casos: mediana par = promedio de los dos centrales (7), sin 'información limitada'", rc.n === 6 && rc.mediana === 7 && rc.limitada === false);
  // Render
  const set = {}; c._setText = (id, v) => { set[id] = v; };
  c._renderTiempoCierreNc([...bulk, ...reales]);
  ok("Render: valor 7 y detalle con casos, % y aviso de información limitada",
    set["fh-kpi-nc-tiempo-cierre"] === "7" && /3 cerradas/.test(set["fh-kpi-nc-cierre-detalle"]) && /67% en ≤15 días/.test(set["fh-kpi-nc-cierre-detalle"]) && /información limitada/.test(set["fh-kpi-nc-cierre-detalle"]));
  c._renderTiempoCierreNc([]);
  ok("Render: sin datos => '-' y mensaje claro", set["fh-kpi-nc-tiempo-cierre"] === "-" && /Sin NC cerradas/.test(set["fh-kpi-nc-cierre-detalle"]));
  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODAS PASARON"); process.exit(fallos ? 1 : 0);
})();
