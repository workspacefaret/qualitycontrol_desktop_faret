"""Motor determinista de responsabilidad PROPUESTA por operador (solo lectura, sin BD ni red).

Principio: participar != ser responsable. Toda salida es una PROPUESTA pendiente de validacion de Calidad;
nada de lo que calcula este modulo es una penalizacion confirmada. Sin nombres en la salida (seudonimos).

Escenarios (por NC de producto):
  1  un unico operador identificable en el documento+maquina(+proceso)  -> propuesta individual
  2  varios operadores y ventana de fecha FIABLE -> solo sesiones que cubren la ventana
  3  varios operadores, sin horario fiable pero documento y maquina confirmados -> reparto equitativo (provisional)
  4  evidencia insuficiente -> sin puntos; participantes solo como contexto ("pendiente de investigacion")
"""
from collections import OrderedDict

import analizar_cruce as ac

PUNTOS_POR_NIVEL = {"CRITICO": 10, "MAYOR": 5, "MENOR": 1, "SIN_NIVEL": 0}  # configurable; ponderacion provisional
ESTADO_CALIDAD = "PENDIENTE_VALIDACION_CALIDAD"
FECHAS_NC_VERIFICADAS = False  # el significado de fecha_fabricacion de la NC NO esta verificado: no se usa para acotar sesiones
USAR_OPERADOR_DECLARADO = True  # el operador que Calidad declara en la NC, si FPS lo corrobora, acota la propuesta
SESION_LARGA_H = 16.0  # una sesion mas larga que dos turnos suele quedar abierta: no sirve para ubicar el defecto en el tiempo


def _stem(t):
    return t[:6]


def alias_candidatos(maq_nc, maquinas_fps):
    """Equivalencia SUGERIDA (no validada) entre el nombre de maquina de Calidad y las de FPS de un documento.
    Todas las palabras no numericas de la maquina de Calidad deben aparecer (por raiz de 6 letras) en la maquina FPS;
    'A/B' significa una u otra. Solo se sugiere si exactamente UNA maquina FPS del documento calza."""
    toks = [t for t in ac.norm_texto(ac.sin_acentos(str(maq_nc or "")).replace("/", " / ")).split() if t]
    grupos, actual = [], []
    for t in toks:
        if t == "/":
            continue
        if t.isdigit():
            continue
        grupos.append(_stem(t))
    if not grupos:
        return []
    # alternativas por barra: palabras unidas por '/' en el original forman un grupo OR
    orig = [x for x in str(maq_nc or "").replace("/", " / ").split()]
    or_groups, cur, i = [], [], 0
    palabras = [ac.norm_texto(ac.sin_acentos(x)) for x in orig]
    while i < len(palabras):
        w = palabras[i]
        if w == "/":
            i += 1
            continue
        if i + 2 < len(palabras) + 0 and i + 1 < len(palabras) and palabras[i + 1] == "/" and i + 2 < len(palabras):
            or_groups.append([_stem(w), _stem(palabras[i + 2])])
            i += 3
            continue
        if not w.isdigit():
            or_groups.append([_stem(w)])
        i += 1
    cand = []
    for mq in {ac.norm_maquina(m) for m in maquinas_fps}:
        stems = {_stem(t) for t in mq.split()}
        if all(any(x in stems for x in g) for g in or_groups):
            cand.append(mq)
    return sorted(cand)


def alias_sugerido(maq_nc, maquinas_fps):
    cand = alias_candidatos(maq_nc, maquinas_fps)
    return cand[0] if len(cand) == 1 else None


def cargar_catalogo(ruta):
    """Catalogo real de maquinas de FPS (dbo.ZZZListaMaquina): aplatz_id = IdMaquina/ResourceKey de las sesiones, bez = nombre,
    gruppe = proceso. Solo lectura; no contiene datos personales."""
    out = []
    for r in ac.leer_csv(ruta):
        nombre = str(ac.col(r, "bez")).strip()
        if nombre:
            out.append({"id": str(ac.col(r, "aplatz_id")).strip(), "nombre": nombre, "corto": str(ac.col(r, "NombreCorto")).strip(),
                        "grupo": str(ac.col(r, "gruppe")).strip(), "activo": str(ac.col(r, "Active")).strip().upper() == "J"})
    return out


