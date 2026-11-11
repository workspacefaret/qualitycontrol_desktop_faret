import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import analizar_cruce as ac  # noqa: E402
import motor_responsabilidad as m  # noqa: E402

SAL = "t|"


def ses(i, op, art="P1", mq="DIANA 8 (SFM)", proc="PEGADO", ini="2026-02-11 07:00:00", fin="2026-02-11 15:00:00", ot="1", cant=100):
    return {"id": str(i), "ot": ot, "mq": ac.norm_maquina(mq), "mq_raw": mq, "ini": ac.parse_fecha(ini), "fin": ac.parse_fecha(fin),
            "op": op, "op_key": ac.clave_operador(op), "op_ok": ac.operador_valido(op), "cant": cant, "proc": proc, "art": art}


def nc(maq="Diana VIII", cod="P1", dec="", area="Pegado", nivel="MAYOR", **kw):
    return {"id": "1", "nivel_nc": nivel, "maquina": maq, "fecha": None, "codigo_producto": cod, "operador_declarado": dec,
            "area": area, "np_nv": "NV 100", **kw}


def dim(r, nombre):
    return next(x for x in r["conciliacion"]["dimensiones"] if x["dimension"] == nombre)


class Conciliacion(unittest.TestCase):
    def setUp(self):
        ac.ALIAS.clear()

    def test_producto_acota_y_confirma(self):
        s = [ses(1, "Ana Perez", art="P1"), ses(2, "Luis Soto", art="P2")]
        r = m.proponer(nc(), s, SAL)
        self.assertEqual(r["producto"]["estado"], "CONFIRMADA")
        self.assertEqual(len(r["operadores"]), 1)
        self.assertEqual(r["escenario"], 1)
        est = {o["operador"]: o["estado"] for o in r["participantesContexto"]}
        self.assertEqual(sorted(est.values()), ["EXCLUIDO", "PROPUESTO"])

    def test_producto_ausente_no_acota_ni_inventa(self):
        s = [ses(1, "Ana Perez", art="P2"), ses(2, "Luis Soto", art="P3")]
        r = m.proponer(nc(cod="P1"), s, SAL)
        self.assertEqual(r["producto"]["estado"], "INSUFICIENTE")
        self.assertEqual(r["escenario"], 3)  # sigue siendo provisional compartido por maquina/proceso
        self.assertEqual(r["confianza"], "BAJA")

    def test_producto_en_otra_maquina_es_discrepancia(self):
        s = [ses(1, "Ana Perez", art="P2"), ses(2, "Luis Soto", art="P1", mq="BOBST 142 - 4 (SFM)", proc="TROQUEL")]
        r = m.proponer(nc(), s, SAL)
        self.assertEqual(r["producto"]["estado"], "DISCREPANCIA")
        self.assertEqual(r["conciliacion"]["estado"], "DISCREPANCIA")

    def test_declarado_corroborado_por_producto_es_confirmado(self):
        s = [ses(1, "Ana Maria Perez Soto", art="P1"), ses(2, "Luis Soto", art="P2")]
        r = m.proponer(nc(dec="Ana Perez"), s, SAL)
        self.assertEqual(r["declarado"]["estado"], "CORROBORADO")
        self.assertEqual(dim(r, "operador")["estado"], "CONFIRMADA")
        self.assertTrue(r["declarado"]["exclusivo"])
        # el mismo seudonimo que el operador FPS (es la misma persona)
        self.assertEqual(r["declarado"]["operador"], r["operadores"][0]["operador"])

    def test_declarado_no_exclusivo_reparte_entre_quienes_fabricaron(self):
        s = [ses(1, "Ana Maria Perez Soto", art="P1"), ses(2, "Luis Soto Rojas", art="P1", ini="2026-02-11 15:00:00", fin="2026-02-11 23:00:00")]
        r = m.proponer(nc(dec="Ana Perez"), s, SAL)
        self.assertEqual(r["escenario"], 3)
        self.assertFalse(r["declarado"]["exclusivo"])
        self.assertEqual(sorted(o["puntosPropuestos"] for o in r["operadores"]), [2.5, 2.5])
        self.assertTrue(any("no es el único" in c for c in r["contradicciones"]))

    def test_declarado_solo_por_nombre_se_indica_y_baja_confianza(self):
        s = [ses(1, "Ana Maria Perez Soto", art="PX"), ses(2, "Luis Soto Rojas", art="PY")]
        r = m.proponer(nc(cod="", dec="Ana Perez"), s, SAL)
        self.assertEqual(r["escenario"], 1)
        self.assertTrue(r["apoyoUnicoNombreDeclarado"])
        self.assertEqual(r["confianza"], "BAJA")
        self.assertEqual(dim(r, "operador")["estado"], "PROBABLE")

    def test_declarado_sin_sesiones_es_discrepancia_sin_puntos_y_con_alternativa(self):
        s = [ses(1, "Luis Soto Rojas", art="P1")]
        r = m.proponer(nc(dec="Carlos Espinoza"), s, SAL)
        self.assertEqual(r["declarado"]["estado"], "NO_ENCONTRADO")
        self.assertEqual((r["escenario"], r["puntosAsignados"], r["operadores"]), (4, 0.0, []))
        self.assertEqual(r["conciliacion"]["estado"], "DISCREPANCIA")
        alt = r["alternativaFps"]
        self.assertFalse(alt["cuentaEnTotales"])
        self.assertEqual([o["puntosHipoteticos"] for o in alt["operadores"]], [5.0])
        self.assertTrue(any(x["estado"] == "CONTEXTO" for x in r["participantesContexto"]))

    def test_variantes_de_nombre_no_corroboran(self):
        s = [ses(1, "Luis Soto Rojas", art="P1"), ses(2, "Claudio Antonio Espinoza Miranda", art="P9", mq="WEST RIVER (SFM)", proc="CORRUGADO")]
        r = m.proponer(nc(dec="Carlos Espinoza"), s, SAL)
        self.assertEqual(r["declarado"]["estado"], "NO_ENCONTRADO")
        self.assertEqual([v["tipo"] for v in r["variantesNombre"]], ["APELLIDO_COINCIDE"])
        self.assertEqual(r["variantesNombre"][0]["procesos"], ["CORRUGADO"])
        self.assertEqual(r["puntosAsignados"], 0.0)

    def test_variante_ortografica(self):
        v = m.variantes_nombre("Cezar Sepulveda", ["CESAR ANDRES SEPULVEDA CORDERO", "LUIS SOTO"])
        self.assertEqual([x["tipo"] for x in v], ["VARIANTE_ORTOGRAFICA"])
        self.assertEqual(m.variantes_nombre("Cesar Sepulveda", ["CESAR ANDRES SEPULVEDA CORDERO"]), [])  # ya coincide: no es variante

    def test_sesiones_fuera_de_fecha_no_descartan(self):
        s = [ses(1, "Ana Perez", ini="2025-01-01 07:00:00", fin="2025-01-01 15:00:00"), ses(2, "Luis Soto", ini="2027-01-01 07:00:00", fin="2027-01-01 15:00:00")]
        r = m.proponer(nc(cod=""), s, SAL)
        self.assertEqual(len(r["operadores"]), 2)

    def test_operadores_simultaneos_sin_duplicar_puntos(self):
        s = [ses(i, f"Operador Numero{i} Apellido", art="P1") for i in range(1, 4)] + [ses(9, "OPERADOR NUMERO1 APELLIDO", art="P1", ini="2026-02-12 07:00:00", fin="2026-02-12 15:00:00")]
        r = m.proponer(nc(), s, SAL)
        self.assertEqual(len(r["operadores"]), 3)
        self.assertEqual(round(sum(o["puntosPropuestos"] for o in r["operadores"]), 2), 5.0)
        self.assertLessEqual(r["puntosAsignados"], r["puntosSeveridad"])

    def test_maquina_ambigua_no_se_convierte_en_equivalencia(self):
        s = [ses(1, "Ana Perez", mq="DISCOVER CILINDRICA (SFM)", proc="TERMOFORMADO"), ses(2, "Luis Soto", mq="DISCOVER CILINDRICA 2 (SFM)", proc="TERMOFORMADO")]
        r = m.proponer(nc(maq="Discover Cilindrica", cod="", area="Termoformado"), s, SAL)
        self.assertNotEqual(r["equivalencia"]["estado"], "VALIDADA")
        self.assertIn(dim(r, "maquina")["estado"], ("INSUFICIENTE", "PROBABLE", "CONFIRMADA"))
        self.assertLessEqual(r["puntosAsignados"], 5.0)

    def test_nc_sin_maquina_es_contexto_sin_puntos(self):
        r = m.proponer(nc(maq=""), [ses(1, "Ana Perez")], SAL)
        self.assertEqual((r["escenario"], r["puntosAsignados"]), (4, 0.0))
        self.assertEqual(dim(r, "maquina")["estado"], "INSUFICIENTE")
        self.assertIn(r["conciliacion"]["estado"], ("PROBABLE", "INSUFICIENTE"))

    def test_documento_no_encontrado(self):
        r = m.proponer(nc(), [], SAL)
        self.assertEqual(dim(r, "documento")["estado"], "INSUFICIENTE")
        self.assertEqual(r["conciliacion"]["estado"], "INSUFICIENTE")
        self.assertEqual(r["puntosAsignados"], 0.0)

    def test_estados_validos(self):
        s = [ses(1, "Ana Perez")]
        r = m.proponer(nc(), s, SAL)
        for x in r["conciliacion"]["dimensiones"]:
            self.assertIn(x["estado"], ("CONFIRMADA", "PROBABLE", "DISCREPANCIA", "INSUFICIENTE"))



