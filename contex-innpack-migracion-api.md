# contex-innpack-migracion-api.md — Migración de INNPACK a arquitectura API

Documento de contexto **exclusivo** para el trabajo de migrar el acceso a datos de INNPACK
(QCC Desktop) desde MySQL directo hacia una arquitectura de API REST, igual a como ya funciona
Faret. Proyecto grande, pensado para ejecutarse en varias sesiones de trabajo — este archivo es
el punto de partida para retomarlo.

Estado actual (2026-08-27): **Etapa 1 (Auth) completada, desplegada en producción y validada
end-to-end**. Quedan ~17 módulos por migrar (ver lista al final). Modo de trabajo: seguro (ver
`CLAUDE.md` — plan → aprobación → un paso a la vez, con validación real antes de dar cada módulo
por cerrado).

## Objetivo y motivación

INNPACK (a diferencia de Faret) conecta **directo a MySQL desde el proceso desktop**
(`DbService.GetCalidadConnection()`/`GetRegistroPaletizadoConnection()`, MySqlConnector, sin API
intermedia). Las credenciales reales de MySQL (`tickera`/`admin123`, host `192.168.1.70`) viven en
`config.json`, que se copia al output y **se empaqueta en cada instalador** — cualquiera con
acceso a una instalación de QCC puede extraer ese archivo y conectarse directo a la BD de
producción con cualquier cliente MySQL, sin pasar por la app. Ese es el motivo de fondo del
cambio, más allá de la consistencia con Faret.

Pedido explícito del usuario: "que mantengamos todo tal cual lo tenemos actualmente, pero
necesito que ahora todo sea por medio de API, al igual que hacemos con FARET". Es decir: **cero
cambios de UX/funcionalidad visibles**, solo cambia el transporte interno (MySQL directo → HTTP
hacia una API nueva que sigue hablando con la misma MySQL).

## Decisión de arquitectura

**Nueva API .NET dedicada** (no extender `qualitycontrol`/`mejora-continua`, que son de dominio
Faret con bases de datos distintas; tampoco el Node `calidad` de `quality_control/backend`, que
es el backend de la app móvil Flutter y no tiene ninguna de la lógica de los módulos INNPACK).
Desplegada en el **mismo servidor SRV-API** que ya hospeda las otras 2 APIs de Faret — mismo
dominio `api.faret.cl`, cero infraestructura DNS/certificado nueva, mismo procedimiento de deploy
ya probado.

**Autenticación: JWT**, igual que `qualitycontrol` de Faret — elegida por mínimo impacto al
usuario final: el login de INNPACK ya validaba usuario/contraseña contra la tabla `usuarios`
(BCrypt); con JWT la pantalla de login, los mensajes de error y el comportamiento no cambian en
absoluto, solo cambia qué pasa *dentro* del proceso (valida contra la API en vez de contra MySQL
directo).

## Repo nuevo: `qualitycontrolinnpack`

`C:\Users\dcarrasco\Desktop\Proyectos\qualitycontrolinnpack\QualityControlInnpack.Api\` — .NET 8
Web API, mismo stack que `apiqualitycontrolfaret` (MySqlConnector sin ORM, BCrypt.Net-Next, JWT
Bearer, Swagger, sin Entity Framework).

Estructura:
```
Configuration/
  JwtOptions.cs           — SecretKey/Issuer/Audience/ExpirationHours
  DbConnectionFactory.cs  — replica 1:1 los métodos de DbService.cs del desktop
                             (GetCalidadConnection/GetRegistroPaletizadoConnection,
                             mismas opciones de pool/timeout) — migrar un Repository
                             del desktop a esta API es casi copy-paste textual.
Shared/
  ApiResponse.cs           — {success, message, data, errors, timestamp}, igual a apiqualitycontrolfaret
  JwtHelper.cs
Middleware/
  ExceptionMiddleware.cs
Models/
  Usuario.cs
DTOs/Auth/
  LoginRequest.cs, LoginResponseDto.cs
Repositories/
  UsuariosRepository.cs    — mismo SQL exacto que AuthRepository.GetByCodigoUsuarioAsync
Services/
  AuthService.cs
Controllers/
  AuthController.cs, HealthController.cs
