// Pruebas breves de "+ Nueva Muestra" (Laboratorio - Muestras, INNPACK): tipo "Caja extendida" y
// selector de Máquina oculto cuando el registro FPS ya la trae (sin perder el valor al guardar).
// Uso: node tools/muestra_laboratorio_tests/test_nueva_muestra.js
const fs = require("fs"), path = require("path");
const base = path.join(__dirname, "../../src/UI/www/modules/muestra-laboratorio/");
let fallos = 0; const ok = (n, v) => { console.log((v ? "PASS " : "FAIL ") + n); if (!v) fallos++; };

// Vista: la opción existe en el selector de nueva muestra y en el de especificaciones (INNPACK).
const vista = fs.readFileSync(base + "muestra-laboratorio.view.html", "utf8");
const sel = id => (vista.split(`id="${id}"`)[1] || "").split("</select>")[0];
ok("Nueva muestra: opción CajaExtendida 'Caja extendida'", /<option value="CajaExtendida">Caja extendida<\/option>/.test(sel("mlbNmTipoMuestra")));
ok("Especificaciones: opción CajaExtendida", /value="CajaExtendida"/.test(sel("mlbEspecTipoMuestra")));
ok("Opciones previas conservadas", ["Papel", "Monotapa", "CartonCorrugadoEmplacado", "PliegoImpreso", "CajaPegada", "CajaMaster", "AdhesivoPVA", "AdhesivoCorrugado", "Otro"].every(v => sel("mlbNmTipoMuestra").includes(`value="${v}"`)));
const faret = fs.readFileSync(path.join(__dirname, "../../src/UI/www/modules/faret-laboratorio/faret-laboratorio.view.html"), "utf8");
ok("FARET sin cambios (no tiene CajaExtendida)", !faret.includes("CajaExtendida"));

// DOM mínimo: cada id es un elemento con value/style/disabled; el campo Máquina tiene su contenedor.
const els = {};
const campoMaquina = { style: { display: "" } };
const el = id => els[id] || (els[id] = {
  id, _v: "", get value() { return this._v }, set value(v) { this._v = String(v ?? "") }, disabled: false, readOnly: false, textContent: "", innerHTML: "", style: { display: "" },
  classList: { add() {}, remove() {} }, dispatchEvent() {},
  get selectedOptions() { return id === "mlbNmMaquina" && this.value ? [{ textContent: "Pegadora 1" }] : [] },
  closest: () => (id === "mlbNmMaquina" ? campoMaquina : null),
});
global.window = {}; global.document = { getElementById: el };
global.alert = m => { throw new Error("alert: " + m); };
eval(fs.readFileSync(base + "muestra-laboratorio.controller.js", "utf8"));
const c = new window.MuestraLaboratorioController();
c._catalogos = { maquinas: [{ id: 7, nombre: "Pegadora 1" }] };
const orden = { ordenTrabajo: 1, cliente: "X" };
c._ordenFpsActual = () => orden;
const registro = { recordKey: 55, maquina: "PEG1", maquinaDescripcion: "Pegadora 1", operador: "Op", productionStartDate: "2026-11-12 10:00:00" };
c._fpsRegistrosVisibles = [{ registro, proceso: { idProceso: 9, nombreProceso: "PEGADO", categoria: "PEGADO", item: "1", itemCode: "P1", itemName: "Prod" } }];

c._soltarRegistroFps();
ok("Al abrir: campo Máquina visible", campoMaquina.style.display === "");
c._onSeleccionarRegistroProduccion(55);
ok("Registro FPS con máquina reconocida: campo oculto", campoMaquina.style.display === "none");
ok("…y el valor sigue cargado (id 7)", els.mlbNmMaquina.value === "7");

let enviado = null;
window.PhotinoBridge = { send: async ({ action, data }) => { if (action === "muestraLab.crear") enviado = data; return { ok: false, error: "fin prueba" }; } };
c._fpsNpConsultada = el("mlbNmNp").value = "123";
el("mlbNmTipoMuestra").value = "CajaExtendida";
global.alert = () => {};
c.guardarNuevaMuestra().then(() => {
  ok("Guardar envía maquinaId 7 y nombre aunque el campo esté oculto", enviado && enviado.maquinaId === 7 && enviado.maquina === "Pegadora 1");
  ok("Guardar envía tipoMuestra CajaExtendida", enviado && enviado.tipoMuestra === "CajaExtendida");

  c._soltarRegistroFps();
  ok("Al soltar el registro: campo visible otra vez y valor autollenado limpiado", campoMaquina.style.display === "" && els.mlbNmMaquina.value === "");
  c._catalogos.maquinas = [];
  c._onSeleccionarRegistroProduccion(55);
  ok("Sin coincidencia en el catálogo: campo visible para elegir a mano", campoMaquina.style.display === "");
  console.log(fallos ? `\n${fallos} FALLOS` : "\nTODAS PASARON"); process.exit(fallos ? 1 : 0);
});
