"""Genera el snapshot v2 (trazabilidad y responsabilidad PROPUESTA) para el modulo Photino. Sin nombres de personas.
Uso: python -I generar_snapshot_v2.py --fps sesiones_por_nv_01.csv [...] --nc nc_calidad.csv --salida auditoria_fps.json
                                     [--v1 snapshot_v1.json] [--alias alias.csv]
Toma el snapshot v1 (cobertura/resumen) y le agrega `ncDetalle` y `indicadores`; version = 2."""
import argparse
import os
import json
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analizar_cruce as ac
import motor_responsabilidad as mr


def evidencia_ampliada(r, nc, p, doc, extra, sal):
    """Historial FPS fuera del documento: donde mas se fabrico el codigo de producto y quien operaba la maquina al registrarse la NC."""
    doc_ids = {x["id"] for x in doc}
    cod = str(nc.get("codigo_producto") or "").strip()
    out = {"productoEnOtrosDocumentos": [], "fechaRegistro": "", "operadoresEnFechaRegistro": [], "declaradoOperabaAlRegistrar": None, "lectura": ""}
    if cod:
        g = {}
        for x in extra:
            if x["art"] == cod and x["id"] not in doc_ids:
                k = (x["proc"], x["mq_raw"], x["ini"].strftime("%Y-%m") if x["ini"] else "")
                d = g.setdefault(k, {"proceso": k[0], "maquina": k[1], "mes": k[2], "sesiones": 0, "operadores": set(), "docs": set()})
                d["sesiones"] += 1
                d["operadores"].add(ac.seudonimo(x["op"], sal))
                d["docs"].add(x.get("nv") or "")
        out["productoEnOtrosDocumentos"] = [{"proceso": v["proceso"], "maquina": v["maquina"], "mes": v["mes"], "sesiones": v["sesiones"], "operadores": sorted(v["operadores"])}
                                           for v in sorted(g.values(), key=lambda z: z["mes"])][:30]
    reg = nc.get("fecha_registro")
    mq = ac.norm_maquina(nc.get("maquina"))
    if reg is not None and mq:
        out["fechaRegistro"] = reg.date().isoformat()
        en_reg = [x for x in extra if x["mq"] == mq and x["ini"] and (x["fin"] or x["ini"]).date() >= reg.date() >= x["ini"].date()]
        por = {}
        for x in en_reg:
            d = por.setdefault(x["op_key"], {"operador": ac.seudonimo(x["op"], sal), "sesiones": 0, "procesos": set(), "_nombre": x["op"]})
            d["sesiones"] += 1
            d["procesos"].add(x["proc"])
        out["operadoresEnFechaRegistro"] = [{"operador": v["operador"], "sesiones": v["sesiones"], "procesos": sorted(v["procesos"])} for v in por.values()]
        decl = nc.get("operador_declarado")
        if ac.operador_valido(decl) and por:
            out["declaradoOperabaAlRegistrar"] = any(mr.coincide_declarado(decl, v["_nombre"]) for v in por.values())
        productores = {x["op_key"] for x in doc if x["op_ok"] and x["art"] == cod} if cod else set()
        if out["declaradoOperabaAlRegistrar"] and p["declarado"]["estado"] in ("NO_ENCONTRADO", "FUERA_DE_MAQUINA", "FUERA_DE_PRODUCTO"):
            out["lectura"] = ("Hipótesis no verificada: el operador declarado es quien operaba esa máquina el día en que se registró la NC; "
                              "no figura entre quienes fabricaron el lote del documento. Puede tratarse del operador que detectó o estaba de turno, no del que produjo.")
        elif out["declaradoOperabaAlRegistrar"] is False:
            out["lectura"] = "El operador declarado no operaba esa máquina el día del registro de la NC."
        elif not decl and por and out["productoEnOtrosDocumentos"]:
            out["lectura"] = "La NC no declara operador; FPS muestra quién operaba la máquina al registrarse y dónde más se fabricó el código."
        # dimension de conciliacion adicional (informativa; no modifica el estado global ni los puntos)
        if out["declaradoOperabaAlRegistrar"] is not None and p.get("conciliacion"):
            p["conciliacion"]["dimensiones"].append({"dimension": "registro", "estado": "PROBABLE" if out["declaradoOperabaAlRegistrar"] else "INSUFICIENTE",
                "calidad": "Declarado " + p["declarado"]["operador"], "fps": ", ".join(v["operador"] for v in out["operadoresEnFechaRegistro"][:4]),
                "detalle": "Operador de esa máquina el día en que se registró la NC (informativo: no cambia la propuesta)."})
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--fps", required=True, nargs="+")
    ap.add_argument("--nc", required=True)
    ap.add_argument("--v1", required=True)
    ap.add_argument("--salida", required=True)
    ap.add_argument("--alias")
    ap.add_argument("--raw", nargs="*", default=[])      # tabla_WorkOrderRecords_*.csv
    ap.add_argument("--master", nargs="*", default=[])   # tabla_ZZZMasterOT_*.csv
    ap.add_argument("--extra", nargs="*", default=[], help="CSV de sesiones fuera del documento (por codigo de producto, maquina u operador)")
    ap.add_argument("--catalogo", default="", help="CSV de dbo.ZZZListaMaquina (aplatz_id, bez, gruppe, Active, NombreCorto)")
    ap.add_argument("--sal", default="QCC-EVOP-v1|")
    a = ap.parse_args(argv)
    alias_n = ac.cargar_alias(a.alias) if a.alias else 0
    catalogo = mr.cargar_catalogo(a.catalogo) if a.catalogo else None
    filas = [r for f in a.fps for r in ac.leer_csv(f)]
    por_np, por_nv, _ = ac.cargar_sesiones(filas)
    raw = [r for f in a.raw for r in ac.leer_csv(f)]
    extra_hist = {}
    for f in a.extra:
        e_np, e_nv, _ = ac.cargar_sesiones(ac.leer_csv(f))
        for lst in list(e_np.values()) + list(e_nv.values()):
            for x in lst:
                extra_hist.setdefault(x["id"], x)
    extra_hist = [x for x in extra_hist.values() if x["op_ok"]]
    master = {ac.norm_np(ac.col(r, "NotaVentaInnpack")): r for f in a.master for r in ac.leer_csv(f)}
    vistas = {}
    for lst in list(por_nv.values()) + list(por_np.values()):
        for x in lst:
            vistas[id(x)] = x
    enriquecidas = mr.enriquecer_con_raw(list(vistas.values()), raw) if raw else 0
    ncs = [r for r in ac.leer_csv(a.nc) if str(ac.col(r, "ambito")).upper() == "PRODUCTO"
           and not ac.bool_csv(ac.col(r, "eliminado"))]
    props, detalle = [], []
    for r in ncs:
        np_ = ac.norm_np(ac.col(r, "np_nv"))
        ses_nv = por_nv.get(np_, [])
        mrow0 = master.get(np_)
        np_faret = ac.norm_np(ac.col(mrow0, "NotaVentaFaret")) if mrow0 else None
        extra = por_np.get(np_faret, []) if (np_faret and ses_nv) else []
        vistos_id = {x["id"] for x in ses_nv}
        extra = [x for x in extra if x["id"] not in vistos_id]   # OT del mismo NP Faret que FPS no etiqueto con la NV
        doc = (ses_nv + extra) if ses_nv else por_np.get(np_, [])
        llave = "NV" if ses_nv else "NP"
        fab, ing = ac.parse_fecha(ac.col(r, "fecha_fabricacion")), ac.parse_fecha(ac.col(r, "fecha_ingreso"))
        nc = {"id": str(ac.col(r, "id")), "nivel_nc": ac.nivel_nc(ac.col(r, "nivel")), "maquina": ac.col(r, "maquina"), "fecha": fab, "fecha_registro": ing,
              "operador_declarado": ac.col(r, "operador"), "area": ac.col(r, "area"),
              "codigo_producto": ac.col(r, "codigo_producto"), "np_nv": ("NV " + np_) if np_ else ""}
        p = mr.proponer(nc, doc, a.sal, catalogo=catalogo)
        ots_det = []
        for ot in sorted({x["ot"] for x in doc}):
            sx = [x for x in doc if x["ot"] == ot]
            ini_o = min((x["ini"] for x in sx if x["ini"]), default=None)
            fin_o = max((x["fin"] or x["ini"] for x in sx if x["ini"]), default=None)
            ots_det.append({"ot": ot, "proceso": sorted({x["proc"] for x in sx if x["proc"]})[:1] and sorted({x["proc"] for x in sx if x["proc"]})[0] or "",
                            "maquinas": sorted({x["mq_raw"] for x in sx})[:5], "sesiones": len(sx),
                            "operadores": len({x["op_key"] for x in sx if x["op_ok"]}), "cantidad": round(sum(x["cant"] for x in sx)),
                            "desde": ini_o.strftime("%Y-%m-%d %H:%M") if ini_o else "", "hasta": fin_o.strftime("%Y-%m-%d %H:%M") if fin_o else "",
                            "sesionesLargas": sum(1 for x in sx if mr._larga(x))})
        mrow = master.get(np_) if llave == "NV" else None
        p["otDetalle"] = ots_det[:60]
        p["documento"] = {"np": ac.col(mrow, "NotaVentaFaret") if mrow else "", "estado": ac.col(mrow, "EstadoDocumento") if mrow else "",
                          "ingreso": str(ac.col(mrow, "FechaIngreso"))[:10] if mrow else "", "entrega": str(ac.col(mrow, "FechaEntrega"))[:10] if mrow else "",
                          "enMaestro": bool(mrow)}
        p["evidenciaAmpliada"] = evidencia_ampliada(r, nc, p, doc, extra_hist, a.sal) if extra_hist else None
        props.append(p)
        ots = sorted({s["ot"] for s in doc})
        mqs = sorted({s["mq_raw"] for s in doc})
        ini = min((s["ini"] for s in doc if s["ini"]), default=None)
        fin = max((s["fin"] or s["ini"] for s in doc if s["ini"]), default=None)
        p.update({"np": np_ or "", "llave": llave, "maquinaNc": ac.col(r, "maquina"),
                  "fechaFabricacionNc": fab.date().isoformat() if fab else "",
                  "fechaRegistroNc": ing.date().isoformat() if ing else "",
                  "diasRegistroTrasFabricacion": (ing - fab).days if fab and ing else None,
                  "otsSoloPorNpFaret": len({x["ot"] for x in extra} - {x["ot"] for x in ses_nv}), "ots": ots[:30], "maquinasDocumento": mqs[:30], "sesionesDocumento": len(doc),
                  "periodoDocumento": f"{ini.date()}..{fin.date()}" if ini and fin else "",
                  "operadorDeclaradoNc": "SI" if ac.operador_valido(ac.col(r, "operador")) else "NO"})
        detalle.append(p)
    eqs = {}
    for p in props:
        k = p["equivalencia"]["nc"] or ""
        c = p.get("catalogo") or {}
        e = eqs.setdefault(k, {"maquinaCalidad": k, "estado": c.get("estado", "NINGUNA"), "idFps": c.get("id", ""), "maquinaFps": c.get("nombre", ""), "proceso": c.get("grupo", ""),
                               "activo": c.get("activo"), "ncs": [], "pendientes": []})
        e["ncs"].append(p["id"])
        if p.get("maquinaCatalogoSinSesiones"):
            e["pendientes"].append(f"NC {p['id']}: el documento no tiene sesiones en esa máquina")
        if c.get("estado") == "AMBIGUA":
            e["pendientes"].append("varias máquinas del catálogo calzan: " + ", ".join(c.get("candidatos", [])))
        if c.get("estado") == "NINGUNA":
            e["pendientes"].append("sin equivalencia en el catálogo FPS")
    ind = mr.indicadores(props)
    v1 = json.load(open(a.v1, encoding="utf-8-sig"))
    v1["version"] = 2
    v1["aliasValidadosAplicados"] = alias_n
    v1["ncDetalle"] = detalle
    v1["equivalenciasMaquinas"] = list(eqs.values())
    v1["indicadores"] = [{"operador": k, **v} for k, v in sorted(ind.items(), key=lambda kv: -kv[1]["participacionNc"])]
    cnt = defaultdict(int)
    for p in props:
        cnt[p["escenario"]] += 1
    v1["escenarios"] = {str(k): cnt.get(k, 0) for k in (1, 2, 3, 4)}
    v1["vigenciaNota"] = "Snapshot historico: refleja la fecha de generacion, no el estado en tiempo real."
    json.dump(v1, open(a.salida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({"escenarios": v1["escenarios"], "ncs": len(props),
                      "conOT": sum(1 for p in props if p["ots"]), "conMaquinaConfirmada": sum(p["maquinaConfirmada"] for p in props),
                      "conHorarioFiable": sum(p["ventanaFiable"] for p in props), "sesionesEnriquecidas": enriquecidas, "aliasSugerido": sum(1 for p in props if p.get("aliasSugerido")), "enMaestro": sum(1 for p in props if p["documento"]["enMaestro"])}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
