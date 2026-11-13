// Pruebas breves de Artículo(s) NV INNPACK en Laboratorio - Muestras (Registros, Ver muestra y
// Nueva muestra). Puente simulado: no consulta FPS ni SAP. Uso: node tools/muestra_laboratorio_tests/test_articulos.js
const fs = require("fs"), path = require("path");
const base = path.join(__dirname, "../../src/UI/www/modules/muestra-laboratorio/");
let fallos = 0; const ok = (n, v) => { console.log((v ? "PASS " : "FAIL ") + n); if (!v) fallos++; };

const vista = fs.readFileSync(base + "muestra-laboratorio.view.html", "utf8");
const thead = vista.split('id="mlbMuestrasBody"')[0].split("<thead>").pop();
ok("Registros: columna 'Artículo(s)' después de 'Código registrado' (12 columnas)",
  /<th>Código registrado<\/th>\s*<th[^>]*>Artículo\(s\)<\/th>/.test(thead) && (thead.match(/<th/g) || []).length === 12);

// DOM mínimo
const els = {}, celdas = [];
const el = id => els[id] || (els[id] = { id, value: "", textContent: "", innerHTML: "", style: { display: "" }, readOnly: false, disabled: false });
global.window = {};
global.performance = { now: () => 0 };
global.document = {
  getElementById: el,
  querySelectorAll: sel => (sel.includes("mlb-articulos") ? celdas : []),
};
eval(fs.readFileSync(base + "muestra-laboratorio.controller.js", "utf8"));
const c = new window.MuestraLaboratorioController();

// Respuestas simuladas del backend por NP
const resp = {
  "4124": { estado: "OK", articulos: ["4820011000001"] },
  "4006": { estado: "OK", articulos: ["4637007530602", "4637007530603"] },
  "23259": { estado: "SIN_NV_INNPACK", articulos: [] },
  "777": { estado: "AMBIGUO", articulos: [] },
  "4300": { estado: "SAP_NO_DISPONIBLE", articulos: [] },
};
const llamadas = [];
let caido = false;
window.PhotinoBridge = {
  send: async ({ action, data }) => {
    if (action !== "muestraLab.articulosNp") return { ok: true, data: [] };
    llamadas.push(data.muestras.map(m => m.np + (m.idProcesoFps ? "#" + m.idProcesoFps : "")));
    if (caido) return { ok: false, error: "Acción no soportada" };
    return { ok: true, data: data.muestras.map(m => ({ np: Number(m.np), idProcesoFps: m.idProcesoFps || 0, ...(m.idProcesoFps === 501 ? { estado: "OK", articulos: ["X"] } : resp[m.np] || { estado: "NP_NO_ENCONTRADA", articulos: [] }) })) };
  },
};

// Celda
ok("Celda: varios códigos separados por coma", c._celdaArticulos(resp["4006"], "4006") === "4637007530602, 4637007530603");
ok("Celda: sin relación inequívoca → '-' con motivo", /title="[^"]*más de una nota de venta[^"]*">-</.test(c._celdaArticulos(resp["777"], "777")));
ok("Celda: NP no numérica (recepción/manual) → '-' sin consultar", c._celdaArticulos(undefined, "") === "-" && c._celdaArticulos(undefined, "ABC") === "-");

(async () => {
  // Registros: una celda por fila; NP repetida y NP vacía
  const filas = ["4124", "4006", "4124", "23259", "", "777", "4300"];
  filas.forEach(np => celdas.push({ dataset: { np }, innerHTML: "" }));
  const items = filas.map((np, i) => ({ id: i + 1, np }));
  await c._resolverArticulosLista(items);
  ok("Registros: una sola llamada, cada NP una vez y sin NP vacía", llamadas.length === 1 && llamadas[0].join() === "4124,4006,23259,777,4300");
  ok("Registros: celdas pintadas con todos los códigos", celdas[0].innerHTML === "4820011000001" && celdas[2].innerHTML === "4820011000001" && celdas[1].innerHTML === "4637007530602, 4637007530603");
  ok("Registros: FARET/ambigua/SAP caído → '-'", [3, 5, 6].every(i => />-</.test(celdas[i].innerHTML)) && celdas[4].innerHTML === "");

  llamadas.length = 0;
  await c._resolverArticulosLista(items);
  ok("Recarga: no repite NP ya resueltas; reintenta solo la que falló por SAP", llamadas.length === 1 && llamadas[0].join() === "4300");

  // Lotes de 50
  llamadas.length = 0;
  const muchas = Array.from({ length: 120 }, (_, i) => ({ id: i, np: String(5000 + i) }));
  await c._resolverArticulosLista(muchas);
  ok("120 NP nuevas → 3 lotes (50/50/20)", llamadas.map(l => l.length).join() === "50,50,20");

  // Backend no soporta la acción (p. ej. web Java anterior): la tabla sigue funcionando con '-'
  caido = true; celdas.length = 0; celdas.push({ dataset: { np: "9001" }, innerHTML: "" });
  await c._resolverArticulosLista([{ id: 1, np: "9001" }]);
  ok("Acción no disponible → '-' (no disponible) sin romper la tabla", /no disponibles en este momento">-</.test(celdas[0].innerHTML));
  caido = false;

  // Ver muestra: usa idProcesoFps para resolver una NP ambigua
  llamadas.length = 0;
  el("mlbDetId").textContent = "33";
  await c._mostrarArticulosDetalle({ id: 33, np: "777", idProcesoFps: 501 });
  ok("Ver: NP ambigua + proceso FPS → artículo resuelto", el("mlbDetArticulos").innerHTML === "X" && llamadas[0].join() === "777#501");
  el("mlbDetId").textContent = "34";
  await c._mostrarArticulosDetalle({ id: 34, np: "4124", idProcesoFps: null });
  ok("Ver: muestra antigua sin proceso, NP inequívoca → artículo (desde caché, sin nueva llamada)", el("mlbDetArticulos").innerHTML === "4820011000001" && llamadas.length === 1);
  el("mlbDetId").textContent = "35";
  await c._mostrarArticulosDetalle({ id: 35, np: "", idProcesoFps: null });
  ok("Ver: sin NP → '-'", el("mlbDetArticulos").textContent === "-");

  // Nueva muestra: artículos de la orden elegida
  c._ponerDatosNotaVentaFps({ npInnpack: "4006", articulosInnpack: [{ itemCode: "A" }, { itemCode: "B" }, { itemCode: "A" }] });
  ok("Nueva muestra: artículos de la orden sin duplicados", el("mlbNmArticulosTexto").textContent === "A, B" && el("mlbNmArticulosWrap").style.display === "");
  c._ponerDatosNotaVentaFps({ npInnpack: "", articulosInnpack: [] });
  ok("Nueva muestra: orden sin NV INNPACK → aviso, sin inventar", el("mlbNmArticulosTexto").textContent === "la orden no tiene nota de venta INNPACK");
  c._ponerDatosNotaVentaFps(null);
  ok("Nueva muestra: sin orden → oculto", el("mlbNmArticulosWrap").style.display === "none");
  c._ponerDatosNotaVentaFps({ npInnpack: "4006" });
  ok("Nueva muestra: backend sin el campo (web anterior) → oculto, sin afirmar nada", el("mlbNmArticulosWrap").style.display === "none");

  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODAS PASARON"); process.exit(fallos ? 1 : 0);
})();