def resolver_en_catalogo(maq_nc, area, catalogo):
    """Busca la maquina de Calidad en TODO el catalogo FPS (no solo en las del documento).
    EXACTA: el nombre normalizado coincide con una sola maquina del catalogo (del mismo proceso si la NC lo indica).
    UNICA: las palabras del nombre de Calidad calzan con una sola maquina del catalogo (mismo proceso). AMBIGUA / NINGUNA en otro caso."""
    res = {"estado": "NINGUNA", "id": "", "nombre": "", "grupo": "", "activo": None, "candidatos": []}
    if not catalogo or not ac.norm_maquina(maq_nc):
        return res
    g = ac.norm_texto(area or "")
    pool = [c for c in catalogo if not g or ac.norm_texto(c["grupo"]) == g] or catalogo
    n = ac.norm_maquina(maq_nc)
    ex = [c for c in pool if ac.norm_maquina(c["nombre"]) == n]
    if len(ex) == 1:
        c, est = ex[0], "EXACTA"
    elif len(ex) > 1:
        res.update(estado="AMBIGUA", candidatos=[c["nombre"] for c in ex][:6])
        return res
    else:
        cand = alias_candidatos(maq_nc, {c["nombre"] for c in pool})
        if len(cand) == 1:
            c, est = next(c for c in pool if ac.norm_maquina(c["nombre"]) == cand[0]), "UNICA"
        elif len(cand) > 1:
            res.update(estado="AMBIGUA", candidatos=[c["nombre"] for c in pool if ac.norm_maquina(c["nombre"]) in cand][:6])
            return res
        else:
            return res
    res.update(estado=est, id=c["id"], nombre=c["nombre"], grupo=c["grupo"], activo=c["activo"])
    return res


def enriquecer_con_raw(sesiones, raw_rows):
    """Agrega a cada sesion (por ID = RecordKey) los datos de dbo.WorkOrderRecords: inicio de setup/produccion reales, cierre,
    comentarios y si otro usuario edito el registro. No cambia ni agrega sesiones."""
    por_id = {str(r.get("RecordKey", "")).strip(): r for r in raw_rows}
    n = 0
    for x in sesiones:
        r = por_id.get(x["id"])
        if not r:
            continue
        n += 1
        x["prod_ini"] = ac.parse_fecha(r.get("ProductionStartDate"))
        x["cierre"] = (r.get("CloseReasonName") or "").strip()
        x["coment"] = bool((r.get("Comments") or "").strip())
        x["editado_otro"] = bool((r.get("UpdateUserKey") or "").strip() and (r.get("UpdateUserKey") or "").strip() != (r.get("UserKey") or "").strip())
        x["recurso"] = (r.get("ResourceKey") or "").strip()
    return n


def coincide_declarado(declarado, nombre_fps):
    """El operador declarado en la NC (texto libre, p. ej. 'Cesar Sepulveda') coincide con el de FPS si TODAS sus palabras
    (minimo 2) estan en el nombre completo de FPS ('CESAR ANDRES SEPULVEDA CORDERO'). Una sola palabra es ambigua."""
    a_ = set(ac.clave_operador(declarado).split())
    b_ = set(ac.clave_operador(nombre_fps).split())
    return len(a_) >= 2 and a_ <= b_


def _estado_declarado(nc):
    d = nc.get("operador_declarado") or ""
    if not ac.operador_valido(d):
        return "SIN_DECLARAR"
    if ac.separa_varios(d) or len(ac.clave_operador(d).split()) < 2:
        return "AMBIGUO"
    return "DECLARADO"


def variantes_nombre(declarado, nombres_fps):
    """Posibles variantes/homonimos del operador declarado entre los nombres de FPS. NUNCA corroboran: solo se informan.
    VARIANTE_ORTOGRAFICA: todas las palabras del declarado tienen un par casi igual (>=0.8) en el nombre FPS (p. ej. Cezar/Cesar).
    APELLIDO_COINCIDE: comparten al menos una palabra pero el nombre de pila difiere (podria ser otra persona)."""
    import difflib
    d = [t for t in ac.clave_operador(declarado).split() if len(t) >= 3]
    out = []
    if len(d) < 2:
        return out
    for nombre in sorted(set(nombres_fps)):
        f = [t for t in ac.clave_operador(nombre).split() if len(t) >= 3]
        if not f or set(d) <= set(f):
            continue
        casi = [any(difflib.SequenceMatcher(None, x, y).ratio() >= 0.8 for y in f) for x in d]
        comp = [t for t in d if t in f]
        if all(casi):
            out.append({"nombre": nombre, "tipo": "VARIANTE_ORTOGRAFICA"})
        elif comp:
            out.append({"nombre": nombre, "tipo": "APELLIDO_COINCIDE"})
    return out


def _larga(x):
    return x["ini"] is not None and x["fin"] is not None and (x["fin"] - x["ini"]).total_seconds() / 3600.0 > SESION_LARGA_H


def repartir_centesimas(total_puntos, n):
    """Reparte total_puntos entre n personas en centesimas, sin perder ni duplicar: 5/3 -> 1.67, 1.67, 1.66."""
    if n <= 0:
        return []
    total_c = int(round(total_puntos * 100))
    base, resto = divmod(total_c, n)
    return [(base + (1 if i < resto else 0)) / 100 for i in range(n)]


