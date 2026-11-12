using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using QualityControlCenter.Backend.Services.FaretApi;

namespace QualityControlCenter.Modules.AdminPlanta
{
    // "Administración de planta" (INNPACK y FARET): operadores de máquina, inspectores, máquinas y áreas/procesos.
    // Habla con la API `calidad` (api/admin-planta), que valida el JWT de la sesión activa y audita cada cambio.
    // La empresa NO se toma del frontend: es siempre la de la sesión (un admin de INNPACK no toca datos de FARET).
    // Acciones: adminPlanta.list / .crear / .actualizar / .auditoria.list (lectura = .list; el resto exige EDITAR en el módulo).
    public class AdminPlantaHandler
    {
        private static readonly HashSet<string> Entidades = new() { "areas", "maquinas", "operadores", "inspectores" };
        private static readonly string[] CamposEscribibles = { "nombre", "grupoId", "codigo", "activo" };

        private readonly FaretApiClient _client;
        private readonly string _empresa;

        public AdminPlantaHandler(FaretApiClient calidadClient, string empresaSesion)
        {
            _client = calidadClient;
            _empresa = empresaSesion.ToUpperInvariant();
        }

        public async Task<string> Handle(string action, Dictionary<string, object> payload)
        {
            try
            {
                if (_empresa is not ("INNPACK" or "FARET"))
                    return Error("Empresa de sesión no válida");

                var data = payload.TryGetValue("data", out var raw) && raw is JsonElement el && el.ValueKind == JsonValueKind.Object
                    ? el
                    : default;

                if (action == "adminPlanta.auditoria.list")
                    return Respuesta(await _client.GetAsync($"admin-planta/{_empresa}/auditoria"));

                var entidad = Texto(data, "entidad");
                if (entidad == null || !Entidades.Contains(entidad))
                    return Error("Entidad no válida");
                var ruta = $"admin-planta/{_empresa}/{entidad}";

                switch (action)
                {
                    case "adminPlanta.list":
                        // Cuentas técnicas: solo se piden si el frontend lo indica; la API las entrega únicamente a ADMIN_TI.
                        var incluirOcultos = entidad == "inspectores" && data.TryGetProperty("incluirOcultos", out var oc) && oc.ValueKind == JsonValueKind.True;
                        return Respuesta(await _client.GetAsync(incluirOcultos ? ruta + "?incluirOcultos=1" : ruta));

                    case "adminPlanta.crear":
                        return Respuesta(await _client.PostJsonAsync(ruta, Cuerpo(data)));

                    case "adminPlanta.actualizar":
                        if (!data.TryGetProperty("id", out var id) || !EsIdValido(id, out var idTexto))
                            return Error("Identificador inválido");
                        return Respuesta(await _client.PutJsonAsync($"{ruta}/{idTexto}", Cuerpo(data)));

                    default:
                        return Error($"Acción no reconocida en Administración de planta: {action}");
                }
            }
            catch (Exception ex)
            {
                return Error(ex.Message);
            }
        }

        private static string? Texto(JsonElement data, string clave) =>
            data.ValueKind == JsonValueKind.Object && data.TryGetProperty(clave, out var v) && v.ValueKind == JsonValueKind.String
                ? v.GetString()
                : null;

        // Solo los campos permitidos viajan a la API (valores tal cual; la API valida y parametriza).
        private static Dictionary<string, JsonElement> Cuerpo(JsonElement data)
        {
            var cuerpo = new Dictionary<string, JsonElement>();
            foreach (var campo in CamposEscribibles)
                if (data.ValueKind == JsonValueKind.Object && data.TryGetProperty(campo, out var v))
                    cuerpo[campo] = v.Clone();
            return cuerpo;
        }

        // id numérico (maquinas/operadores/inspectores/procesos) o código de 3 letras (áreas FARET): nunca texto libre en la URL.
        private static bool EsIdValido(JsonElement id, out string texto)
        {
            texto = "";
            if (id.ValueKind == JsonValueKind.Number && id.TryGetInt32(out var n) && n > 0)
            {
                texto = n.ToString();
                return true;
            }
            if (id.ValueKind == JsonValueKind.String)
            {
                var s = id.GetString() ?? "";
                if (s.Length == 3 && s.AsSpan().IndexOfAnyExceptInRange('A', 'Z') < 0)
                {
                    texto = s;
                    return true;
                }
            }
            return false;
        }

        // La API responde { ok, data } o { ok:false, message } (también en 4xx/5xx).
        private static string Respuesta((bool ok, string body) r)
        {
            try
            {
                using var doc = JsonDocument.Parse(r.body);
                var root = doc.RootElement;
                if (root.TryGetProperty("ok", out var ok) && ok.ValueKind == JsonValueKind.True)
                {
                    object? datos = root.TryGetProperty("data", out var d) ? d.Clone() : null;
                    return JsonSerializer.Serialize(new { ok = true, data = datos });
                }
                var mensaje = root.TryGetProperty("message", out var m) ? m.GetString() : null;
                return Error(mensaje ?? "No se pudo completar la operación");
            }
            catch
            {
                // El servidor respondió algo que no es JSON (p. ej. una página 404): la API aún no incluye este módulo.
                return Error("El servidor aún no tiene habilitada la administración de planta. Pide a TI que actualice la API de Calidad.");
            }
        }

        private static string Error(string mensaje) => JsonSerializer.Serialize(new { ok = false, error = mensaje });
    }
}
