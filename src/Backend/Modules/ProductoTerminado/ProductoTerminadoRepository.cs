using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using MySqlConnector;
using QualityControlCenter.Services;

namespace QualityControlCenter.Modules.ProductoTerminado
{
    public class ProductoTerminadoRepository
    {
        // procesos.id reales (tabla `procesos`, confirmado contra la BD: Pegado=4, Termoformado=5)
        // usados para escopar los catálogos de defectos/orígenes — registros_producto_terminado.
        // proceso_pt es un ENUM('Termoformado','Pegado') propio, no una FK a `procesos`.
        private const int ProcesoIdPegado = 4;
        private const int ProcesoIdTermoformado = 5;

        private readonly DbService _db;

        public ProductoTerminadoRepository(DbService db)
        {
            _db = db;
        }

        private static (string WhereSql, List<MySqlParameter> Parameters) BuildWhere(
            ProductoTerminadoFiltroParams f
        )
        {
            var where = new List<string> { "1 = 1", "rpt.eliminado = 0" };
            var pars = new List<MySqlParameter>();

            // Scope por empresa (columna nullable — registros de antes de que Flutter agregara esta
            // pregunta quedaron con empresa=NULL). Decisión explícita del usuario: esos registros
            // históricos se muestran como INNPACK, nunca en Faret, para no hacerlos desaparecer.
            if (f.Empresa == "INNPACK")
            {
                where.Add("(rpt.empresa = @empresa OR rpt.empresa IS NULL)");
                pars.Add(new MySqlParameter("@empresa", "INNPACK"));
            }
            else if (f.Empresa == "FARET")
            {
                where.Add("rpt.empresa = @empresa");
                pars.Add(new MySqlParameter("@empresa", "FARET"));
            }

            if (!string.IsNullOrWhiteSpace(f.FechaDesde))
            {
                where.Add("rpt.fecha_registro >= @fechaDesde");
                pars.Add(new MySqlParameter("@fechaDesde", f.FechaDesde));
            }

            if (!string.IsNullOrWhiteSpace(f.FechaHasta))
            {
                where.Add("rpt.fecha_registro <= @fechaHasta");
                pars.Add(new MySqlParameter("@fechaHasta", f.FechaHasta));
            }

            if (!string.IsNullOrWhiteSpace(f.Np))
            {
                where.Add("rpt.np LIKE @np");
                pars.Add(new MySqlParameter("@np", $"%{f.Np}%"));
            }

            if (!string.IsNullOrWhiteSpace(f.CodigoProducto))
            {
                where.Add("rpt.codigo_producto LIKE @codigoProducto");
                pars.Add(new MySqlParameter("@codigoProducto", $"%{f.CodigoProducto}%"));
            }

            if (!string.IsNullOrWhiteSpace(f.Proceso))
            {
                where.Add("rpt.proceso_pt = @proceso");
                pars.Add(new MySqlParameter("@proceso", f.Proceso));
            }

            if (!string.IsNullOrWhiteSpace(f.Maquina))
            {
                where.Add("rpt.maquina = @maquina");
                pars.Add(new MySqlParameter("@maquina", f.Maquina));
            }

            if (!string.IsNullOrWhiteSpace(f.Turno))
            {
                where.Add("rpt.turno = @turno");
                pars.Add(new MySqlParameter("@turno", f.Turno));
            }

            if (f.InspectorId.HasValue)
            {
                where.Add("rpt.usuario_id = @inspectorId");
                pars.Add(new MySqlParameter("@inspectorId", f.InspectorId.Value));
            }

            if (!string.IsNullOrWhiteSpace(f.Resultado))
            {
                where.Add("rpt.resultado = @resultado");
                pars.Add(new MySqlParameter("@resultado", f.Resultado));
            }

            if (f.OrigenId.HasValue)
            {
                where.Add(
                    "EXISTS (SELECT 1 FROM registro_pt_hallazgos h2 WHERE h2.registro_id = rpt.id AND h2.origen_id = @origenId)"
                );
                pars.Add(new MySqlParameter("@origenId", f.OrigenId.Value));
            }

            return ("WHERE " + string.Join(" AND ", where), pars);
        }