Program.cs
appsettings.json / appsettings.Development.json / appsettings.Production.json
```

`appsettings.Development.json` usa `tickera`/`admin123` (válido desde IPs `192.168.1.%`, sirve
para pruebas locales). `appsettings.Production.json` usa un **usuario MySQL dedicado**
`qcc_innpack_api` (ver sección de bug/fix más abajo) — nunca reutiliza `tickera` en producción.

## Etapa 1 (Auth) — completada

- `POST /api/auth/login` — mismo SQL exacto que el `AuthRepository` original del desktop (tabla
  `usuarios`: `id/codigo_usuario/nombre_completo/password_hash/rol/activo`, BCrypt.Verify), mismos
  3 mensajes de error (`Usuario no existe`/`Usuario desactivado`/`Contraseña incorrecta` — nota:
  "Usuario desactivado" es una rama muerta heredada del código original, porque el SELECT ya
  filtra `WHERE activo = 1`, así que un usuario inactivo siempre cae en "Usuario no existe"; no es
  un bug introducido en la migración, es fidelidad 1:1 con el comportamiento previo). Devuelve JWT
  + los mismos datos que antes traía `LoginResponse` (`userId`, `codigoUsuario`, `nombreCompleto`,
  `rol`).
- Desktop: `src/Backend/Services/InnpackApi/InnpackApiSettings.cs` + `InnpackApiClient.cs` (calco
  exacto de `FaretApiSettings`/`FaretApiClient` — Get/PostJson/PutJson/PatchJson/Delete,
  SetToken/ClearToken/HasToken/IsConfigured). `src/Backend/Modules/Auth/AuthService.cs` reescrito
  para llamar `InnpackApiClient` en vez de `AuthRepository` directo — `AuthHandler.cs`,
  `CurrentUserSessionService` y el frontend de login **no se tocaron en absoluto**.
  `src/Backend/Repositories/Auth/AuthRepository.cs` queda **sin uso** pero no se borró — se retira
  recién cuando toda la migración esté terminada (no antes, para no arriesgar nada mientras hay
  módulos a medio migrar).
- `config.json` del desktop: nueva sección
  ```json
  "QualityControlInnpackApi": {
    "BaseUrl": "https://api.faret.cl/innpack",
    "UseApi": true
  }
  ```

## Deploy en SRV-API

Sitio IIS existente "API" (`C:\API WEB\api\`, mismo servidor que `qualitycontrol`/
`mejora-continua`). Se creó:
- Application Pool nuevo **`QualityControlInnpackPool`** (`managedRuntimeVersion=""` / No Managed
  Code, Integrated, ApplicationPoolIdentity) — aislado, nunca se tocaron `QualityControlPool` ni
  `MejoraContinuaPool`.
- App IIS nueva `/innpack` → `C:\API WEB\api\innpack` → ese pool.

**Gotcha real de deploy (nuevo, no estaba en `reference-deploy-apis-net-srv-api`)**: esta carpeta
nueva **no tenía un share SMB dedicado** (a diferencia de `\\SRV-API\qualitycontrol`/
`\\SRV-API\mejora-continua`, que ya existían). Copiar por UNC path (`\\SRV-API\api\innpack`) no
funciona porque ese share no existe. Solución usada: `New-PSSession -ComputerName SRV-API` +
`Copy-Item -ToSession $session` (no requiere compartir la carpeta por SMB). Además, el `icacls`
para dar el ACE `IIS AppPool\QualityControlInnpackPool:(OI)(CI)(RX)` **debe ejecutarse dentro de
`Invoke-Command -ComputerName SRV-API`** (en el propio servidor) — ejecutarlo contra un UNC path
desde el cliente falla porque la identidad virtual `IIS AppPool\X` solo se resuelve localmente en
el servidor IIS (mismo gotcha ya documentado para los otros 2 despliegues, reconfirmado acá con
una tercera app).

Procedimiento real usado (repetible para el siguiente módulo/deploy de esta misma API, ya no hace
falta crear pool/app de nuevo, ya existen):
1. `dotnet publish -c Release` local.
2. `New-PSSession -ComputerName SRV-API` → `Copy-Item -ToSession` de los archivos publicados a
   `C:\API WEB\api\innpack`.
3. `Invoke-Command -ComputerName SRV-API` → `icacls` (verificar/reaplicar ACE del pool) →
   `Restart-WebAppPool -Name "QualityControlInnpackPool"`.
4. Validar `GET https://api.faret.cl/innpack/api/health` (200) y **siempre** re-chequear
   `qualitycontrol`/`mejora-continua` (regresión — deben seguir en 200 sin cambios).

## Bug real encontrado y corregido: colisión de host MySQL con otra app del servidor

El primer intento de login devolvía `500`. Con `stdoutLogEnabled` habilitado temporalmente
(revertido después) se vio el error real:
```
MySqlConnector.MySqlException: Access denied for user 'tickera'@'SRV-API.ad.faret.cl' (using password: YES)
```
pese a que `tickera`@`192.168.1.%` y `tickera`@`%` sí tienen privilegios sobre `calidad`. Causa
real (confirmada consultando `mysql.user`/`SHOW GRANTS` directo): ya existía una entrada **más
específica** `tickera@srv-api.ad.faret.cl` (host exacto, creada antes para otra app IIS del mismo
servidor — `Guardias.Api`/`guardias_app`, sin relación con este proyecto). MySQL siempre matchea
la entrada más específica disponible, así que esa entrada (sin privilegios sobre `calidad`) le
ganaba al wildcard. Además esa entidad tiene **su propia contraseña, distinta a `admin123`** —
cada combinación usuario@host es una entidad independiente en MySQL, con su propia contraseña.

Primer intento (revertido, no era la solución correcta): agregar el privilegio de `calidad`
directo a esa entrada existente — funcionalmente hubiera bastado, pero se descartó porque no se
puede autenticar sin saber la contraseña real de esa entidad, y cambiarla habría arriesgado romper
`Guardias.Api` (que probablemente tiene esa contraseña guardada en su propia config).

