# Paso 1 - Extrae (SOLO LECTURA) y clasifica antecedentes de clasificacion de pallets (azul/rojo/verde).
# Uso: python -I 01_extraer_clasificar.py <ruta/config.json> <carpeta_de_trabajo_FUERA_del_repo>
# Lee las credenciales unicamente de config.json en tiempo de ejecucion; no las imprime ni las guarda.
# Escribe <carpeta_de_trabajo>/step1.json (contiene datos de inspecciones: no versionar).
import json, re, sys, time, datetime as dt, urllib.request, collections
import pymysql, pymysql.cursors
CFG, OUT = sys.argv[1], sys.argv[2]
API_DESDE, API_HASTA = '2026-09-01', '2026-11-20'   # ventana consultada en la API INNPACK (SQL Server)
cfg = json.load(open(CFG, encoding='utf-8-sig'))

# --- cliente minimo de la API INNPACK: un login (cuenta de servicio de config.json) y luego solo GET ---
_BASE = cfg['QualityControlInnpackApi']['BaseUrl'].rstrip('/') + '/'
def _req(path, body=None, tok=None):
    r = urllib.request.Request(_BASE + path, data=None if body is None else json.dumps(body).encode(),
                               headers={'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + tok} if tok else {})})
    with urllib.request.urlopen(r, timeout=90) as f:
        return json.loads(f.read().decode('utf-8'))
def login():
    sa = cfg['InnpackApiServiceAccount']
    return _req('api/auth/login', {'codigoUsuario': sa['CodigoUsuario'], 'password': sa['Password']})['data']['token']
def get(path, tok):
    return _req(path, None, tok)

# ---------------- MySQL historico (READ ONLY) ----------------
c = pymysql.connect(host=cfg['MySqlHost'], port=int(cfg['MySqlPort']), user=cfg['MySqlUser'], password=cfg['MySqlPassword'],
                    database=cfg['QualityDbName'], charset='utf8mb4', cursorclass=pymysql.cursors.DictCursor, read_timeout=180)
cur = c.cursor()
cur.execute("SET SESSION TRANSACTION READ ONLY")
cur.execute("""SELECT rc.id, rc.fecha_registro, rc.hora_registro, rc.creado_en, rc.np, rc.cliente, rc.codigo_producto, rc.descripcion_producto,
  rc.area, p.nombre proceso, m.nombre maquina, rc.turno, u.nombre_completo inspector, ec.nombre estado_inspeccion,
  rc.estado_validacion, rc.fecha_validacion, rc.usuario_validacion, rc.eliminado, rc.observacion, rc.requiere_merma, rc.tipo_merma, rc.cantidad_merma
  FROM registros_control rc LEFT JOIN usuarios u ON u.id=rc.usuario_id LEFT JOIN procesos p ON p.id=rc.proceso_id
  LEFT JOIN maquinas m ON m.id=rc.maquina_id LEFT JOIN estados_catalogo ec ON ec.id=rc.estado_id ORDER BY rc.id""")
my = {r['id']: r for r in cur.fetchall()}
cur.execute("SELECT f.registro_id, f.id fid, pcv.nombre parametro, f.observacion FROM registro_fallas_visuales f LEFT JOIN parametros_control_visual pcv ON pcv.id=f.parametro_id ORDER BY f.id")
fallas = collections.defaultdict(list)
for r in cur.fetchall():
    fallas[r['registro_id']].append(r)
cur.execute("SELECT id, registro_id, nombre_original, ruta_archivo, tamano_bytes, fecha_creacion FROM registro_adjuntos ORDER BY id")
adj = collections.defaultdict(list)
for r in cur.fetchall():
    adj[r['registro_id']].append(r)
cur.execute("SELECT registro_id, observacion FROM registro_control_bobinas WHERE observacion IS NOT NULL AND observacion<>''")
bob = collections.defaultdict(list)
for r in cur.fetchall():
    bob[r['registro_id']].append(r['observacion'])
otras = {}
for t, col in [('registro_pt_hallazgos', 'observacion'), ('registro_ensayos', 'observacion'), ('registro_mermas', 'observacion'),
               ('no_conformidades', 'observacion'), ('registro_control_bobinas', 'observacion'), ('registro_fallas_visuales', 'observacion')]:
    cur.execute("SELECT COUNT(*) n, SUM(" + col + " REGEXP 'azul|rojo|verde') k FROM " + t)
    r = cur.fetchone()
    otras[t] = [int(r['n'] or 0), int(r['k'] or 0)]
c.close()

# ---------------- API INNPACK (SQL Server) solo GET ----------------
tok = login()
apirows = []
p = 1
while True:
    d = get('api/registros-control?page=%d&limit=200&fechaDesde=%s&fechaHasta=%s' % (p, API_DESDE, API_HASTA), tok)['data']
    apirows += d['items']
    if p >= d['pages']:
        break
    p += 1
    time.sleep(0.4)
api = {r['id']: r for r in apirows}

# ---------------- Consolidacion de filas base ----------------
def f(v):
    if v is None:
        return ''
    if hasattr(v, 'isoformat'):
        return v.isoformat()
    return str(v)

def hora(v):
    s = str(v) if v is not None else ''
    return (('0' + s) if re.match(r'^\d:', s) else s)[:8]

base = {}
for i, r in my.items():
    base[i] = dict(id=i, fecha=f(r['fecha_registro']), hora=hora(r['hora_registro']), np=r['np'], cliente=r['cliente'] or '',
        codigo_producto=r['codigo_producto'] or '', producto=r['descripcion_producto'] or '', area=r['area'] or '', proceso=r['proceso'] or '',
        maquina=r['maquina'] or '', turno=r['turno'] or '', inspector=r['inspector'] or '', estado_inspeccion=r['estado_inspeccion'] or '',
        estado_validacion=r['estado_validacion'] or '', fecha_validacion=f(r['fecha_validacion']), usuario_validacion=r['usuario_validacion'] or '',
        eliminado=int(r['eliminado'] or 0), observacion=r['observacion'] or '', fuente='MySQL historico (calidad)',
        defectos=' ; '.join(x['parametro'] or '' for x in fallas.get(i, [])),
        fallas_obs=' ; '.join((x['observacion'] or '') for x in fallas.get(i, []) if x['observacion']),
        bobinas_obs=' ; '.join(bob.get(i, [])), tipo_merma=r['tipo_merma'] or '', cantidad_merma=f(r['cantidad_merma']),
        fotos=[a['ruta_archivo'] for a in adj.get(i, []) if a['ruta_archivo']])
solape_dif = collections.Counter()
solape_n = 0
for i, r in api.items():
    if i in base:
        solape_n += 1
        b = base[i]
        b['fuente'] = 'MySQL historico + API SQL Server'
        if (b['observacion'] or '').strip() != (r['observacion'] or '').strip():
            solape_dif['observacion'] += 1
        if (b['estado_validacion'] or '') != (r['estadoValidacion'] or ''):
            solape_dif['estado_validacion'] += 1
        if (b['estado_inspeccion'] or '') != (r['estado'] or ''):
            solape_dif['estado_inspeccion'] += 1
        continue
    base[i] = dict(id=i, fecha=r['fechaRegistro'], hora=(r['horaRegistro'] or '')[:8], np=r['np'], cliente='(no disponible via API)',
        codigo_producto=r['codigoProducto'] or '', producto=r['producto'] or '', area='(no disponible via API)', proceso=r['proceso'] or '',
        maquina=r['maquina'] or '', turno=r['turno'] or '', inspector=r['usuario'] or '', estado_inspeccion=r['estado'] or '',
        estado_validacion=r['estadoValidacion'] or '', fecha_validacion=r['fechaValidacion'] or '', usuario_validacion=r['usuarioValidacion'] or '',
        eliminado=-1, observacion=r['observacion'] or '', fuente='API SQL Server (vigente)', defectos=r['tipoDefecto'] or '', fallas_obs='',
        bobinas_obs=r['bobinaObservacion'] or '', tipo_merma=r['tipoMerma'] or '', cantidad_merma=r['cantidadMerma'] or '',
        fotos=[r['imagenUrl']] if r['imagenUrl'] else [])
    for k in ('defectos', 'bobinas_obs', 'tipo_merma', 'cantidad_merma', 'observacion', 'codigo_producto', 'producto'):
        if base[i][k] == '-':
            base[i][k] = ''

# ---------------- Clasificacion ----------------
COL = r'(azul(?:es)?|roj[oa]s?|verde?s?)'
P = r'pall?e?t+s?'
conf = [re.compile(P + r'(?:\s+\S+){0,4}?\s+(?:en|a)\s+' + COL, re.I), re.compile(P + r'\s+' + COL, re.I), re.compile(COL + r'\s+' + P, re.I)]
NUM = {'un': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5, 'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10}

def colores(t):
    t2 = re.sub(r'\bRojas\b', '', t)  # apellido (Rojas) no es color
    out = []
    for nom, k in (('AZUL', 'azul'), ('ROJO', 'roj'), ('VERDE', 'verd')):
        if re.search(r'\b' + k, t2, re.I):
            out.append(nom)
    return out, t2

def clasificar(b):
    textos = [('observacion', b['observacion']), ('fallas_obs', b['fallas_obs']), ('bobinas_obs', b['bobinas_obs']),
              ('defectos', b['defectos']), ('tipo_merma', b['tipo_merma'])]
    cols = []
    campos = []
    cert = None
    regla = ''
    for nm, t in textos:
        if not t:
            continue
        cs, t2 = colores(t)
        if not cs:
            continue
        campos.append(nm)
        cols += [x for x in cs if x not in cols]
        if any(rx.search(t2) for rx in conf):
            cert = 'confirmado'
            regla = 'R1: palabra pallet/palet + color en la misma expresion (ej. "pallet en azul", "pallet azul")'
        elif re.search(P, t2, re.I) and cert != 'confirmado':
            cert = 'probable'
            regla = 'R2: pallet y color en el mismo texto pero no ligados directamente (ej. "pallet con film azul")'
        elif cert is None:
            cert = 'ambiguo'
            regla = 'R3: color sin la palabra pallet (material/film/pliegos); no prueba clasificacion de pallet'
    return cols, campos, cert, regla

def cantidad(b):
    t = ' '.join([b['observacion'], b['fallas_obs']])
    m = re.search(r'\b(\d+|' + '|'.join(NUM) + r')\s+' + P + r'\b', t, re.I)
    cant = ''
    if m:
        cant = m.group(1) if m.group(1).isdigit() else str(NUM[m.group(1).lower()])
    refs = re.findall(P + r'\s*(?:n[°º.]?\s*)?(\d[\d\-]*(?:\s*(?:y|,)\s*\d[\d\-]*)*)', t, re.I)
    return cant, '; '.join(refs)

hits = []
for i in sorted(base):
    b = base[i]
    cols, campos, cert, regla = clasificar(b)
    if not cols:
        continue
    cant, refs = cantidad(b)
    b.update(color=' / '.join(cols), campos_con_color=', '.join(campos), certeza=cert, criterio=regla,
             cantidad_pallets_declarada=cant, pallets_numeros_citados=refs)
    hits.append(b)

# ---------------- Eventos (deduplicacion) ----------------
def norm(t):
    return re.sub(r'\s+', ' ', re.sub(r'[^\w ]', ' ', (t or '').lower())).strip()

def ts(b):
    try:
        return dt.datetime.fromisoformat(b['fecha'][:10] + 'T' + (b['hora'] or '00:00:00')[:8])
    except Exception:
        return dt.datetime.fromisoformat(b['fecha'][:10])

groups = collections.defaultdict(list)
for b in sorted(hits, key=ts):
    key = (str(b['np']).strip(), norm(b['observacion']) or norm(b['defectos']), b['proceso'])
    lst = groups[key]
    if lst and (ts(b) - ts(lst[-1][-1])) <= dt.timedelta(minutes=60):
        lst[-1].append(b)
    else:
        lst.append([b])
evs = []
for key, lst in groups.items():
    for g in lst:
        evs.append(g)
evs.sort(key=lambda g: (ts(g[0]), g[0]['id']))
for n, g in enumerate(evs, 1):
    for b in g:
        b['evento_id'] = 'EVT-%04d' % n
        b['registros_en_evento'] = len(g)

# ---------------- Fotos: verificar existencia (HEAD, sin descargar) ----------------
def url(u):
    return u if u.startswith('http') else 'https://api.faret.cl/calidad' + (u if u.startswith('/') else '/' + u)

fotos = {}
for b in hits:
    for u in b['fotos']:
        U = url(u)
        if U in fotos:
            continue
        try:
            x = urllib.request.urlopen(urllib.request.Request(U, method='HEAD'), timeout=20)
            fotos[U] = (x.status, x.headers.get('Content-Length'), x.headers.get('Content-Type'))
        except Exception as e:
            fotos[U] = (getattr(e, 'code', 'ERR'), None, None)
        time.sleep(0.15)
for b in hits:
    b['fotos_url'] = [url(u) for u in b['fotos']]

ids_api_only = sorted(i for i in api if i not in my)
huecos = (ids_api_only[-1] - ids_api_only[0] + 1 - len(ids_api_only)) if ids_api_only else 0
meta = dict(generado=dt.datetime.now().isoformat(timespec='seconds'), mysql_total=len(my),
    mysql_min_fecha=min(f(r['fecha_registro']) for r in my.values()), mysql_max_fecha=max(f(r['fecha_registro']) for r in my.values()),
    mysql_eliminados=sum(1 for r in my.values() if r['eliminado']), mysql_areas=dict(collections.Counter(r['area'] or '(nulo)' for r in my.values())),
    api_total=len(api), api_min_fecha=min(r['fechaRegistro'] for r in api.values()), api_max_fecha=max(r['fechaRegistro'] for r in api.values()),
    solape_ids=solape_n, solape_dif=dict(solape_dif), api_solo_ids=len(ids_api_only), api_solo_huecos_id=huecos, otras_tablas=otras,
    mysql_dias=len({f(r['fecha_registro']) for r in my.values()}), api_dias=len({r['fechaRegistro'] for r in api.values()}))
meta['fechas_con_datos'] = sorted({b['fecha'][:10] for b in base.values()})
meta['total_por_mes'] = dict(sorted(collections.Counter(b['fecha'][:7] for b in base.values()).items()))
meta['eliminados_mysql_por_mes'] = dict(sorted(collections.Counter(b['fecha'][:7] for b in base.values() if b['eliminado'] == 1).items()))
meta['total_por_area'] = dict(collections.Counter(b['area'] for b in base.values()))
json.dump(dict(meta=meta, hits=hits, fotos={k: list(v) for k, v in fotos.items()}), open(OUT + '/step1.json', 'w', encoding='utf-8'),
          ensure_ascii=False, default=str)
print('hits', len(hits), 'eventos', len(evs), dict(collections.Counter(b['certeza'] for b in hits)), 'fotos', len(fotos),
      dict(collections.Counter(v[0] for v in fotos.values())))
print({k: v for k, v in meta.items()})