class EvidenciaAmpliada(unittest.TestCase):
    def test_declarado_operaba_al_registrar_es_hipotesis_sin_puntos(self):
        import generar_snapshot_v2 as g
        doc = [ses(1, "Luis Soto Rojas", art="P1", ini="2026-02-11 07:00:00", fin="2026-02-11 15:00:00")]
        n = nc(dec="Carlos Espinoza", fecha_registro=ac.parse_fecha("2026-06-22"))
        p = m.proponer(n, doc, SAL)
        extra = [ses(10, "CARLOS ESPINOZA", art="P7", ini="2026-06-22 07:00:00", fin="2026-06-22 15:00:00"),
                 ses(11, "Ana Perez", art="P1", ini="2025-09-01 07:00:00", fin="2025-09-01 15:00:00")]
        e = g.evidencia_ampliada({}, n, p, doc, extra, SAL)
        self.assertTrue(e["declaradoOperabaAlRegistrar"])
        self.assertIn("no verificada", e["lectura"])
        self.assertEqual(len(e["operadoresEnFechaRegistro"]), 1)
        self.assertEqual(e["productoEnOtrosDocumentos"][0]["mes"], "2025-09")
        self.assertEqual(p["puntosAsignados"], 0.0)  # la hipotesis no cambia la propuesta
        self.assertEqual(p["conciliacion"]["estado"], "DISCREPANCIA")

    def test_sin_declarado_no_inventa_hipotesis(self):
        import generar_snapshot_v2 as g
        doc = [ses(1, "Luis Soto Rojas", art="P1")]
        n = nc(dec="", fecha_registro=ac.parse_fecha("2026-06-22"))
        p = m.proponer(n, doc, SAL)
        e = g.evidencia_ampliada({}, n, p, doc, [ses(10, "CARLOS ESPINOZA", ini="2026-06-22 07:00:00", fin="2026-06-22 15:00:00")], SAL)
        self.assertIsNone(e["declaradoOperabaAlRegistrar"])
        self.assertNotIn("Hipótesis", e["lectura"])  # sin operador declarado no se formula hipotesis sobre el declarado


