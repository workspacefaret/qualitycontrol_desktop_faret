from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import stringWidth


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "QCC_Informe_Actualizaciones_Profesional_2026-08-27.pdf"

W, H = A4
M = 48

NAVY = HexColor("#12324A")
BLUE = HexColor("#1E6FA8")
CYAN = HexColor("#39A9C7")
PALE = HexColor("#EAF4F8")
PALE_BLUE = HexColor("#F3F7FA")
INK = HexColor("#21313C")
MUTED = HexColor("#607581")
LINE = HexColor("#D6E1E6")
WHITE = HexColor("#FFFFFF")
GREEN = HexColor("#1C8A62")
GREEN_PALE = HexColor("#E8F5EF")
AMBER = HexColor("#C8871A")

pdfmetrics.registerFont(TTFont("Segoe", r"C:\Windows\Fonts\segoeui.ttf"))
pdfmetrics.registerFont(TTFont("Segoe-Bold", r"C:\Windows\Fonts\segoeuib.ttf"))
pdfmetrics.registerFont(TTFont("Segoe-Italic", r"C:\Windows\Fonts\segoeuii.ttf"))


def rounded_rect(c, x, y, w, h, fill, radius=10, stroke=None, width=1):
    c.setLineWidth(width)
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1 if stroke else 0)


def wrap_lines(text, font, size, max_width):
    words = text.split()
    lines, current = [], ""
    for word in words:
        test = word if not current else f"{current} {word}"
        if stringWidth(test, font, size) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_text(c, text, x, y, max_width, font="Segoe", size=10, color=INK, leading=None):
    leading = leading or size * 1.42
    c.setFont(font, size)
    c.setFillColor(color)
    for paragraph in text.split("\n"):
        if not paragraph:
            y -= leading * 0.65
            continue
        for line in wrap_lines(paragraph, font, size, max_width):
            c.drawString(x, y, line)
            y -= leading
    return y


