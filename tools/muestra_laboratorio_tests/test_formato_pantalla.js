// Pruebas breves de la visualización de Laboratorio - Muestras (Registros → Ver): 2 decimales con coma,
// ECT "Promedio fuerza", y que el informe impreso conserve su formato. Uso: node test_formato_pantalla.js
const fs = require("fs"), path = require("path");
global.window = {};
global.document = { getElementById: () => null };
eval(fs.readFileSync(path.join(__dirname, "../../src/UI/www/modules/muestra-laboratorio/muestra-laboratorio.controller.js"), "utf8"));
const C = window.MuestraLaboratorioController;
const c = new C();
let fallos = 0; const ok = (n, v) => { console.log((v ? "PASS " : "FAIL ") + n); if (!v) fallos++; };

// _num2: exactamente 2 decimales, coma decimal, sin inventar datos
ok("_num2 112.0200 -> 112,02", c._num2(112.02) === "112,02" && c._num2("112.0200") === "112,02");
ok("_num2 redondea a 2 (1.005, 7.5 -> 7,50)", c._num2(7.5) === "7,50" && c._num2(3.14159) === "3,14");
ok("_num2 entero -> 2 decimales", c._num2(8) === "8,00");
ok("_num2 null/''/texto -> null (no inventa 0)", c._num2(null) === null && c._num2("") === null && c._num2("abc") === null && c._num2(undefined) === null);

// Columna Resultado
const ect = { tipoEnsayo: "ECT", resultadoValor: 45.6789, resultadoUnidad: "lbf/m", detalle: { promedioForce: 112.02 } };
ok("ECT: 'Promedio fuerza: 112,02 lbf' con el valor real de la muestra", c._resultadoPantalla(ect) === "Promedio fuerza: 112,02 lbf");
ok("ECT con otro valor real (98.5)", c._resultadoPantalla({ ...ect, detalle: { promedioForce: 98.5 } }) === "Promedio fuerza: 98,50 lbf");
ok("ECT sin promedioForce -> cae al valor consolidado con 2 decimales", c._resultadoPantalla({ ...ect, detalle: {} }) === "45,68 lbf/pulg".replace("lbf/pulg", c._u("lbf/m")));
ok("Otro ensayo (Humedad) 7.456 % -> 7,46 %", c._resultadoPantalla({ tipoEnsayo: "HUMEDAD", resultadoValor: 7.456, resultadoUnidad: "%" }) === "7,46 %");
ok("Sin resultado numérico -> '-'", c._resultadoPantalla({ tipoEnsayo: "LUGOL", resultadoValor: null }) === "-");

// renderEnsayos (HTML) incluye el ECT y la fila de ensayos con modelo muestras
let html = ""; global.document = { getElementById: () => ({ set innerHTML(v) { html = v; } }) };
c.renderEnsayos([ect, { tipoEnsayo: "GRAMAJE", resultadoValor: 120.3456, resultadoUnidad: "g/m²", modeloMuestras: true, muestras: [{}, {}], estado: "Finalizado" }]);
ok("Tabla: ECT y 'N muestras' formateados", /Promedio fuerza: 112,02 lbf/.test(html) && /120,35 g\/m² · 2 muestras/.test(html));

// Ver muestras (solo lectura): 2 decimales aunque la configuración diga 4; edición/informe conservan los suyos
const cfg = { decimales: 4, unidad: "lbf", resultados: [{ codigo: "fuerza", etiqueta: "Fuerza", unidad: "lbf", decimales: 4 }], entradas: [] };
c._em = { cfg, soloLectura: true };
ok("Ver muestras: promedio con 2 decimales", /Promedio: 112,02 lbf/.test(c._emTextoPromedio({ completaGuardada: true, promedioGuardado: 112.0200, unidad: "lbf" })));
ok("Ver muestras: resultado de determinación con 2 decimales", /Fuerza: 99,12 lbf/.test(c._emTextoResultadosDet(cfg, { valida: true, resultados: { fuerza: 99.1234 } })));
c._em = { cfg, soloLectura: false };
ok("Edición en vivo conserva los decimales de la configuración (4)", /Fuerza: 99,1234/.test(c._emTextoResultadosDet(cfg, { valida: true, resultados: { fuerza: 99.1234 } })));
const otros = [{ etiqueta: "Resistencia", valor: 7.12345, unidad: "lbf/m", codigo: "resultado:r" }];
ok("Informe (_emTextoOtros sin flag) conserva sus decimales; con flag usa 2", /7,12345|7,1235|7,12/.test(c._emTextoOtros(cfg, otros)) && /7,12 /.test(c._emTextoOtros(cfg, otros, true)));
ok("Informe: _metaEnsayo sin cambios (valor crudo del ensayo)", /Resultado: 45.6789 /.test(c._metaEnsayo(ect)));
console.log(fallos ? `\n${fallos} FALLOS` : "\nTODAS PASARON"); process.exit(fallos ? 1 : 0);
