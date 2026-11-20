# Paso 2 - Genera CSV, XLSX y PDF a partir de step1.json (no consulta ninguna base ni API).
# Uso: python -I 02_generar_entregables.py <carpeta_de_trabajo>/step1.json <carpeta_destino_NUEVA>
# Requiere: openpyxl y Microsoft Edge (variable EDGE opcional) para imprimir el PDF. LINEA BASE INFORMATIVA, no estadistica oficial.
import json, sys, csv, collections, datetime as dt, html, os, subprocess
EDGE = os.environ.get('EDGE', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

SRC, DEST = sys.argv[1], sys.argv[2]
D = json.load(open(SRC, encoding='utf-8'))
M, H, FO = D['meta'], D['hits'], D['fotos']
RANK = {'confirmado': 3, 'probable': 2, 'ambiguo': 1}
ELIM = {1: 'SI', 0: 'NO', -1: 'NO VERIFICABLE (la API vigente no expone eliminados)'}

# ---------- registros ----------
cols = ['id_original', 'fuente', 'fecha', 'hora', 'np', 'cliente', 'codigo_producto', 'producto', 'area', 'proceso', 'maquina', 'turno', 'inspector',
        'color_pallet', 'certeza', 'criterio_clasificacion', 'cantidad_pallets_declarada', 'pallets_numeros_citados', 'observacion_original',
        'defectos_registrados', 'observaciones_de_fallas', 'observaciones_de_bobinas', 'campos_donde_aparece_color', 'estado_inspeccion',
        'estado_validacion', 'fecha_validacion', 'usuario_validacion', 'eliminacion_logica', 'n_fotos', 'fotos_url', 'fotos_http_200',
        'evento_id', 'registros_en_evento', 'es_duplicado_dentro_del_evento']
first_in_event = {}
rows = []
for b in H:
    dup = 'SI' if b['evento_id'] in first_in_event else 'NO'
    first_in_event.setdefault(b['evento_id'], b['id'])
    ok = sum(1 for u in b['fotos_url'] if FO.get(u, [None])[0] == 200)
    rows.append([b['id'], b['fuente'], b['fecha'], b['hora'], b['np'], b['cliente'], b['codigo_producto'], b['producto'], b['area'], b['proceso'], b['maquina'],
                 b['turno'], b['inspector'], b['color'], b['certeza'], b['criterio'], b['cantidad_pallets_declarada'], b['pallets_numeros_citados'],
                 b['observacion'], b['defectos'], b['fallas_obs'], b['bobinas_obs'], b['campos_con_color'], b['estado_inspeccion'], b['estado_validacion'],
                 b['fecha_validacion'], b['usuario_validacion'], ELIM[b['eliminado']], len(b['fotos_url']), ' | '.join(b['fotos_url']), ok,
                 b['evento_id'], b['registros_en_evento'], dup])
with open(os.path.join(DEST, 'EVIDENCIAS_PALLETS.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f, quoting=csv.QUOTE_ALL)
    w.writerow(cols)
    w.writerows(rows)

# ---------- eventos ----------
EV = collections.OrderedDict()
for b in H:
    EV.setdefault(b['evento_id'], []).append(b)
ev_rows = []
ev_info = []
for eid, g in EV.items():
    cert = max((x['certeza'] for x in g), key=lambda c: RANK[c])
    colr = ' / '.join(sorted({c for x in g for c in x['color'].split(' / ')}))
    cants = [x['cantidad_pallets_declarada'] for x in g if x['cantidad_pallets_declarada']]
    elim = sum(1 for x in g if x['eliminado'] == 1)
    estado_el = 'SI (todos eliminados)' if elim == len(g) else ('PARCIAL' if elim else ('NO VERIFICABLE' if all(x['eliminado'] == -1 for x in g) else 'NO'))
    nf = len({u for x in g for u in x['fotos_url']})
    info = dict(eid=eid, g=g, cert=cert, color=colr, cant=cants[0] if cants else '', elim=estado_el, nf=nf, fecha=g[0]['fecha'], mes=g[0]['fecha'][:7])
    ev_info.append(info)
    ev_rows.append([eid, g[0]['fecha'], g[0]['hora'], g[-1]['hora'], g[0]['np'], g[0]['producto'], g[0]['proceso'], g[0]['maquina'], g[0]['turno'], g[0]['inspector'],
                    colr, cert, info['cant'], g[0]['observacion'], g[0]['defectos'], ' / '.join(sorted({x['estado_inspeccion'] for x in g})),
                    ' / '.join(sorted({x['estado_validacion'] for x in g})), len(g), ', '.join(str(x['id']) for x in g), estado_el, nf,
                    ' | '.join(sorted({x['fuente'] for x in g}))])
ev_cols = ['evento_id', 'fecha', 'hora_primer_registro', 'hora_ultimo_registro', 'np', 'producto', 'proceso', 'maquina', 'turno', 'inspector', 'color_pallet', 'certeza',
           'cantidad_pallets_declarada', 'observacion_original', 'defectos_registrados', 'estado_inspeccion', 'estado_validacion', 'registros_en_evento',
           'ids_registros', 'eliminacion_logica', 'fotos_distintas', 'fuente']

# ---------- estadisticas ----------
def cnt(it): return collections.Counter(it)
reg_cert_col = cnt((b['certeza'], b['color']) for b in H)
ev_cert_col = cnt((e['cert'], e['color']) for e in ev_info)
reg_cert = cnt(b['certeza'] for b in H)
ev_cert = cnt(e['cert'] for e in ev_info)
colors = ['AZUL', 'ROJO', 'VERDE']
def by_color(counter_fn):
    out = {}
    for c in colors:
        out[c] = {k: counter_fn(c, k) for k in ('confirmado', 'probable', 'ambiguo')}
    return out
reg_by_color = by_color(lambda c, k: sum(v for (cert, col), v in reg_cert_col.items() if cert == k and col == c))
ev_by_color = by_color(lambda c, k: sum(v for (cert, col), v in ev_cert_col.items() if cert == k and col == c))
mixto_ev = sum(v for (cert, col), v in ev_cert_col.items() if ' / ' in col)
mixto_reg = sum(v for (cert, col), v in reg_cert_col.items() if ' / ' in col)
mes_ev = collections.defaultdict(lambda: collections.Counter())
for e in ev_info: mes_ev[e['mes']][e['cert']] += 1
mes_reg = collections.defaultdict(lambda: collections.Counter())
for b in H: mes_reg[b['fecha'][:7]][b['certeza']] += 1
proc_ev = cnt(e['g'][0]['proceso'] for e in ev_info if e['cert'] != 'ambiguo')
maq_ev = cnt(e['g'][0]['maquina'] for e in ev_info if e['cert'] != 'ambiguo')
insp_ev = cnt(e['g'][0]['inspector'] for e in ev_info if e['cert'] != 'ambiguo')
estado_ev = cnt(e['g'][0]['estado_inspeccion'] for e in ev_info if e['cert'] != 'ambiguo')
val_reg = cnt(b['estado_validacion'] for b in H)
elim_reg = cnt(ELIM[b['eliminado']].split(' (')[0] for b in H)
fuente_reg = cnt(b['fuente'] for b in H)
area_reg = cnt(b['area'] for b in H)
cant_ev = [e for e in ev_info if e['cant'] and e['cert'] == 'confirmado']
cant_total = sum(int(e['cant']) for e in cant_ev)
fotos_reg = sum(1 for b in H if b['fotos_url'])
fotos_tot = len(FO)
fotos_ok = sum(1 for v in FO.values() if v[0] == 200)
dup_reg = sum(1 for r in rows if r[-1] == 'SI')
ev_dup = sum(1 for e in ev_info if len(e['g']) > 1)
ev_solo_elim = sum(1 for e in ev_info if e['elim'].startswith('SI'))
conf_ev = [e for e in ev_info if e['cert'] == 'confirmado']
# cobertura
fechas = set(M['fechas_con_datos'])
d0, d1 = dt.date(2026, 5, 27), dt.date(2026, 11, 20)
miss = [d0 + dt.timedelta(i) for i in range((d1 - d0).days + 1) if (d0 + dt.timedelta(i)).isoformat() not in fechas]
def ranges(ds):
    out = []
    for d in ds:
        if out and (d - out[-1][1]).days == 1: out[-1][1] = d
        else: out.append([d, d])
    return ['%s' % a.isoformat() if a == b else '%s a %s' % (a.isoformat(), b.isoformat()) for a, b in out]
gaps = ranges(miss)
ndias_rango = (d1 - d0).days + 1
primer = min(b['fecha'] for b in H)

# ---------- XLSX ----------
wb = Workbook()
HF = PatternFill('solid', fgColor='1F3864')
def sheet(ws, header, data, widths=None, wrap_cols=()):
    ws.append(header)
    for r in data: ws.append(r)
    for c in ws[1]:
        c.font = Font(bold=True, color='FFFFFF'); c.fill = HF; c.alignment = Alignment(wrap_text=True, vertical='center')
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = ws.dimensions
    for i, h in enumerate(header, 1):
        w = (widths or {}).get(h, min(max(len(str(h)) + 2, 12), 40))
        ws.column_dimensions[get_column_letter(i)].width = w
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(wrap_text=(ws.cell(1, c.column).value in wrap_cols), vertical='top')
ws = wb.active; ws.title = 'LEEME'
leeme = ['Historico de clasificacion de pallets AZUL / ROJO / VERDE - INNPACK (linea base)', 'Generado: ' + M['generado'] + '  |  Periodo cubierto: ' + M['mysql_min_fecha'] + ' a 2026-11-19 (corte 2026-11-20)',
         'LINEA BASE INFORMATIVA: este historico NO es una estadistica oficial de cantidades de pallets ni un indicador de gestion; es una referencia previa al registro oficial.',
         '', 'FUENTES: MySQL historico "calidad" (hasta ' + M['mysql_max_fecha'] + ') + API INNPACK / SQL Server (desde ' + M['api_min_fecha'] + '). Solo lectura.',
         'Cada fila de "Registros completos" es una INSPECCION (registro de control), NO un pallet. Un mismo hecho puede estar repetido en varias inspecciones (ver evento_id).',
         'Las cantidades de pallets solo se informan si estan escritas en la observacion (cantidad_pallets_declarada); no son conteos verificados.',
         'Certeza: confirmado = "pallet ... en/azul|rojo|verde"; probable = pallet y color en el texto sin ligazon directa; ambiguo = color sin la palabra pallet.',
         'eliminacion_logica NO VERIFICABLE = registros desde SQL Server: la API no expone eliminados.', 'Hojas: Registros completos | Eventos unicos | Resumen estadistico | Fotografias | Ambiguos y probables']
for t in leeme: ws.append([t])
ws.column_dimensions['A'].width = 150
ws['A1'].font = Font(bold=True, size=14)
sheet(wb.create_sheet('Registros completos'), cols, rows, {'observacion_original': 60, 'fotos_url': 60, 'criterio_clasificacion': 45, 'producto': 35, 'cliente': 30, 'defectos_registrados': 35, 'observaciones_de_fallas': 35, 'observaciones_de_bobinas': 30}, ('observacion_original', 'criterio_clasificacion', 'fotos_url', 'defectos_registrados'))
sheet(wb.create_sheet('Eventos unicos'), ev_cols, ev_rows, {'observacion_original': 60, 'producto': 35, 'ids_registros': 30, 'defectos_registrados': 35, 'fuente': 30}, ('observacion_original', 'ids_registros', 'defectos_registrados'))
# resumen
wr = wb.create_sheet('Resumen estadistico')
def put(title, header, data):
    wr.append([title]); wr.cell(wr.max_row, 1).font = Font(bold=True, size=12)
    wr.append(header)
    for c in wr[wr.max_row]: c.font = Font(bold=True, color='FFFFFF'); c.fill = HF
    for r in data: wr.append(r)
    wr.append([])
put('Eventos unicos por color y certeza', ['Color', 'Confirmado', 'Probable', 'Ambiguo', 'Total'], [[c] + [ev_by_color[c][k] for k in ('confirmado', 'probable', 'ambiguo')] + [sum(ev_by_color[c].values())] for c in colors] + [['TOTAL', ev_cert['confirmado'], ev_cert['probable'], ev_cert['ambiguo'], len(ev_info)]])
put('Registros (inspecciones) por color y certeza', ['Color', 'Confirmado', 'Probable', 'Ambiguo', 'Total'], [[c] + [reg_by_color[c][k] for k in ('confirmado', 'probable', 'ambiguo')] + [sum(reg_by_color[c].values())] for c in colors] + [['TOTAL', reg_cert['confirmado'], reg_cert['probable'], reg_cert['ambiguo'], len(H)]])
put('Por mes (eventos unicos)', ['Mes', 'Confirmado', 'Probable', 'Ambiguo', 'Total eventos', 'Total inspecciones del mes (todas)'], [[m, mes_ev[m]['confirmado'], mes_ev[m]['probable'], mes_ev[m]['ambiguo'], sum(mes_ev[m].values()), M['total_por_mes'].get(m, '')] for m in sorted(mes_ev)])
put('Por proceso (eventos confirmados+probables)', ['Proceso', 'Eventos'], proc_ev.most_common())
put('Por maquina (eventos confirmados+probables)', ['Maquina', 'Eventos'], maq_ev.most_common())
put('Por inspector (eventos confirmados+probables)', ['Inspector', 'Eventos'], insp_ev.most_common())
put('Estado de inspeccion (eventos confirmados+probables)', ['Estado', 'Eventos'], estado_ev.most_common())
put('Estado de validacion (registros)', ['Estado', 'Registros'], val_reg.most_common())
put('Eliminacion logica (registros)', ['Eliminado', 'Registros'], elim_reg.most_common())
put('Fuente (registros)', ['Fuente', 'Registros'], fuente_reg.most_common())
put('Cantidades de pallets DECLARADAS en texto (eventos confirmados)', ['Concepto', 'Valor'], [['Eventos confirmados', len(conf_ev)], ['Con cantidad escrita', len(cant_ev)], ['Suma de cantidades escritas (declarada, no verificada)', cant_total]])
put('Fotografias', ['Concepto', 'Valor'], [['Registros con foto', fotos_reg], ['Fotos distintas', fotos_tot], ['Fotos con HTTP 200', fotos_ok]])
wr.column_dimensions['A'].width = 55
for k in 'BCDEF': wr.column_dimensions[k].width = 22
# fotos
fr = []
for b in H:
    for u in b['fotos_url']:
        v = FO.get(u, ['?', None, None])
        fr.append([b['id'], b['evento_id'], b['fecha'], b['np'], b['color'], b['certeza'], ELIM[b['eliminado']].split(' (')[0], u, v[0], v[1], v[2]])
sheet(wb.create_sheet('Fotografias'), ['id_registro', 'evento_id', 'fecha', 'np', 'color', 'certeza', 'eliminado', 'url', 'http_status', 'bytes', 'content_type'], fr, {'url': 80})
amb = [r for r in rows if r[14] in ('ambiguo', 'probable')]
sheet(wb.create_sheet('Ambiguos y probables'), cols, amb, {'observacion_original': 60, 'fotos_url': 60, 'criterio_clasificacion': 45, 'producto': 35, 'cliente': 30}, ('observacion_original', 'criterio_clasificacion', 'fotos_url'))
XL = os.path.join(DEST, 'HISTORICO_PALLETS_INNPACK.xlsx')
wb.save(XL)

# ---------- HTML -> PDF ----------
E = html.escape
def tbl(header, data, cls=''):
    return '<table class="%s"><tr>%s</tr>%s</table>' % (cls, ''.join('<th>%s</th>' % E(str(h)) for h in header), ''.join('<tr>%s</tr>' % ''.join('<td>%s</td>' % E(str(x)) for x in r) for r in data))
def bars(items, color='#1F3864'):
    mx = max([v for _, v in items] + [1])
    return ''.join('<div class="bar"><span class="bl">%s</span><span class="bb" style="width:%d%%;background:%s"></span><span class="bv">%s</span></div>' % (E(str(k)), int(v / mx * 100), color, v) for k, v in items)
ev_conf_rows = [[e['eid'], e['fecha'], e['g'][0]['np'], e['g'][0]['proceso'], e['g'][0]['maquina'], e['color'], e['cant'] or '-', len(e['g']), e['nf'], e['elim'].split(' (')[0], e['g'][0]['observacion'][:95]] for e in conf_ev]
doc = '''<html><head><meta charset="utf-8"><style>
@page{size:A4;margin:16mm 14mm} body{font-family:Segoe UI,Arial,sans-serif;font-size:10.5px;color:#1b1b1b;line-height:1.45}
h1{font-size:22px;color:#1F3864;margin:0 0 4px} h2{font-size:14px;color:#1F3864;border-bottom:2px solid #1F3864;padding-bottom:3px;margin:20px 0 8px} h3{font-size:11.5px;margin:12px 0 4px}
table{border-collapse:collapse;width:100%;margin:6px 0 10px} th{background:#1F3864;color:#fff;text-align:left;padding:4px 6px;font-size:9.5px} td{border-bottom:1px solid #ddd;padding:3px 6px;vertical-align:top;font-size:9.5px}
.kpi{display:inline-block;border:1px solid #1F3864;border-radius:6px;padding:8px 14px;margin:0 8px 8px 0;text-align:center} .kpi b{display:block;font-size:20px;color:#1F3864}
.bar{display:flex;align-items:center;margin:2px 0} .bl{width:150px;font-size:9.5px} .bb{height:11px;display:inline-block} .bv{margin-left:6px;font-size:9.5px}
.warn{background:#fff4e5;border-left:4px solid #e08a00;padding:6px 10px;margin:8px 0} .note{background:#eef3fb;border-left:4px solid #1F3864;padding:6px 10px;margin:8px 0} .small{color:#555;font-size:9px}
.pb{page-break-before:always} tr{page-break-inside:avoid}
</style></head><body>'''
doc += '<h1>Informe historico de clasificacion de pallets (azul / rojo / verde)</h1><div class="small">Inspecciones de Calidad INNPACK - Linea base previa al registro oficial estructurado<br>Generado: %s &nbsp;|&nbsp; Periodo: %s a 2026-11-20 &nbsp;|&nbsp; Operacion de solo lectura</div>' % (M['generado'].replace('T', ' '), primer if False else M['mysql_min_fecha'])
doc += '<div class="warn"><b>Linea base informativa.</b> Este historico no es una estadistica oficial de cantidades de pallets ni un indicador de gestion: son anotaciones de texto libre interpretadas por reglas, previas al registro oficial estructurado.</div>'
doc += '<h2>1. Resumen ejecutivo</h2>'
doc += '<div class="kpi"><b>%d</b>eventos unicos<br>con color</div><div class="kpi"><b>%d</b>eventos<br>confirmados</div><div class="kpi"><b>%d</b>registros<br>(inspecciones)</div><div class="kpi"><b>%d</b>fotos<br>verificadas</div>' % (len(ev_info), ev_cert['confirmado'], len(H), fotos_ok)
doc += '<p>Hasta ahora la clasificacion de pallets por color se anotaba de manera informal en las observaciones de las inspecciones. Se reviso todo el historial disponible en MySQL (%s a %s, %d registros) y en SQL Server via API INNPACK (%s a %s, %d registros), buscando menciones de azul, rojo y verde. Se encontraron <b>%d inspecciones</b> con color, que representan <b>%d eventos distintos</b> una vez agrupados los duplicados (misma NP, proceso y texto en una ventana de 60 minutos).</p>' % (M['mysql_min_fecha'], M['mysql_max_fecha'], M['mysql_total'], M['api_min_fecha'], M['api_max_fecha'], M['api_total'], len(H), len(ev_info))
doc += '<div class="warn"><b>Importante:</b> una inspeccion no es un pallet. Las cantidades de pallets solo constan cuando estan escritas en el texto (%d eventos confirmados las declaran, suma declarada = %d) y no son conteos verificados.</div>' % (len(cant_ev), cant_total)
doc += '<h2>2. Alcance, fuentes y metodologia</h2><ul><li><b>MySQL historico</b> (BD calidad): todos los registros de control incluidos los eliminados logicamente (%d de %d), con fallas visuales, adjuntos y observaciones de bobinas.</li><li><b>API INNPACK (SQL Server vigente)</b>: solo GET, paginado, filtrado por fecha (%s a %s). Expone una foto por registro, no expone eliminados y no trae cliente ni area.</li><li><b>Otras tablas INNPACK</b> revisadas por menciones de color: producto terminado, ensayos, mermas, no conformidades, bobinas (0 menciones); fallas visuales (%d menciones, ya incluidas via su registro).</li><li><b>Fotografias</b>: se verifico su existencia con consultas HEAD (sin descargar ni modificar).</li></ul>' % (M['mysql_eliminados'], M['mysql_total'], M['api_min_fecha'], M['api_max_fecha'], M['otras_tablas']['registro_fallas_visuales'][1])
doc += '<h3>Criterios de certeza</h3>' + tbl(['Nivel', 'Regla', 'Ejemplo'], [['Confirmado', 'Palabra pallet/palet y color en la misma expresion', '"pallet en azul", "pallet n5 en azul", "pallet rojo"'], ['Probable', 'Pallet y color en el mismo texto, sin ligazon directa', '"pallet con film azul"'], ['Ambiguo', 'Color sin la palabra pallet (material, film, pliegos)', '"material en azul", "film azul"']])
doc += '<p class="small">Se excluye el apellido "Rojas" (nombre de personas). Eventos: registros con la misma NP, proceso y texto normalizado, separados por menos de 60 minutos, se agrupan en un unico evento.</p>'
doc += '<h2>3. Cobertura temporal</h2>' + tbl(['Fuente', 'Desde', 'Hasta', 'Dias con datos', 'Registros'], [['MySQL historico', M['mysql_min_fecha'], M['mysql_max_fecha'], M['mysql_dias'], M['mysql_total']], ['SQL Server via API', M['api_min_fecha'], M['api_max_fecha'], M['api_dias'], M['api_total']], ['Solape (ids en ambas)', '2026-09-01', '2026-09-08', '-', '%d ids, sin diferencias en observacion ni estados' % M['solape_ids']]])
doc += '<p>De los %d dias entre %s y 2026-11-20, <b>%d no tienen registros</b> en ninguna fuente: %s. (El 2026-11-20 es el dia en curso.)</p>' % (ndias_rango, d0.isoformat(), len(miss), E(', '.join(gaps)))
doc += '<h2>4. Hallazgos</h2><h3>4.1 Eventos unicos por color y certeza</h3>' + tbl(['Color', 'Confirmado', 'Probable', 'Ambiguo', 'Total'], [[c] + [ev_by_color[c][k] for k in ('confirmado', 'probable', 'ambiguo')] + [sum(ev_by_color[c].values())] for c in colors] + [['TOTAL', ev_cert['confirmado'], ev_cert['probable'], ev_cert['ambiguo'], len(ev_info)]])
doc += '<p>Hay %d eventos con mas de un color mencionado (clasificados segun el color presente; ver hoja Eventos).</p>' % mixto_ev if mixto_ev else ''
doc += '<h3>4.2 Registros (inspecciones) por color y certeza</h3>' + tbl(['Color', 'Confirmado', 'Probable', 'Ambiguo', 'Total'], [[c] + [reg_by_color[c][k] for k in ('confirmado', 'probable', 'ambiguo')] + [sum(reg_by_color[c].values())] for c in colors] + [['TOTAL', reg_cert['confirmado'], reg_cert['probable'], reg_cert['ambiguo'], len(H)]])
doc += '<p>%d de %d inspecciones son repeticiones dentro de un evento (%d eventos tienen mas de un registro). Ejemplo: NP 4058 del 2026-10-08 tiene 22 registros identicos.</p>' % (dup_reg, len(H), ev_dup)
doc += '<h3>4.3 Evolucion mensual (eventos)</h3>' + tbl(['Mes', 'Confirmado', 'Probable', 'Ambiguo', 'Total eventos', 'Inspecciones del mes'], [[m, mes_ev[m]['confirmado'], mes_ev[m]['probable'], mes_ev[m]['ambiguo'], sum(mes_ev[m].values()), M['total_por_mes'].get(m, '')] for m in sorted(mes_ev)])
doc += '<p class="small">Atencion: el registro formal con texto libre aumenta desde septiembre; el crecimiento puede reflejar mayor habito de anotarlo, no necesariamente mas casos.</p>'
doc += '<h3>4.4 Procesos, maquinas e inspectores (eventos confirmados y probables)</h3><b>Proceso</b>' + bars(proc_ev.most_common(8)) + '<b>Maquina</b>' + bars(maq_ev.most_common(8), '#2E75B6') + '<b>Inspector</b>' + bars(insp_ev.most_common(8), '#548235')
doc += '<h3>4.5 Estado, validacion y eliminacion</h3>' + tbl(['Estado de inspeccion', 'Eventos'], estado_ev.most_common()) + tbl(['Validacion', 'Registros'], val_reg.most_common()) + tbl(['Eliminado logico', 'Registros'], elim_reg.most_common())
doc += '<h3>4.6 Fotografias</h3><p>%d registros con color tienen foto; %d fotos distintas; <b>%d de %d responden HTTP 200</b>. Origen: https://api.faret.cl/calidad/uploads/control/... (acceso de solo lectura por URL). El contenido visual de las imagenes no fue analizado.</p>' % (fotos_reg, fotos_tot, fotos_ok, fotos_tot)
doc += '<h2 class="pb">5. Eventos confirmados</h2><p class="small">Listado resumido (%d eventos). El detalle completo esta en HISTORICO_PALLETS_INNPACK.xlsx y EVIDENCIAS_PALLETS.csv.</p>' % len(conf_ev)
doc += tbl(['Evento', 'Fecha', 'NP', 'Proceso', 'Maquina', 'Color', 'Cant. decl.', 'Regs', 'Fotos', 'Elim.', 'Observacion'], ev_conf_rows)
doc += '<h2>6. Limitaciones</h2><ul>'
lim = ['<b>Eliminados en SQL Server no visibles</b>: la API vigente no expone registros eliminados; los %d registros desde SQL Server figuran como "no verificable". En el historico MySQL %d de %d registros (%.0f%%) estaban eliminados, por lo que es probable que existan eventos eliminados no recuperables en el tramo reciente. Hay %d huecos de ID en el tramo solo-API, indicador no concluyente. Se probo filtrar eliminados en la API (parametros incluirEliminados / eliminado): sin efecto, y no existe acceso SQL de solo lectura a la base de Calidad en SQL Server desde este entorno.' % (fuente_reg.get('API SQL Server (vigente)', 0), M['mysql_eliminados'], M['mysql_total'], 100.0 * M['mysql_eliminados'] / M['mysql_total'], M['api_solo_huecos_id']),
       'Cliente y area no estan disponibles para los registros leidos via API (campos vacios, marcados).', 'La API entrega una sola foto por registro; en MySQL constan todos los adjuntos.', 'Las inspecciones no son pallets: no se estimaron cantidades. Solo se informa lo escrito en el texto.',
       'Texto libre: pueden existir clasificaciones con redaccion no detectada por las reglas (errores ortograficos extremos) o colores con otro significado (material, film).', 'Produccion: MySQL tiene %d registros de area PRODUCCION sin menciones de color; el resumen de Produccion en SQL Server no devolvio registros y su area no es consultable por la API de Calidad.' % (M['mysql_areas'].get('PRODUCCION', 0) + M['mysql_areas'].get('PRODUCCION INNPACK', 0)),
       'No se incluyen tablas Faret (registros_calidad_faret): fuera del alcance INNPACK.', 'No se declara cobertura completa: hay dias sin datos y registros eliminados del tramo reciente no verificables.']
doc += ''.join('<li>%s</li>' % x for x in lim) + '</ul>'
doc += '<h2>7. Conclusiones y uso futuro</h2><ul><li>La clasificacion por color aparece casi siempre como <b>pallet azul</b> (segregado/observado) y rara vez rojo; no hay registros de pallet verde como clasificacion.</li><li>Este rescate es una <b>referencia historica consultable</b>, separada de los indicadores del futuro registro estructurado, cuya fecha de corte se definira despues.</li><li>Antecedentes recuperables para el nuevo sistema: color, causa (defecto), NP, proceso, maquina, turno, inspector, estado de inspeccion/validacion, fotografias y la expresion textual original.</li><li>Recomendacion: no mezclar este historico con los KPI oficiales; usar el evento_id para evitar duplicados al comparar.</li></ul>'
doc += '</body></html>'
HTML = os.path.join(os.path.dirname(SRC), 'informe.html')
open(HTML, 'w', encoding='utf-8').write(doc)
PDF = os.path.join(DEST, 'INFORME_HISTORICO_PALLETS_INNPACK.pdf')
subprocess.run([EDGE, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--print-to-pdf=' + PDF, 'file:///' + HTML.replace('\\', '/')], check=True, timeout=120)
# datos para los .md
json.dump(dict(ev=len(ev_info), conf=ev_cert['confirmado'], prob=ev_cert['probable'], amb=ev_cert['ambiguo'], regs=len(H), rc=dict(reg_cert), ev_by_color=ev_by_color, reg_by_color=reg_by_color,
               dup=dup_reg, ev_dup=ev_dup, fotos=[fotos_reg, fotos_tot, fotos_ok], cant=[len(cant_ev), cant_total], gaps=gaps, miss=len(miss), solo_elim=ev_solo_elim, mes={m: dict(mes_ev[m]) for m in mes_ev}, primer=M['mysql_min_fecha'], mixto=mixto_ev,
               elim=dict(elim_reg), fuente=dict(fuente_reg)), open(os.path.join(os.path.dirname(SRC), 'stats.json'), 'w'), default=str)
print('OK', len(rows), len(ev_rows), len(fr))
