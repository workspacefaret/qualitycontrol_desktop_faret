// Verificación de producción de Administración de planta (aislamiento por empresa + cuentas técnicas ocultas).
// SOLO LECTURA: todas las verificaciones normales son GET. La única escritura es 1 PUT por sentido sobre un id que NO existe (999999999)
// y con cuerpo vacío: el middleware/controlador debe rechazarlo con 403 antes de tocar la base; si el aislamiento fallara, el resultado
// sería 404 (registro inexistente) sin ninguna modificación posible. No se hace ningún PUT/POST sobre cuentas reales.
//
// Credenciales: se piden por consola con la escritura oculta (nada se pasa por argumentos, variables de entorno ni archivos) y viven solo
// en memoria; el script no imprime contraseñas, tokens, encabezados ni cuerpos de respuesta (solo PASS/FAIL y conteos).
// Requiere una terminal interactiva (PowerShell o Git Bash normal): node docs/verificar_admin_planta_solo_lectura.js
const readline = require('readline');
const API = 'https://api.faret.cl/calidad/api/admin-planta';
const OCULTAS = { INNPACK: [63, 64, 84], FARET: [691] };
let fallos = 0;
const ok = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fallos++; };

const pedir = (texto, secreto) => new Promise((resolver) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (s) => { if (!rl.stdoutMuted) rl.output.write(s); };
  rl.question(texto, (r) => { rl.close(); if (secreto) process.stdout.write('\n'); resolver(r); });
  rl.stdoutMuted = !!secreto;
});

const llamar = async (metodo, ruta, token, cuerpo) => {
  try {
    const r = await fetch(API + ruta, { method: metodo, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { s: r.status, b: await r.json().catch(() => null) };
  } catch (e) { return { s: 0, b: null }; }
};
const login = async (url, cuerpo) => {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const d = await r.json().catch(() => null);
    return { token: d?.data?.token || d?.data?.accessToken || null, status: r.status };
  } catch (e) { return { token: null, status: 0 }; }
};

(async () => {
  if (!process.stdin.isTTY) { console.log('Ejecútalo en una terminal interactiva (las credenciales se piden con escritura oculta).'); process.exit(2); }

  console.log('Sesión ADMIN_TI de FARET:');
  let idF = await pedir('  Usuario/identificador: ', false); let pwF = await pedir('  Contraseña: ', true);
  const f = await login('https://api.faret.cl/qualitycontrol/api/Auth/login', { identificador: idF, password: pwF });
  idF = pwF = null;
  console.log('Sesión ADMIN_TI de INNPACK:');
  let idI = await pedir('  Código de usuario: ', false); let pwI = await pedir('  Contraseña: ', true);
  const i = await login('https://api.faret.cl/innpack/api/auth/login', { codigoUsuario: idI, password: pwI });
  idI = pwI = null;

  ok(!!f.token, `login FARET (HTTP ${f.status})`); ok(!!i.token, `login INNPACK (HTTP ${i.status})`);
  if (!f.token || !i.token) return process.exit(1);
  const [tf, ti] = [f.token, i.token];

  console.log('\n-- [INNPACK] Aislamiento INNPACK -> FARET (esperado 403)');
  for (const r of ['/FARET/maquinas', '/FARET/inspectores', '/FARET/auditoria']) ok((await llamar('GET', r, ti)).s === 403, `GET ${r}`);
  ok((await llamar('PUT', '/FARET/inspectores/999999999', ti, {})).s === 403, 'PUT sobre id inexistente (403 = rechazado antes de tocar datos)');

  console.log('\n-- [FARET] Aislamiento FARET -> INNPACK (esperado 403)');
  for (const r of ['/INNPACK/maquinas', '/INNPACK/inspectores', '/INNPACK/auditoria']) ok((await llamar('GET', r, tf)).s === 403, `GET ${r}`);
  ok((await llamar('PUT', '/INNPACK/inspectores/999999999', tf, {})).s === 403, 'PUT sobre id inexistente (403 = rechazado antes de tocar datos)');

  console.log('\n-- Sesiones legítimas en su propia empresa (GET)');
  for (const [emp, tk, quien] of [['INNPACK', ti, 'INNPACK'], ['FARET', tf, 'FARET']]) {
    for (const e of ['areas', 'maquinas', 'operadores']) { const r = await llamar('GET', `/${emp}/${e}`, tk); ok(r.s === 200 && Array.isArray(r.b?.data) && r.b.data.length > 0, `[${quien}] ${emp} listar ${e} (${r.b?.data?.length ?? '-'})`); }
    ok((await llamar('GET', `/${emp}/auditoria`, tk)).s === 200, `[${quien}] ${emp} auditoría`);
  }

  console.log('\n-- Cuentas técnicas ocultas (GET)');
  for (const [emp, tk, quien] of [['INNPACK', ti, 'INNPACK'], ['FARET', tf, 'FARET']]) {
    const norm = await llamar('GET', `/${emp}/inspectores`, tk);
    const lista = norm.b?.data || [];
    ok(norm.s === 200 && !lista.some((u) => OCULTAS[emp].includes(u.id)), `[${quien}] ${emp}: no aparecen en el listado operativo (${lista.length} inspectores)`);
    ok(lista.every((u) => u.oculto === false), `[${quien}] ${emp}: ningún inspector listado viene marcado oculto`);
    const todo = await llamar('GET', `/${emp}/inspectores?incluirOcultos=1`, tk);
    const vistas = (todo.b?.data || []).filter((u) => u.oculto === true).map((u) => u.id);
    ok(OCULTAS[emp].every((id) => vistas.includes(id)) && vistas.length === OCULTAS[emp].length, `[${quien}] ${emp}: ADMIN_TI ve exactamente las ocultas esperadas (ids ${vistas.join(', ')})`);
  }

  console.log('\n-- Sin sesión y catálogos (GET, sin token)');
  ok((await llamar('GET', '/INNPACK/inspectores', null)).s === 401, 'admin-planta sin token = 401');
  for (const p of ['calidad-faret/catalogo-planta', 'calidad-faret/operadores', 'calidad-faret/catalogo-eventos', 'catalogos/maquinas', 'catalogos/usuarios']) {
    let s = 0; try { s = (await fetch('https://api.faret.cl/calidad/api/' + p)).status; } catch (e) { /* sin red */ }
    ok(s === 200, `${p} = ${s}`);
  }
  console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK');
  process.exit(fallos ? 1 : 0);
})();
