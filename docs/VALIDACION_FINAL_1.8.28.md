# Validación final 1.8.28 (preparación, 04-11-2026)
**Actualizado 04-11-2026:** el responsable TI confirmó haber realizado y aprobado las validaciones 1 a 3 (ver `PUBLICACION_1.8.28.md`). M9 global sigue NO verificado (solo medido en OF 22924: máx. 537). Nota: el ítem 2 de FPS devuelve 5 emplacados (4 con producción + 1 con cantidad 0) y 7 troquelados.

## 1. FPS (Prueba 4) — solo lectura
- NP Faret 22924 / NP Innpack 4062, ítem 2. Esperado: 4 registros de Emplacado y 7 de Troquelado.
- Verificar por registro: ID (recordKey), NP Faret/Innpack, ítem, proceso, máquina, operador, fecha/hora inicio y término, cantidad (registros con 0 visibles con la etiqueta «Sin producción»). No debe preseleccionarse ninguno.
- Cambiar el NP después de elegir: la selección y los datos autollenados deben limpiarse (M8b). Vaciar la orden: cliente/formato/antecedentes deben limpiarse (M8).
- Consulta M9 (una sola vez, en FPS): máximos de `LEN(Obs3)`, `LEN(Obs2)` en `ZZZMasterOT`.

## 2. Registro físico REG-LAB-04 de Mariela (Prueba 5)
Necesita a Mariela y un registro real. Cargar en Photino: identificación (NP, ítem, registro FPS, proceso, máquina, operador, turno, tipo de onda), método y versión, dimensiones (nominales/probeta/reales), muestras y determinaciones, resultados y promedios, trazabilidad FPS. Comparar con el papel; anotar cualquier dato que no pueda ingresarse (no se considera validado mientras exista alguno). Pendientes a confirmar con ella: RCT/Cobb (1 lectura por bobina vs 3 probetas), Cobb cara/tiempo, uso de horno en complejo, FCT 267,12/4,14, fuente de tipo de onda y dimensiones nominales, magnitud de especificación RCT/FCT.

## 3. Informes Excel/PDF en la app real
- Generar el Excel y abrirlo en Excel real; generar el PDF desde el diálogo de impresión de Photino.
- Comprobar: solo ensayos Finalizados en las hojas de formato, borradores/anulados solo en «Resultados del sistema», marca de método correcta (Higrómetro/Termobalanza/Horno), unidades en español (lb/pulg, pulg), todas las muestras y determinaciones visibles.

## 4. Antes de publicar
Orden SQL (DBA: `2026_11_muestra_laboratorio_ensayos_auditoria_anulacion.sql`) → API → instalador → `latest.json` al final; subir 3 propiedades de versión del csproj + `.iss` + sidebar + novedades; comparar con el `latest.json` real del share. Sin SQL de A6 (no se amplía DECIMAL).