def bullet_list(c, items, x, y, max_width, size=10.2, gap=8, bullet_color=CYAN):
    for item in items:
        lines = wrap_lines(item, "Segoe", size, max_width - 20)
        c.setFillColor(bullet_color)
        c.circle(x + 4, y - 4, 2.5, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Segoe", size)
        line_y = y
        for line in lines:
            c.drawString(x + 17, line_y, line)
            line_y -= size * 1.42
        y = line_y - gap
    return y


def header(c, number, title, subtitle, company, page):
    c.setFillColor(NAVY)
    c.rect(0, H - 110, W, 110, fill=1, stroke=0)
    c.setFillColor(CYAN)
    c.setFont("Segoe-Bold", 12)
    c.drawString(M, H - 38, number)
    status_text = f"EN PRODUCCION  |  {company}"
    status_width = max(132, stringWidth(status_text, "Segoe-Bold", 7.8) + 28)
    rounded_rect(c, W - M - status_width, H - 48, status_width, 24, GREEN, 12)
    c.setFillColor(WHITE)
    c.setFont("Segoe-Bold", 7.8)
    c.drawCentredString(W - M - status_width / 2, H - 40, status_text)
    c.setFillColor(WHITE)
    title_size = 22
    while title_size > 17 and stringWidth(title, "Segoe-Bold", title_size) > W - 2 * M:
        title_size -= 0.5
    c.setFont("Segoe-Bold", title_size)
    c.drawString(M, H - 68, title)
    c.setFont("Segoe", 10.5)
    c.setFillColor(HexColor("#CDE1EA"))
    c.drawString(M, H - 89, subtitle)
    footer(c, page)


def footer(c, page):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(M, 34, W - M, 34)
    c.setFillColor(MUTED)
    c.setFont("Segoe", 8)
    c.drawString(M, 20, "QUALITY CONTROL CENTER  |  INFORME DE ACTUALIZACION")
    c.drawRightString(W - M, 20, f"{page} / 6")


def label(c, text, x, y, color=BLUE):
    c.setFillColor(color)
    c.setFont("Segoe-Bold", 9)
    c.drawString(x, y, text.upper())


def callout(c, title, text, x, y, w, h, accent=CYAN, fill=PALE):
    rounded_rect(c, x, y, w, h, fill, 9)
    c.setFillColor(accent)
    c.rect(x, y, 5, h, fill=1, stroke=0)
    c.setFillColor(NAVY)
    c.setFont("Segoe-Bold", 10)
    c.drawString(x + 18, y + h - 23, title)
    draw_text(c, text, x + 18, y + h - 43, w - 34, size=9.2, color=MUTED, leading=13)


def summary_card(c, number, title, description, scope, x, y, w, h):
    rounded_rect(c, x, y, w, h, WHITE, 10, LINE)
    rounded_rect(c, x + 14, y + h - 46, 34, 30, NAVY, 8)
    c.setFillColor(WHITE)
    c.setFont("Segoe-Bold", 11)
    c.drawCentredString(x + 31, y + h - 36, number)
    c.setFillColor(NAVY)
    c.setFont("Segoe-Bold", 11.5)
    c.drawString(x + 60, y + h - 29, title)
    c.setFillColor(MUTED)
    c.setFont("Segoe", 8.4)
    c.drawString(x + 60, y + h - 43, scope)
    draw_text(c, description, x + 16, y + h - 66, w - 32, size=9.1, leading=13)


def draw_cover(c):
    c.setFillColor(NAVY)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setFillColor(BLUE)
    c.circle(W + 15, H - 85, 155, fill=1, stroke=0)
    c.setFillColor(CYAN)
    c.circle(W - 38, H - 58, 83, fill=1, stroke=0)
    c.setFillColor(HexColor("#174866"))
    c.circle(-25, 55, 125, fill=1, stroke=0)

    c.setFillColor(CYAN)
    c.setFont("Segoe-Bold", 11)
    c.drawString(M, H - 110, "QUALITY CONTROL CENTER")
    c.setFillColor(WHITE)
    c.setFont("Segoe-Bold", 33)
    c.drawString(M, H - 184, "Actualizaciones")
    c.drawString(M, H - 225, "del sistema")
    c.setFillColor(HexColor("#D3E6EE"))
    c.setFont("Segoe", 13)
    draw_text(
        c,
        "Resumen ejecutivo de las mejoras implementadas y disponibles para los equipos usuarios.",
        M,
        H - 270,
        390,
        size=13,
        color=HexColor("#D3E6EE"),
        leading=19,
    )

    rounded_rect(c, M, 176, W - 2 * M, 92, HexColor("#173C54"), 12, HexColor("#315A71"))
    c.setFillColor(WHITE)
    c.setFont("Segoe-Bold", 10)
    c.drawString(M + 20, 238, "ENTREGA PRODUCTIVA")
    c.setFillColor(HexColor("#BFD7E2"))
    c.setFont("Segoe", 9.5)
    c.drawString(M + 20, 218, "Versiones 1.8.6 y 1.8.7")
    c.drawString(M + 20, 198, "27 de agosto de 2026")
    rounded_rect(c, W - M - 160, 200, 140, 38, GREEN, 19)
    c.setFillColor(WHITE)
    c.setFont("Segoe-Bold", 10)
    c.drawCentredString(W - M - 90, 214, "IMPLEMENTADO")

    c.setFillColor(HexColor("#AFC9D4"))
    c.setFont("Segoe", 8.5)
    c.drawString(M, 60, "INNPACK  |  FARET")
    c.drawRightString(W - M, 60, "INFORME DE ENTREGA")
    c.showPage()


def draw_summary(c):
    header(c, "RESUMEN", "Una entrega enfocada en operación y trazabilidad", "Mejoras disponibles para uso productivo", "QCC", 2)
    y = H - 145
    c.setFillColor(NAVY)
    c.setFont("Segoe-Bold", 17)
    c.drawString(M, y, "Cambios incluidos en esta entrega")
    y -= 25
    draw_text(
        c,
        "Esta actualización incorpora mejoras solicitadas por los usuarios para reducir tareas manuales, centralizar consultas y fortalecer el respaldo de la información.",
        M,
        y,
        W - 2 * M,
        size=10.5,
        color=MUTED,
        leading=15,
    )

    card_w = (W - 2 * M - 14) / 2
    summary_card(c, "01", "Talleres Externos", "Sincronización con FPS, cantidades correctas e historial de liberaciones.", "INNPACK", M, 493, card_w, 118)
    summary_card(c, "02", "Trazabilidad", "Consulta consolidada de NP, procesos, paletizado y materiales asignados.", "INNPACK Y VERSION FARET", M + card_w + 14, 493, card_w, 118)
    summary_card(c, "03", "No Conformidades", "PDF de causa raíz y evidencia fotográfica, también durante la creación.", "INNPACK Y FARET", M, 357, card_w, 118)
    summary_card(c, "04", "Exportación a Excel", "Auditoría general y corrección de la columna de liberaciones FPS.", "INNPACK Y FARET", M + card_w + 14, 357, card_w, 118)

    callout(
        c,
        "Estado de la entrega",
        "Los cambios descritos se encuentran implementados y publicados mediante las versiones 1.8.6 y 1.8.7.",
        M,
        235,
        W - 2 * M,
        85,
        accent=GREEN,
        fill=GREEN_PALE,
    )
    c.showPage()


def draw_talleres(c):
    header(c, "01", "Talleres Externos", "Sincronización automática con FPS y corrección de cantidades", "INNPACK", 3)
    label(c, "Qué mejora", M, H - 146)
    draw_text(
        c,
        "El módulo deja de depender de revisiones manuales en FPS. Ahora consulta las liberaciones asociadas a cada trabajo y actualiza automáticamente las cantidades operativas.",
        M,
        H - 168,
        W - 2 * M,
        size=10.6,
        leading=15,
    )

    rounded_rect(c, M, 495, W - 2 * M, 145, PALE_BLUE, 12)
    c.setFillColor(NAVY)
    c.setFont("Segoe-Bold", 13)
    c.drawString(M + 20, 615, "Flujo de sincronización")
    steps = [
        ("1", "Sincronizar", "El usuario inicia la consulta desde el módulo."),
        ("2", "Verificar", "QCC cruza NV, ítem y código contra FPS."),
        ("3", "Actualizar", "Se recalculan cantidades e historial sin duplicados."),
    ]
    sx = M + 20
    sw = (W - 2 * M - 40) / 3
    for n, title, desc in steps:
        rounded_rect(c, sx, 518, 28, 28, BLUE, 14)
        c.setFillColor(WHITE)
        c.setFont("Segoe-Bold", 10)
        c.drawCentredString(sx + 14, 527, n)
        c.setFillColor(NAVY)
        c.setFont("Segoe-Bold", 10)
        c.drawString(sx, 575, title)
        draw_text(c, desc, sx, 559, sw - 10, size=8.7, color=MUTED, leading=12)
        sx += sw

    label(c, "Resultados para el usuario", M, 458)
    bullet_list(
        c,
        [
            "La cantidad revisada o entregada se incrementa con las liberaciones nuevas encontradas en FPS.",
            "La cantidad a revisar utiliza el total real de la Orden de Fabricación y la cantidad faltante se recalcula automáticamente.",
            "Cada trabajo muestra Ver historial (N), con folio, fecha y cantidad de cada liberación aplicada.",
            "La sincronización puede repetirse de forma segura: el folio único evita sumar dos veces la misma entrega.",
        ],
        M,
        432,
        W - 2 * M,
        size=9.8,
        gap=7,
    )
    callout(c, "Corrección aplicada", "Se corrigió la fuente de la cantidad a revisar para que coincida con la Orden de Fabricación real, incluyendo el ajuste del caso histórico identificado.", M, 116, W - 2 * M, 80, accent=AMBER, fill=HexColor("#FFF5E5"))
    c.showPage()


def draw_trazabilidad(c):
    header(c, "02", "Trazabilidad", "Un NP, una consulta consolidada de su avance", "QCC", 4)
    label(c, "Objetivo", M, H - 146)
    draw_text(
        c,
        "Permitir que el usuario consulte un NP y reúna en una sola pantalla la información de planificación, procesos, materiales y paletizado.",
        M,
        H - 168,
        W - 2 * M,
        size=10.6,
        leading=15,
    )

    cards = [
        ("NP", "Resumen general", "Cliente, producto, cantidades y estado de los procesos."),
        ("01", "Planificación", "Proceso, máquina, avance, estado y fecha de entrega."),
        ("02", "Materiales", "SKU y descripción del insumo asignado a cada proceso."),
        ("03", "Paletizado", "Pallets y códigos asociados a la NP consultada."),
    ]
    y = 555
    for tag, title, desc in cards:
        rounded_rect(c, M, y, W - 2 * M, 74, WHITE, 10, LINE)
        rounded_rect(c, M + 15, y + 18, 42, 38, NAVY if tag == "NP" else BLUE, 9)
        c.setFillColor(WHITE)
        c.setFont("Segoe-Bold", 10)
        c.drawCentredString(M + 36, y + 31, tag)
        c.setFillColor(NAVY)
        c.setFont("Segoe-Bold", 11)
        c.drawString(M + 72, y + 44, title)
        draw_text(c, desc, M + 72, y + 25, W - 2 * M - 92, size=9.2, color=MUTED, leading=12.5)
        y -= 88

    callout(
        c,
        "Alcance del dato de materiales",
        "Se muestra el material planificado para cada proceso. El sistema no presenta el lote físico exacto consumido, porque ese dato no está registrado actualmente en las fuentes conectadas.",
        M,
        135,
        W - 2 * M,
        94,
        accent=CYAN,
        fill=PALE,
    )
    c.showPage()


def draw_nc(c):
    header(c, "03", "No Conformidades", "Adjuntos de causa raíz y evidencia fotográfica", "INNPACK + FARET", 5)
    label(c, "Nueva capacidad", M, H - 146)
    draw_text(
        c,
        "Las No Conformidades ahora pueden concentrar el respaldo documental de su análisis y seguimiento, tanto al crear el registro como durante su gestión posterior.",
        M,
        H - 168,
        W - 2 * M,
        size=10.6,
        leading=15,
    )

    card_w = (W - 2 * M - 16) / 2
    rounded_rect(c, M, 475, card_w, 160, PALE_BLUE, 12)
    rounded_rect(c, M + card_w + 16, 475, card_w, 160, PALE_BLUE, 12)
    c.setFillColor(BLUE)
    c.circle(M + 34, 600, 17, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Segoe-Bold", 12)
    c.drawCentredString(M + 34, 596, "PDF")
    c.setFillColor(NAVY)
    c.setFont("Segoe-Bold", 12)
    c.drawString(M + 18, 565, "Análisis de causa raíz")
    draw_text(c, "Un archivo PDF de hasta 10 MB. Puede reemplazarse cuando exista una nueva versión.", M + 18, 542, card_w - 36, size=9.4, color=MUTED, leading=13.5)

    x2 = M + card_w + 16
    c.setFillColor(CYAN)
    c.circle(x2 + 34, 600, 17, fill=1, stroke=0)
    c.setFillColor(WHITE)
    c.setFont("Segoe-Bold", 12)
    c.drawCentredString(x2 + 34, 596, "10")
    c.setFillColor(NAVY)
    c.setFont("Segoe-Bold", 12)
    c.drawString(x2 + 18, 565, "Evidencia fotográfica")
    draw_text(c, "Hasta diez fotografías, con un máximo de 5 MB por archivo.", x2 + 18, 542, card_w - 36, size=9.4, color=MUTED, leading=13.5)

    label(c, "Cómo funciona", M, 438)
    bullet_list(
        c,
        [
            "Los archivos pueden seleccionarse directamente en el formulario de una nueva No Conformidad.",
            "También pueden incorporarse, reemplazarse o eliminarse desde Análisis y Plan de Acción.",
            "Si un adjunto falla durante la creación, la No Conformidad permanece guardada y la carga puede reintentarse después.",
            "La experiencia de uso es equivalente en INNPACK y Faret, respetando la arquitectura propia de cada empresa.",
        ],
        M,
        412,
        W - 2 * M,
        size=9.8,
        gap=8,
    )
    callout(c, "Beneficio", "La evidencia y el análisis quedan asociados al mismo registro, facilitando la revisión, la trazabilidad y el cierre documentado de cada caso.", M, 118, W - 2 * M, 80, accent=GREEN, fill=GREEN_PALE)
    c.showPage()


def draw_excel(c):
    header(c, "04", "Exportación a Excel", "Auditoría de columnas en los módulos de ambas empresas", "INNPACK + FARET", 6)
    label(c, "Revisión realizada", M, H - 146)
    draw_text(
        c,
        "Se revisaron los módulos que generan tablas temporales para exportar el histórico completo, verificando que las columnas del archivo coincidan con la información presentada en pantalla.",
        M,
        H - 168,
        W - 2 * M,
        size=10.6,
        leading=15,
    )

    rounded_rect(c, M, 485, W - 2 * M, 138, PALE_BLUE, 12)
    c.setFillColor(NAVY)
    c.setFont("Segoe-Bold", 14)
    c.drawString(M + 22, 592, "Resultado de la auditoría")
    c.setFillColor(GREEN)
    c.setFont("Segoe-Bold", 30)
    c.drawString(M + 22, 535, "11")
    c.setFillColor(MUTED)
    c.setFont("Segoe", 9.5)
    c.drawString(M + 65, 543, "módulos revisados")
    c.setFillColor(BLUE)
    c.setFont("Segoe-Bold", 30)
    c.drawString(M + 250, 535, "1")
    c.setFillColor(MUTED)
    c.setFont("Segoe", 9.5)
    c.drawString(M + 275, 543, "caso real corregido")

    label(c, "Corrección", M, 448)
    draw_text(
        c,
        "En Talleres Externos, la exportación del histórico completo omitía la columna Liberaciones FPS. La tabla de exportación fue actualizada y ahora incluye correctamente este dato.",
        M,
        425,
        W - 2 * M,
        size=10.2,
        leading=15,
    )
    callout(c, "Comportamiento validado", "El resto de los exportadores revisados conserva las columnas correspondientes. El mecanismo general de Excel funciona correctamente.", M, 294, W - 2 * M, 84, accent=GREEN, fill=GREEN_PALE)

    c.setFillColor(NAVY)
    c.setFont("Segoe-Bold", 17)
    c.drawString(M, 245, "Entrega disponible")
    draw_text(
        c,
        "Las mejoras incluidas en este informe fueron incorporadas considerando las solicitudes y observaciones comunicadas por los usuarios. El producto actualizado se encuentra disponible para operación.",
        M,
        220,
        W - 2 * M,
        size=10.4,
        color=MUTED,
        leading=15,
    )
    rounded_rect(c, M, 105, W - 2 * M, 72, NAVY, 12)
    c.setFillColor(CYAN)
    c.setFont("Segoe-Bold", 9)
    c.drawString(M + 20, 150, "VERSIONES PUBLICADAS")
    c.setFillColor(WHITE)
    c.setFont("Segoe-Bold", 18)
    c.drawString(M + 20, 121, "1.8.6  +  1.8.7")
    c.drawRightString(W - M - 20, 121, "27.08.2026")
    c.showPage()


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUTPUT), pagesize=A4)
    c.setTitle("Quality Control Center - Informe de actualizaciones")
    c.setAuthor("Quality Control Center")
    c.setSubject("Resumen profesional de mejoras implementadas en las versiones 1.8.6 y 1.8.7")
    draw_cover(c)
    draw_summary(c)
    draw_talleres(c)
    draw_trazabilidad(c)
    draw_nc(c)
    draw_excel(c)
    c.save()


if __name__ == "__main__":
    build()
