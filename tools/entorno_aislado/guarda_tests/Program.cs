using System;
using System.IO;
using System.Text.Json;
using QualityControlCenter.Services;

var fallos = 0;
var total = 0;
void Caso(string nombre, bool ok) { total++; if (!ok) { fallos++; Console.WriteLine("FALLA " + nombre); } }
int Problemas(string json) { using var d = JsonDocument.Parse(json); return EntornoAislado.Problemas(d.RootElement).Count; }
string Url(string u) => JsonSerializer.Serialize(new { Api = new { BaseUrl = u } });

Caso("config local", Problemas("""{"Api":{"BaseUrl":"http://127.0.0.1:5291","UseApi":true,"ApiKey":"abc123"},"Otra":{"BaseUrl":"http://localhost:1","Host":"localhost","Vacio":""}}""") == 0);
foreach (var u in new[] { "http://192.0.2.10:5000", "https://servidor.interno", "http://127.0.0.1.ejemplo.com", "http://localhost@ejemplo.com", "file://servidor/carpeta", "ftp://servidor" })
    Caso("url " + u, Problemas(Url(u)) == 1);
Caso("host remoto", Problemas("""{"MySqlHost":"192.0.2.10"}""") == 1);
Caso("server remoto", Problemas("""{"Sql":{"Server":"SERVIDOR"}}""") == 1);
Caso("ruta de red", Problemas(JsonSerializer.Serialize(new { UpdatesShareRoot = new string('\\', 2) + "servidor" })) == 1);
Caso("dentro de un arreglo", Problemas("""{"Lista":["http://remoto"]}""") == 1);

// Sin la variable, el comportamiento es el de siempre.
Environment.SetEnvironmentVariable("QCC_AISLADO", null);
Caso("inactivo usa config.json", EntornoAislado.RutaConfig == Path.Combine(AppContext.BaseDirectory, "config.json"));
EntornoAislado.Validar();

Environment.SetEnvironmentVariable("QCC_AISLADO", "1");
Environment.SetEnvironmentVariable("QCC_CONFIG", null);
bool Rechaza() { try { EntornoAislado.Validar(); return false; } catch (InvalidOperationException) { return true; } }
Caso("activo sin QCC_CONFIG no arranca (no cae en config.json)", EntornoAislado.RutaConfig == "" && Rechaza());
var tmp = Path.GetTempFileName();
Environment.SetEnvironmentVariable("QCC_CONFIG", tmp);
File.WriteAllText(tmp, Url("http://192.0.2.10"));
Caso("activo con destino remoto no arranca", Rechaza());
File.WriteAllText(tmp, Url("http://127.0.0.1:5291"));
Caso("activo con destino local arranca", !Rechaza());
File.Delete(tmp);

// Consola: contraseñas y tokens ocultos, el resto intacto.
var mensaje = JsonSerializer.Serialize(new { action = "auth.login", data = new { CodigoUsuario = "u", Password = "se\"cre\\to", PasswordNueva = "otra-123", Token = "ey.abc" } });
var visible = LogSeguro.Ocultar(mensaje);
Caso("oculta claves y token", !visible.Contains("cre") && !visible.Contains("otra-123") && !visible.Contains("ey.abc"));
Caso("conserva el resto y sigue siendo JSON", visible.Contains("auth.login") && JsonDocument.Parse(visible).RootElement.GetProperty("data").GetProperty("CodigoUsuario").GetString() == "u");
Caso("sin datos sensibles no cambia", LogSeguro.Ocultar("""{"action":"trazabilidad.buscar","data":{"np":"4007"}}""") == """{"action":"trazabilidad.buscar","data":{"np":"4007"}}""");

Console.WriteLine($"{total - fallos}/{total}");
return fallos == 0 ? 0 : 1;
