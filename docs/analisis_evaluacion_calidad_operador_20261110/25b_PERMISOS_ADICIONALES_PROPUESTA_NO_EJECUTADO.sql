/* ==========================================================================================================
   PROPUESTA — NO EJECUTADO. Lo revisa, aprueba y aplica una persona con AD\Administrador.
   Servidor: SAP_NEW (192.168.1.230)   Base: FPS_PRODUCCION   Cuenta: fps_historico_ro (solo lectura)
   Solo GRANT SELECT por objeto. Sin escritura, sin roles (db_datareader), sin VIEW DEFINITION, sin Rut.
   Catalogo verificado el 10-11-2026 (sys.objects visible para la cuenta): solo ven 3 objetos
   (dbo.WorkOrderRecords, dbo.ZZZMasterOT, plan.vw_FactProduccion); las demas fuentes se identificaron por la
   documentacion del sistema (docs 01/02/20) y por la definicion funcional de la vista.
   ========================================================================================================== */
USE FPS_PRODUCCION;
GO

/* ---- 1) PRIORIDAD ALTA para las 7 NC: catalogo de maquinas ------------------------------------------------
   Objeto: dbo.ZZZListaMaquina (aplatz_id = WorkOrderRecords.ResourceKey, NombreCorto, nombre).
   Justificacion: las 3 NC con equivalencia de maquina "sugerida" (6, 7, 14) y la NC 15 dependen de validar el
   nombre de maquina de Calidad contra la maquina real de FPS con su identificador (ResourceKey), no solo por texto.
   Es un catalogo de maquinas: no contiene datos personales. */
GRANT SELECT ON OBJECT::dbo.ZZZListaMaquina TO fps_historico_ro;
GO

/* ---- 2) OPCIONAL, para NC FUTURAS (no resuelve las 7 actuales): turnos reales ------------------------------
   Objeto: dbo.ZZZSesionEventos (TurnoKey = ticks del LOGIN; eventos LOGIN/LOGOUT/SETUP/PRODUCCION/IMPRODUCTIVO;
   UserKey). Segun la documentacion solo existe desde 2026-08-05 y solo en estaciones con [session].log_enabled.
   Las 7 NC actuales se fabricaron entre enero y julio de 2026, ANTES de esa fecha, por lo que esta tabla NO las
   resuelve; se solicita unicamente para que las NC nuevas puedan ubicarse por turno real. No contiene Rut. */
GRANT SELECT ON OBJECT::dbo.ZZZSesionEventos TO fps_historico_ro;
GO

/* ---- NO se solicita ---------------------------------------------------------------------------------------
   dbo.ZZZUsuarios: contiene Rut (dato personal) y el nombre del operador ya llega por plan.vw_FactProduccion.
   dbo.ZZZProcesosWeb / ZZZProcesosProductivos: el proceso ya llega en la vista (columna Proceso). */

/* ---- Verificacion posterior (solo lectura) --------------------------------------------------------------- */
EXECUTE AS USER = 'fps_historico_ro';
SELECT HAS_PERMS_BY_NAME('dbo.ZZZListaMaquina','OBJECT','SELECT')  AS sel_maquinas,
       HAS_PERMS_BY_NAME('dbo.ZZZSesionEventos','OBJECT','SELECT') AS sel_eventos,
       HAS_PERMS_BY_NAME('dbo.ZZZListaMaquina','OBJECT','INSERT')  AS ins_maquinas,      -- debe ser 0
       HAS_PERMS_BY_NAME('dbo.ZZZSesionEventos','OBJECT','UPDATE') AS upd_eventos;       -- debe ser 0
REVERT;
GO

/* ---- Reversion (si hiciera falta) -------------------------------------------------------------------------
REVOKE SELECT ON OBJECT::dbo.ZZZListaMaquina  FROM fps_historico_ro;
REVOKE SELECT ON OBJECT::dbo.ZZZSesionEventos FROM fps_historico_ro;
*/