**Fix real aplicado**: usuario MySQL **nuevo y dedicado**, `qcc_innpack_api`@`srv-api.ad.faret.cl`,
contraseña propia generada, mismos privilegios sobre `calidad` que ya tiene `tickera`
(`SELECT, INSERT, UPDATE, DELETE, CREATE, REFERENCES, INDEX, ALTER, EXECUTE`) — 100% aditivo, cero
cambios a `tickera` en ningún host, cero riesgo para `guardias_app` ni para nadie más. Es además
mejor práctica de por sí (credenciales propias por servicio, no reutilizar las del desktop).

**Regla para las próximas migraciones/deploys en SRV-API**: antes de asumir que un error de login
MySQL es de credenciales, verificar primero si hay una entrada de host más específica que la
esperada:
```sql
SELECT Host FROM mysql.user WHERE User = '<usuario>';
SHOW GRANTS FOR '<usuario>'@'<host_exacto_del_servidor_nuevo>';
```
Un host exacto ya registrado por otra app puede tener prioridad silenciosa sobre wildcards y
bloquear el acceso con un error que parece de credenciales pero es de grants/prioridad de host.
Preferir siempre un usuario MySQL dedicado por servicio nuevo, no reutilizar uno compartido —
sobre todo en un servidor que ya hospeda múltiples apps con historiales propios (SRV-API hospeda
`appguardias`, `mejora-continua`, `formularios`, `apifaret`, `qualitycontrol`,
`programa-produccion`, `agconteov2`, `fps-python`, `webcorporativas`, y ahora `innpack`).

## Validación end-to-end realizada

- API standalone vía `curl` contra `https://api.faret.cl/innpack`: login correcto, contraseña
  incorrecta, usuario inexistente — todo con usuarios de prueba reales creados y limpiados en la
  BD real (`TEST-CLAUDE-BORRAR*`).
- Desde el propio `AuthService` del desktop (harness con `<ProjectReference>` al `.csproj`
  principal, mismo patrón usado en toda la migración de Faret de sesiones anteriores): login →
  `IsAuthenticated()`/`HasToken` correctos, contraseña incorrecta, logout → estado limpio.
- Regresión confirmada varias veces durante el proceso: `qualitycontrol` y `mejora-continua` en
  200 sin cambios en cada paso del deploy.

## Pendiente — módulos que faltan migrar (17 archivos, ~15 acciones + 3 híbridas)

Todos hoy usan `DbService.GetCalidadConnection()`/`GetRegistroPaletizadoConnection()` directo,
deben pasar por la misma receta que Auth (mover Repository a la API nueva casi textual, cambiar el
Handler del desktop para usar `InnpackApiClient`, probar E2E, validar en producción):

- `Modules/Dashboard/DashboardRepository.cs`
- `Modules/Home/HomeService.cs`
- `Modules/Laboratorio/LaboratorioRepository.cs`
- `Modules/MaquinasSeguimiento/MaquinasSeguimientoRepository.cs`
- `Modules/ProductoTerminado/ProductoTerminadoRepository.cs` (híbrido Faret+INNPACK)
- `Modules/RegistrosProduccion/RegistrosProduccionRepository.cs`
- `Modules/TalleresExternos/TalleresExternosRepository.cs`
- `Repositories/ControlDocumental/ControlDocumentalRepository.cs` (híbrido Faret+INNPACK)
- `Repositories/FaretLaboratorio/FaretLaboratorioRepository.cs` (Faret, vive en `calidad`)
- `Repositories/MuestraLaboratorio/MuestraLaboratorioRepository.cs`
- `Repositories/NoConformidades/NoConformidadesCatalogosRepository.cs` +
  `NoConformidadesRepository.cs`
- `Repositories/RecepcionCalidad/RecepcionCalidadRepository.cs` (híbrido Faret+INNPACK)
- `Repositories/RegistrosControl/RegistrosControlRepository.cs`
- `Repositories/Usuarios/UsuariosRepository.cs` (gestión de usuarios — ojo, distinto de
  `AuthRepository`, que ya migró)
- `Repositories/Trazabilidad/TrazabilidadRepository.cs` (usa `GetRegistroPaletizadoConnection`,
  BD `registro_paletizado`, mismo servidor/usuario `tickera` — ya soportado por
  `DbConnectionFactory` de la API nueva, falta migrar el Repository en sí)

Al terminar todos: retirar `AuthRepository.cs` y los métodos de `DbService.cs` que ya no se usen
desde el desktop (`GetCalidadConnection`/`GetRegistroPaletizadoConnection`).

Orden de los siguientes módulos: **sin definir todavía** — a decidir al retomar este trabajo,
probablemente empezando por uno de bajo riesgo/tráfico (Talleres Externos o Máquinas-Seguimiento)
antes de encarar los más grandes (Registros de Control, No Conformidades).

Ver también `contex.md` para el resto del historial del proyecto, y `CLAUDE.md` sección "Config &
deployment" para el resto de gotchas de despliegue/versión/`latest.json` que aplican igual cuando
se empaquete un nuevo instalador con estos cambios.