        private static MySqlCommand BuildCommand(
            MySqlConnection conn,
            string sql,
            List<MySqlParameter> pars
        )
        {
            var cmd = new MySqlCommand(sql, conn);

            foreach (var p in pars)
            {
                // Un MySqlParameter no se puede reutilizar en dos comandos (queda "owned" por el
                // primero) — se clona por cada query nueva que reutiliza el mismo WHERE.
                cmd.Parameters.Add(new MySqlParameter(p.ParameterName, p.Value));
            }

            return cmd;
        }

        public async Task<ProductoTerminadoFiltrosDto> ObtenerFiltros(string empresa)
        {
            var result = new ProductoTerminadoFiltrosDto();

            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var empresaWhere =
                empresa == "FARET" ? "AND empresa = 'FARET'" : "AND (empresa = 'INNPACK' OR empresa IS NULL)";

            await using (
                var cmd = new MySqlCommand(
                    $@"
                    SELECT DISTINCT maquina
                    FROM registros_producto_terminado
                    WHERE maquina IS NOT NULL AND TRIM(maquina) <> ''
                      AND eliminado = 0
                    {empresaWhere}
                    ORDER BY maquina
                    ",
                    conn
                )
            )
            {
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    result.Maquinas.Add(Text(reader, "maquina"));
                }
            }

            await using (
                var cmd = new MySqlCommand(
                    @"
                    SELECT id, nombre_completo
                    FROM usuarios
                    WHERE activo = 1
                    ORDER BY nombre_completo
                    ",
                    conn
                )
            )
            {
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    result.Inspectores.Add(
                        new ProductoTerminadoCatalogoDto
                        {
                            Id = Int(reader, "id"),
                            Nombre = Text(reader, "nombre_completo"),
                        }
                    );
                }
            }