def _resumen_operadores(sesiones, sal):
    por = OrderedDict()
    for s in sorted(sesiones, key=lambda x: (x["ini"] or ac.datetime.max, x["id"])):
        k = s["op_key"]
        d = por.setdefault(k, {"op": ac.seudonimo(s["op"], sal), "sesiones": 0, "cantidad": 0.0,
                               "desde": None, "hasta": None, "maquinas": set(), "ots": set(), "procesos": set(), "lista": []})
        d["sesiones"] += 1
        d["cantidad"] += s.get("cant", 0.0)
        for f in (s["ini"], s["fin"]):
            if f is not None:
                d["desde"] = f if d["desde"] is None or f < d["desde"] else d["desde"]
                d["hasta"] = f if d["hasta"] is None or f > d["hasta"] else d["hasta"]
        d["maquinas"].add(s["mq_raw"])
        d["ots"].add(s["ot"])
        d["procesos"].add(s.get("proc", ""))
        d["lista"].append({"ot": s["ot"], "proceso": s.get("proc", ""), "maquina": s["mq_raw"], "inicio": s["ini"].strftime("%Y-%m-%d %H:%M") if s["ini"] else "",
                           "fin": s["fin"].strftime("%Y-%m-%d %H:%M") if s["fin"] else "", "cantidad": round(s.get("cant", 0.0)),
                           "prodInicio": s["prod_ini"].strftime("%Y-%m-%d %H:%M") if s.get("prod_ini") else "",
                           "larga": _larga(s), "cierre": s.get("cierre", ""), "comentario": bool(s.get("coment")),
                           "editadoPorOtro": bool(s.get("editado_otro"))})
    return por


def _fmt(d):
    return d.date().isoformat() if d else ""


def _salida_ops(por, puntos_por_op):
    return [{"operador": v["op"], "sesiones": v["sesiones"], "cantidad": round(v["cantidad"]),
             "desde": _fmt(v["desde"]), "hasta": _fmt(v["hasta"]), "maquinas": sorted(v["maquinas"]),
             "ots": sorted(v["ots"]), "procesos": sorted(x for x in v["procesos"] if x), "sesionesDetalle": v["lista"][:20],
             "sesionesLargas": sum(1 for z in v["lista"] if z["larga"]), "puntosPropuestos": puntos_por_op.get(k, 0.0)} for k, v in por.items()]


def _clasificar_participantes(por_doc, elegibles_keys, estado_maquina, fuera_ventana_keys=(), no_declarados=(), candidatos=(), no_producto=()):
    """Cada operador del documento queda PROPUESTO, EXCLUIDO o CONTEXTO, con el motivo escrito."""
    out = []
    for k, v in por_doc.items():
        donde = f"{' / '.join(sorted(v['maquinas']))}" + (f" (proceso {', '.join(sorted(x for x in v['procesos'] if x))})" if any(v["procesos"]) else "")
        if k in elegibles_keys:
            est, mot = "PROPUESTO", f"Operó {donde} en {v['sesiones']} sesión(es), OT {', '.join(sorted(v['ots']))}: misma máquina y proceso que la NC."
        elif k in no_producto:
            est, mot = "EXCLUIDO", f"Operó la misma máquina y proceso ({donde}), pero no el mismo código de producto de la NC."
        elif k in no_declarados:
            est, mot = "EXCLUIDO", f"Operó la misma máquina y proceso ({donde}), pero la NC declara a otro operador."
        elif k in candidatos:
            est, mot = "CONTEXTO", f"Coincide con la máquina de la NC ({donde}), pero el operador declarado en la NC no figura en esa máquina/proceso en FPS: sin atribución."
        elif k in fuera_ventana_keys:
            est, mot = "EXCLUIDO", f"Operó la máquina de la NC pero sus sesiones quedan fuera de la ventana verificada del defecto ({donde})."
        elif estado_maquina == "SIN_SESIONES":
            est, mot = "CONTEXTO", f"La máquina de la NC está confirmada en el catálogo FPS, pero este documento no tiene sesiones en ella; se muestra como contexto, sin puntos ({donde})."
        elif estado_maquina == "NINGUNA":
            est, mot = "CONTEXTO", f"La máquina de la NC no tiene equivalencia en FPS: se muestra como trazabilidad contextual, sin puntos ({donde})."
        else:
            est, mot = "EXCLUIDO", f"Solo operó otra máquina/proceso distinto al de la NC: {donde}."
        out.append((k, est, mot))
    return out


