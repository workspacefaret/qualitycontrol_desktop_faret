using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Modules.Trazabilidad;
using QualityControlCenter.Services;

namespace QualityControlCenter.Repositories.Trazabilidad
{
    public class TrazabilidadRepository
    {
        private readonly DbService _db;

        public TrazabilidadRepository(DbService db)
        {
            _db = db;
        }

        // registro_paletizado.palets: NP puede venir como np_cliente (del cliente) o como
        // nota_venta_innpack (NV Innpack) — se busca por cualquiera de las dos, igual que el
        // propio LogisticControlCenter (PaletizadoRepository.ObtenerPalets) filtra por np_cliente.
        public async Task<List<PaletTrazabilidadDto>> ObtenerPaletizadoPorNp(string np)
        {
            var resultado = new List<PaletTrazabilidadDto>();

            using var conn = _db.GetRegistroPaletizadoConnection();
            await conn.OpenAsync();

            const string sql =
                @"SELECT
                    p.id_palet,
                    p.fecha_registro,
                    p.planta_produccion,
                    p.np_cliente,
                    p.nota_venta_innpack,
                    p.nombre_cliente,
                    p.taller_paletizado,
                    p.tipo_palet,
                    p.cantidad,
                    COALESCE(p.descripcion_sap, p.descripcion) AS descripcion,
                    p.fecha_impresion
                FROM palets p
                WHERE p.np_cliente = @np OR p.nota_venta_innpack = @np
                ORDER BY p.fecha_registro DESC";

            using var cmd = new MySqlCommand(sql, conn);
            cmd.Parameters.AddWithValue("@np", np);

            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                resultado.Add(
                    new PaletTrazabilidadDto
                    {
                        IdPalet = reader["id_palet"]?.ToString() ?? "",
                        Fecha = reader["fecha_registro"] != DBNull.Value
                            ? Convert.ToDateTime(reader["fecha_registro"])
                            : (DateTime?)null,
                        Planta = reader["planta_produccion"]?.ToString() ?? "",
                        NpCliente = reader["np_cliente"]?.ToString() ?? "",
                        NotaVentaInnpack = reader["nota_venta_innpack"]?.ToString() ?? "",
                        NombreCliente = reader["nombre_cliente"]?.ToString() ?? "",
                        Taller = reader["taller_paletizado"]?.ToString() ?? "",
                        Tipo = reader["tipo_palet"]?.ToString() ?? "",
                        Cantidad = reader["cantidad"] != DBNull.Value
                            ? Convert.ToDecimal(reader["cantidad"])
                            : 0,
                        Descripcion = reader["descripcion"]?.ToString() ?? "",
                        FechaImpresion = reader["fecha_impresion"]?.ToString(),
                    }
                );
            }

            return resultado;
        }
    }
}
