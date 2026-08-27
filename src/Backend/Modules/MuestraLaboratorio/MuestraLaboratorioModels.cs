using System;
using System.Collections.Generic;

namespace QualityControlCenter.Modules.MuestraLaboratorio
{
    public class MuestraListItemDto
    {
        public int Id { get; set; }
        public string FechaIngreso { get; set; } = "";
        public string Origen { get; set; } = "";
        public string TipoMuestra { get; set; } = "";
        public string Np { get; set; } = "";
        public string Cliente { get; set; } = "";
        public string CodigoProducto { get; set; } = "";
        public string Descripcion { get; set; } = "";
        public string Estado { get; set; } = "";
        public string Evaluacion { get; set; } = "";
        public int TotalEnsayos { get; set; }
    }

    public class MuestraDetalleDto : MuestraListItemDto
    {
        public string? FechaEnsayo { get; set; }
        public string AnalistaNombre { get; set; } = "";
        public string Maquina { get; set; } = "";
        public string Turno { get; set; } = "";
        public string Lote { get; set; } = "";
        public string Proveedor { get; set; } = "";
        public string Observacion { get; set; } = "";
        public int? NcId { get; set; }
        public string? NcCodigo { get; set; }
        public List<EnsayoDto> Ensayos { get; set; } = new();
    }

    public class EnsayoDto
    {
        public int Id { get; set; }
        public int MuestraId { get; set; }
        public string TipoEnsayo { get; set; } = "";
        public string Metodo { get; set; } = "";
        public string AnalistaNombre { get; set; } = "";
        public string Fecha { get; set; } = "";
        public string Estado { get; set; } = "";
        public decimal? ResultadoValor { get; set; }
        public string? ResultadoUnidad { get; set; }
        public decimal? EspecificacionMin { get; set; }
        public decimal? EspecificacionMax { get; set; }
        public string? EspecificacionUnidad { get; set; }
        public string Cumplimiento { get; set; } = "";
        public string Observacion { get; set; } = "";
        public string? MotivoAnulacion { get; set; }
        public int? EnsayoReemplazaId { get; set; }
        public string? MotivoReemplazo { get; set; }
        public object? Detalle { get; set; }
    }

    public class CrearMuestraRequest
    {
        public string Origen { get; set; } = "";
        public string TipoMuestra { get; set; } = "";
        public string? Np { get; set; }
        public string? Cliente { get; set; }
        public string? CodigoProducto { get; set; }
        public string? Descripcion { get; set; }
        public string? Maquina { get; set; }
        public string? Turno { get; set; }
        public string? Lote { get; set; }
        public string? Proveedor { get; set; }
        public string? Observacion { get; set; }
        public string? FechaEnsayo { get; set; }
    }

    public class EnsayoBaseRequest
    {
        public int MuestraId { get; set; }
        public string? Metodo { get; set; }
        public int? AnalistaUsuarioId { get; set; }
        public string? AnalistaNombre { get; set; }
        public string? Observacion { get; set; }
    }

    public class HumedadGuardarRequest : EnsayoBaseRequest
    {
        public string MetodoEquipo { get; set; } = ""; // Higrometro/Termobalanza/Horno
        public decimal? HigrometroIzquierdo { get; set; }
        public decimal? HigrometroCentro { get; set; }
        public decimal? HigrometroDerecho { get; set; }
        public decimal? TermobalanzaValor { get; set; }
        public decimal? Horno1PesoInicial { get; set; }
        public decimal? Horno1PesoFinal { get; set; }
        public decimal? Horno2PesoInicial { get; set; }
        public decimal? Horno2PesoFinal { get; set; }
        public decimal? Horno3PesoInicial { get; set; }
        public decimal? Horno3PesoFinal { get; set; }
    }

    public class GramajeGuardarRequest : EnsayoBaseRequest
    {
        public string TipoMaterial { get; set; } = ""; // Papel/Cartulina/Pliego/ComplejoCorrugado
        public string Modalidad { get; set; } = ""; // ProbetaPeso/Directo
        public decimal? Muestra1 { get; set; }
        public decimal? Muestra2 { get; set; }
        public decimal? Muestra3 { get; set; }
    }

    public class CobbProbetaRequest
    {
        public string? Bobina { get; set; }
        public string? Cara { get; set; } // Externa/Interna
        public decimal? PesoInicial { get; set; }
        public decimal? PesoFinal { get; set; }
        public string? Tiempo { get; set; }
    }

    public class CobbGuardarRequest : EnsayoBaseRequest
    {
        public CobbProbetaRequest? P1 { get; set; }
        public CobbProbetaRequest? P2 { get; set; }
        public CobbProbetaRequest? P3 { get; set; }
    }