            await using (
                var cmd = new MySqlCommand(
                    @"
                    SELECT id, nombre
                    FROM parametros_control_visual
                    WHERE proceso_id IN (@pegado, @termoformado)
                    ORDER BY nombre
                    ",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@pegado", ProcesoIdPegado);
                cmd.Parameters.AddWithValue("@termoformado", ProcesoIdTermoformado);

                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    result.Defectos.Add(
                        new ProductoTerminadoCatalogoDto
                        {
                            Id = Int(reader, "id"),
                            Nombre = Text(reader, "nombre"),
                        }
                    );
                }
            }

            await using (
                var cmd = new MySqlCommand(
                    @"
                    SELECT id, nombre
                    FROM origenes_problema
                    WHERE proceso_id IN (@pegado, @termoformado)
                    ORDER BY nombre
                    ",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@pegado", ProcesoIdPegado);
                cmd.Parameters.AddWithValue("@termoformado", ProcesoIdTermoformado);

                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    result.Origenes.Add(
                        new ProductoTerminadoCatalogoDto
                        {
                            Id = Int(reader, "id"),
                            Nombre = Text(reader, "nombre"),
                        }
                    );
                }
            }

            return result;
        }

        public async Task<ProductoTerminadoResumenDto> ObtenerResumen(ProductoTerminadoFiltroParams f)
        {
            var result = new ProductoTerminadoResumenDto();

            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var (whereSql, pars) = BuildWhere(f);

            // KPIs: una sola fila agregada directo sobre registros_producto_terminado — unidades_nc
            // y defectos_totales ya vienen precalculados por Flutter/API en la cabecera, así que un
            // SUM acá no corre riesgo de inflarse por ningún JOIN (no hay JOIN en esta query).
            await using (
                var cmd = BuildCommand(
                    conn,
                    $@"
                    SELECT
                        COUNT(*) AS total,
                        SUM(CASE WHEN rpt.resultado = 'CONFORME' THEN 1 ELSE 0 END) AS conformes,
                        SUM(CASE WHEN rpt.resultado = 'NO CONFORME' THEN 1 ELSE 0 END) AS no_conformes,
                        IFNULL(SUM(rpt.unidades_nc), 0) AS unidades_nc,
                        IFNULL(SUM(rpt.defectos_totales), 0) AS defectos_totales
                    FROM registros_producto_terminado rpt
                    {whereSql};
                    ",
                    pars
                )
            )
            {
                await using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    var total = Int(reader, "total");
                    var conformes = Int(reader, "conformes");
                    var noConformes = Int(reader, "no_conformes");

                    result.TotalInspecciones = total;
                    result.PorcentajeConformes = CalcularPorcentaje(conformes, total);
                    result.PorcentajeNoConformes = CalcularPorcentaje(noConformes, total);
                    result.UnidadesNoConformes = Int(reader, "unidades_nc");
                    result.DefectosRegistrados = Int(reader, "defectos_totales");
                }
            }

            // Pareto de defectos: cada fila de registro_pt_hallazgo_defectos es UNA ocurrencia de un
            // defecto — esta query es independiente de la de KPIs, así que no infla nada de arriba.
            await using (
                var cmd = BuildCommand(
                    conn,
                    $@"
                    SELECT pcv.nombre AS defecto, COUNT(*) AS cantidad
                    FROM registro_pt_hallazgo_defectos hd
                    INNER JOIN registro_pt_hallazgos h ON h.id = hd.hallazgo_id
                    INNER JOIN registros_producto_terminado rpt ON rpt.id = h.registro_id
                    INNER JOIN parametros_control_visual pcv ON pcv.id = hd.defecto_id
                    {whereSql}
                    GROUP BY pcv.id, pcv.nombre
                    ORDER BY cantidad DESC;
                    ",
                    pars
                )
            )
            {
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    result.ParetoDefectos.Add(
                        new ProductoTerminadoParetoItemDto
                        {
                            Defecto = Text(reader, "defecto"),
                            Cantidad = Int(reader, "cantidad"),
                        }
                    );
                }
            }

            // NC por origen: cada fila de registro_pt_hallazgos = una unidad no conforme (1
            // hallazgo = 1 unidad, por definición de negocio) — se cuenta el hallazgo, no el defecto.
            await using (
                var cmd = BuildCommand(
                    conn,
                    $@"
                    SELECT op.nombre AS origen, COUNT(*) AS cantidad
                    FROM registro_pt_hallazgos h
                    INNER JOIN registros_producto_terminado rpt ON rpt.id = h.registro_id
                    INNER JOIN origenes_problema op ON op.id = h.origen_id
                    {whereSql}
                    GROUP BY op.id, op.nombre
                    ORDER BY cantidad DESC;
                    ",
                    pars
                )
            )
            {
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    result.NcPorOrigen.Add(
                        new ProductoTerminadoOrigenItemDto
                        {
                            Origen = Text(reader, "origen"),
                            Cantidad = Int(reader, "cantidad"),
                        }
                    );
                }
            }

            // Tendencia: agregada directo sobre la cabecera (sin JOIN), por fecha de registro.
            await using (
                var cmd = BuildCommand(
                    conn,
                    $@"
                    SELECT
                        rpt.fecha_registro AS fecha,
                        COUNT(*) AS inspecciones,
                        SUM(CASE WHEN rpt.resultado = 'NO CONFORME' THEN 1 ELSE 0 END) AS no_conformes
                    FROM registros_producto_terminado rpt
                    {whereSql}
                    GROUP BY rpt.fecha_registro
                    ORDER BY rpt.fecha_registro ASC;
                    ",
                    pars
                )
            )
            {
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    result.Tendencia.Add(
                        new ProductoTerminadoTendenciaItemDto
                        {
                            Fecha = Convert.ToDateTime(reader["fecha"]).ToString("dd-MM-yyyy"),
                            Inspecciones = Int(reader, "inspecciones"),
                            NoConformes = Int(reader, "no_conformes"),
                        }
                    );
                }
            }

            // Comparación Termoformado vs Pegado: agregada directo sobre la cabecera (sin JOIN).
            await using (
                var cmd = BuildCommand(
                    conn,
                    $@"
                    SELECT
                        rpt.proceso_pt AS proceso,
                        COUNT(*) AS inspecciones,
                        IFNULL(SUM(rpt.unidades_nc), 0) AS unidades_nc,
                        SUM(CASE WHEN rpt.resultado = 'NO CONFORME' THEN 1 ELSE 0 END) AS no_conformes
                    FROM registros_producto_terminado rpt
                    {whereSql}
                    GROUP BY rpt.proceso_pt;
                    ",
                    pars
                )
            )
            {
                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var inspecciones = Int(reader, "inspecciones");
                    var noConformes = Int(reader, "no_conformes");

                    result.ComparacionProcesos.Add(
                        new ProductoTerminadoComparacionItemDto
                        {
                            Proceso = Text(reader, "proceso"),
                            Inspecciones = inspecciones,
                            UnidadesNc = Int(reader, "unidades_nc"),
                            PorcentajeNc = CalcularPorcentaje(noConformes, inspecciones),
                        }
                    );
                }
            }

            return result;
        }

        public async Task<(List<ProductoTerminadoItemDto> Items, int Total)> ObtenerRegistros(
            ProductoTerminadoFiltroParams f,
            int page,
            int limit
        )
        {
            var items = new List<ProductoTerminadoItemDto>();
            var offset = (page - 1) * limit;

            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var (whereSql, pars) = BuildWhere(f);

            int total;
            await using (
                var countCmd = BuildCommand(
                    conn,
                    $@"
                    SELECT COUNT(*)
                    FROM registros_producto_terminado rpt
                    {whereSql};
                    ",
                    pars
                )
            )
            {
                total = Convert.ToInt32(await countCmd.ExecuteScalarAsync() ?? 0);
            }

            await using (
                var cmd = BuildCommand(
                    conn,
                    $@"
                    SELECT
                        rpt.id,
                        DATE_FORMAT(rpt.fecha_registro, '%d-%m-%Y') AS fecha_registro,
                        TIME_FORMAT(rpt.hora_registro, '%H:%i') AS hora_registro,
                        IFNULL(u.nombre_completo, '-') AS inspector,
                        IFNULL(rpt.np, '-') AS np,
                        IFNULL(rpt.cliente, '-') AS cliente,
                        IFNULL(rpt.codigo_producto, '-') AS codigo_producto,
                        IFNULL(rpt.descripcion_producto, '-') AS descripcion_producto,
                        rpt.proceso_pt AS proceso,
                        rpt.cantidad_lote,
                        IFNULL(rpt.maquina, '-') AS maquina,
                        rpt.turno,
                        rpt.resultado
                    FROM registros_producto_terminado rpt
                    LEFT JOIN usuarios u ON u.id = rpt.usuario_id
                    {whereSql}
                    ORDER BY rpt.id DESC
                    LIMIT @limit OFFSET @offset;
                    ",
                    pars
                )
            )
            {
                cmd.Parameters.AddWithValue("@limit", limit);
                cmd.Parameters.AddWithValue("@offset", offset);

                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    items.Add(
                        new ProductoTerminadoItemDto
                        {
                            Id = Int(reader, "id"),
                            FechaRegistro = Text(reader, "fecha_registro"),
                            HoraRegistro = Text(reader, "hora_registro"),
                            Inspector = Text(reader, "inspector"),
                            Np = Text(reader, "np"),
                            Cliente = Text(reader, "cliente"),
                            CodigoProducto = Text(reader, "codigo_producto"),
                            DescripcionProducto = Text(reader, "descripcion_producto"),
                            Proceso = Text(reader, "proceso"),
                            CantidadLote = Int(reader, "cantidad_lote"),
                            Maquina = Text(reader, "maquina"),
                            Turno = Text(reader, "turno"),
                            Resultado = Text(reader, "resultado"),
                        }
                    );
                }
            }

            return (items, total);
        }

        public async Task<ProductoTerminadoDetalleDto?> ObtenerDetalle(int id, string empresa)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            ProductoTerminadoDetalleDto? detalle = null;

            // Mismo scope por empresa que las listas — si el id existe pero es de la otra empresa,
            // esto devuelve null (mismo comportamiento que "no encontrado"), evitando que un enlace
            // directo por id cruce datos entre INNPACK y Faret.
            var empresaWhere =
                empresa == "FARET" ? "AND rpt.empresa = 'FARET'" : "AND (rpt.empresa = 'INNPACK' OR rpt.empresa IS NULL)";

            await using (
                var cmd = new MySqlCommand(
                    $@"
                    SELECT
                        rpt.id,
                        DATE_FORMAT(rpt.fecha_registro, '%d-%m-%Y') AS fecha_registro,
                        TIME_FORMAT(rpt.hora_registro, '%H:%i') AS hora_registro,
                        IFNULL(u.nombre_completo, '-') AS inspector,
                        IFNULL(rpt.np, '-') AS np,
                        IFNULL(rpt.cliente, '-') AS cliente,
                        IFNULL(rpt.codigo_producto, '-') AS codigo_producto,
                        IFNULL(rpt.descripcion_producto, '-') AS descripcion_producto,
                        rpt.proceso_pt AS proceso,
                        rpt.cantidad_lote,
                        IFNULL(rpt.cantidad_pallets, 0) AS cantidad_pallets,
                        IFNULL(rpt.cantidad_cajas_bins, 0) AS cantidad_cajas_bins,
                        IFNULL(rpt.maquina, '-') AS maquina,
                        rpt.turno,
                        rpt.nivel_inspeccion,
                        rpt.aql,
                        rpt.letra_codigo,
                        rpt.tamano_muestra,
                        rpt.ac,
                        rpt.re,
                        rpt.inspeccion_100,
                        rpt.unidades_nc,
                        rpt.defectos_totales,
                        rpt.resultado
                    FROM registros_producto_terminado rpt
                    LEFT JOIN usuarios u ON u.id = rpt.usuario_id
                    WHERE rpt.id = @id
                      AND rpt.eliminado = 0
                    {empresaWhere};
                    ",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", id);

                await using var reader = await cmd.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    detalle = new ProductoTerminadoDetalleDto
                    {
                        Id = Int(reader, "id"),
                        FechaRegistro = Text(reader, "fecha_registro"),
                        HoraRegistro = Text(reader, "hora_registro"),
                        Inspector = Text(reader, "inspector"),
                        Np = Text(reader, "np"),
                        Cliente = Text(reader, "cliente"),
                        CodigoProducto = Text(reader, "codigo_producto"),
                        DescripcionProducto = Text(reader, "descripcion_producto"),
                        Proceso = Text(reader, "proceso"),
                        CantidadLote = Int(reader, "cantidad_lote"),
                        CantidadPallets = Int(reader, "cantidad_pallets"),
                        CantidadCajasBins = Int(reader, "cantidad_cajas_bins"),
                        Maquina = Text(reader, "maquina"),
                        Turno = Text(reader, "turno"),
                        NivelInspeccion = Text(reader, "nivel_inspeccion"),
                        Aql = reader["aql"] == DBNull.Value ? 0 : Convert.ToDecimal(reader["aql"]),
                        LetraCodigo = Text(reader, "letra_codigo"),
                        TamanoMuestra = Int(reader, "tamano_muestra"),
                        Ac = reader["ac"] == DBNull.Value ? null : Int(reader, "ac"),
                        Re = reader["re"] == DBNull.Value ? null : Int(reader, "re"),
                        Inspeccion100 = Convert.ToBoolean(reader["inspeccion_100"]),
                        UnidadesNoConformes = Int(reader, "unidades_nc"),
                        DefectosTotales = Int(reader, "defectos_totales"),
                        Resultado = Text(reader, "resultado"),
                    };
                }
            }

            if (detalle == null)
                return null;

            await using (
                var cmd = new MySqlCommand(
                    @"
                    SELECT pallet_id
                    FROM registro_pt_pallets
                    WHERE registro_id = @id
                    ORDER BY id;
                    ",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", id);

                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    detalle.Pallets.Add(Text(reader, "pallet_id"));
                }
            }

            var hallazgosPorId = new Dictionary<int, ProductoTerminadoHallazgoDto>();

            await using (
                var cmd = new MySqlCommand(
                    @"
                    SELECT
                        h.id,
                        h.correlativo,
                        IFNULL(op.nombre, '-') AS origen,
                        IFNULL(h.observacion, '') AS observacion,
                        IFNULL(h.foto_ruta, '') AS foto_ruta
                    FROM registro_pt_hallazgos h
                    LEFT JOIN origenes_problema op ON op.id = h.origen_id
                    WHERE h.registro_id = @id
                    ORDER BY h.correlativo ASC;
                    ",
                    conn
                )
            )
            {
                cmd.Parameters.AddWithValue("@id", id);

                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var hallazgo = new ProductoTerminadoHallazgoDto
                    {
                        Id = Int(reader, "id"),
                        Correlativo = Int(reader, "correlativo"),
                        Origen = Text(reader, "origen"),
                        Observacion = Text(reader, "observacion"),
                        FotoRuta = Text(reader, "foto_ruta"),
                    };

                    detalle.Hallazgos.Add(hallazgo);
                    hallazgosPorId[hallazgo.Id] = hallazgo;
                }
            }

            if (hallazgosPorId.Count > 0)
            {
                var ids = string.Join(",", hallazgosPorId.Keys);

                await using var cmd = new MySqlCommand(
                    $@"
                    SELECT hd.hallazgo_id, pcv.id AS defecto_id, pcv.nombre AS defecto
                    FROM registro_pt_hallazgo_defectos hd
                    INNER JOIN parametros_control_visual pcv ON pcv.id = hd.defecto_id
                    WHERE hd.hallazgo_id IN ({ids});
                    ",
                    conn
                );

                await using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var hallazgoId = Int(reader, "hallazgo_id");

                    if (hallazgosPorId.TryGetValue(hallazgoId, out var hallazgo))
                    {
                        hallazgo.Defectos.Add(
                            new ProductoTerminadoHallazgoDefectoDto
                            {
                                Id = Int(reader, "defecto_id"),
                                Nombre = Text(reader, "defecto"),
                            }
                        );
                    }
                }
            }

            return detalle;
        }

        public async Task<List<ProductoTerminadoExportRowDto>> ObtenerFilasExportacion(
            ProductoTerminadoFiltroParams f
        )
        {
            var rows = new List<ProductoTerminadoExportRowDto>();

            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var (whereSql, pars) = BuildWhere(f);

            // Una fila por combinación inspección/hallazgo/defecto (LEFT JOIN en cascada) para
            // conservar trazabilidad completa en el Excel — una inspección sin hallazgos igual
            // sale (una fila, columnas de hallazgo vacías); esto es intencional, no un bug de join.
            await using var cmd = BuildCommand(
                conn,
                $@"
                SELECT
                    rpt.id AS inspeccion_id,
                    DATE_FORMAT(rpt.fecha_registro, '%d-%m-%Y') AS fecha,
                    IFNULL(u.nombre_completo, '-') AS inspector,
                    IFNULL(rpt.np, '-') AS np,
                    IFNULL(rpt.cliente, '-') AS cliente,
                    IFNULL(rpt.codigo_producto, '-') AS codigo_producto,
                    IFNULL(rpt.descripcion_producto, '-') AS descripcion_producto,
                    rpt.proceso_pt AS proceso,
                    rpt.cantidad_lote,
                    IFNULL(rpt.maquina, '-') AS maquina,
                    rpt.nivel_inspeccion,
                    rpt.aql,
                    rpt.letra_codigo,
                    rpt.tamano_muestra,
                    rpt.ac,
                    rpt.re,
                    rpt.unidades_nc,
                    rpt.defectos_totales,
                    rpt.resultado,
                    h.correlativo AS hallazgo_correlativo,
                    IFNULL(pcv.nombre, '') AS defecto,
                    IFNULL(op.nombre, '') AS origen
                FROM registros_producto_terminado rpt
                LEFT JOIN usuarios u ON u.id = rpt.usuario_id
                LEFT JOIN registro_pt_hallazgos h ON h.registro_id = rpt.id
                LEFT JOIN origenes_problema op ON op.id = h.origen_id
                LEFT JOIN registro_pt_hallazgo_defectos hd ON hd.hallazgo_id = h.id
                LEFT JOIN parametros_control_visual pcv ON pcv.id = hd.defecto_id
                {whereSql}
                ORDER BY rpt.id DESC, h.correlativo ASC, pcv.nombre ASC;
                ",
                pars
            );

            await using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                rows.Add(
                    new ProductoTerminadoExportRowDto
                    {
                        InspeccionId = Int(reader, "inspeccion_id"),
                        Fecha = Text(reader, "fecha"),
                        Inspector = Text(reader, "inspector"),
                        Np = Text(reader, "np"),
                        Cliente = Text(reader, "cliente"),
                        CodigoProducto = Text(reader, "codigo_producto"),
                        DescripcionProducto = Text(reader, "descripcion_producto"),
                        Proceso = Text(reader, "proceso"),
                        CantidadLote = Int(reader, "cantidad_lote"),
                        Maquina = Text(reader, "maquina"),
                        NivelInspeccion = Text(reader, "nivel_inspeccion"),
                        Aql = reader["aql"] == DBNull.Value ? 0 : Convert.ToDecimal(reader["aql"]),
                        LetraCodigo = Text(reader, "letra_codigo"),
                        TamanoMuestra = Int(reader, "tamano_muestra"),
                        Ac = reader["ac"] == DBNull.Value ? null : Int(reader, "ac"),
                        Re = reader["re"] == DBNull.Value ? null : Int(reader, "re"),
                        UnidadesNoConformes = Int(reader, "unidades_nc"),
                        DefectosTotales = Int(reader, "defectos_totales"),
                        Resultado = Text(reader, "resultado"),
                        HallazgoCorrelativo =
                            reader["hallazgo_correlativo"] == DBNull.Value
                                ? null
                                : Int(reader, "hallazgo_correlativo"),
                        Defecto = Text(reader, "defecto"),
                        Origen = Text(reader, "origen"),
                    }
                );
            }

            return rows;
        }

        // Borrado lógico, mismo criterio que el resto del sistema (no_conformidades.eliminado,
        // documentos.eliminado, etc.) — nunca DELETE físico. El scope por empresa se aplica acá
        // también: un usuario Faret no puede marcar como eliminado un registro INNPACK ni viceversa
        // (mismo criterio de aislamiento que ObtenerDetalle). Devuelve false si el id no existe, ya
        // está eliminado, o no pertenece al scope de la empresa indicada.
        public async Task<bool> Eliminar(int id, string empresa)
        {
            await using var conn = _db.GetCalidadConnection();
            await conn.OpenAsync();

            var empresaWhere =
                empresa == "FARET" ? "AND empresa = 'FARET'" : "AND (empresa = 'INNPACK' OR empresa IS NULL)";

            await using var cmd = new MySqlCommand(
                $@"
                UPDATE registros_producto_terminado
                SET eliminado = 1
                WHERE id = @id
                  AND eliminado = 0
                  {empresaWhere};
                ",
                conn
            );

            cmd.Parameters.AddWithValue("@id", id);

            var filasAfectadas = await cmd.ExecuteNonQueryAsync();
            return filasAfectadas > 0;
        }

        private static decimal CalcularPorcentaje(decimal valor, decimal total)
        {
            if (total <= 0)
                return 0;

            return Math.Round((valor / total) * 100, 0);
        }

        private static int Int(MySqlDataReader reader, string column)
        {
            return reader[column] == DBNull.Value ? 0 : Convert.ToInt32(reader[column]);
        }

        private static string Text(MySqlDataReader reader, string column)
        {
            return reader[column] == DBNull.Value ? "" : reader[column]?.ToString() ?? "";
        }
    }
}
