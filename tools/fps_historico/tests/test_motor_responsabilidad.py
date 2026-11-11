import os
import sys
import unittest
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import analizar_cruce as ac  # noqa: E402
import motor_responsabilidad as m  # noqa: E402

SAL = "t|"


def ses(i, op, mq="DIANA 8 (SFM)", ini="2026-02-11 07:00:00", fin="2026-02-11 15:00:00", ot="1", cant=100):
    return {"id": str(i), "ot": ot, "mq": ac.norm_maquina(mq), "mq_raw": mq, "ini": ac.parse_fecha(ini), "fin": ac.parse_fecha(fin),
            "op": op, "op_key": ac.clave_operador(op), "op_ok": ac.operador_valido(op), "cant": cant}


def nc(maq="Diana VIII", fecha="2026-02-11", nivel="MAYOR", **kw):
    return {"id": "1", "nivel_nc": nivel, "maquina": maq, "fecha": ac.parse_fecha(fecha), **kw}


class Motor(unittest.TestCase):
    def setUp(self):
        ac.ALIAS.clear()

    def test_reparto_exacto(self):
        self.assertEqual(m.repartir_centesimas(5, 3), [1.67, 1.67, 1.66])
        self.assertEqual(round(sum(m.repartir_centesimas(5, 3)), 2), 5.0)
        self.assertEqual(m.repartir_centesimas(1, 3), [0.34, 0.33, 0.33])
        self.assertEqual(m.repartir_centesimas(5, 0), [])

    def test_escenario1_unico_operador_fecha_cubierta(self):
        r = m.proponer(nc(), [ses(1, "Ana Perez")], SAL, fechas_verificadas=True)
        self.assertEqual((r["escenario"], r["confianza"], r["puntosAsignados"]), (1, "ALTA", 5.0))
        self.assertEqual(r["estadoCalidad"], m.ESTADO_CALIDAD)

    def test_escenario1_fecha_no_fiable_baja_a_media(self):
        r = m.proponer(nc(fecha="2026-03-31"), [ses(1, "Ana Perez")], SAL)
        self.assertEqual((r["escenario"], r["confianza"], r["ventanaFiable"]), (1, "MEDIA", False))

    def test_escenario2_solo_sesiones_que_cubren(self):
        s = [ses(1, "Ana Perez"), ses(2, "Luis Soto", ini="2026-02-14 07:00:00", fin="2026-02-14 15:00:00"),
             ses(3, "Eva Rojas")]
        r = m.proponer(nc(), s, SAL, fechas_verificadas=True)
        self.assertEqual(r["escenario"], 2)
        self.assertEqual(len(r["operadores"]), 2)  # Luis queda solo en el contexto
        self.assertEqual(len(r["participantesContexto"]), 3)
        self.assertEqual(round(r["puntosAsignados"], 2), 5.0)

    def test_escenario3_reparto_equitativo_sin_perdida(self):
        s = [ses(1, "Ana Perez"), ses(2, "Luis Soto"), ses(3, "Eva Rojas")]
        r = m.proponer(nc(fecha="2026-04-01"), s, SAL)
        self.assertEqual(r["escenario"], 3)
        self.assertEqual(sorted(o["puntosPropuestos"] for o in r["operadores"]), [1.66, 1.67, 1.67])
        self.assertEqual(round(sum(o["puntosPropuestos"] for o in r["operadores"]), 2), 5.0)

    def test_operador_con_varias_sesiones_cuenta_una_vez(self):
        s = [ses(1, "Ana Perez"), ses(2, "ANA  PEREZ", ini="2026-02-12 07:00:00", fin="2026-02-12 15:00:00"), ses(3, "Luis Soto")]
        r = m.proponer(nc(fecha="2026-04-01"), s, SAL)
        self.assertEqual(len(r["operadores"]), 2)
        self.assertEqual(round(r["puntosAsignados"], 2), 5.0)

    def test_sesiones_duplicadas_no_inflan(self):
        filas = [{"ID": "9", "NP": "1", "NVInnpack": "3687", "FECHA INICIO": "2026-02-11 07:00:00", "FECHA TERMINO": "2026-02-11 15:00:00",
                  "OPERADOR": "Ana Perez", "MAQUINA": "DIANA 8 (SFM)", "OT": "1", "CANTIDAD_PRODUCCION": "10"}] * 2
        _, por_nv, dup = ac.cargar_sesiones(filas)
        self.assertEqual((len(por_nv["3687"]), dup), (1, 1))

    def test_sin_maquina_no_asigna(self):
        r = m.proponer(nc(maq=""), [ses(1, "Ana Perez")], SAL)
        self.assertEqual((r["escenario"], r["puntosAsignados"]), (4, 0.0))
        self.assertEqual(len(r["participantesContexto"]), 1)

    def test_alias_sugerido_baja_confianza_y_validado_sube(self):
        s = [ses(1, "Ana Perez", mq="DISCOVER CILINDRICA (SFM)")]
        r = m.proponer(nc(maq="Discover Cilíndrica 1"), s, SAL)
        self.assertEqual((r["escenario"], r["confianza"], r["aliasSugerido"]), (1, "BAJA", True))
        ac.ALIAS[ac.norm_maquina("Discover Cilíndrica 1")] = ac.norm_maquina("DISCOVER CILINDRICA (SFM)")
        r2 = m.proponer(nc(maq="Discover Cilíndrica 1"), s, SAL)
        self.assertEqual((r2["confianza"], r2["aliasSugerido"], r2["equivalencia"]["estado"]), ("MEDIA", False, "VALIDADA"))

    def test_fechas_de_la_nc_no_descartan_operadores_si_no_estan_verificadas(self):
        s = [ses(1, "Ana Perez"), ses(2, "Luis Soto", ini="2026-02-14 07:00:00", fin="2026-02-14 15:00:00")]
        r = m.proponer(nc(fecha="2026-02-11"), s, SAL)  # la fecha solo cubre a Ana, pero no esta verificada
        self.assertEqual((r["escenario"], len(r["operadores"]), r["fechaUsadaParaAcotar"]), (3, 2, False))
        self.assertEqual(round(sum(o["puntosPropuestos"] for o in r["operadores"]), 2), 5.0)

    def test_fecha_fuera_del_periodo_es_contradiccion_no_descarte(self):
        r = m.proponer(nc(fecha="2026-06-01"), [ses(1, "Ana Perez")], SAL)
        self.assertEqual(len(r["operadores"]), 1)
        self.assertTrue(any("fuera del período" in c for c in r["contradicciones"]))

    def test_participantes_incluidos_y_excluidos_con_motivo(self):
        s = [ses(1, "Ana Perez"), ses(2, "Luis Soto", mq="BOBST 106 - 1")]
        r = m.proponer(nc(), s, SAL)
        est = {o["estado"] for o in r["participantesContexto"]}
        self.assertEqual(est, {"PROPUESTO", "EXCLUIDO"})
        self.assertTrue(all(o["motivo"] for o in r["participantesContexto"]))
        self.assertEqual([o["puntosPropuestos"] for o in r["participantesContexto"] if o["estado"] == "EXCLUIDO"], [0.0])

    def test_sin_maquina_identificable_solo_contexto_sin_puntos(self):
        r = m.proponer(nc(maq="Maquina inexistente"), [ses(1, "Ana Perez"), ses(2, "Luis Soto")], SAL)
        self.assertEqual((r["escenario"], r["puntosAsignados"], r["equivalencia"]["estado"]), (4, 0.0, "NINGUNA"))
        self.assertEqual({o["estado"] for o in r["participantesContexto"]}, {"CONTEXTO"})

    def test_estados_de_equivalencia(self):
        self.assertEqual(m.proponer(nc(), [ses(1, "Ana Perez")], SAL)["equivalencia"]["estado"], "EXACTA")
        r = m.proponer(nc(maq="Discover Cilíndrica 1"), [ses(1, "Ana Perez", mq="DISCOVER CILINDRICA (SFM)")], SAL)
        self.assertEqual((r["equivalencia"]["estado"], r["confianza"]), ("SUGERIDA", "BAJA"))

    def test_operador_declarado_corroborado_acota_a_individual(self):
        s = [ses(1, "CESAR ANDRES SEPULVEDA CORDERO"), ses(2, "JOSE PINO ORELLANA"), ses(3, "YESAHIN MENDEZ MEZA")]
        r = m.proponer(nc(operador_declarado="Cesar Sepulveda"), s, SAL)
        self.assertEqual((r["escenario"], r["declarado"]["estado"], r["puntosAsignados"], len(r["operadores"])), (1, "CORROBORADO", 5.0, 1))
        self.assertEqual(sorted(o["estado"] for o in r["participantesContexto"]), ["EXCLUIDO", "EXCLUIDO", "PROPUESTO"])
        self.assertNotIn("SEPULVEDA", str(r))

    def test_operador_declarado_ausente_en_fps_no_atribuye(self):
        s = [ses(1, "LUIS EDUARDO MACIAS COELLO")]
        r = m.proponer(nc(operador_declarado="Carlos Espinoza"), s, SAL)
        self.assertEqual((r["escenario"], r["puntosAsignados"], r["declarado"]["estado"]), (4, 0.0, "NO_ENCONTRADO"))
        self.assertEqual({o["estado"] for o in r["participantesContexto"]}, {"CONTEXTO"})
        self.assertTrue(r["contradicciones"])

    def test_operador_declarado_en_otra_maquina_del_documento(self):
        s = [ses(1, "Ana Maria Perez"), ses(2, "Carlos Espinoza Soto", mq="BOBST 106 - 1")]
        r = m.proponer(nc(operador_declarado="Carlos Espinoza"), s, SAL)
        self.assertEqual((r["escenario"], r["declarado"]["estado"], r["puntosAsignados"]), (4, "FUERA_DE_MAQUINA", 0.0))

    def test_declarado_ambiguo_o_vacio_no_se_usa(self):
        for d in ("", "N/A", "Carlos", "Ana / Luis"):
            r = m.proponer(nc(operador_declarado=d), [ses(1, "Ana Perez"), ses(2, "Luis Soto")], SAL)
            self.assertEqual((r["escenario"], len(r["operadores"])), (3, 2), d)

    def test_proceso_de_la_nc_contradictorio_se_informa(self):
        s = [ses(1, "Ana Perez")]
        s[0]["proc"] = "PEGADO"
        r = m.proponer(nc(area="Termoformado"), s, SAL)
        self.assertFalse(r["procesoCoincide"])
        self.assertTrue(any("área/proceso" in c for c in r["contradicciones"]))

    def test_fecha_posterior_al_registro_no_es_ventana_fiable(self):
        r = m.proponer(nc(fecha="2026-02-11", fecha_registro=ac.parse_fecha("2026-02-01")), [ses(1, "Ana Perez")], SAL)
        self.assertFalse(r["ventanaFiable"])
        self.assertIn("fecha_de_fabricacion_posterior_al_registro_dato_incoherente", r["razones"])

    def test_alias_sugerido_ambiguo_no_asigna(self):
        s = [ses(1, "Ana Perez", mq="DISCOVER CILINDRICA 1 (SFM)"), ses(2, "Luis Soto", mq="DISCOVER CILINDRICA 2 (SFM)")]
        self.assertEqual(m.proponer(nc(maq="Discover Cilíndrica"), s, SAL)["escenario"], 4)
        self.assertEqual(m.proponer(nc(maq="Diana VIII"), [ses(1, "Ana Perez", mq="KBA 2")], SAL)["escenario"], 4)

    def test_alias_con_alternativas_barra(self):
        self.assertEqual(m.alias_sugerido("Discover Cónica/Ovalada", ["DISCOVER OVALADO (SFM)"]), "DISCOVER OVALADO")

    def test_sesion_larga_no_ubica_el_defecto(self):
        largo = ses(1, "Ana Perez", ini="2026-02-10 07:00:00", fin="2026-02-15 07:00:00")
        r = m.proponer(nc(fecha="2026-02-12"), [largo, ses(2, "Luis Soto", ini="2026-02-01 07:00:00", fin="2026-02-01 15:00:00")], SAL)
        self.assertFalse(r["ventanaFiable"])
        self.assertEqual(r["escenario"], 3)
        self.assertEqual(r["operadores"][0]["sesionesLargas"] + r["operadores"][1]["sesionesLargas"], 1)

    def test_enriquecer_con_raw_no_agrega_sesiones(self):
        s = [ses(1, "Ana Perez")]
        n = m.enriquecer_con_raw(s, [{"RecordKey": "1", "UserKey": "5", "UpdateUserKey": "9", "CloseReasonName": "PRODUCCION PARCIAL", "Comments": "x"}])
        self.assertEqual((n, len(s), s[0]["editado_otro"], s[0]["cierre"]), (1, 1, True, "PRODUCCION PARCIAL"))

    def test_sin_documento_o_np_compartido(self):
        self.assertEqual(m.proponer(nc(), [], SAL)["escenario"], 4)
        self.assertEqual(m.proponer(nc(), [ses(1, "Ana Perez")], SAL, np_en_varias_empresas=True)["puntosAsignados"], 0.0)

    def test_sesion_sin_operador_valido_no_recibe_puntos(self):
        r = m.proponer(nc(), [ses(1, ""), ses(2, "N/A")], SAL)
        self.assertEqual((r["escenario"], r["puntosAsignados"]), (4, 0.0))

    def test_nc_eliminada_o_rectificada_marca_revision_y_no_suma(self):
        r = m.proponer(nc(rectificada=True), [ses(1, "Ana Perez")], SAL)
        self.assertTrue(r["revisarVigencia"])
        ind = m.indicadores([r])
        self.assertEqual(list(ind.values())[0]["propuestaPuntos"], 0.0)

    def test_nunca_mas_puntos_que_la_severidad_y_c_siempre_cero(self):
        p = [m.proponer(nc(nivel="MENOR", fecha="2026-04-01"), [ses(i, f"Op {i}") for i in range(7)], SAL)]
        self.assertLessEqual(p[0]["puntosAsignados"], 1.0)
        self.assertEqual(round(sum(o["puntosPropuestos"] for o in p[0]["operadores"]), 2), 1.0)
        self.assertTrue(all(v["confirmadaPuntos"] == 0 for v in m.indicadores(p).values()))

    def test_varias_ot_misma_nc_un_operador_una_cuota(self):
        s = [ses(1, "Ana Perez", ot="A"), ses(2, "Ana Perez", ot="B", ini="2026-02-12 07:00:00", fin="2026-02-12 15:00:00")]
        r = m.proponer(nc(fecha="2026-04-01"), s, SAL)
        self.assertEqual((len(r["operadores"]), r["operadores"][0]["sesiones"], r["operadores"][0]["puntosPropuestos"]), (1, 2, 5.0))

    def test_sin_nombres_en_salida(self):
        r = m.proponer(nc(), [ses(1, "Ana Perez")], SAL)
        self.assertNotIn("Perez", str(r))

    def test_participar_no_es_responsable_participacion_vs_propuesta(self):
        s = [ses(1, "Ana Perez"), ses(2, "Luis Soto", mq="OTRA")]
        r = m.proponer(nc(), s, SAL)
        ind = m.indicadores([r])
        self.assertEqual(len(ind), 2)
        self.assertEqual(sorted(v["propuestaPuntos"] for v in ind.values()), [0.0, 5.0])


if __name__ == "__main__":
    unittest.main()
