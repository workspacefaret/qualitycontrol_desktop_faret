// Pruebas breves de "Ítem / Artículo" (NV INNPACK) en Laboratorio - Muestras (Registros, Ver muestra y
// Nueva muestra). Puente simulado: no consulta FPS ni SAP. Uso: node tools/muestra_laboratorio_tests/test_articulos.js
const fs = require("fs"), path = require("path");
const base = path.join(__dirname, "../../src/UI/www/modules/muestra-laboratorio/");
let fallos = 0; const ok = (n, v) => { console.log((v ? "PASS " : "FAIL ") + n); if (!v) fallos++; };

const vista = fs.readFileSync(base + "muestra-laboratorio.view.html", "utf8");
const thead = vista.split('id="mlbMuestrasBody"')[0].split("<thead>").pop();
ok("Registros: 'Cód. producción (registrado)' + 'Ítem / Artículo' (12 columnas)",
  /<th[^>]*>Cód\. producción \(registrado\)<\/th>\s*<th[^>]*>Ítem \/ Artículo<\/th>/.test(thead) && (thead.match(/<th/g) || []).length === 12);
const ctrl = fs.readFileSync(base + "muestra-laboratorio.controller.js", "utf8");
ok("Ver muestra: 'Ítem / Artículo (NV INNPACK)' separado de 'Cód. producción (registrado)'",
  ctrl.includes("</b>Ítem / Artículo (NV INNPACK)</div>") && ctrl.includes("</b>Cód. producción (registrado)</div>"));

// DOM mínimo
const els = {}, celdas = [];
const el = id => els[id] || (els[id] = { id, value: "", textContent: "", innerHTML: "", style: { display: "" }, readOnly: false, disabled: false });
global.window = {};
global.performance = { now: () => 0 };
global.document = {
  getElementById: el,
  querySelectorAll: sel => (sel.includes("mlb-articulos") ? celdas : []),
};
eval(ctrl);
const c = new window.MuestraLaboratorioController();

// Respuestas simuladas del backend (mismo formato que ArticulosNpResolver, datos reales de SAP INNPACK)
const par = (item, articulo) => ({ item, articulo });
const resp = {
  "4124": { estado: "OK", articulos: ["4820011000001"], items: [par("1", "4820011000001")] },
  "4137": { estado: "OK", articulos: ["4487011602196", "4487012602196", "4487008602196"],
    items: [par("1", "4487011602196"), par("2", "4487012602196"), par("3", "4487008602196")] },
  "23259": { estado: "SIN_NV_INNPACK", articulos: [], items: [] },
  "777": { estado: "AMBIGUO", articulos: [], items: [] },
  "4300": { estado: "SAP_NO_DISPONIBLE", articulos: [], items: [] },
  "4400": { estado: "NO_DISPONIBLE", articulos: [], items: [] },
};
const llamadas = [];
let caido = false;
window.PhotinoBridge = {
  send: async ({ action, data }) => {
    if (action !== "muestraLab.articulosNp") return { ok: true, data: [] };
    llamadas.push(data.muestras.map(m => m.np + (m.idProcesoFps ? "#" + m.idProcesoFps : "")));
    if (caido) return { ok: false, error: "Acción no soportada" };
    return { ok: true, data: data.muestras.map(m => ({ np: Number(m.np), idProcesoFps: m.idProcesoFps || 0,
      ...(m.idProcesoFps === 501 ? { estado: "OK", articulos: ["X"], items: [par("2", "X")] } : resp[m.np] || { estado: "NP_NO_ENCONTRADA", articulos: [], items: [] }) })) };
  },
};
const lineas = html => [...html.matchAll(/<div[^>]*>([^<]*)<\/div>/g)].map(m => m[1]);

// Celda
ok("Celda: un ítem → 'Ítem 1: artículo'", lineas(c._celdaArticulos(resp["4124"], "4124")).join("|") === "Ítem 1: 4820011000001");
ok("Celda: varios ítems, una línea por ítem con su artículo (NV 4137)",
  lineas(c._celdaArticulos(resp["4137"], "4137")).join("|") === "Ítem 1: 4487011602196|Ítem 2: 4487012602196|Ítem 3: 4487008602196");