def _proponer_base(nc, sesiones_doc, sal, catalogo=None, alias=None, puntos_nivel=None, np_en_varias_empresas=False, fechas_verificadas=FECHAS_NC_VERIFICADAS):
    """nc: {id, nivel_nc, maquina, fecha(datetime|None), fecha_registro, eliminado, rectificada}.
    sesiones_doc: sesiones (deduplicadas) de TODAS las OT del documento de la NC (NV Innpack / NP Faret).
    Las fechas de la NC solo acotan sesiones si fechas_verificadas=True (su significado no esta verificado hoy);
    si no, se muestran como contradicciones/contexto y NUNCA descartan operadores."""
    puntos_nivel = puntos_nivel or PUNTOS_POR_NIVEL
    alias = ac.ALIAS if alias is None else alias
    sev = puntos_nivel.get(nc.get("nivel_nc", "SIN_NIVEL"), 0)
    faltante, razones, contra = [], [], []
    res = {"id": nc["id"], "nivelNc": nc.get("nivel_nc"), "puntosSeveridad": sev, "estadoCalidad": ESTADO_CALIDAD,
           "revisarVigencia": bool(nc.get("eliminado") or nc.get("rectificada")),
           "documentoIdentificado": bool(sesiones_doc), "maquinaConfirmada": False, "ventanaFiable": False, "aliasSugerido": False,
           "equivalencia": {"estado": "NINGUNA", "nc": nc.get("maquina") or "", "fps": "", "detalle": ""},
           "fechaUsadaParaAcotar": False,
           "declarado": {"estado": _estado_declarado(nc), "operador": "", "exclusivo": None}, "apoyoUnicoNombreDeclarado": False,
           "producto": {"codigo": str(nc.get("codigo_producto") or "").strip(), "estado": "INSUFICIENTE", "detalle": "", "sesiones": 0, "operadores": []},
           "alternativaFps": None, "variantesNombre": [], "conciliacion": None,
           "catalogo": resolver_en_catalogo(nc.get("maquina"), nc.get("area"), catalogo), "maquinaCatalogoSinSesiones": False, "procesoNc": nc.get("area") or "", "procesoCoincide": None,
           "escenario": 4, "confianza": "SIN_EVIDENCIA", "operadores": [], "participantesContexto": [],
           "razones": razones, "evidenciaFaltante": faltante, "contradicciones": contra, "puntosAsignados": 0.0}

    if nc.get("eliminado") or nc.get("rectificada"):
        razones.append("nc_eliminada_o_rectificada_revisar_asignaciones")
    validos = [s for s in sesiones_doc if s["op_ok"]]
    por_doc = _resumen_operadores(validos, sal)

    def cerrar(estado_maquina, elegibles_keys=(), fuera=(), no_decl=(), cand=(), no_prod=()):
        cl = {k: (e, m) for k, e, m in _clasificar_participantes(por_doc, set(elegibles_keys), estado_maquina, set(fuera), set(no_decl), set(cand), set(no_prod))}
        res["participantesContexto"] = [{**o, "estado": cl[k][0], "motivo": cl[k][1]} for k, o in zip(por_doc.keys(), _salida_ops(por_doc, {}))]
        return res

    def alternativa(por_k, base_, nota):
        """Hipotesis informativa (NO suma a los totales): que pasaria si Calidad aceptara la evidencia FPS en vez del operador declarado."""
        if not por_k:
            return
        cuota = repartir_centesimas(sev, len(por_k))
        res["alternativaFps"] = {"base": base_, "cuentaEnTotales": False, "nota": nota, "confianza": "BAJA",
                                 "operadores": [{"operador": v["op"], "puntosHipoteticos": cuota[i]} for i, (k_, v) in enumerate(por_k.items())]}

    if not sesiones_doc:
        razones.append("documento_no_encontrado_en_fps")
        faltante.append("NV/NP presente en FPS")
        return res
    if np_en_varias_empresas:
        razones.append("np_compartido_entre_empresas")
        faltante.append("llave de documento sin ambiguedad")
        return cerrar("NINGUNA")

    mq_nc = ac.norm_maquina(nc.get("maquina"))
    if not mq_nc:
        razones.append("sin_maquina_nc")
        faltante.append("maquina identificable en la NC")
        return cerrar("NINGUNA")
    maquinas_doc = {s["mq"]: s["mq_raw"] for s in validos}
    mq_objetivo = alias.get(mq_nc, mq_nc)
    en_maq = [s for s in validos if s["mq"] == mq_objetivo]
    eq = res["equivalencia"]
    if en_maq:
        eq["estado"] = "VALIDADA" if mq_nc in alias else "EXACTA"
        eq["fps"] = maquinas_doc.get(mq_objetivo, "")
        eq["detalle"] = "Alias validado por una persona" if mq_nc in alias else "El nombre normalizado coincide con el de FPS"
    else:
        sug = alias_sugerido(nc.get("maquina"), {s["mq_raw"] for s in validos})
        if sug:
            en_maq = [s for s in validos if s["mq"] == sug]
            res["aliasSugerido"] = True
            eq["estado"] = "SUGERIDA"
            eq["fps"] = maquinas_doc.get(sug, sug)
            eq["detalle"] = "Todas las palabras del nombre de Calidad (sin números; 'A/B' = A o B) aparecen en una única máquina del documento. No está validada."
            razones.append("maquina_por_equivalencia_sugerida_no_validada")
            faltante.append("validación de la equivalencia de máquina (por ejemplo con dbo.ZZZListaMaquina)")
    cat = res["catalogo"]
    if cat["estado"] in ("EXACTA", "UNICA"):
        mq_cat = ac.norm_maquina(cat["nombre"])
        en_cat = [x for x in validos if x["mq"] == mq_cat]
        det_cat = (f"Catálogo FPS (ZZZListaMaquina): {cat['nombre']} · id {cat['id']} · proceso {cat['grupo']}; "
                   + ("nombre idéntico tras normalizar." if cat["estado"] == "EXACTA" else "única máquina del catálogo, en ese proceso, que calza con el nombre de Calidad."))
        nums_nc = {t for t in ac.norm_texto(str(nc.get("maquina") or "")).split() if t.isdigit()}
        nums_cat = {t for t in ac.norm_texto(cat["nombre"]).split() if t.isdigit()}
        if cat["estado"] == "UNICA" and nums_nc - nums_cat:
            det_cat += f" El número «{', '.join(sorted(nums_nc - nums_cat))}» del nombre de Calidad no tiene equivalente en el catálogo FPS (solo existe una máquina de ese tipo)."
        if en_maq and en_maq[0]["mq"] != mq_cat:
            contra.append(f"El catálogo FPS ubica la máquina de la NC en «{cat['nombre']}», pero se emparejó por texto con otra del documento.")
        elif en_cat and eq["estado"] != "VALIDADA":
            en_maq = en_cat
            res["aliasSugerido"] = False
            eq.update(estado="CATALOGO", fps=en_cat[0]["mq_raw"], detalle=det_cat)
            if "maquina_por_equivalencia_sugerida_no_validada" in razones:
                razones.remove("maquina_por_equivalencia_sugerida_no_validada")
            razones.append("maquina_confirmada_con_el_catalogo_fps")
        elif not en_cat:
            eq.update(estado="CATALOGO", fps=cat["nombre"], detalle=det_cat)
            res["maquinaCatalogoSinSesiones"] = True
            contra.append(f"La máquina de la NC es «{cat['nombre']}» (id {cat['id']}) según el catálogo FPS, pero el documento no registra ninguna sesión en ella.")
            razones.append("maquina_confirmada_en_catalogo_sin_sesiones_en_el_documento")
            faltante.append("el documento o lote correcto de esa máquina (el NV de la NC no pasó por ella en FPS)")
            return cerrar("SIN_SESIONES")
    if not en_maq:
        razones.append("maquina_nc_sin_equivalencia_en_fps")
        faltante.append("máquina de la NC sin equivalencia verificable en las OT del documento")
        return cerrar("NINGUNA")
    res["maquinaConfirmada"] = True

    # Fechas de la NC: informativas. Solo acotan si su significado esta verificado (fechas_verificadas=True).
    f = nc.get("fecha").date() if nc.get("fecha") else None
    reg = nc.get("fecha_registro")
    if f is not None and reg is not None and f > reg.date():
        contra.append(f"La fecha de fabricación de la NC ({f}) es posterior a su propio registro ({reg.date()}).")
        razones.append("fecha_de_fabricacion_posterior_al_registro_dato_incoherente")
        f = None
    ini_m = min((s["ini"] for s in en_maq if s["ini"]), default=None)
    fin_m = max(((s["fin"] or s["ini"]) for s in en_maq if s["ini"]), default=None)
    if f is not None and ini_m and fin_m and not (ini_m.date() <= f <= fin_m.date()):
        contra.append(f"La fecha de la NC ({f}) está fuera del período en que FPS fabricó en esa máquina ({ini_m.date()} a {fin_m.date()}); no se usa para descartar operadores.")
        razones.append("fecha_nc_fuera_del_periodo_de_la_maquina_no_se_usa_para_descartar")
    if reg is not None and nc.get("fecha") is not None:
        pass
    elegibles, fiable, fuera = en_maq, False, []
    if f is not None and fechas_verificadas:
        cubren = [s for s in en_maq if ac.en_ventana(s, f) and not _larga(s)]
        if cubren:
            elegibles, fiable = cubren, True
            res["fechaUsadaParaAcotar"] = True
            fuera = [k for k in _resumen_operadores(en_maq, sal) if k not in _resumen_operadores(cubren, sal)]
        else:
            contra.append("Ninguna sesión (de menos de 16 h) de esa máquina cubre la fecha verificada del defecto.")
    elif f is not None:
        faltante.append("significado verificado de las fechas de la NC (hoy no se usan para acotar sesiones)")
    res["ventanaFiable"] = fiable
    largas = [s for s in elegibles if _larga(s)]
    if largas:
        contra.append(f"{len(largas)} sesión(es) duran más de {int(SESION_LARGA_H)} h (posiblemente abiertas varios turnos).")

    # Codigo de producto de la NC frente al ARTICULO de las sesiones FPS (llave mas fuerte que el nombre del operador).
    base_maq = elegibles
    prod = res["producto"]
    prod_acota = False
    cod = prod["codigo"]
    if not cod:
        prod["detalle"] = "La NC no registra código de producto."
        faltante.append("código de producto en la NC")
    else:
        en_doc_cod = [x for x in validos if x.get("art") == cod]
        en_maq_cod = [x for x in elegibles if x.get("art") == cod]
        if en_maq_cod:
            prod.update(estado="CONFIRMADA", sesiones=len(en_maq_cod),
                        detalle=f"El código figura en {len(en_maq_cod)} sesión(es) FPS de la máquina/proceso emparejados.")
            prod["operadores"] = [o["operador"] for o in _salida_ops(_resumen_operadores(en_maq_cod, sal), {})]
            elegibles, prod_acota = en_maq_cod, True
            razones.append("producto_de_la_nc_acota_a_las_sesiones_del_mismo_codigo")
        elif en_doc_cod:
            prod.update(estado="DISCREPANCIA", sesiones=len(en_doc_cod),
                        detalle="El código figura en el documento, pero en otra máquina o proceso distinto al de la NC.")
            contra.append("El código de producto de la NC se fabricó en otra máquina/proceso del documento, no en el declarado.")
        else:
            prod["detalle"] = "El código de producto de la NC no figura en las sesiones FPS de este documento (puede haberse registrado en otra OT)."
            faltante.append("sesiones FPS del código de producto de la NC")
    res["productoAcota"] = prod_acota

    # Proceso (area) declarado en la NC frente a los procesos FPS de la maquina emparejada.
    area = ac.norm_texto(nc.get("area") or "")
    if area:
        procs = {ac.norm_texto(x["proc"]) for x in elegibles if x.get("proc")}
        res["procesoCoincide"] = any(area in pr or pr in area for pr in procs) if procs else None
        if res["procesoCoincide"] is False:
            contra.append(f"La NC indica el área/proceso '{nc.get('area')}', pero en FPS esa máquina figura en {', '.join(sorted(procs)) or 'otro proceso'}.")

    # Operador declarado por Calidad frente a los operadores FPS de la maquina/proceso (y producto) emparejados.
    dec = res["declarado"]
    por_maq_full = _resumen_operadores(base_maq, sal)
    por_maq = _resumen_operadores(elegibles, sal)
    if USAR_OPERADOR_DECLARADO and dec["estado"] == "DECLARADO":
        nombre = nc.get("operador_declarado")
        dec["operador"] = ac.seudonimo(nombre, sal)
        en_doc = [k for k in por_doc if any(coincide_declarado(nombre, x["op"]) for x in validos if x["op_key"] == k)]
        en_maq_k = [k for k in por_maq if k in en_doc]
        en_full_k = [k for k in por_maq_full if k in en_doc]
        if en_maq_k:
            dec["estado"] = "CORROBORADO"
            razones.append("operador_declarado_en_la_nc_corroborado_por_fps")
            dec["operador"] = por_maq[en_maq_k[0]]["op"]  # mismo seudonimo que el operador FPS (misma persona)
            dec["exclusivo"] = len(por_maq) == 1
            if prod_acota:
                if len(por_maq) > 1:
                    contra.append("El operador declarado en la NC no es el único que fabricó ese código de producto en esa máquina según FPS.")
                    razones.append("otros_operadores_fabricaron_el_mismo_producto_en_la_misma_maquina")
            else:
                if len(por_maq) > 1:
                    res["apoyoUnicoNombreDeclarado"] = True
                    razones.append("propuesta_apoyada_solo_en_el_nombre_declarado")
                    faltante.append("evidencia distinta del nombre declarado (código de producto/horario) para excluir a los otros operadores de la máquina")
                elegibles = [x for x in elegibles if x["op_key"] in en_maq_k]
        elif en_full_k:
            dec["estado"] = "FUERA_DE_PRODUCTO"
            dec["operador"] = por_doc[en_full_k[0] if "FUERA_DE_PRODUCTO"=="FUERA_DE_PRODUCTO" else en_doc[0]]["op"]
            contra.append("El operador declarado en la NC operó esa máquina/proceso, pero no fabricó el código de producto de la NC según FPS.")
            razones.append("operador_declarado_no_fabrico_el_producto_de_la_nc")
            faltante.append("aclarar con qué operador y producto se originó el defecto (las fuentes se contradicen)")
            alternativa(por_maq, "producto", "Operadores que fabricaron el código de producto de la NC en esa máquina según FPS.")
            return cerrar("CONTRADICCION", cand=por_maq.keys(), no_prod=[k for k in por_maq_full if k not in por_maq])
        elif en_doc:
            dec["estado"] = "FUERA_DE_MAQUINA"
            dec["operador"] = por_doc[en_full_k[0] if "FUERA_DE_MAQUINA"=="FUERA_DE_PRODUCTO" else en_doc[0]]["op"]
            contra.append("El operador declarado en la NC trabajó en este documento, pero no en la máquina/proceso de la NC.")
            razones.append("operador_declarado_no_opero_la_maquina_de_la_nc")
            res["maquinaConfirmada"] = True
            faltante.append("aclarar con qué operador y máquina se originó el defecto (las fuentes se contradicen)")
            alternativa(por_maq, "producto" if prod_acota else "maquina_proceso", "Operadores FPS de esa máquina/proceso" + (" que fabricaron el mismo código de producto." if prod_acota else "."))
            return cerrar("CONTRADICCION", cand=por_maq.keys(), no_prod=[k for k in por_maq_full if k not in por_maq])
        else:
            dec["estado"] = "NO_ENCONTRADO"
            contra.append("El operador declarado en la NC no figura en ninguna sesión de este documento en FPS, mientras que la máquina/proceso sí tienen otros operadores.")
            razones.append("operador_declarado_no_figura_en_fps")
            faltante.append("sesiones FPS del operador declarado (no aparece en el documento)")
            alternativa(por_maq, "producto" if prod_acota else "maquina_proceso", "Operadores FPS de esa máquina/proceso" + (" que fabricaron el mismo código de producto." if prod_acota else "; el código de producto no pudo verificarse."))
            return cerrar("CONTRADICCION", cand=por_maq.keys(), no_prod=[k for k in por_maq_full if k not in por_maq])

    por = _resumen_operadores(elegibles, sal)
    n = len(por)
    cuota = repartir_centesimas(sev, n)
    puntos = {k: cuota[i] for i, k in enumerate(por)}
    res["operadores"] = _salida_ops(por, puntos)
    res["puntosAsignados"] = round(sum(cuota), 2)
    limitada = (eq["estado"] == "SUGERIDA" and dec["estado"] != "CORROBORADO" and not prod_acota) or res["apoyoUnicoNombreDeclarado"]
    if n == 1:
        res["escenario"] = 1
        res["confianza"] = "BAJA" if limitada else ("ALTA" if fiable else "MEDIA")
        razones.append("unico_operador_en_documento_y_maquina")
    elif fiable:
        res["escenario"] = 2
        res["confianza"] = "BAJA" if limitada else "MEDIA"
        razones.append("varios_operadores_solo_sesiones_que_cubren_la_ventana")
    else:
        res["escenario"] = 3
        res["confianza"] = "BAJA"
        razones.append("responsabilidad_compartida_provisional_reparto_equitativo")
        faltante.append("horario verificado del defecto para distinguir entre los operadores elegibles")
    faltante.append("validación explícita de Calidad antes de cualquier efecto oficial")
    no_decl = [k for k in por_maq if k not in por] if dec["estado"] == "CORROBORADO" and not prod_acota else []
    no_prod = [k for k in por_maq_full if k not in por_maq] if prod_acota else []
    return cerrar(eq["estado"], por.keys(), fuera, no_decl, no_prod=no_prod)


