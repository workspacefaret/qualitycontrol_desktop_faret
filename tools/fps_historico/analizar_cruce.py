#!/usr/bin/env python3
"""Cruce NC (calidad_db) <-> sesiones de fabricacion FPS. Solo lectura de CSV locales; no se conecta a nada.

Distingue:
  * operador PARTICIPANTE: figura en una sesion FPS de ese NP/maquina/fecha (evidencia de presencia).
  * operador RESPONSABLE (propuesto): solo si hay evidencia independiente suficiente (ver clasificar()).
Niveles: CONFIRMADA / PROBABLE / NO_ATRIBUIBLE. Solo CONFIRMADA puede sumar puntos, una vez por NC.
Uso: python analizar_cruce.py --fps sesiones_por_np.csv --nc nc_calidad.csv --salida DIR [--con-nombres]
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import date, datetime

PUNTOS = {"CRITICO": 10, "MAYOR": 5, "MENOR": 1}
GENERICOS = {"ADMIN", "ADMINISTRADOR", "SISTEMA", "OPERADOR", "SIN OPERADOR", "N/A", "NA", "-"}


def sin_acentos(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def norm_texto(s):
    s = sin_acentos(str(s or "")).upper().strip()
    return re.sub(r"\s+", " ", s)


def clave_operador(s):
    """Clave canonica: tokens alfanumericos ordenados (ignora orden y puntuacion). '' si vacio."""
    toks = re.findall(r"[A-Z0-9]+", norm_texto(s))
    return " ".join(sorted(toks))


ROMANOS = {"I": "1", "II": "2", "III": "3", "IV": "4", "V": "5", "VI": "6", "VII": "7", "VIII": "8", "IX": "9", "X": "10",
           "XI": "11", "XII": "12"}


def norm_maquina(s):
    """Nombre de maquina comparable entre Calidad y FPS: sin acentos, sin parentesis ('(SFM)','(EUR)'), romanos->digitos,
    sin guiones ni espacios extra. 'Diana VIII' == 'DIANA 8 (SFM)'."""
    t = norm_texto(re.sub(r"\([^)]*\)", " ", str(s or "")))
    toks = [ROMANOS.get(x, x) for x in re.findall(r"[A-Z0-9]+", t)]
    return " ".join(toks)


def operador_valido(s):
    n = norm_texto(s)
    return n != "" and n not in GENERICOS


def separa_varios(s):
    """True si el texto de operador de la NC parece nombrar a mas de una persona."""
    t = " " + norm_texto(s) + " "
    return bool(re.search(r"[/,;+]| Y | E ", t))


def norm_np(v):
    t = str(v or "").strip()
    if not re.fullmatch(r"\d{1,10}", t):
        return None
    return t.lstrip("0") or "0"  # ceros a la izquierda no distinguen NP


def parse_fecha(v):
    t = str(v or "").strip()
    if not t:
        return None
    for f in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(t[:19] if "%H" in f else t[:10], f)
        except ValueError:
            continue
    return None


def nivel_nc(v):
    t = norm_texto(v)
    if t.startswith("CR"):
        return "CRITICO"
    if t.startswith("MAY"):
        return "MAYOR"
    if t.startswith("MEN"):
        return "MENOR"
    return "SIN_NIVEL"


def col(row, *nombres):
    bajo = {k.lower().strip(): k for k in row}
    for n in nombres:
        if n.lower() in bajo:
            return row[bajo[n.lower()]]
    return ""


def leer_csv(ruta):
    with open(ruta, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def bool_csv(v):
    return str(v).strip().lower() in ("1", "true", "verdadero", "si", "sí")


def _num(v):
    try:
        return float(str(v).replace(",", "."))
    except ValueError:
        return 0.0


def cargar_sesiones(filas):
    """Devuelve (sesiones_por_np, duplicadas_eliminadas). Deduplica por ID de sesion (o por huella)."""
    vistos, por_np, por_nv, dup = set(), defaultdict(list), defaultdict(list), 0
    for r in filas:
        np_ = norm_np(col(r, "NP"))
        nv_ = norm_np(col(r, "NVInnpack"))
        if nv_ == "0":
            nv_ = None  # 0 = sin NV Innpack
        if np_ is None and nv_ is None:
            continue
        sid = str(col(r, "ID")).strip()
        ini = parse_fecha(col(r, "FECHA INICIO"))
        fin = parse_fecha(col(r, "FECHA TERMINO"))
        op = col(r, "OPERADOR")
        mq = col(r, "MAQUINA")
        huella = ("id", sid) if sid else ("h", col(r, "OT"), norm_texto(mq), ini, fin, clave_operador(op))
        if huella in vistos:
            dup += 1
            continue
        vistos.add(huella)
        ses_ = {"id": sid, "ot": str(col(r, "OT")).strip(), "mq": norm_maquina(mq), "mq_raw": mq,
                            "ini": ini, "fin": fin, "op": op, "op_key": clave_operador(op),
                            "op_ok": operador_valido(op), "cant": _num(col(r, "CANTIDAD_PRODUCCION")), "proc": str(col(r, "Proceso")).strip(),
                            "setup_h": _num(col(r, "TIEMPO SETUP")), "prod_h": _num(col(r, "TIEMPO PRODUCCION")),
                            "obs": bool(str(col(r, "OBSERVACIONES")).strip()),
                            "art": str(col(r, "ARTICULO")).strip(), "id_maq": str(col(r, "IdMaquina")).strip()}
        if np_ is not None:
            por_np[np_].append(ses_)
        if nv_ is not None:
            por_nv[nv_].append(ses_)
    return por_np, por_nv, dup


def en_ventana(s, f):
    """f: date. La sesion cubre la fecha si inicio<=f<=termino (por dia). Fechas invertidas/ausentes: sin ventana."""
    if s["ini"] is None or s["fin"] is None or s["fin"] < s["ini"]:
        return None  # no evaluable
    return s["ini"].date() <= f <= s["fin"].date()


ALIAS = {}  # {maquina NC normalizada: maquina FPS normalizada}; solo alias VALIDADOS (--alias)


def clasificar(nc, sesiones, np_en_varias_empresas, llaves=("NP",)):
    """nc: dict normalizado. Retorna dict con nivel, razones, participantes, responsable_propuesto."""
    r = {"nivel": "NO_ATRIBUIBLE", "razones": [], "participantes": [], "responsable_propuesto": "",
         "operadores_np": len({clave_operador(s_["op"]) for s_ in sesiones if s_["op_ok"]}),
         "maquinas_fps_np": "; ".join(sorted({s_["mq_raw"] for s_ in sesiones}, key=norm_texto)[:12]),
         "periodo_np": "", "fecha_en_periodo_np": "",
         "sesiones_np": len(sesiones), "sesiones_ventana": 0, "llave": "+".join(llaves) if sesiones else ""}
    if nc["np"] is None:
        r["razones"].append("np_invalido_o_vacio")
        return r
    if not sesiones:
        r["razones"].append("np_sin_fabricacion_en_fps")
        return r
    f = nc["fecha"].date() if nc["fecha"] else None
    ini_ = [s_["ini"].date() for s_ in sesiones if s_["ini"]]
    fin_ = [(s_["fin"] or s_["ini"]).date() for s_ in sesiones if s_["ini"]]
    if ini_:
        r["periodo_np"] = f"{min(ini_)}..{max(fin_)}"
        if f:
            r["fecha_en_periodo_np"] = "SI" if min(ini_) <= f <= max(fin_) else "NO"
            if r["fecha_en_periodo_np"] == "NO":
                r["razones"].append("fecha_fuera_del_periodo_de_fabricacion_del_np")
    mq = norm_maquina(nc["maquina"])
    mq = ALIAS.get(mq, mq)
    ses_maq = [s for s in sesiones if mq and s["mq"] == mq]
    ses_vent = []
    if f and ses_maq:
        ses_vent = [s for s in ses_maq if en_ventana(s, f) is True]
    fecha_en_np = bool(f) and any(en_ventana(s, f) is True for s in sesiones)
    r["sesiones_ventana"] = len(ses_vent)
    if not f:
        r["razones"].append("sin_fecha_fabricacion")
    if not mq:
        r["razones"].append("sin_maquina_nc")
    elif not ses_maq:
        r["razones"].append("maquina_no_coincide")

    # Participantes: operadores validos de las sesiones de la ventana (maquina+fecha); si no hay ventana, de las de maquina.
    base = ses_vent or ses_maq
    parts = sorted({s["op"].strip() for s in base if s["op_ok"]}, key=norm_texto)
    # un mismo operador con variantes de escritura cuenta una vez
    vistos, unicos = set(), []
    for p in parts:
        k = clave_operador(p)
        if k not in vistos:
            vistos.add(k)
            unicos.append(p)
    r["participantes"] = unicos
    sesiones_sin_op = sum(1 for s in base if not s["op_ok"])

    if not (ses_maq or fecha_en_np):
        r["razones"].append("np_presente_pero_sin_coincidencia_de_maquina_ni_fecha")
        return r
    r["nivel"] = "PROBABLE"
    if np_en_varias_empresas:
        r["razones"].append("np_compartido_entre_empresas")
    if len(llaves) > 1:
        r["razones"].append("numero_coincide_como_NP_y_como_NV")
    if not ses_vent:
        r["razones"].append("fecha_fuera_de_ventana_de_sesion" if f and ses_maq else "sin_ventana_maquina_fecha")
        return r
    if len(unicos) == 0:
        r["razones"].append("ventana_sin_operador_valido")
        return r
    if sesiones_sin_op:
        r["razones"].append("ventana_con_sesion_sin_operador_valido")
    if len(unicos) > 1:
        r["razones"].append("varios_participantes")
    nc_op_ok = operador_valido(nc["operador"])
    if not nc_op_ok:
        r["razones"].append("sin_operador_nc")
    elif separa_varios(nc["operador"]):
        r["razones"].append("operador_nc_nombra_varias_personas")
    else:
        k = clave_operador(nc["operador"])
        coincide = [p for p in unicos if clave_operador(p) == k]
        if not coincide:
            r["razones"].append("operador_nc_no_coincide_con_fps")
        elif len(unicos) == 1 and not sesiones_sin_op and not np_en_varias_empresas and len(llaves) == 1:
            r["nivel"] = "CONFIRMADA"
            r["responsable_propuesto"] = coincide[0]
        else:
            r["razones"].append("coincide_pero_no_unico_o_evidencia_incompleta")
    return r


def seudonimo(nombre, sal):
    k = clave_operador(nombre)
    return "OP-" + hashlib.sha256((sal + k).encode()).hexdigest()[:6].upper() if k else ""


def analizar(fps_filas, nc_filas, incluir_eliminadas=False):
    por_np, por_nv, dup_sesiones = cargar_sesiones(fps_filas)
    ncs = []
    for r in nc_filas:
        ncs.append({
            "id": str(col(r, "id")).strip(), "ambito": norm_texto(col(r, "ambito")) or "PRODUCTO",
            "empresa": norm_texto(col(r, "empresa")), "eliminado": bool_csv(col(r, "eliminado")),
            "np": norm_np(col(r, "np_nv")), "np_raw": str(col(r, "np_nv")).strip(), "maquina": col(r, "maquina"),
            "fecha": parse_fecha(col(r, "fecha_fabricacion")), "nivel_nc": nivel_nc(col(r, "nivel")),
            "operador": col(r, "operador"),
        })
    eliminadas = [n for n in ncs if n["eliminado"]]
    activas = [n for n in ncs if incluir_eliminadas or not n["eliminado"]]
    # NP presente en NC de mas de una empresa distinta (NP numerico puede repetirse entre empresas)
    emp_por_np = defaultdict(set)
    for n in activas:
        if n["np"] and n["empresa"]:
            emp_por_np[n["np"]].add(n["empresa"])
    resultados, vistos_pen, puntos = [], set(), defaultdict(int)
    for n in activas:
        a_np = por_np.get(n["np"], []) if n["np"] else []
        a_nv = por_nv.get(n["np"], []) if n["np"] else []
        llaves = tuple(k for k, v in (("NP", a_np), ("NV", a_nv)) if v) or ("NP",)
        uni, vistos_ids = [], set()
        for s_ in a_np + a_nv:
            if id(s_) not in vistos_ids:
                vistos_ids.add(id(s_))
                uni.append(s_)
        c = clasificar(n, uni, len(emp_por_np.get(n["np"], ())) > 1, llaves)
        pts, dup_nc = 0, False
        if n["ambito"] == "PRODUCTO" and c["nivel"] == "CONFIRMADA":
            clave = (n["np"], norm_texto(n["maquina"]), n["fecha"].date() if n["fecha"] else None,
                     n["nivel_nc"], clave_operador(n["operador"]))
            if clave in vistos_pen:
                dup_nc = True
            else:
                vistos_pen.add(clave)
                pts = PUNTOS.get(n["nivel_nc"], 0)
                if pts:
                    puntos[c["responsable_propuesto"]] += pts
        resultados.append({**n, **c, "puntos_confirmados": pts, "posible_duplicado": dup_nc})
    return resultados, dict(puntos), {"sesiones_duplicadas_eliminadas": dup_sesiones,
                                      "np_con_sesiones": len(por_np), "nv_con_sesiones": len(por_nv), "nc_eliminadas_excluidas": len(eliminadas)}


def resumen(resultados, extra):
    def cuenta(pred):
        return sum(1 for r in resultados if pred(r))
    out = {"total_nc_analizadas": len(resultados), **extra}
    for amb in sorted({r["ambito"] for r in resultados}):
        rs = [r for r in resultados if r["ambito"] == amb]
        out[amb] = {
            "nc": len(rs),
            "con_np_valido": sum(1 for r in rs if r["np"]),
            "np_presente_en_fps": sum(1 for r in rs if r["sesiones_np"] > 0),
            "con_operadores_asociados_al_np": sum(1 for r in rs if r["operadores_np"] > 0),
            "con_participantes_en_maquina_y_fecha": sum(1 for r in rs if r["participantes"]),
            "con_maquina_coincidente": sum(1 for r in rs if "maquina_no_coincide" not in r["razones"] and "sin_maquina_nc" not in r["razones"] and r["sesiones_np"] > 0),
            "fecha_dentro_del_periodo_del_np": sum(1 for r in rs if r["fecha_en_periodo_np"] == "SI"),
            "fecha_fuera_del_periodo_del_np": sum(1 for r in rs if r["fecha_en_periodo_np"] == "NO"),
            "con_coincidencia_maquina_y_fecha": sum(1 for r in rs if r["sesiones_ventana"] > 0),
            "con_varios_participantes": sum(1 for r in rs if len(r["participantes"]) > 1),
            "confirmada": sum(1 for r in rs if r["nivel"] == "CONFIRMADA"),
            "probable": sum(1 for r in rs if r["nivel"] == "PROBABLE"),
            "no_atribuible": sum(1 for r in rs if r["nivel"] == "NO_ATRIBUIBLE"),
            "sin_coincidencia_en_fps": sum(1 for r in rs if r["sesiones_np"] == 0),
            "llave_NP": sum(1 for r in rs if r["llave"] == "NP"),
            "llave_NV_Innpack": sum(1 for r in rs if r["llave"] == "NV"),
            "llave_ambigua_NP_y_NV": sum(1 for r in rs if r["llave"] == "NP+NV"),
        }
    return out


def escribir(resultados, puntos, res, salida, con_nombres, sal):
    os.makedirs(salida, exist_ok=True)
    with open(os.path.join(salida, ".gitignore"), "w") as f:
        f.write("*\n")
    vis = (lambda n: n) if con_nombres else (lambda n: seudonimo(n, sal))
    campos = ["id", "ambito", "empresa", "np", "nivel_nc", "maquina", "fecha_fabricacion", "nivel_atribucion",
              "razones", "llave", "operadores_np", "periodo_np", "fecha_en_periodo_np", "maquinas_fps_np", "sesiones_np", "sesiones_ventana", "participantes", "responsable_propuesto",
              "puntos_confirmados", "posible_duplicado"]
    with open(os.path.join(salida, "cruce_nc_fps.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(campos)
        for r in resultados:
            w.writerow([r["id"], r["ambito"], r["empresa"], r["np"] or r["np_raw"], r["nivel_nc"],
                        r["maquina"], r["fecha"].date().isoformat() if r["fecha"] else "", r["nivel"], ";".join(r["razones"]), r["llave"], r["operadores_np"], r["periodo_np"], r["fecha_en_periodo_np"], r["maquinas_fps_np"],
                        r["sesiones_np"], r["sesiones_ventana"], ";".join(vis(p) for p in r["participantes"]),
                        vis(r["responsable_propuesto"]) if r["responsable_propuesto"] else "",
                        r["puntos_confirmados"], r["posible_duplicado"]])
    with open(os.path.join(salida, "puntos_confirmados_por_operador.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["operador", "puntos_confirmados"])
        for k in sorted(puntos, key=lambda x: norm_texto(x)):
            w.writerow([vis(k), puntos[k]])
    with open(os.path.join(salida, "resumen_cruce.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)


def exportar_modulo(resultados, res, cobertura_filas, ruta, alias_n):
    """JSON agregado y SIN nombres de personas para el modulo Photino (snapshot de auditoria)."""
    cob = {}
    if cobertura_filas:
        def i(v):
            try:
                return int(float(v))
            except (TypeError, ValueError):
                return 0
        cob = {
            "meses": len(cobertura_filas),
            "desde": min(str(col(r, "primera_sesion"))[:10] for r in cobertura_filas),
            "hasta": max(str(col(r, "ultima_sesion"))[:10] for r in cobertura_filas),
            "sesiones": sum(i(col(r, "sesiones")) for r in cobertura_filas),
            "operadoresMaxMes": max(i(col(r, "operadores_distintos")) for r in cobertura_filas),
            "sinOperador": sum(i(col(r, "sin_operador")) for r in cobertura_filas),
            "operadorGenerico": sum(i(col(r, "operador_generico")) for r in cobertura_filas),
            "fechasInvertidas": sum(i(col(r, "fechas_invertidas")) for r in cobertura_filas),
            "filasIgualSesiones": all(i(col(r, "filas")) == i(col(r, "sesiones")) for r in cobertura_filas),
        }
    prod = [r for r in resultados if r["ambito"] == "PRODUCTO"]
    out = {
        "version": 1,
        "generado": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "fuente": "FPS [plan].[vw_FactProduccion] + calidad_db.dbo.no_conformidades (auditoria de solo lectura)",
        "aliasValidadosAplicados": alias_n,
        "cobertura": cob,
        "resumen": {k: v for k, v in res.items() if k in ("PRODUCTO", "INTERNA", "total_nc_analizadas", "nc_eliminadas_excluidas",
                                                           "sesiones_duplicadas_eliminadas")},
        "ncProducto": [{
            "id": r["id"], "nivelNc": r["nivel_nc"], "np": r["np"] or r["np_raw"], "llave": r["llave"],
            "fechaFabricacion": r["fecha"].date().isoformat() if r["fecha"] else "", "maquina": r["maquina"],
            "sesionesNp": r["sesiones_np"], "operadoresNp": r["operadores_np"], "periodoNp": r["periodo_np"],
            "fechaEnPeriodoNp": r["fecha_en_periodo_np"], "participantesEnMaquinaYFecha": len(r["participantes"]),
            "atribucion": r["nivel"], "razones": r["razones"], "puntosConfirmados": r["puntos_confirmados"],
        } for r in prod],
    }
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)


def cargar_alias(ruta):
    """CSV nc_maquina,fps_maquina,validado. Solo se aplican filas con validado=SI."""
    n = 0
    for r in leer_csv(ruta):
        if str(col(r, "validado")).strip().upper() == "SI":
            ALIAS[norm_maquina(col(r, "nc_maquina"))] = norm_maquina(col(r, "fps_maquina"))
            n += 1
    return n


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--fps", required=True, nargs="+")
    ap.add_argument("--nc", required=True)
    ap.add_argument("--salida", required=True)
    ap.add_argument("--con-nombres", action="store_true")
    ap.add_argument("--incluir-eliminadas", action="store_true")
    ap.add_argument("--alias", help="CSV nc_maquina,fps_maquina,validado (solo validado=SI)")
    ap.add_argument("--cobertura", help="cobertura_mensual.csv de la herramienta (para el snapshot del modulo)")
    ap.add_argument("--exportar-modulo", help="ruta del JSON agregado (sin nombres) para el modulo Photino")
    a = ap.parse_args(argv)
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    if os.path.abspath(a.salida).lower().startswith(repo.lower()):
        sys.exit("La carpeta de salida no puede estar dentro del repositorio.")
    alias_n = cargar_alias(a.alias) if a.alias else 0
    fps_filas = [r for f in a.fps for r in leer_csv(f)]
    res_, puntos, extra = analizar(fps_filas, leer_csv(a.nc), a.incluir_eliminadas)
    sal = os.urandom(8).hex()
    escribir(res_, puntos, resumen(res_, extra), a.salida, a.con_nombres, sal)
    if a.exportar_modulo:
        exportar_modulo(res_, resumen(res_, extra), leer_csv(a.cobertura) if a.cobertura else [], a.exportar_modulo, alias_n)
    print(json.dumps(resumen(res_, extra), ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