CAT = [
    {"id": "65", "nombre": "DIANA 8 (SFM)", "corto": "DIANA8SFM", "grupo": "PEGADO", "activo": True},
    {"id": "17", "nombre": "DIANA 5", "corto": "DIANA 5", "grupo": "PEGADO", "activo": True},
    {"id": "93", "nombre": "DISCOVER CILINDRICA (SFM)", "corto": "CILINDRICA", "grupo": "TERMOFORMADO", "activo": True},
    {"id": "78", "nombre": "DISCOVER OVALADO (SFM)", "corto": "DISCOV SFM", "grupo": "TERMOFORMADO", "activo": True},
    {"id": "90", "nombre": "KBA 2", "corto": "KBA 2", "grupo": "OFF-SET", "activo": True},
    {"id": "91", "nombre": "KBA 3", "corto": "KBA 3", "grupo": "OFF-SET", "activo": True},
]


class Catalogo(unittest.TestCase):
    def setUp(self):
        ac.ALIAS.clear()

    def test_exacta_con_numero_romano(self):
        r = m.resolver_en_catalogo("Diana VIII", "Pegado", CAT)
        self.assertEqual((r["estado"], r["id"]), ("EXACTA", "65"))

    def test_unica_con_sufijo_numerico_sin_equivalente(self):
        r = m.resolver_en_catalogo("Discover Cilíndrica 1", "Termoformado", CAT)
        self.assertEqual((r["estado"], r["id"]), ("UNICA", "93"))

    def test_barra_es_una_u_otra(self):
        r = m.resolver_en_catalogo("Discover Cónica/Ovalada", "Termoformado", CAT)
        self.assertEqual((r["estado"], r["id"]), ("UNICA", "78"))

    def test_ambigua_y_sin_equivalencia(self):
        self.assertEqual(m.resolver_en_catalogo("KBA", "Off-set", CAT)["estado"], "AMBIGUA")
        self.assertEqual(m.resolver_en_catalogo("Maquina Inexistente", "Pegado", CAT)["estado"], "NINGUNA")
        self.assertEqual(m.resolver_en_catalogo("Diana VIII", "Pegado", None)["estado"], "NINGUNA")

    def test_catalogo_confirma_y_sube_la_conciliacion(self):
        s = [ses(1, "Ana Maria Perez Soto", art="P1", mq="DISCOVER CILINDRICA (SFM)", proc="TERMOFORMADO")]
        r = m.proponer(nc(maq="Discover Cilindrica 1", area="Termoformado"), s, SAL, catalogo=CAT)
        self.assertEqual(r["equivalencia"]["estado"], "CATALOGO")
        self.assertEqual(dim(r, "maquina")["estado"], "CONFIRMADA")
        self.assertIn("no tiene equivalente", r["equivalencia"]["detalle"])

    def test_maquina_confirmada_sin_sesiones_en_el_documento(self):
        s = [ses(1, "Ana Perez", mq="BOBST 142 - 2 (SFM)", proc="TROQUEL")]
        r = m.proponer(nc(maq="Diana VIII", area="Pegado"), s, SAL, catalogo=CAT)
        self.assertEqual((r["escenario"], r["puntosAsignados"]), (4, 0.0))
        self.assertTrue(r["maquinaCatalogoSinSesiones"])
        self.assertEqual(dim(r, "maquina")["estado"], "CONFIRMADA")
        self.assertEqual(dim(r, "ocurrencia")["estado"], "DISCREPANCIA")
        self.assertEqual(dim(r, "proceso")["estado"], "CONFIRMADA")  # el proceso de la NC coincide con el del catalogo
        self.assertTrue(all(x["estado"] == "CONTEXTO" for x in r["participantesContexto"]))
        self.assertEqual(r["conciliacion"]["estado"], "DISCREPANCIA")

    def test_sin_catalogo_el_comportamiento_no_cambia(self):
        s = [ses(1, "Ana Perez", mq="DISCOVER CILINDRICA (SFM)", proc="TERMOFORMADO")]
        r = m.proponer(nc(maq="Discover Cilindrica 1", area="Termoformado", cod=""), s, SAL)
        self.assertEqual(r["equivalencia"]["estado"], "SUGERIDA")


if __name__ == "__main__":
    unittest.main()
