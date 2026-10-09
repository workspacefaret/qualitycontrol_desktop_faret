using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace QualityControlCenter.Services
{
    // Permisos por módulo del usuario logueado (INNPACK o Faret). Única fuente de verdad del
    // desktop para "¿este usuario puede ver/editar este módulo?":
    //   1. ADMIN_TI → EDITAR en todo, siempre.
    //   2. Gestión de Usuarios → solo ADMIN_TI (no se personaliza).
    //   3. Permiso personalizado del usuario (API: usuario_modulo_permiso) → manda ese.
    //   4. Sin personalizar → la regla por rol de siempre (la misma que tenía app.js).
    // Inicio (inicio / faret) nunca baja de VER.
    //
    // ValidarAccion() es el bloqueo server-side que usa MessageRouter antes de despachar: no
    // basta con ocultar botones. Cada módulo nuevo del sidebar DEBE registrarse en `Modulos`
    // (sin registro, sus acciones se rechazan) y cada acción nueva de solo lectura que no
    // termine en .list/.get/.resumen/.detalle debe agregarse a `AccionesLectura` (si no, un
    // usuario con VER la verá bloqueada).
    public class PermisosService
    {
        public const string SinAcceso = "SIN_ACCESO";
        public const string Ver = "VER";
        public const string Editar = "EDITAR";

        private sealed record ModuloDef(string Empresa, string[] PrefijosEscritura);

        // módulo del frontend (data-module) → empresa + prefijos de acción que puede escribir.
        private static readonly Dictionary<string, ModuloDef> Modulos = new()
        {
            ["inicio"] = new("INNPACK", new[] { "inicio" }),
            ["dashboard"] = new("INNPACK", new[] { "dashboard" }),
            ["registros-produccion"] = new("INNPACK", new[] { "registrosProduccion" }),
            ["no-conformidades"] = new("INNPACK", new[] { "noConformidades" }),
            ["nc-internas"] = new("INNPACK", new[] { "noConformidades" }),
            ["control-documental"] = new("INNPACK", new[] { "controlDocumental" }),
            ["maquinas-seguimiento"] = new("INNPACK", Array.Empty<string>()),
            ["registros-control"] = new("INNPACK", new[] { "registrosControl" }),
            ["talleres-externos"] = new("INNPACK", new[] { "talleresExternos" }),
            ["producto-terminado"] = new("INNPACK", new[] { "productoTerminado" }),
            ["certificados-liberacion"] = new("INNPACK", Array.Empty<string>()),
            ["despachos-diarios"] = new("INNPACK", Array.Empty<string>()),
            ["recepcion-calidad"] = new("INNPACK", new[] { "recepcion" }),
            ["muestra-laboratorio"] = new("INNPACK", new[] { "muestraLab" }),
            ["trazabilidad"] = new("INNPACK", Array.Empty<string>()),
            ["formularios"] = new("INNPACK", new[] { "formularios" }),
            ["usuarios"] = new("INNPACK", new[] { "usuarios" }),
            ["faret"] = new("FARET", Array.Empty<string>()),
            ["faret-inspecciones"] = new("FARET", new[] { "faret.inspecciones" }),
            ["faret-inspecciones-pallet"] = new("FARET", new[] { "faret.inspeccionesPallet" }),
            ["faret-producto-terminado"] = new("FARET", new[] { "productoTerminado" }),
            ["faret-certificados-liberacion"] = new("FARET", Array.Empty<string>()),
            ["faret-despachos-diarios"] = new("FARET", Array.Empty<string>()),
            ["faret-nc"] = new("FARET", new[] { "faret.nc", "faret.pncCatalogos", "faret.catalogos" }),
            ["faret-nc-internas"] = new("FARET", new[] { "noConformidades" }),
            ["faret-control-documental"] = new("FARET", new[] { "controlDocumental" }),
            ["faret-talleres-externos"] = new("FARET", new[] { "faret.talleresExternos" }),
            ["faret-importacion"] = new("FARET", new[] { "faret.importacion" }),
            ["faret-maquinas"] = new("FARET", Array.Empty<string>()),
            ["faret-data"] = new("FARET", Array.Empty<string>()),
            ["faret-trazabilidad"] = new("FARET", Array.Empty<string>()),
            ["faret-formularios"] = new("FARET", new[] { "formularios" }),
            ["faret-laboratorio"] = new("FARET", new[] { "faretLab" }),
            ["faret-recepcion-calidad"] = new("FARET", new[] { "recepcion" }),
            ["faret-usuarios"] = new("FARET", new[] { "faret.usuarios" }),
        };

        // Módulos que nunca bajan de VER.
        private static readonly HashSet<string> ModulosInicio = new() { "inicio", "faret" };

        // Acciones permitidas sin sesión ni módulo de origen (login/logout/exportar a Excel).
        private static readonly HashSet<string> AccionesPublicas = new()
        {
            "auth.login",
            "auth.logout",
            "auth.me",
            "faret.login",
            "faret.logout",
            "faret.health",
            "excel.guardar",
        };

        // Lecturas que no terminan en un sufijo de lectura genérico. Todo lo que no es lectura
        // se trata como escritura (criterio cerrado: ante la duda, se bloquea con VER).
        private static readonly HashSet<string> AccionesLectura = new()
        {
            "certificadosLiberacion.buscar",
            "certificadosLiberacion.pdf.descargar",
            "certificadosLiberacion.calidadPdf.descargar",
            "controlDocumental.adjunto.abrir",
            "dashboard.obtenerFiltros",
            "dashboard.obtenerResumen",
            "despachosDiarios.sap.categorias",
            "faret.catalogos.areas",
            "faret.catalogos.defectos",
            "faret.catalogos.inspectores",
            "faret.catalogos.maquinas",
            "faret.catalogos.operadores",
            "faret.inspecciones.adjuntos",
            "faret.nc.adjuntos.abrir",
            "faret.talleresExternos.catalogos",
            "formularios.abrirPdf",
            "inicio.getDashboard",
            "liberacionCalidad.inspectores",
            "maquinasSeguimiento.obtenerResumen",
            "muestraLab.adjunto.abrir",
            "muestraLab.bobinaHistorial",
            "muestraLab.catalogos",
            "muestraLab.consultarNp",
            "muestraLab.consultarRegistroProduccion",
            "muestraLab.indicadores",
            "muestraLab.materialesFps",
            "muestraLab.resolverBobina",
            "noConformidades.adjuntos.abrir",
            "noConformidades.filtrosOpciones",
            "productoTerminado.exportarDetalle",
            "productoTerminado.filtros",
            "recepcion.foto.abrir",
            "recepcion.sap.consultar",
            "recepcion.sap.lotes",
            "registrosControl.obtenerRegistros",
            "registrosProduccion.obtenerFiltros",
            "registrosProduccion.obtenerResumen",
            "talleresExternos.catalogos",
            "talleresExternos.historialLiberaciones",
            "trazabilidad.consultarNp",
        };

        private static readonly HashSet<string> SufijosLectura = new() { "list", "get", "resumen", "detalle" };

        private readonly object _lock = new();
        private string? _empresa;
        private string _rol = "";
        private Dictionary<string, string> _personalizados = new();

        public bool HaySesion
        {
            get { lock (_lock) return _empresa != null; }
        }

        public void Establecer(string empresa, string rol, Dictionary<string, string> personalizados)
        {
            lock (_lock)
            {
                _empresa = empresa.ToUpperInvariant();
                _rol = rol ?? "";
                _personalizados = new Dictionary<string, string>(personalizados);
            }
        }

        public void Limpiar()
        {
            lock (_lock)
            {
                _empresa = null;
                _rol = "";
                _personalizados = new Dictionary<string, string>();
            }
        }

        // Nivel efectivo de un módulo para el usuario actual (SIN_ACCESO si no hay sesión, si el
        // módulo es de la otra empresa o si no está registrado).
        public string NivelEfectivo(string modulo)
        {
            lock (_lock)
                return NivelEfectivoSinLock(modulo);
        }

        // Todos los módulos de la empresa de la sesión con su nivel efectivo (para el frontend).
        public Dictionary<string, string> NivelesEfectivos()
        {
            lock (_lock)
            {
                return Modulos
                    .Where(m => m.Value.Empresa == _empresa)
                    .ToDictionary(m => m.Key, m => NivelEfectivoSinLock(m.Key));
            }
        }

        // null = permitido; texto = motivo del rechazo.
        public string? ValidarAccion(string action, string? modulo)
        {
            if (AccionesPublicas.Contains(action))
                return null;

            lock (_lock)
            {
                if (_empresa == null)
                    return "No hay una sesión activa. Vuelve a iniciar sesión.";

                // Niveles efectivos de la propia sesión (menú y modo "Solo vista" del frontend).
                if (action == "permisos.mios")
                    return null;

                // Gestión de Usuarios: solo ADMIN_TI de la empresa de la sesión, venga de donde venga.
                if (action.StartsWith("usuarios.") || action.StartsWith("faret.usuarios."))
                {
                    var empresaAccion = action.StartsWith("faret.") ? "FARET" : "INNPACK";
                    if (!EsAdminTiSinLock() || empresaAccion != _empresa)
                        return "Acceso no autorizado: solo ADMIN_TI puede administrar usuarios.";
                }

                // Eliminar formularios (borrado físico, irreversible): solo ADMIN_TI.
                if (action == "formularios.eliminar" && !EsAdminTiSinLock())
                    return "Acceso no autorizado: solo ADMIN_TI puede eliminar formularios.";

                if (string.IsNullOrWhiteSpace(modulo) || !Modulos.TryGetValue(modulo, out var def))
                    return "Acción rechazada: módulo de origen no reconocido.";

                var nivel = NivelEfectivoSinLock(modulo);
                if (nivel == SinAcceso)
                    return "No tienes acceso a este módulo.";

                if (EsLectura(action))
                    return null;

                if (nivel != Editar)
                    return "Solo vista: no tienes permiso para modificar datos en este módulo.";

                if (!def.PrefijosEscritura.Any(p => action.StartsWith(p + ".")))
                    return "Acción no permitida desde este módulo.";

                return null;
            }
        }

        public static bool EsLectura(string action)
        {
            if (AccionesPublicas.Contains(action) || AccionesLectura.Contains(action))
                return true;

            var ultimo = action[(action.LastIndexOf('.') + 1)..];
            return SufijosLectura.Contains(ultimo);
        }

        // Extrae los permisos personalizados de la respuesta de GET api/auth/mis-permisos
        // (mismo shape ApiResponse {success, data:[{modulo, nivel}]} en la API INNPACK y Faret).
        public static bool TryParsearPermisos(string body, out Dictionary<string, string> permisos)
        {
            permisos = new Dictionary<string, string>();
            try
            {
                using var doc = JsonDocument.Parse(body);
                if (
                    !doc.RootElement.TryGetProperty("data", out var data)
                    || data.ValueKind != JsonValueKind.Array
                )
                    return false;

                foreach (var item in data.EnumerateArray())
                {
                    var modulo = item.TryGetProperty("modulo", out var m) ? m.GetString() : null;
                    var nivel = item.TryGetProperty("nivel", out var n) ? n.GetString() : null;
                    if (string.IsNullOrWhiteSpace(modulo) || string.IsNullOrWhiteSpace(nivel))
                        continue;

                    nivel = nivel.ToUpperInvariant();
                    if (nivel is SinAcceso or Ver or Editar)
                        permisos[modulo] = nivel;
                }
                return true;
            }
            catch
            {
                return false;
            }
        }

        private bool EsAdminTiSinLock() =>
            string.Equals(_rol, "ADMIN_TI", StringComparison.OrdinalIgnoreCase);

        private string NivelEfectivoSinLock(string modulo)
        {
            if (_empresa == null || !Modulos.TryGetValue(modulo, out var def) || def.Empresa != _empresa)
                return SinAcceso;

            if (EsAdminTiSinLock())
                return Editar;

            if (modulo is "usuarios" or "faret-usuarios")
                return SinAcceso;

            string nivel = _personalizados.TryGetValue(modulo, out var personalizado)
                ? personalizado
                : NivelPorRol(_empresa, _rol, modulo);

            if (nivel == SinAcceso && ModulosInicio.Contains(modulo))
                return Ver;

            return nivel;
        }

        // Módulos que ADMIN_TI puede personalizar en la matriz de permisos (todos los de la
        // empresa menos Gestión de Usuarios, que depende solo del rol ADMIN_TI).
        public static List<string> ModulosPersonalizables(string empresa)
        {
            empresa = empresa.ToUpperInvariant();
            return Modulos
                .Where(m => m.Value.Empresa == empresa && m.Key is not ("usuarios" or "faret-usuarios"))
                .Select(m => m.Key)
                .ToList();
        }

        // Filas de la matriz de permisos de un usuario: nivel por rol + permiso personalizado (si
        // hay) de cada módulo. `permisosApi` es el arreglo data de GET api/usuarios/{id}/permisos.
        public static object ArmarMatriz(string empresa, string rol, JsonElement permisosApi)
        {
            var personalizados = new Dictionary<string, JsonElement>();
            if (permisosApi.ValueKind == JsonValueKind.Array)
            {
                foreach (var p in permisosApi.EnumerateArray())
                {
                    if (p.TryGetProperty("modulo", out var m) && m.ValueKind == JsonValueKind.String)
                        personalizados[m.GetString()!] = p;
                }
            }

            static string? Texto(JsonElement e, string prop) =>
                e.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

            return new
            {
                esAdminTi = string.Equals(rol, "ADMIN_TI", StringComparison.OrdinalIgnoreCase),
                modulos = ModulosPersonalizables(empresa).Select(modulo =>
                {
                    personalizados.TryGetValue(modulo, out var p);
                    var tiene = p.ValueKind == JsonValueKind.Object;
                    return new
                    {
                        modulo,
                        porRol = NivelPorRolDe(empresa, rol, modulo),
                        personalizado = tiene ? Texto(p, "nivel")?.ToUpperInvariant() : null,
                        modificadoPor = tiene ? Texto(p, "modificadoPor") : null,
                        fechaModificacion = tiene ? Texto(p, "fechaModificacion") : null,
                        minimoVer = ModulosInicio.Contains(modulo),
                    };
                }).ToList(),
            };
        }

        // Nivel que da el rol (sin permisos personalizados) — lo que muestra la matriz como
        // valor "por rol". Inicio nunca baja de VER.
        public static string NivelPorRolDe(string empresa, string rol, string modulo)
        {
            empresa = empresa.ToUpperInvariant();
            if (!Modulos.TryGetValue(modulo, out var def) || def.Empresa != empresa)
                return SinAcceso;

            if (string.Equals(rol, "ADMIN_TI", StringComparison.OrdinalIgnoreCase))
                return Editar;

            if (modulo is "usuarios" or "faret-usuarios")
                return SinAcceso;

            var nivel = NivelPorRol(empresa, rol ?? "", modulo);
            return nivel == SinAcceso && ModulosInicio.Contains(modulo) ? Ver : nivel;
        }

        // Regla por rol previa a los permisos personalizados (la misma que aplicaba
        // refreshSidebarState en core/app.js): visible = EDITAR, oculto = SIN_ACCESO.
        private static string NivelPorRol(string? empresa, string rolUsuario, string modulo)
        {
            if (empresa != "FARET")
                return Editar;

            var rol = rolUsuario.ToUpperInvariant();

            if (modulo is "faret-data" or "faret-importacion")
                return rol == "ADMIN" ? Editar : SinAcceso;

            if (rol == "CONSULTA")
            {
                return modulo is "faret" or "faret-talleres-externos" or "faret-nc" or "faret-nc-internas" or "faret-despachos-diarios"
                    ? Editar
                    : SinAcceso;
            }

            return Editar;
        }
    }
}