def conciliar(res, nc, sesiones_doc, sal):
    """Capa de conciliacion Calidad <-> FPS. Estados: CONFIRMADA / PROBABLE / DISCREPANCIA / INSUFICIENTE.
    Cada dimension conserva su procedencia (Calidad declara, FPS registra); ninguna fuente sobrescribe a la otra."""
    dims = []

    def d(dim, estado, calidad, fps, detalle):
        dims.append({"dimension": dim, "estado": estado, "calidad": calidad or "", "fps": fps or "", "detalle": detalle})

    maqs = sorted({s["mq_raw"] for s in sesiones_doc if s["op_ok"]})
    procs = sorted({s.get("proc", "") for s in sesiones_doc if s.get("proc")})
    ots = sorted({s["ot"] for s in sesiones_doc})
    if not res["documentoIdentificado"]:
        d("documento", "INSUFICIENTE", nc.get("np_nv", ""), "", "El documento no figura en FPS.")
    elif "np_compartido_entre_empresas" in res["razones"]:
        d("documento", "PROBABLE", nc.get("np_nv", ""), f"{len(ots)} OT", "El número se repite en más de una empresa.")
    else:
        d("documento", "CONFIRMADA", nc.get("np_nv", ""), f"{len(ots)} OT, {len(sesiones_doc)} sesiones", "NV/NP encontrado en FPS.")
    pr = res["producto"]
    d("producto", pr["estado"], pr["codigo"], f"{pr['sesiones']} sesión(es) con ese código" if pr["sesiones"] else "", pr["detalle"])
    eq = res["equivalencia"]
    # Sin identificador comun entre Calidad y FPS, un nombre igual o parecido nunca es definitivo: solo una validacion humana
    # (VALIDADA) o la fabricacion del mismo codigo de producto en esa maquina (EXACTA + producto) lo confirman.
    if eq["estado"] in ("VALIDADA", "CATALOGO") or (eq["estado"] == "EXACTA" and pr["estado"] == "CONFIRMADA"):
        est_m = "CONFIRMADA"
    elif eq["estado"] in ("EXACTA", "SUGERIDA"):
        est_m = "PROBABLE"
    else:
        est_m = "INSUFICIENTE"
    det_m = eq["detalle"] or "Sin equivalencia verificable en las OT del documento."
    if est_m == "CONFIRMADA" and eq["estado"] == "EXACTA":
        det_m += " Confirmada además porque el código de producto de la NC se fabricó en esa máquina."
    elif est_m == "PROBABLE" and eq["estado"] == "EXACTA":
        det_m += " Sin identificador común: no es definitiva."
    d("maquina", est_m, eq["nc"], eq["fps"], det_m)
    if res.get("maquinaCatalogoSinSesiones"):
        d("ocurrencia", "DISCREPANCIA", nc.get("np_nv", ""), "sin sesiones en esa máquina", "El documento anotado en la NC no pasó por la máquina anotada según FPS.")
    pc = res["procesoCoincide"]
    if pc is None and res["catalogo"]["estado"] in ("EXACTA", "UNICA") and res["procesoNc"]:
        pc = ac.norm_texto(res["procesoNc"]) == ac.norm_texto(res["catalogo"]["grupo"])
        procs = procs or [res["catalogo"]["grupo"]]
    d("proceso", "CONFIRMADA" if pc is True else "DISCREPANCIA" if pc is False else "INSUFICIENTE", res["procesoNc"], ", ".join(procs[:4]),
      "El área/proceso de la NC coincide con el de FPS." if pc is True else "No coincide con FPS." if pc is False else "Sin comparación posible.")
    dec = res["declarado"]
    ops_pr = pr["operadores"]
    if dec["estado"] == "CORROBORADO":
        apoyo = pr["estado"] == "CONFIRMADA"
        d("operador", "CONFIRMADA" if apoyo else "PROBABLE", "Declarado " + dec["operador"], ", ".join(ops_pr) if apoyo else "",
          "Figura entre quienes fabricaron el mismo código de producto en esa máquina." if apoyo else "Figura en la máquina/proceso; la identidad se apoya en el nombre declarado, sin verificar el producto.")
    elif dec["estado"] in ("NO_ENCONTRADO", "FUERA_DE_MAQUINA", "FUERA_DE_PRODUCTO"):
        d("operador", "DISCREPANCIA", "Declarado " + dec["operador"], ", ".join(ops_pr), {"NO_ENCONTRADO": "El operador declarado no figura en el documento en FPS.", "FUERA_DE_MAQUINA": "Trabajó en el documento, pero no en esa máquina/proceso.", "FUERA_DE_PRODUCTO": "Operó esa máquina, pero no fabricó el código de producto de la NC."}[dec["estado"]])
    else:
        d("operador", "INSUFICIENTE", "", ", ".join(ops_pr), "La NC no declara un operador utilizable." if dec["estado"] == "SIN_DECLARAR" else "El texto del operador declarado es ambiguo y no se usa.")
    if dec["estado"] in ("NO_ENCONTRADO", "FUERA_DE_MAQUINA", "FUERA_DE_PRODUCTO") and nc.get("operador_declarado"):
        nombres = [s["op"] for s in sesiones_doc if s["op_ok"]]
        pseudos = {s["op"]: ac.seudonimo(s["op"], sal) for s in sesiones_doc if s["op_ok"]}
        proc_de = {}
        for s in sesiones_doc:
            if s["op_ok"]:
                proc_de.setdefault(s["op"], set()).add(s.get("proc", ""))
        res["variantesNombre"] = [{"operador": pseudos[v["nombre"]], "tipo": v["tipo"], "procesos": sorted(x for x in proc_de.get(v["nombre"], ()) if x)}
                                  for v in variantes_nombre(nc["operador_declarado"], nombres)]
    estados = [x["estado"] for x in dims]
    if "DISCREPANCIA" in estados:
        g = "DISCREPANCIA"
    elif res["documentoIdentificado"] and all(e == "CONFIRMADA" for e in estados):
        g = "CONFIRMADA"
    elif res["documentoIdentificado"] and any(e in ("CONFIRMADA", "PROBABLE") for e in estados[1:]):
        g = "PROBABLE"
    else:
        g = "INSUFICIENTE"
    res["conciliacion"] = {"estado": g, "dimensiones": dims}
    return res


def proponer(nc, sesiones_doc, sal, **kw):
    res = _proponer_base(nc, sesiones_doc, sal, **kw)
    return conciliar(res, nc, sesiones_doc, sal)


def indicadores(propuestas):
    """A participacion, B propuesta provisional, C confirmada (siempre 0: no existe almacenamiento de decision de Calidad)."""
    ind = {}
    for p in propuestas:
        vistos = set()
        for o in p["participantesContexto"]:
            if o["operador"] in vistos:
                continue
            vistos.add(o["operador"])
            ind.setdefault(o["operador"], {"participacionNc": 0, "propuestaPuntos": 0.0, "confirmadaPuntos": 0.0})["participacionNc"] += 1
        if p["revisarVigencia"]:
            continue  # NC eliminada/rectificada: no suma propuesta
        for o in p["operadores"]:
            ind.setdefault(o["operador"], {"participacionNc": 0, "propuestaPuntos": 0.0, "confirmadaPuntos": 0.0})
            ind[o["operador"]]["propuestaPuntos"] = round(ind[o["operador"]]["propuestaPuntos"] + o["puntosPropuestos"], 2)
    return ind
