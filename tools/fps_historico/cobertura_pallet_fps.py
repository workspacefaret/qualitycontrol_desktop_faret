#!/usr/bin/env python3
"""Auditoria de cobertura (SOLO LECTURA, sin red, sin BD): ¿que % de inspecciones Pallet/Papel se puede
relacionar con el operador de maquina de FPS usando maquina + fecha/hora + sesiones?

Trabaja solo sobre archivos CSV locales que una persona exporta con su sesion autorizada.
No imprime ni guarda UserKey ni nombres: solo cuenta. No asigna puntajes 10/5/1.

Entradas (CSV UTF-8, con encabezado):
  --pallet         id,fechaRegistro,horaRegistro,maquina[,tipoMaterial,numeroPallet]   (export del modulo/API calidad-faret-pallet)
  --sesiones       aplatz_id,UserKey,inicio,fin                                     (WorkOrderRecords: inicio=COALESCE(ProductionStartDate,SetupStartDate), fin=ProductionEndDate)
  --equivalencias  maquina_pallet,aplatz_id,verificada                              (verificada=SI solo si una persona la confirmo; NO se acepta nada aproximado)
Uso:  python -I cobertura_pallet_fps.py --pallet p.csv --sesiones s.csv --equivalencias e.csv --salida out_dir
      python -I cobertura_pallet_fps.py --autotest        (prueba con datos SINTETICOS, no son resultados reales)
"""
import argparse, csv, json, os, sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta

MAX_SESION_H = 16          # misma regla que Evaluacion por Operador: sesiones mas largas no ubican un instante
TOLERANCIA_H = 2           # sesion que termina/empieza cerca del registro -> solo "probable"
CONFIABLE, PROBABLE, SIN = "confiable", "probable", "sin_identificacion"


def norm(s):
    return " ".join((s or "").upper().split())


