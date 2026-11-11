import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import analizar_cruce as a  # noqa: E402

# Datos 100% sinteticos (nombres y NP inventados).


def ses(id_, np_, mq, ini, fin, op, ot="1"):
    return {"ID": id_, "NP": np_, "OT": ot, "MAQUINA": mq, "FECHA INICIO": ini, "FECHA TERMINO": fin, "OPERADOR": op}


def nc(id_, np_, mq="M1", fecha="2026-03-10", nivel="Mayor", op="Ana Perez", ambito="PRODUCTO", empresa="INNPACK", elim="False"):
    return {"id": id_, "np_nv": np_, "maquina": mq, "fecha_fabricacion": fecha, "nivel": nivel,
            "operador": op, "ambito": ambito, "empresa": empresa, "eliminado": elim}


S_OK = ses("1", "1001", "M1", "2026-03-10 07:00:00", "2026-03-10 15:00:00", "PEREZ ANA")


class Cruce(unittest.TestCase):
    def run_(self, fps, ncs, **k):
        return a.analizar(fps, ncs, **k)

    def test_confirmada_un_operador_coincide(self):
        r, pts, _ = self.run_([S_OK], [nc("1", "1001")])
        self.assertEqual(r[0]["nivel"], "CONFIRMADA")
        self.assertEqual(r[0]["responsable_propuesto"], "PEREZ ANA")  # orden de nombre ignorado
        self.assertEqual(pts, {"PEREZ ANA": 5})

    def test_sesiones_duplicadas_no_inflan(self):
        r, pts, ex = self.run_([S_OK, dict(S_OK)], [nc("1", "1001")])
        self.assertEqual(ex["sesiones_duplicadas_eliminadas"], 1)
        self.assertEqual(r[0]["sesiones_np"], 1)
        self.assertEqual(pts, {"PEREZ ANA": 5})

    def test_varios_operadores_no_es_confirmada(self):
        f = [S_OK, ses("2", "1001", "M1", "2026-03-10 15:00:00", "2026-03-10 23:00:00", "SOTO LUIS")]
        r, pts, _ = self.run_(f, [nc("1", "1001")])
        self.assertEqual(r[0]["nivel"], "PROBABLE")
        self.assertIn("varios_participantes", r[0]["razones"])
        self.assertEqual(len(r[0]["participantes"]), 2)
        self.assertEqual(pts, {})  # participante != responsable: sin puntos

    def test_variantes_del_mismo_operador_cuentan_una_vez(self):
        f = [S_OK, ses("2", "1001", "M1", "2026-03-10 07:00:00", "2026-03-10 15:00:00", "Ana  Perez")]
        r, _, _ = self.run_(f, [nc("1", "1001")])
        self.assertEqual(len(r[0]["participantes"]), 1)
        self.assertEqual(r[0]["nivel"], "CONFIRMADA")

    def test_nc_sin_fecha_es_probable_sin_puntos(self):
        r, pts, _ = self.run_([S_OK], [nc("1", "1001", fecha="")])
        self.assertEqual(r[0]["nivel"], "PROBABLE")
        self.assertIn("sin_fecha_fabricacion", r[0]["razones"])
        self.assertEqual(pts, {})

    def test_np_inexistente_en_fps(self):
        r, _, _ = self.run_([S_OK], [nc("1", "9999")])
        self.assertEqual(r[0]["nivel"], "NO_ATRIBUIBLE")
        self.assertIn("np_sin_fabricacion_en_fps", r[0]["razones"])

    def test_np_con_ceros_a_la_izquierda(self):
        r, _, _ = self.run_([S_OK], [nc("1", "01001")])
        self.assertEqual(r[0]["nivel"], "CONFIRMADA")

    def test_llave_por_nv_innpack(self):
        f = [dict(S_OK, NVInnpack="3687", NP="21582")]
        r, pts, _ = self.run_(f, [nc("1", "3687")])
        self.assertEqual(r[0]["nivel"], "CONFIRMADA")
        self.assertEqual(r[0]["llave"], "NV")
        self.assertEqual(pts, {"PEREZ ANA": 5})

    def test_numero_ambiguo_np_y_nv_no_confirma(self):
        f = [dict(S_OK, NP="3687", NVInnpack="0"), dict(S_OK, ID="9", NP="21000", NVInnpack="3687")]
        r, pts, _ = self.run_(f, [nc("1", "3687")])
        self.assertEqual(r[0]["nivel"], "PROBABLE")
        self.assertIn("numero_coincide_como_NP_y_como_NV", r[0]["razones"])
        self.assertEqual(pts, {})

    def test_maquina_equivalente_romanos_y_sufijo(self):
        f = [ses("1", "1001", "DIANA 8 (SFM)", "2026-03-10 07:00:00", "2026-03-10 15:00:00", "PEREZ ANA")]
        r, _, _ = self.run_(f, [nc("1", "1001", mq="Diana VIII")])
        self.assertEqual(r[0]["nivel"], "CONFIRMADA")

    def test_alias_solo_validados(self):
        f = [ses("1", "1001", "DISCOVER OVALADO (SFM)", "2026-03-10 07:00:00", "2026-03-10 15:00:00", "PEREZ ANA")]
        r, _, _ = self.run_(f, [nc("1", "1001", mq="Discover Cónica/Ovalada")])
        self.assertNotEqual(r[0]["nivel"], "CONFIRMADA")
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "alias.csv")
            with open(ruta, "w", encoding="utf-8") as fh:
                fh.write("nc_maquina,fps_maquina,validado\nDiscover Cónica/Ovalada,DISCOVER OVALADO (SFM),NO\n")
            self.assertEqual(a.cargar_alias(ruta), 0)
            with open(ruta, "w", encoding="utf-8") as fh:
                fh.write("nc_maquina,fps_maquina,validado\nDiscover Cónica/Ovalada,DISCOVER OVALADO (SFM),SI\n")
            self.assertEqual(a.cargar_alias(ruta), 1)
            try:
                r, _, _ = self.run_(f, [nc("1", "1001", mq="Discover Cónica/Ovalada")])
                self.assertEqual(r[0]["nivel"], "CONFIRMADA")
            finally:
                a.ALIAS.clear()

    def test_fecha_fuera_del_periodo_del_np(self):
        r, _, _ = self.run_([S_OK], [nc("1", "1001", fecha="2026-05-01")])
        self.assertEqual(r[0]["fecha_en_periodo_np"], "NO")
        self.assertIn("fecha_fuera_del_periodo_de_fabricacion_del_np", r[0]["razones"])

    def test_operadores_np_no_implica_responsabilidad(self):
        f = [S_OK, ses("2", "1001", "OTRA", "2026-03-11 07:00:00", "2026-03-11 15:00:00", "SOTO LUIS")]
        r, pts, _ = self.run_(f, [nc("1", "1001", mq="M9", op="")])
        self.assertEqual(r[0]["operadores_np"], 2)
        self.assertEqual(pts, {})
        self.assertNotEqual(r[0]["nivel"], "CONFIRMADA")

    def test_export_modulo_sin_nombres(self):
        import json
        r, p, ex = self.run_([S_OK], [nc("1", "1001")])
        with tempfile.TemporaryDirectory() as d:
            ruta = os.path.join(d, "m.json")
            a.exportar_modulo(r, a.resumen(r, ex), [], ruta, 0)
            txt = open(ruta, encoding="utf-8").read()
            self.assertNotIn("PEREZ", txt.upper())
            self.assertEqual(json.loads(txt)["ncProducto"][0]["atribucion"], "CONFIRMADA")

    def test_np_invalido(self):
        r, _, _ = self.run_([S_OK], [nc("1", "12AB")])
        self.assertEqual(r[0]["nivel"], "NO_ATRIBUIBLE")

    def test_maquina_distinta_y_fecha_fuera(self):
        r, _, _ = self.run_([S_OK], [nc("1", "1001", mq="M2", fecha="2026-04-01")])
        self.assertEqual(r[0]["nivel"], "NO_ATRIBUIBLE")
        r, _, _ = self.run_([S_OK], [nc("1", "1001", fecha="2026-04-01")])
        self.assertEqual(r[0]["nivel"], "PROBABLE")
        self.assertIn("fecha_fuera_de_ventana_de_sesion", r[0]["razones"])

    def test_operador_nc_no_coincide(self):
        r, pts, _ = self.run_([S_OK], [nc("1", "1001", op="Juan Rojas")])
        self.assertEqual(r[0]["nivel"], "PROBABLE")
        self.assertIn("operador_nc_no_coincide_con_fps", r[0]["razones"])
        self.assertEqual(pts, {})

    def test_nc_sin_operador_no_asigna_responsable(self):
        r, pts, _ = self.run_([S_OK], [nc("1", "1001", op="")])
        self.assertEqual(r[0]["nivel"], "PROBABLE")
        self.assertEqual(r[0]["responsable_propuesto"], "")
        self.assertEqual(pts, {})

    def test_operador_generico_en_sesion_no_confirma(self):
        f = [S_OK, ses("2", "1001", "M1", "2026-03-10 09:00:00", "2026-03-10 10:00:00", "admin")]
        r, pts, _ = self.run_(f, [nc("1", "1001")])
        self.assertEqual(r[0]["nivel"], "PROBABLE")
        self.assertEqual(pts, {})

    def test_nc_con_varios_operadores_en_texto(self):
        r, pts, _ = self.run_([S_OK], [nc("1", "1001", op="Ana Perez / Luis Soto")])
        self.assertEqual(r[0]["nivel"], "PROBABLE")
        self.assertEqual(pts, {})

    def test_cruce_entre_empresas_mismo_np(self):
        r, pts, _ = self.run_([S_OK], [nc("1", "1001", empresa="INNPACK"), nc("2", "1001", empresa="FARET", mq="M1", fecha="2026-03-10")])
        self.assertTrue(all(x["nivel"] == "PROBABLE" for x in r))
        self.assertTrue(all("np_compartido_entre_empresas" in x["razones"] for x in r))
        self.assertEqual(pts, {})

    def test_nc_duplicada_no_duplica_penalizacion(self):
        r, pts, _ = self.run_([S_OK], [nc("1", "1001"), nc("2", "1001")])
        self.assertEqual(pts, {"PEREZ ANA": 5})
        self.assertEqual(sum(1 for x in r if x["posible_duplicado"]), 1)

    def test_interna_no_penaliza(self):
        r, pts, _ = self.run_([S_OK], [nc("1", "1001", ambito="INTERNA")])
        self.assertEqual(pts, {})
        self.assertEqual(r[0]["puntos_confirmados"], 0)

    def test_eliminadas_excluidas_por_defecto(self):
        r, _, ex = self.run_([S_OK], [nc("1", "1001"), nc("2", "1001", elim="True")])
        self.assertEqual(len(r), 1)
        self.assertEqual(ex["nc_eliminadas_excluidas"], 1)

    def test_fechas_invertidas_no_evaluables(self):
        f = [ses("1", "1001", "M1", "2026-03-10 15:00:00", "2026-03-10 07:00:00", "PEREZ ANA")]
        r, _, _ = self.run_(f, [nc("1", "1001")])
        self.assertNotEqual(r[0]["nivel"], "CONFIRMADA")

    def test_sesion_que_cruza_dias(self):
        f = [ses("1", "1001", "M1", "2026-03-09 22:00:00", "2026-03-10 06:00:00", "PEREZ ANA")]
        r, _, _ = self.run_(f, [nc("1", "1001", fecha="2026-03-10")])
        self.assertEqual(r[0]["nivel"], "CONFIRMADA")

    def test_seudonimo_estable_con_misma_sal(self):
        self.assertEqual(a.seudonimo("Ana Perez", "s"), a.seudonimo("PEREZ ANA", "s"))
        self.assertNotEqual(a.seudonimo("Ana Perez", "s"), a.seudonimo("Ana Perez", "t"))

    def test_salida_dentro_del_repo_rechazada(self):
        repo_out = os.path.join(os.path.dirname(__file__), "..", "..", "..", "x")
        with self.assertRaises(SystemExit):
            a.main(["--fps", "a", "--nc", "b", "--salida", repo_out])

    def test_escritura_de_salida(self):
        r, p, ex = self.run_([S_OK], [nc("1", "1001")])
        with tempfile.TemporaryDirectory() as d:
            a.escribir(r, p, a.resumen(r, ex), d, False, "sal")
            txt = open(os.path.join(d, "cruce_nc_fps.csv"), encoding="utf-8-sig").read()
            self.assertNotIn("PEREZ", txt)  # seudonimizado por defecto
            self.assertIn("OP-", txt)


if __name__ == "__main__":
    unittest.main()