    public class EspesorGuardarRequest : EnsayoBaseRequest
    {
        public string TipoMedicion { get; set; } = ""; // Ubicacion/Muestra
        public decimal? Medicion1 { get; set; }
        public decimal? Medicion2 { get; set; }
        public decimal? Medicion3 { get; set; }
    }

    public class ResistenciaProbetaRequest
    {
        public string? Bobina { get; set; }
        public decimal? Force { get; set; }
        public decimal? Strength { get; set; }
    }

    // Sirve para RCT (Componente=Liner/Onda) y FCT (Componente=null) - ver TipoEnsayo en el
    // handler, que decide cual de los dos se esta guardando.
    public class ResistenciaGuardarRequest : EnsayoBaseRequest
    {
        public string? Componente { get; set; } // Liner/Onda, solo RCT
        public string? StrengthUnidad { get; set; }
        public ResistenciaProbetaRequest? P1 { get; set; }
        public ResistenciaProbetaRequest? P2 { get; set; }
        public ResistenciaProbetaRequest? P3 { get; set; }
    }

    public class EctGuardarRequest : EnsayoBaseRequest
    {
        public decimal? P1Force { get; set; }
        public decimal? P2Force { get; set; }
        public decimal? P3Force { get; set; }
        public decimal? P4Force { get; set; }
        public decimal? P5Force { get; set; }
    }

    public class BctCajaRequest
    {
        public decimal? Largo { get; set; }
        public decimal? Ancho { get; set; }
        public decimal? Alto { get; set; }
        public string? TipoOnda { get; set; }
        public decimal? GramajeComplejo { get; set; }
        public decimal? EspesorComplejo { get; set; }
        public decimal? ResultadoLbf { get; set; }
    }

    public class BctMedidoGuardarRequest : EnsayoBaseRequest
    {
        public int CajasEnsayadas { get; set; }
        public string? MotivoMenos3 { get; set; }
        public BctCajaRequest? C1 { get; set; }
        public BctCajaRequest? C2 { get; set; }
        public BctCajaRequest? C3 { get; set; }
    }

    public class BctTeoricoGuardarRequest : EnsayoBaseRequest
    {
        public int EctEnsayoId { get; set; }
        public int EspesorEnsayoId { get; set; }
        public decimal LargoMm { get; set; }
        public decimal AnchoMm { get; set; }
    }

    public class ViscosidadGuardarRequest : EnsayoBaseRequest
    {
        public string? TipoAdhesivo { get; set; }
        public decimal? Temperatura { get; set; }
        public string? Equipo { get; set; }
        public string? Husillo { get; set; }
        public decimal? VelocidadRpm { get; set; }
        public decimal? ResultadoCp { get; set; }
    }

    public class PhGuardarRequest : EnsayoBaseRequest
    {
        public string ValorTexto { get; set; } = "";
        public string? ColorObservado { get; set; }
    }

    public class SolidosDeterminacionRequest
    {
        public decimal? M1 { get; set; }
        public decimal? M2 { get; set; }
        public decimal? M3 { get; set; }
    }

    public class SolidosGuardarRequest : EnsayoBaseRequest
    {
        public SolidosDeterminacionRequest? D1 { get; set; }
        public SolidosDeterminacionRequest? D2 { get; set; }
        public SolidosDeterminacionRequest? D3 { get; set; }
    }

    // Lugol es categorico: el Cumplimiento lo decide el analista (Cumple/No cumple/Sin
    // especificacion), no se calcula contra una especificacion numerica como el resto.
    public class LugolGuardarRequest : EnsayoBaseRequest
    {
        public string? PuntoMuestra { get; set; }
        public string? Coloracion { get; set; }
        public string Resultado { get; set; } = ""; // Positivo/Negativo/NoConcluyente
        public string? Interpretacion { get; set; }
        public string Cumplimiento { get; set; } = "Sin especificacion";
    }

    public class EspecificacionDto
    {
        public int Id { get; set; }
        public string TipoMuestra { get; set; } = "";
        public string TipoEnsayo { get; set; } = "";
        public string? CodigoProducto { get; set; }
        public decimal? LimiteMin { get; set; }
        public decimal? LimiteMax { get; set; }
        public string? Unidad { get; set; }
        public bool Activo { get; set; }
    }

    public class GuardarEspecificacionRequest
    {
        public int? Id { get; set; } // null = crear nueva
        public string TipoMuestra { get; set; } = "";
        public string TipoEnsayo { get; set; } = "";
        public string? CodigoProducto { get; set; }
        public decimal? LimiteMin { get; set; }
        public decimal? LimiteMax { get; set; }
        public string? Unidad { get; set; }
    }
}