ok("Celda: sin ítems (backend anterior) → solo los artículos", lineas(c._celdaArticulos({ estado: "OK", articulos: ["A", "B"] }, "1")).join("|") === "A|B");
ok("Celda: relación ambigua → '-' con motivo", /title="[^"]*más de una nota de venta[^"]*">-</.test(c._celdaArticulos(resp["777"], "777")));
ok("Celda: FPS API sin actualizar → 'aún no disponibles', sin afirmar que SAP no tenga datos",
  /aún no disponibles: FPS API todavía no los entrega">-</.test(c._celdaArticulos(resp["4400"], "4400")) && !/no tiene artículos/.test(c._celdaArticulos(resp["4400"], "4400")));
ok("Celda: NP no numérica (recepción/manual) → '-' sin consultar", c._celdaArticulos(undefined, "") === "-" && c._celdaArticulos(undefined, "ABC") === "-");

(async () => {
  // Registros: una celda por fila; NP repetida y NP vacía
  const filas = ["4124", "4137", "4124", "23259", "", "777", "4300", "4400"];
  filas.forEach(np => celdas.push({ dataset: { np }, innerHTML: "" }));
  const items = filas.map((np, i) => ({ id: i + 1, np }));
  await c._resolverArticulosLista(items);
  ok("Registros: una sola llamada, cada NP una vez y sin NP vacía", llamadas.length === 1 && llamadas[0].join() === "4124,4137,23259,777,4300,4400");
  ok("Registros: celdas con todos los ítems y artículos", lineas(celdas[1].innerHTML).length === 3 && lineas(celdas[2].innerHTML)[0] === "Ítem 1: 4820011000001");
  ok("Registros: FARET/ambigua/SAP caído/FPS sin actualizar → '-'", [3, 5, 6, 7].every(i => />-</.test(celdas[i].innerHTML)) && celdas[4].innerHTML === "");

  llamadas.length = 0;
  await c._resolverArticulosLista(items);
  ok("Recarga: no repite NP resueltas; reintenta SAP caído y FPS sin actualizar", llamadas.length === 1 && llamadas[0].join() === "4300,4400");

  // Lotes de 50
  llamadas.length = 0;
  await c._resolverArticulosLista(Array.from({ length: 120 }, (_, i) => ({ id: i, np: String(5000 + i) })));
  ok("120 NP nuevas → 3 lotes (50/50/20)", llamadas.map(l => l.length).join() === "50,50,20");

  // Backend sin la acción (p. ej. la web): la tabla sigue funcionando con '-'
  caido = true; celdas.length = 0; celdas.push({ dataset: { np: "9001" }, innerHTML: "" });
  await c._resolverArticulosLista([{ id: 1, np: "9001" }]);
  ok("Acción no disponible → '-' sin romper la tabla", />-</.test(celdas[0].innerHTML));
  caido = false;

  // Ver muestra
  llamadas.length = 0;
  el("mlbDetId").textContent = "33";
  await c._mostrarArticulosDetalle({ id: 33, np: "777", idProcesoFps: 501 });
  ok("Ver: NP ambigua + proceso FPS → su ítem y artículo", lineas(el("mlbDetArticulos").innerHTML).join("|") === "Ítem 2: X" && llamadas[0].join() === "777#501");
  el("mlbDetId").textContent = "34";
  await c._mostrarArticulosDetalle({ id: 34, np: "4137", idProcesoFps: null });
  ok("Ver: muestra antigua sin proceso, NP inequívoca → todos los ítems (desde caché)", lineas(el("mlbDetArticulos").innerHTML).length === 3 && llamadas.length === 1);
  el("mlbDetId").textContent = "35";
  await c._mostrarArticulosDetalle({ id: 35, np: "", idProcesoFps: null });
  ok("Ver: sin NP → '-'", el("mlbDetArticulos").textContent === "-");

  // Nueva muestra: orden elegida (formato de fps-api: articulosInnpack con items)
  c._ponerDatosNotaVentaFps({ npInnpack: "4006", articulosInnpack: [
    { itemCode: "4637007530603", items: ["2"] }, { itemCode: "4637007530602", items: ["1"] }, { itemCode: "4637007530602", items: ["1"] }] });
  ok("Nueva muestra: ítems ordenados y sin duplicar",
    el("mlbNmArticulosTexto").textContent === "Ítem 1: 4637007530602 · Ítem 2: 4637007530603" && el("mlbNmArticulosWrap").style.display === "");
  c._ponerDatosNotaVentaFps({ npInnpack: "", articulosInnpack: [] });
  ok("Nueva muestra: orden sin NV INNPACK → aviso, sin inventar", el("mlbNmArticulosTexto").textContent === "la orden no tiene nota de venta INNPACK");
  c._ponerDatosNotaVentaFps(null);
  ok("Nueva muestra: sin orden → oculto", el("mlbNmArticulosWrap").style.display === "none");
  c._ponerDatosNotaVentaFps({ npInnpack: "4006" });
  ok("Nueva muestra: FPS API sin el campo → oculto, sin afirmar nada", el("mlbNmArticulosWrap").style.display === "none");

  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODAS PASARON"); process.exit(fallos ? 1 : 0);
})();