def parse_dt(txt):
    txt = (txt or "").strip().replace("T", " ").replace("Z", "")
    for f in ("%Y-%m-%d %H:%M:%S.%f", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M"):
        try:
            return datetime.strptime(txt, f)
        except ValueError:
            pass
    return None


def parse_registro(fecha, hora):
    d = (fecha or "").strip()[:10]
    h = (hora or "").strip()
    if "T" in h:                       # hora venida como datetime ISO
        h = h.split("T")[1]
    h = h.replace("Z", "")[:8] or "00:00:00"
    if len(h) == 5:
        h += ":00"
    return parse_dt(f"{d} {h}")


def clasificar(ins, equiv, sesiones_por_maquina):
    """Devuelve (clase, motivo). Nunca atribuye solo por maquina: exige ventana horaria."""
    t = ins["t"]
    if not norm(ins["maquina"]):
        return SIN, "sin_maquina"
    if t is None:
        return SIN, "sin_fecha_hora"
    aplatz = equiv.get(norm(ins["maquina"]))
    if aplatz is None:
        return SIN, "maquina_sin_equivalencia_verificada"
    ses = sesiones_por_maquina.get(aplatz, [])
    if not ses:
        return SIN, "maquina_sin_sesiones_fps"
    cubren = [s for s in ses if s["ini"] <= t <= s["fin"]]
    cortas = [s for s in cubren if (s["fin"] - s["ini"]) <= timedelta(hours=MAX_SESION_H)]
    largas = [s for s in cubren if s not in cortas]
    if cortas:
        ops = {s["op"] for s in cortas}
        if len(ops) == 1 and not largas:
            return CONFIABLE, "sesion_unica_compatible" if len(cortas) == 1 else "sesiones_solapadas_mismo_operador"
        if len(ops) == 1:
            return PROBABLE, "sesion_corta_y_larga_solapadas"
        return PROBABLE, "varios_operadores_simultaneos"
    if largas:
        return PROBABLE, "solo_sesion_prolongada"
    tol = timedelta(hours=TOLERANCIA_H)
    cerca = [s for s in ses if s["ini"] - tol <= t <= s["fin"] + tol]
    if cerca:
        return PROBABLE, "sesion_cercana_fuera_de_ventana"
    return SIN, "sin_sesion_en_la_hora"


def leer_csv(ruta):
    with open(ruta, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def pct(n, d):
    return round(100.0 * n / d, 1) if d else 0.0


def analizar(pallet, sesiones, equivalencias, offset_h=0):
    equiv = {norm(e["maquina_pallet"]): str(e["aplatz_id"]).strip()
             for e in equivalencias if norm(e.get("verificada")) == "SI" and str(e.get("aplatz_id", "")).strip()}
    por_maq = defaultdict(list)
    sin_fechas = 0
    for s in sesiones:
        ini, fin = parse_dt(s.get("inicio")), parse_dt(s.get("fin"))
        if ini is None or fin is None or fin < ini or not (s.get("UserKey") or "").strip():
            sin_fechas += 1
            continue
        d = timedelta(hours=offset_h)
        por_maq[str(s["aplatz_id"]).strip()].append({"ini": ini + d, "fin": fin + d, "op": s["UserKey"].strip()})
    glob, por_maquina, por_mes, motivos = Counter(), defaultdict(Counter), defaultdict(Counter), Counter()
    vistos, duplicados = set(), 0
    for r in pallet:
        if r["id"] in vistos:
            duplicados += 1
            continue
        vistos.add(r["id"])
        ins = {"maquina": r.get("maquina"), "t": parse_registro(r.get("fechaRegistro"), r.get("horaRegistro"))}
        clase, motivo = clasificar(ins, equiv, por_maq)
        glob[clase] += 1
        motivos[(clase, motivo)] += 1
        por_maquina[norm(r.get("maquina")) or "(sin maquina)"][clase] += 1
        por_mes[(ins["t"].strftime("%Y-%m") if ins["t"] else "(sin fecha)")][clase] += 1
    total = sum(glob.values())

    def fila(c):
        n = sum(c.values())
        return {"total": n, **{k: c[k] for k in (CONFIABLE, PROBABLE, SIN)},
                **{f"pct_{k}": pct(c[k], n) for k in (CONFIABLE, PROBABLE, SIN)}}
    return {
        "total_inspecciones": total, "duplicados_ignorados": duplicados, "sesiones_invalidas_ignoradas": sin_fechas,
        "equivalencias_verificadas": len(equiv),
        "global": fila(glob),
        "por_maquina": {k: fila(v) for k, v in sorted(por_maquina.items(), key=lambda kv: -sum(kv[1].values()))},
        "por_mes": {k: fila(v) for k, v in sorted(por_mes.items())},
        "motivos": {f"{c}:{m}": n for (c, m), n in motivos.most_common()},
    }


def autotest():
    d = lambda s: s
    eq = [{"maquina_pallet": "DIANA 3", "aplatz_id": "15", "verificada": "SI"},
          {"maquina_pallet": "DIANA 5", "aplatz_id": "17", "verificada": "NO"}]
    ses = [{"aplatz_id": "15", "UserKey": "A", "inicio": "2026-01-05 06:00", "fin": "2026-01-05 14:00"},
           {"aplatz_id": "15", "UserKey": "B", "inicio": "2026-01-06 06:00", "fin": "2026-01-06 14:00"},
           {"aplatz_id": "15", "UserKey": "C", "inicio": "2026-01-06 08:00", "fin": "2026-01-06 12:00"},
           {"aplatz_id": "15", "UserKey": "D", "inicio": "2026-01-10 00:00", "fin": "2026-01-14 00:00"}]
    mk = lambda i, m, f, h: {"id": i, "maquina": m, "fechaRegistro": f, "horaRegistro": h}
    pal = [mk("1", "DIANA 3", "2026-01-05", "10:00:00"),      # confiable
           mk("2", "DIANA 3", "2026-01-06", "10:00:00"),      # dos operadores -> probable
           mk("3", "DIANA 3", "2026-01-12", "10:00:00"),      # sesion prolongada -> probable
           mk("4", "DIANA 3", "2026-01-05", "15:00:00"),      # cerca fuera de ventana -> probable
           mk("5", "DIANA 3", "2026-02-01", "10:00:00"),      # sin sesion
           mk("6", "DIANA 5", "2026-01-05", "10:00:00"),      # equivalencia no verificada
           mk("7", "", "2026-01-05", "10:00:00"),             # sin maquina
           mk("1", "DIANA 3", "2026-01-05", "10:00:00")]      # duplicado
    r = analizar(pal, ses, eq)
    g = r["global"]
    esperado = (g[CONFIABLE], g[PROBABLE], g[SIN], r["duplicados_ignorados"]) == (1, 3, 3, 1)
    print("AUTOTEST (datos sinteticos):", "OK" if esperado else f"FALLO {g}")
    return 0 if esperado else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pallet"); ap.add_argument("--sesiones"); ap.add_argument("--equivalencias")
    ap.add_argument("--salida", default="cobertura_pallet_fps_salida")
    ap.add_argument("--offset-horas", type=float, default=0, help="ajuste horario a aplicar a las sesiones (p.ej. -3 si vienen en UTC)")
    ap.add_argument("--autotest", action="store_true")
    a = ap.parse_args()
    if a.autotest:
        return autotest()
    if not (a.pallet and a.sesiones and a.equivalencias):
        ap.error("faltan --pallet, --sesiones y --equivalencias")
    r = analizar(leer_csv(a.pallet), leer_csv(a.sesiones), leer_csv(a.equivalencias), a.offset_horas)
    os.makedirs(a.salida, exist_ok=True)
    with open(os.path.join(a.salida, "cobertura.json"), "w", encoding="utf-8") as f:
        json.dump(r, f, ensure_ascii=False, indent=2)
    with open(os.path.join(a.salida, "cobertura_por_maquina.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f); w.writerow(["maquina", "total", CONFIABLE, PROBABLE, SIN, "pct_confiable", "pct_probable", "pct_sin"])
        for m, v in r["por_maquina"].items():
            w.writerow([m, v["total"], v[CONFIABLE], v[PROBABLE], v[SIN], v[f"pct_{CONFIABLE}"], v[f"pct_{PROBABLE}"], v[f"pct_{SIN}"]])
    g = r["global"]
    print(f"Inspecciones: {r['total_inspecciones']} | confiable {g['pct_confiable']}% | probable {g['pct_probable']}% | sin identificacion {g['pct_sin_identificacion']}%")
    print("Detalle en", os.path.abspath(a.salida))
    return 0


if __name__ == "__main__":
    sys.exit(main())
