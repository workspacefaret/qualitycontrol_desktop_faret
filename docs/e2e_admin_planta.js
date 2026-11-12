// Prueba E2E autenticada contra producción (usuario de pruebas AdminTI). Datos de prueba marcados ZZ TEST-CLAUDE y dados de baja al final.
const B = 'https://api.faret.cl/calidad/api/admin-planta';
let token, fallos = 0;
const ok = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fallos++; };
const j = async (met, ruta, cuerpo, tk = token) => {
  const r = await fetch(B + ruta, { method: met, headers: { 'content-type': 'application/json', ...(tk ? { authorization: 'Bearer ' + tk } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  return { s: r.status, b: await r.json().catch(() => null) };
};
(async () => {
  const l = await fetch('https://api.faret.cl/qualitycontrol/api/Auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identificador: process.env.IDENT, password: process.env.PW }) });
  const lj = await l.json(); token = lj.data?.token || lj.data?.accessToken; ok(l.status === 200 && !!token, 'login Faret AdminTI');
  // FARET
  let r = await j('GET', '/FARET/maquinas'); ok(r.s === 200 && r.b.data.length >= 32, `FARET listar máquinas (${r.b?.data?.length})`);
  const areas = (await j('GET', '/FARET/areas')).b.data; ok(areas.length === 8, `FARET áreas = ${areas.length}`);
  r = await j('GET', '/FARET/operadores'); ok(r.s === 200 && r.b.data.length >= 47, `FARET listar operadores (${r.b.data.length})`);
  r = await j('GET', '/FARET/inspectores'); ok(r.s === 200 && r.b.data.length > 0 && 'activo' in r.b.data[0], `FARET listar inspectores (${r.b.data.length})`);
  r = await j('POST', '/FARET/operadores', { nombre: 'zz test-claude op', grupoId: 'LAM' }); ok(r.s === 201 && r.b.data.nombre === 'ZZ TEST-CLAUDE OP' && r.b.data.activo, 'FARET crear operador (mayúsculas)');
  const op = r.b?.data;
  r = await j('POST', '/FARET/operadores', { nombre: 'ZZ test-claude OP', grupoId: 'LAM' }); ok(r.s === 409, 'FARET duplicado rechazado 409');
  r = await j('POST', '/FARET/operadores', { nombre: '   ', grupoId: 'LAM' }); ok(r.s === 400, 'FARET nombre vacío 400');
  r = await j('POST', '/FARET/operadores', { nombre: 'ZZ X', grupoId: 'XXX' }); ok(r.s === 400, 'FARET área inexistente 400');
  let cat = (await (await fetch('https://api.faret.cl/calidad/api/calidad-faret/catalogo-planta')).json()).data;
  ok(cat.operadoresPorArea['02-LAMINADO'].includes('ZZ TEST-CLAUDE OP'), 'catálogo móvil ve el operador nuevo');
  r = await j('PUT', '/FARET/operadores/' + op.id, { nombre: 'ZZ TEST-CLAUDE OP2', grupoId: 'PEG' }); ok(r.s === 200 && r.b.data.nombre === 'ZZ TEST-CLAUDE OP2' && r.b.data.grupoId === 'PEG', 'FARET editar nombre y mover de área');
  r = await j('PUT', '/FARET/operadores/' + op.id, { activo: false }); ok(r.s === 200 && r.b.data.activo === false, 'FARET dar de baja');
  cat = (await (await fetch('https://api.faret.cl/calidad/api/calidad-faret/catalogo-planta')).json()).data;
  ok(!JSON.stringify(cat).includes('ZZ TEST-CLAUDE'), 'catálogo móvil ya NO muestra la baja');
  r = await j('PUT', '/FARET/operadores/999999', { activo: false }); ok(r.s === 404, 'FARET id inexistente 404');
  r = await j('POST', '/FARET/maquinas', { nombre: 'zz test-claude maq', grupoId: 'LAM' }); ok(r.s === 201, 'FARET crear máquina'); const mq = r.b?.data;
  if (mq) { r = await j('PUT', '/FARET/maquinas/' + mq.id, { activo: false }); ok(r.s === 200 && !r.b.data.activo, 'FARET baja máquina'); }
  r = await j('POST', '/FARET/areas', { nombre: 'zz test', codigo: 'LAM' }); ok(r.s === 409, 'FARET código de área duplicado 409');
  r = await j('POST', '/FARET/areas', { nombre: 'zz test', codigo: 'L1' }); ok(r.s === 400, 'FARET código de área inválido 400');
  r = await j('POST', '/FARET/inspectores', { nombre: 'zz test-claude insp' }); ok(r.s === 201, 'FARET crear inspector'); const ins = r.b?.data;
  if (ins) { r = await j('PUT', '/FARET/inspectores/' + ins.id, { activo: false }); ok(r.s === 200 && !r.b.data.activo, 'FARET baja inspector');
    const ops = (await (await fetch('https://api.faret.cl/calidad/api/calidad-faret/operadores')).json()).data; ok(!ops.includes('ZZ TEST-CLAUDE INSP'), 'lista de inspectores móvil excluye la baja'); }
  // INNPACK (lecturas + escritura reversible sobre dato real + una alta de prueba)
  for (const e of ['areas', 'maquinas', 'operadores', 'inspectores']) { r = await j('GET', '/INNPACK/' + e); ok(r.s === 200 && r.b.data.length > 0, `INNPACK listar ${e} (${r.b?.data?.length})`); }
  const procs = (await j('GET', '/INNPACK/areas')).b.data; const peg = procs.find((p) => p.nombre === 'Pegado');
  const colombo = (await j('GET', '/INNPACK/operadores')).b.data.find((o) => /colombo/i.test(o.nombre)); ok(colombo && colombo.activo === false, 'INNPACK Colombo figura de baja (migración 012)');
  if (colombo) { r = await j('PUT', '/INNPACK/operadores/' + colombo.id, { activo: true }); ok(r.s === 200 && r.b.data.activo, 'INNPACK UPDATE operadores_maquina (reactivar, prueba)');
    r = await j('PUT', '/INNPACK/operadores/' + colombo.id, { activo: false }); ok(r.s === 200 && !r.b.data.activo, 'INNPACK revertido a baja'); }
  r = await j('POST', '/INNPACK/maquinas', { nombre: 'ZZ Test-Claude Maq', grupoId: peg.id }); ok(r.s === 201 && /^MAQ-PEG-/.test(r.b.data.codigo), 'INNPACK INSERT maquinas (código QR generado: ' + r.b?.data?.codigo + ')'); const im = r.b?.data;
  if (im) { r = await j('PUT', '/INNPACK/maquinas/' + im.id, { activo: false }); ok(r.s === 200 && !r.b.data.activo, 'INNPACK baja máquina de prueba'); }
  r = await j('POST', '/INNPACK/inspectores', { nombre: 'ZZ Test-Claude Insp' }); ok(r.s === 201 && /^CAL-/.test(r.b.data.codigo), 'INNPACK INSERT usuarios (código ' + r.b?.data?.codigo + ')'); const ii = r.b?.data;
  if (ii) { r = await j('PUT', '/INNPACK/inspectores/' + ii.id, { activo: false }); ok(r.s === 200 && !r.b.data.activo, 'INNPACK baja inspector de prueba'); }
  // Auditoría
  r = await j('GET', '/FARET/auditoria'); ok(r.s === 200 && r.b.data.some((a) => a.usuario && a.registro === 'ZZ TEST-CLAUDE OP2'), 'auditoría FARET registra los cambios con usuario'); console.log('   última fila:', JSON.stringify(r.b.data[0]));
  r = await j('GET', '/INNPACK/auditoria'); ok(r.s === 200 && r.b.data.length > 0, 'auditoría INNPACK registra los cambios');
  console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTODO OK');
})();
