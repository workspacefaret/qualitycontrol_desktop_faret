// Pruebas breves de "Ítem / Artículo" (NV INNPACK) en Laboratorio - Muestras: solo el ítem que el usuario
// eligió al crear la muestra (proceso FPS guardado). Puente simulado: no consulta FPS ni SAP.
// Uso: node tools/muestra_laboratorio_tests/test_articulos.js
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
const el = id => els[id] || (els[id] = { id, value: "", textContent: "", innerHTML: "", style: { display: "" }, readOnly: false, disabled: false, closest: () => null });
global.window = {};
global.performance = { now: () => 0 };
global.document = {
  getElementById: el,
  querySelectorAll: sel => (sel.includes("mlb-articulos") ? celdas : []),
};
eval(ctrl);
const c = new window.MuestraLaboratorioController();

// Respuestas simuladas del backend por (np, idProcesoFps), formato de ArticulosNpResolver (datos reales SAP INNPACK).
const par = (item, articulo) => ({ item, articulo });
const resp = {
  "4137|701": { estado: "OK", articulos: ["4487012602196"], items: [par("2", "4487012602196")] },
  "4137|702": { estado: "OK", articulos: ["4487008602196"], items: [par("3", "4487008602196")] },
  "4124|801": { estado: "OK", articulos: ["4820011000001"], items: [par("1", "4820011000001")] },
  "23259|901": { estado: "SIN_NV_INNPACK", articulos: [], items: [] },
  "4300|902": { estado: "SAP_NO_DISPONIBLE", articulos: [], items: [] },
  "4500|903": { estado: "ITEM_NO_EN_NV", articulos: [], items: [] },
};
const llamadas = [];
let caido = false;
window.PhotinoBridge = {
  send: async ({ action, data }) => {
    if (action !== "muestraLab.articulosNp") return { ok: true, data: [] };
    llamadas.push(data.muestras.map(m => m.np + "#" + m.idProcesoFps));
    if (caido) return { ok: false, error: "Acción no soportada" };
    return { ok: true, data: data.muestras.map(m => ({ np: Number(m.np), idProcesoFps: m.idProcesoFps,
      ...(resp[m.np + "|" + m.idProcesoFps] || { estado: "PROCESO_NO_ENCONTRADO", articulos: [], items: [] }) })) };
  },
};
const lineas = html => [...html.matchAll(/<div[^>]*>([^<]*)<\/div>/g)].map(m => m[1]);

// Celda
ok("Celda: solo el ítem elegido → 'Ítem 2: artículo'", lineas(c._celdaArticulos(resp["4137|701"], "4137")).join("|") === "Ítem 2: 4487012602196");
ok("Celda: muestra sin proceso FPS → '-' 'Sin ítem elegido', sin consultar",
  /title="Sin ítem elegido[^"]*">-</.test(c._celdaArticulos(c._articulosDe({ np: "4137", idProcesoFps: null }), "4137")));
