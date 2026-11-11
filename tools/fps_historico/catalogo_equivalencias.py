"""Catalogo de equivalencias de maquinas Calidad <-> FPS para las NC de producto (solo lectura, sin datos personales).
Estados: CONFIRMADA (nombre normalizado igual, o alias validado por una persona), PROBABLE (nombre parcial unico y/o el codigo de
producto de la NC se fabrico solo en esa maquina de FPS), NO_DEMOSTRADA. Ninguna coincidencia textual se declara definitiva."""
import argparse
import csv
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analizar_cruce as ac  # noqa: E402
import motor_responsabilidad as mr  # noqa: E402


def construir(ncs, sesiones_por_nv):
    filas, vistos = [], set()
    for r in ncs:
        nv = ac.norm_np(ac.col(r, "np_nv"))
        doc = [s for s in sesiones_por_nv.get(nv, []) if s["op_ok"]]
        maq_nc = ac.col(r, "maquina")
        cod = str(ac.col(r, "codigo_producto")).strip()
        clave = (nv, ac.norm_maquina(maq_nc), cod)
        if clave in vistos or not maq_nc:
            continue
        vistos.add(clave)
        mq_nc = ac.norm_maquina(maq_nc)
        mq_fps = {s["mq"]: (s["mq_raw"], s["id_maq"], s["proc"]) for s in doc}
        por_prod = sorted({s["mq_raw"] for s in doc if cod and s["art"] == cod})
        if mq_nc in mq_fps:
            fps, idm, proc = mq_fps[mq_nc]
            if por_prod == [fps]:
                est, ev = "CONFIRMADA", "Nombre normalizado idéntico y el código de producto de la NC se fabricó en esa máquina."
            else:
                est, ev = "PROBABLE", "Nombre normalizado idéntico (p. ej. VIII = 8), sin identificador común ni producto verificado: no es definitiva."
        else:
            sug = mr.alias_sugerido(maq_nc, {s["mq_raw"] for s in doc})
            if sug and sug in mq_fps:
                est, (fps, idm, proc), ev = "PROBABLE", mq_fps[sug], "Todas las palabras del nombre de Calidad están en una única máquina del documento."
                if por_prod == [fps]:
                    ev += " Además, el código de producto de la NC se fabricó solo en esa máquina."
            else:
                est, fps, idm, proc, ev = "NO_DEMOSTRADA", "", "", "", "Ninguna máquina del documento coincide con el nombre de Calidad."
        filas.append({"nv": nv or "", "maquina_calidad": maq_nc, "estado": est, "maquina_fps": fps, "id_maquina_fps": idm, "proceso_fps": proc,
                      "maquinas_que_fabricaron_el_producto": " | ".join(por_prod), "evidencia": ev, "id_nc": ac.col(r, "id")})
    return filas


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--fps", nargs="+", required=True)
    ap.add_argument("--nc", required=True)
    ap.add_argument("--salida", required=True)
    a = ap.parse_args(argv)
    _, por_nv, _ = ac.cargar_sesiones([r for f in a.fps for r in ac.leer_csv(f)])
    ncs = [r for r in ac.leer_csv(a.nc) if str(ac.col(r, "ambito")).upper() == "PRODUCTO" and not ac.bool_csv(ac.col(r, "eliminado"))]
    filas = construir(ncs, por_nv)
    with open(a.salida, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(filas[0].keys()))
        w.writeheader()
        w.writerows(filas)
    for f in filas:
        print(f["id_nc"], f["nv"], f["estado"], "|", f["maquina_calidad"], "->", f["maquina_fps"], f["id_maquina_fps"], f["proceso_fps"], "| producto en:", f["maquinas_que_fabricaron_el_producto"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
