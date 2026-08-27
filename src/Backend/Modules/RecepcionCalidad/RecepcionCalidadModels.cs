using System;
using System.Collections.Generic;

namespace QualityControlCenter.Modules.RecepcionCalidad
{
    // Espejo de RecepcionBobinaDto de apisapfaret (GET /api/recepcion/bobinas).
    public class RecepcionSapItemDto
    {
        public int DocEntry { get; set; }
        public int LineNum { get; set; }
        public string FechaRecepcion { get; set; } = "";
        public string Proveedor { get; set; } = "";
        public string Guia { get; set; } = "";
        public string ItemCode { get; set; } = "";
        public string Descripcion { get; set; } = "";
        public decimal CantidadRecibida { get; set; }
        public decimal? AnchoDeclarado { get; set; }
        public decimal? GramajeDeclarado { get; set; }
    }

    public class RecepcionSapLoteDto
    {
        public string ItemCode { get; set; } = "";
        public string NumeroBobina { get; set; } = "";
        public int AbsEntry { get; set; }
        public string FechaCreacion { get; set; } = "";
    }

    public class LoteControlListItemDto
    {
        public int Id { get; set; }
        public string FechaCreacion { get; set; } = "";
        public string TipoMateriaPrima { get; set; } = "";
        public string Proveedor { get; set; } = "";
        public string ItemCode { get; set; } = "";
        public string Descripcion { get; set; } = "";
        public decimal? CantidadTotalLote { get; set; }
        public string Estado { get; set; } = "";
        public int TotalBobinas { get; set; }
        public int TotalMuestreadas { get; set; }
    }

    public class LoteControlDetalleDto : LoteControlListItemDto
    {
        public string Guia { get; set; } = "";
        public string LoteProveedor { get; set; } = "";
        public decimal? AnchoDeclarado { get; set; }
        public decimal? GramajeDeclarado { get; set; }
        public List<string> Bobinas { get; set; } = new();
        public PlanMuestreoDto? Plan { get; set; }
        public List<BobinaMuestreadaDto> Muestreadas { get; set; } = new();
        public int? MuestraLaboratorioId { get; set; }
        public PvaDto? Pva { get; set; }
        public PliegoFaretDto? PliegoFaret { get; set; }
        public int? NcId { get; set; }
        public string? NcCodigo { get; set; }
    }

    // recepcion_pva - solo lo que le falta al lote generico (proveedor/guia/codigo/lote proveedor
    // ya viven en recepcion_lotes_control, no se duplican aca).
    public class PvaDto
    {
        public string? NombreAdhesivo { get; set; }
        public decimal? CantidadBins { get; set; }
        public string? FechaFabricacionVencimiento { get; set; }
        public string CertificadoCalidad { get; set; } = ""; // Si/No/Pendiente
        public string CondicionGeneral { get; set; } = "";   // Conforme/ConObservacion/NoConforme
        public string? Observacion { get; set; }
        public bool TieneFoto { get; set; }
    }

    // recepcion_pliego_faret - idem, solo lo especifico del tipo.
    public class PliegoFaretDto
    {
        public string? Np { get; set; }
        public string? Cliente { get; set; }
        public string? Producto { get; set; }
        public decimal? CantidadTotal { get; set; }
        public decimal? CantidadVerde { get; set; }
        public decimal? CantidadAzul { get; set; }
        public decimal? CantidadRoja { get; set; }
        public string EstadoCarpeta { get; set; } = "";   // Recibida/Incompleta/NoRecibida
        public string? CondicionVisual { get; set; }
        public string? TipoHallazgo { get; set; }
        public decimal? CantidadAfectada { get; set; }
        public string? Observacion { get; set; }
        public bool TieneFoto { get; set; }
    }

    public class PlanMuestreoDto
    {
        public string Norma { get; set; } = "";
        public int TamanoLote { get; set; }
        public string NivelInspeccion { get; set; } = "";
        public decimal Aql { get; set; }
        public string LetraCodigo { get; set; } = "";
        public int TamanoMuestra { get; set; }
        public int? NumeroAceptacion { get; set; }
        public int? NumeroRechazo { get; set; }
    }

    public class BobinaMuestreadaDto
    {
        public string NumeroBobina { get; set; } = "";
        public string SeleccionTipo { get; set; } = "";
        public string? CriterioManual { get; set; }
        public string Usuario { get; set; } = "";
        public string FechaSeleccion { get; set; } = "";
    }

    public class CrearLoteRequest
    {
        public string TipoMateriaPrima { get; set; } = ""; // Bobina/PVA/PliegoFaret
        public string Empresa { get; set; } = "INNPACK"; // INNPACK/FARET
        public string? Proveedor { get; set; }
        public string? Guia { get; set; }
        public string? ItemCode { get; set; }
        public string? Descripcion { get; set; }
        public string? LoteProveedor { get; set; }
        public decimal? AnchoDeclarado { get; set; }
        public decimal? GramajeDeclarado { get; set; }
        public List<string> Bobinas { get; set; } = new();

        // PVA (solo si TipoMateriaPrima == "PVA")
        public string? PvaNombreAdhesivo { get; set; }
        public decimal? PvaCantidadBins { get; set; }
        public string? PvaFechaFabricacionVencimiento { get; set; }
        public string? PvaCertificadoCalidad { get; set; }
        public string? PvaCondicionGeneral { get; set; }
        public string? PvaObservacion { get; set; }
        public string? PvaFotoBase64 { get; set; }

        // Pliego Faret (solo si TipoMateriaPrima == "PliegoFaret")
        public string? PfNp { get; set; }
        public string? PfCliente { get; set; }
        public string? PfProducto { get; set; }
        public decimal? PfCantidadTotal { get; set; }
        public decimal? PfCantidadVerde { get; set; }
        public decimal? PfCantidadAzul { get; set; }
        public decimal? PfCantidadRoja { get; set; }
        public string? PfEstadoCarpeta { get; set; }
        public string? PfCondicionVisual { get; set; }
        public string? PfTipoHallazgo { get; set; }
        public decimal? PfCantidadAfectada { get; set; }
        public string? PfObservacion { get; set; }
        public string? PfFotoBase64 { get; set; }
    }

    public class GenerarPlanRequest
    {
        public int LoteId { get; set; }
        public string NivelInspeccion { get; set; } = "II";
        public decimal Aql { get; set; } = 2.5m;
    }

    public class BobinaMuestreadaRequest
    {
        public string NumeroBobina { get; set; } = "";
        public string SeleccionTipo { get; set; } = "Manual";
        public string? CriterioManual { get; set; }
    }
}