ok("Celda: ítem que no está en la NV → '-' con motivo", /no figura en la nota de venta INNPACK">-</.test(c._celdaArticulos(resp["4500|903"], "4500")));
ok("Celda: NP no numérica (recepción/manual) → '-'", c._celdaArticulos(undefined, "") === "-" && c._celdaArticulos(undefined, "ABC") === "-");

(async () => {
  // Registros: misma NP con dos ítems distintos, una repetida, una sin proceso, una sin NP
  const items = [
    { id: 1, np: "4137", idProcesoFps: 701 }, { id: 2, np: "4137", idProcesoFps: 702 }, { id: 3, np: "4137", idProcesoFps: 701 },
    { id: 4, np: "4124", idProcesoFps: 801 }, { id: 5, np: "4137", idProcesoFps: null }, { id: 6, np: "", idProcesoFps: null },
    { id: 7, np: "23259", idProcesoFps: 901 }, { id: 8, np: "4300", idProcesoFps: 902 },
  ];
  items.forEach(m => celdas.push({ dataset: { clave: c._claveArticulos(m.np, m.idProcesoFps) }, innerHTML: c._celdaArticulos(c._articulosDe(m), m.np) }));
  await c._resolverArticulosLista(items);
  ok("Registros: una llamada; cada (NP, proceso) una vez; sin consultar las que no tienen proceso",
    llamadas.length === 1 && llamadas[0].join() === "4124#801,4137#701,4137#702,4300#902,23259#901");
  ok("Registros: misma NP, cada fila con SOLO su ítem",
    lineas(celdas[0].innerHTML).join("|") === "Ítem 2: 4487012602196" && lineas(celdas[1].innerHTML).join("|") === "Ítem 3: 4487008602196"
    && lineas(celdas[2].innerHTML).join("|") === "Ítem 2: 4487012602196" && lineas(celdas[3].innerHTML).join("|") === "Ítem 1: 4820011000001");
  ok("Registros: sin proceso / sin NP / FARET / SAP caído → '-'",
    /Sin ítem elegido[^"]*">-</.test(celdas[4].innerHTML) && celdas[5].innerHTML === "-" && [6, 7].every(i => />-</.test(celdas[i].innerHTML)));

  llamadas.length = 0;
  await c._resolverArticulosLista(items);
  ok("Recarga: no repite lo resuelto; reintenta SAP caído", llamadas.length === 1 && llamadas[0].join() === "4300#902");

  llamadas.length = 0;
  await c._resolverArticulosLista(Array.from({ length: 120 }, (_, i) => ({ id: i, np: String(5000 + i), idProcesoFps: 1 })));
  ok("120 muestras nuevas → 3 lotes (50/50/20)", llamadas.map(l => l.length).join() === "50,50,20");

  caido = true; celdas.length = 0; celdas.push({ dataset: { clave: c._claveArticulos("9001", 5) }, innerHTML: "" });
  await c._resolverArticulosLista([{ id: 1, np: "9001", idProcesoFps: 5 }]);
  ok("Acción no disponible → '-' sin romper la tabla", />-</.test(celdas[0].innerHTML));
  caido = false;

  // Ver muestra
  llamadas.length = 0;
  el("mlbDetId").textContent = "33";
  await c._mostrarArticulosDetalle({ id: 33, np: "4137", idProcesoFps: 702 });
  ok("Ver: solo el ítem elegido (desde caché, sin nueva consulta)", lineas(el("mlbDetArticulos").innerHTML).join("|") === "Ítem 3: 4487008602196" && llamadas.length === 0);
  el("mlbDetId").textContent = "34";
  await c._mostrarArticulosDetalle({ id: 34, np: "4137", idProcesoFps: null });
  ok("Ver: muestra sin proceso FPS → '-' sin consultar", /Sin ítem elegido[^"]*">-</.test(el("mlbDetArticulos").innerHTML) && llamadas.length === 0);
  el("mlbDetId").textContent = "35";
  await c._mostrarArticulosDetalle({ id: 35, np: "", idProcesoFps: null });
  ok("Ver: sin NP → '-'", el("mlbDetArticulos").textContent === "-");

  // Nueva muestra: orden elegida (formato de fps-api: articulosInnpack con items)
  const orden = { npInnpack: "4137", articulosInnpack: [
    { itemCode: "4487011602196", items: ["1"] }, { itemCode: "4487012602196", items: ["2"] }, { itemCode: "4487008602196", items: ["3"] }] };
  c._ponerDatosNotaVentaFps(orden);
  ok("Nueva muestra: sin registro elegido → todos los ítems de la orden",
    el("mlbNmArticulosTexto").textContent === "Ítem 1: 4487011602196 · Ítem 2: 4487012602196 · Ítem 3: 4487008602196" && el("mlbNmArticulosWrap").style.display === "");
  c._pintarArticulosNm("02");
  ok("Nueva muestra: registro del ítem 2 → solo 'Ítem 2' (\"02\" = \"2\")", el("mlbNmArticulosTexto").textContent === "Ítem 2: 4487012602196");
  c._pintarArticulosNm("7");
  ok("Nueva muestra: ítem que no está en la NV → aviso, sin inventar", el("mlbNmArticulosTexto").textContent === "el ítem 7 no figura en la nota de venta INNPACK");
  c._soltarRegistroFps();
  ok("Nueva muestra: al soltar el registro vuelven todos los ítems", el("mlbNmArticulosTexto").textContent.split(" · ").length === 3);
  c._ponerDatosNotaVentaFps({ npInnpack: "", articulosInnpack: [] });
  ok("Nueva muestra: orden sin NV INNPACK → aviso", el("mlbNmArticulosTexto").textContent === "la orden no tiene nota de venta INNPACK");
  c._ponerDatosNotaVentaFps(null);
  ok("Nueva muestra: sin orden → oculto", el("mlbNmArticulosWrap").style.display === "none");
  c._ponerDatosNotaVentaFps({ npInnpack: "4006" });
  ok("Nueva muestra: FPS API sin el campo → oculto, sin afirmar nada", el("mlbNmArticulosWrap").style.display === "none");

  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODAS PASARON"); process.exit(fallos ? 1 : 0);
})();
