// Caso FICTICIO (NP 9999) y pool SQL simulado, compartidos por la vista aislada y tools/entorno_aislado.
// Ningún dato es real: sirve para revisar pantallas, informes y flujos sin conectarse a bases reales.
const filas = {}
function clasificar(t) {
    if (t.includes("OBTQ")) return "inventario"
    if (!t.includes("OPENQUERY")) {
        if (t.includes("SELECT TOP 1 R.*")) return "corridaOriginal"
        if (t.includes("ZZZProcessControlResults")) return "controles"
        if (t.includes("ETIQUETAS_PRODUCCIONES")) return "etiquetas"
        if (t.includes("NotaVentaInnpack = @n OR OrdenTrabajo = @n")) return "resolver"
        return "fps"
    }
    if (t.includes("Faret_Control_Calidad")) return "liberaciones"
    if (t.includes("OIGE")) return "consumos"
    if (t.includes("OIGN")) return "entradas"
    if (t.includes("ORDN") && t.includes("OBTN")) return "loteVentas"
    if (t.includes("OBTN")) return "lote"
    if (t.includes("DLN1")) return "despachos"
    return "notaVenta"
}
// Fila inventada de una corrida: sus columnas no pretenden ser las de FPS.
filas.corridaOriginal = [{ RecordKey: 101, Campo_ficticio_A: "VALOR DE PRUEBA", Campo_ficticio_B: null }]

const crearPool = (opciones = {}) => ({
    request: () => ({
        input() { return this },
        query(t) {
            const clase = clasificar(t)
            if (opciones.falla && (clase === "despachos" || clase === "consumos")) return Promise.reject(new Error("falla simulada de SAP"))
            const r = filas[clase] || []
            return Promise.resolve(Array.isArray(r[0]) ? { recordsets: r, recordset: r[0] } : { recordset: r, recordsets: [r] })
        },
        cancel() {}
    })
})

// ── Caso ficticio: 2 ítems; ítem 1 con factura de reserva y guías, devolución y nota de crédito con reingreso ──
const nv = (LineNum, Item, ItemCode, Descripcion, Cantidad) => ({ DocEntry: 900, DocNum: 9999, CardName: "CLIENTE DE PRUEBA LTDA.", DocDate: "2026-08-13", DocDueDate: "2026-10-30", DocStatus: "O", PerfilInnpack: "P000001", Cancelada: "N", LineNum, Item, ItemCode, Descripcion, Cantidad, CantidadAbierta: 0, Unidad: "UN" })
const doc = (Tipo, DocEntry, BaseType, BaseEntry, BaseLine, Cantidad, extra = {}) => ({ Tipo, DocEntry, DocNum: 50000 + DocEntry, DocDate: "2026-09-20", LineNum: 0, BaseType, BaseEntry, BaseLine, ItemCode: "4596000000001", Cantidad, Reserva: "N", RepusoStock: 0, TieneAdjunto: 1, ...extra })
const proc = (IdProceso, NombreProceso) => ({ IdProceso, OrdenTrabajo: 30001, NombreCarpeta: NombreProceso, NombreProceso, Categoria: NombreProceso, NrPl: "1", ItemCode: "SEMI-1", ItemName: `${NombreProceso} PLIEGO`, UnidadMedida: "UN", CantidadTotal: 13000 })
const ses = (RecordKey, IdProceso, Maquina, Operador, ProductionQuantity, hora) => ({ RecordKey, IdProceso, Maquina, Operador, Status: 1, ProductionQuantity, SetupQuantity: 40, SetupStartDate: `2026-09-0${(RecordKey % 8) + 1} ${hora}:00:00`, ProductionStartDate: `2026-09-0${(RecordKey % 8) + 1} ${hora}:30:00`, ProductionEndDate: `2026-09-0${(RecordKey % 8) + 1} ${hora}:59:00` })
Object.assign(filas, {
    resolver: [{ NotaVentaInnpack: 9999, OrdenTrabajo: 30001 }],
    fps: [[{ OrdenTrabajo: 30001, NotaVentaFaret: 30001, NotaVentaInnpack: 9999, Cliente: "CLIENTE DE PRUEBA LTDA.", FechaIngreso: "2026-08-14", GuiaTecnica: "GT 15 rev. ficticia" }],
        [proc(1, "IMPRESION"), proc(2, "TROQUELADO"), proc(3, "PEGADO")],
        [ses(101, 1, "HEIDELBERG 1", "OPERADOR UNO", 12600, "08"), ses(102, 2, "IBERICA 2", "OPERADOR DOS", 6100, "16"), ses(103, 2, "IBERICA 2", "OPERADOR TRES", 6200, "23"), ses(104, 3, "BOBST", "OPERADOR CUATRO", 98000, "09")]],
    notaVenta: [nv(0, 1, "4596000000001", "ESTUCHE DE PRUEBA 2,5 KG", 100000), nv(1, 2, "4596000000002", "BANDEJA DE PRUEBA", 5000)],
    despachos: [doc("FACTURA", 1, 17, 900, 0, 60000, { Reserva: "Y" }), doc("GUIA", 2, 13, 1, 0, 40000), doc("GUIA", 3, 17, 900, 0, 20000), doc("DEVOLUCION", 4, 15, 3, 0, 1000),
        doc("FACTURA", 5, 15, 3, 0, 20000), doc("NOTA_CREDITO", 6, 13, 5, 0, 500, { RepusoStock: 1 })],
    liberaciones: [{ Folio: 7001, Item: 1, ItemCode: "4596000000001", Descripcion: "ESTUCHE", Fecha: "2026-09-18 10:00:00", Cantidad: 70000, BodegaOrigen: "CONTROL DE CALIDAD", BodegaDestino: "PRODUCTOS TERMINADOS", Maquina: "BOBST", Operador: "OPERADOR CUATRO", Inspector: "INSPECTOR", TipoAdhe1: "PVA 3885", LoteAdhe1: "5445-1", TipoAdhe2: "N/A", LoteAdhe2: "N/A", TipoPegado: "LATERAL", Embalaje: "CAJA 40X30", Bultos: 140 },
        { Folio: 7002, Item: 1, ItemCode: "4596000000001", Descripcion: "ESTUCHE", Fecha: "2026-09-19 11:00:00", Cantidad: 800, BodegaOrigen: "CONTROL DE CALIDAD", BodegaDestino: "CUARENTENA", Inspector: "INSPECTOR", TipoAdhe1: "N/A", LoteAdhe1: "N/A" }],
    consumos: [{ Base: "FARET", DocEntry: 11, DocNum: 88001, DocDate: "2026-09-01", LineNum: 0, OrdenTrabajo: "30001", ItemCode: "MP-CART-1", Descripcion: "CARTULINA DE PRUEBA 300 G", Cantidad: 13500, Devuelto: 300, Unidad: "PL", Bodega: "BMP", Lote: "5433-1", SerieFabricante: "SF-1", LoteProveedor: "LP-9", IngresoLote: "2026-08-20", CantidadLote: -13500, OrigenTipo: 20, OrigenDocEntry: 555, OrigenDocNum: 6001, OrigenFecha: "2026-08-20", OrigenCodigo: "P1", OrigenNombre: "PROVEEDOR DE PRUEBA" }],
    entradas: [], controles: [], etiquetas: [{ RecordKey: 104, Etiquetas: 24 }],
    inventario: [{ Tipo: "SALIDA", ItemCode: "4596000000001", Saldo: 58500 }, { Tipo: "SALDO", ItemCode: "4596000000001", Bodega: "BPT", Saldo: 9500, Lotes: 2 }]
})

module.exports = { crearPool }
