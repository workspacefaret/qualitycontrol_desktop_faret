// Restricciones de las consultas del comparador: único destino de producción admitido y petición de solo consulta.

// fps-api de producción: publicada por IIS en la subruta /fps (docs/OPERACION_DESPLIEGUE_QCC.md) y usada así por el
// escritorio (FpsApi.BaseUrl). La clave solo puede viajar a esta dirección exacta: HTTPS, mismo host y misma ruta.
const URL_PRODUCCION = "https://api.faret.cl/fps/api/produccion"

// Comparación exacta del texto (solo se toleran espacios y barras finales). No se normaliza la URL: así no pasan
// "..", "%2e", barras invertidas, usuario@host, puertos, consultas ni hosts parecidos.
function urlProduccion(texto) {
    const limpio = String(texto ?? "").trim().replace(/\/+$/, "")
    if (limpio !== URL_PRODUCCION) throw new Error(`URL no admitida. La única dirección de producción es ${URL_PRODUCCION}`)
    return URL_PRODUCCION
}

// Node permite desactivar la validación de certificados por variable de entorno: en producción no se acepta.
function exigirTlsVerificado(env) {
    if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
        throw new Error("NODE_TLS_REJECT_UNAUTHORIZED=0 desactiva la verificación TLS: quitar esa variable. Para la CA corporativa usar node --use-system-ca")
    }
}

// Siempre GET, sin cuerpo y sin seguir redirecciones (fetch reenviaría x-api-key a otro destino).
const opcionesConsulta = (clave, ms = 120000) => ({
    method: "GET", redirect: "error", headers: { "x-api-key": clave }, signal: AbortSignal.timeout(ms)
})

module.exports = { URL_PRODUCCION, urlProduccion, exigirTlsVerificado, opcionesConsulta }
