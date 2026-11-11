using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace QualityControlCenter.Modules.EvaluacionOperadores
{
    // Protección de fps-api (Fase 42, riesgos R1/R2 de la auditoría de la Fase 41).
    // Guarda en memoria el UNIVERSO ya atribuido (Data + sesiones FPS), de modo que cambiar filtros, "Limpiar" o volver a
    // abrir el módulo NO vuelva a consultar FPS. Garantías:
    //  - una única carga activa: las solicitudes iguales se consolidan (single-flight);
    //  - vigencia configurable (por defecto 10 min) y actualización manual (`forzar`), con un mínimo entre cargas;
    //  - un error NO se reintenta solo: se recuerda unos segundos y se devuelve tal cual (sin tormentas de reintentos);
    //  - tiempo máximo global de la carga y cancelación real del lado de QCC (HttpClient), sin reutilizar datos viejos;
    //  - la clave incluye si el usuario ve nombres: otro permiso o usuario nunca recibe datos de otro, y se invalida al
    //    cambiar/cerrar la sesión (token) o expirar.
    // Solo memoria del proceso: no se escribe nada en disco. NO detiene una consulta que FPS ya haya empezado.
    public sealed class FaretUniversoCache
    {
        public static readonly FaretUniversoCache Instancia = new();

        public TimeSpan Vigencia { get; set; } = TimeSpan.FromMinutes(10);
        public TimeSpan TiempoMaximoCarga { get; set; } = TimeSpan.FromSeconds(90);
        public TimeSpan MinimoEntreCargas { get; set; } = TimeSpan.FromSeconds(15); // también protege "Actualizar" repetido
        public TimeSpan EsperaTrasError { get; set; } = TimeSpan.FromSeconds(30);

        public sealed record Universo(List<FaretAtribucionFps.Resultado> Resultados, int Registradas, int Documentos, int Sesiones, DateTime CargadoUtc);

        public sealed record Respuesta(string Estado, Universo? Datos, string? Error, string Origen, int EsperarSeg = 0);

        // Resultado de una carga real.
        public sealed record Carga(string Estado, Universo? Datos, string? Error);

        // Estado propio de cada carga: su cancelación (usuario/sesión) nunca se mezcla con la de otra carga posterior.
        private sealed class Carga_
        {
            public CancellationTokenSource Cts = null!;
            public int Cancelada; // 1 = cancelada por usuario, cambio de sesión o de permisos (no por tiempo)
        }

        private readonly object _lock = new();
        private string? _clave;
        private Universo? _universo;
        private DateTime _ultimoIntentoUtc = DateTime.MinValue;
        private Respuesta? _ultimoError;
        private DateTime _errorUtc = DateTime.MinValue;
        private Task<Respuesta>? _enCurso;
        private Carga_? _slot;
        private string? _claveEnCurso;
        private Func<DateTime> _ahora = () => DateTime.UtcNow;

        // Solo para pruebas: reloj inyectable.
        public void UsarReloj(Func<DateTime> reloj) => _ahora = reloj;

        public int Cargas { get; private set; } // cargas reales iniciadas (diagnóstico/pruebas)

        public bool HayCargaEnCurso { get { lock (_lock) return _enCurso is not null && !_enCurso.IsCompleted; } }

        public Universo? Actual { get { lock (_lock) return _universo; } }

        public async Task<Respuesta> ObtenerAsync(string clave, bool forzar, Func<CancellationToken, Task<Carga>> cargar)
        {
            Task<Respuesta> tarea;
            lock (_lock)
            {
                var ahora = _ahora();
                if (_clave is not null && _clave != clave)
                {
                    // otro usuario / otro permiso: nada se reutiliza
                    _universo = null; _ultimoError = null; _clave = null;
                    CancelarYSoltar();
                }

                // Otra clave (permiso/usuario distinto) con una carga ya en vuelo: se cancela esa carga, no sigue consultando FPS.
                if (_enCurso is not null && !_enCurso.IsCompleted && _claveEnCurso != clave)
                    CancelarYSoltar();

                if (_enCurso is not null && !_enCurso.IsCompleted && _claveEnCurso == clave)
                {
                    tarea = _enCurso; // consolidar con la carga activa
                }
                else
                {
                    var edad = _universo is null ? TimeSpan.MaxValue : ahora - _universo.CargadoUtc;
                    if (_universo is not null && _clave == clave && edad < Vigencia && (!forzar || ahora - _ultimoIntentoUtc < MinimoEntreCargas))
                        return new Respuesta("OK", _universo, null, "CACHE");

                    if (_ultimoError is not null && _clave == clave && ahora - _errorUtc < EsperaTrasError
                        && (!forzar || ahora - _ultimoIntentoUtc < MinimoEntreCargas))
                    {
                        var falta = (int)Math.Ceiling((EsperaTrasError - (ahora - _errorUtc)).TotalSeconds);
                        return _ultimoError with { EsperarSeg = Math.Max(1, falta), Origen = "ERROR_RECIENTE" };
                    }

                    _ultimoIntentoUtc = ahora;
                    Cargas++;
                    var slot = new Carga_ { Cts = new CancellationTokenSource(TiempoMaximoCarga) };
                    _slot = slot; _claveEnCurso = clave;
                    _enCurso = tarea = EjecutarAsync(clave, cargar, slot);
                }
            }
            return await tarea.ConfigureAwait(false);
        }

        private async Task<Respuesta> EjecutarAsync(string clave, Func<CancellationToken, Task<Carga>> cargar, Carga_ slot)
        {
            Respuesta r;
            try
            {
                var c = await Task.Run(() => cargar(slot.Cts.Token)).ConfigureAwait(false);
                r = new Respuesta(c.Estado, c.Datos, c.Error, "NUEVA");
            }
            catch (OperationCanceledException)
            {
                r = Volatile.Read(ref slot.Cancelada) == 1
                    ? new Respuesta("CANCELADO", null, "Carga cancelada. Los datos mostrados antes no se modificaron.", "NUEVA")
                    : new Respuesta("TIMEOUT", null, $"La carga superó el tiempo máximo de {(int)TiempoMaximoCarga.TotalSeconds} s y se canceló.", "NUEVA");
            }
            catch (Exception ex)
            {
                r = new Respuesta("ERROR", null, "Error inesperado al cargar: " + ex.Message, "NUEVA");
            }
            lock (_lock)
            {
                // Solo la carga vigente puede guardar resultado: una carga soltada (cambio de sesión/permiso) jamás llega a la caché.
                if (_claveEnCurso == clave && ReferenceEquals(_slot, slot))
                {
                    if (r.Estado == "OK" && r.Datos is not null) { _clave = clave; _universo = r.Datos; _ultimoError = null; }
                    else if (r.Estado != "CANCELADO") { _clave = clave; _ultimoError = r; _errorUtc = _ahora(); }
                    _enCurso = null; _claveEnCurso = null; _slot = null;
                }
            }
            slot.Cts.Dispose();
            return r;
        }

        // El usuario pulsó "Cancelar": corta la carga activa en QCC (no detiene lo que FPS ya esté ejecutando).
        public bool Cancelar()
        {
            lock (_lock)
            {
                if (_enCurso is null || _enCurso.IsCompleted || _slot is null) return false;
                Interlocked.Exchange(ref _slot.Cancelada, 1);
                try { _slot.Cts.Cancel(); } catch (ObjectDisposedException) { }
                return true;
            }
        }

        // Cambio/cierre de sesión o expiración del token: no se conserva nada.
        public void Invalidar()
        {
            lock (_lock)
            {
                _universo = null; _ultimoError = null; _clave = null; _ultimoIntentoUtc = DateTime.MinValue;
                CancelarYSoltar();
            }
        }

        // Cancela la carga activa (si hay) y la desvincula: su resultado, aunque llegue, no se guarda ni se comparte con nadie.
        // Debe llamarse dentro del lock.
        private void CancelarYSoltar()
        {
            if (_slot is not null && _enCurso is not null && !_enCurso.IsCompleted)
            {
                Interlocked.Exchange(ref _slot.Cancelada, 1);
                try { _slot.Cts.Cancel(); } catch (ObjectDisposedException) { }
            }
            _enCurso = null; _claveEnCurso = null; _slot = null;
        }
    }
}
