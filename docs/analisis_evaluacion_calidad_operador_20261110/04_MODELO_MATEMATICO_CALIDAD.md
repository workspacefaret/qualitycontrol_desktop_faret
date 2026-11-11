# 04 — Modelo matemático de calidad por operador

**No existe una fórmula oficial.** Calidad (Pedro Roa, 03-11-2026) entregó solo penalizaciones: Crítico = 10, Mayor = 5, Menor = 1; periodicidad mensual; usar fecha de fabricación. Todo lo de abajo es **PROPUESTA** a validar.

## 1. Definiciones

- Operador *o*, mes de fabricación *m*.
- `w(n)`: peso del nivel (10/5/1). Nivel no clasificado → **no suma**, pero se cuenta en "pendientes".
- `P(o,m) = Σ w(nivel_i) · a_i(o)` sobre NC *i* atribuibles, donde `a_i(o)` ∈ [0,1] es la fracción de la NC asignada al operador (1 si atribución A/B; reparto si C).
- `N(o,m) = Σ a_i(o)` (NC ponderadas por atribución).
- Exposición productiva (de FPS, por sesión atribuida al operador en el mes):
  - `S` = sesiones, `H` = horas de producción, `OFx` = OF distintas tocadas, `U` = unidades producidas (`ProductionQuantity`), `Ub/Um` = buenas/malas.
- Cobertura de inspección `C = unidades inspeccionadas / unidades producidas` (solo si existe dato; hoy solo producto terminado).

Tres cosas distintas, no mezclar:
- **Índice de penalización** (puntos; sube cuando empeora): F1, F2, F3.
- **Tasa de no conformidades** (eventos por exposición): F4.
- **Porcentaje de cumplimiento 0–100** (sube cuando mejora): F5, **solo derivado y con umbral aprobado**.

## 2. Fórmulas candidatas

### F1 — Penalización acumulada
`F1 = P(o,m)`
- Ejemplo: Juan: 1 Mayor + 1 Menor → 5+1 = **6**. Pedro: 0 → **0**.
- Ventaja: trivial, auditable. Limitación: **ignora la exposición**; quien produjo más tiene más oportunidades de error. Sesgo contra operadores de alto volumen. Uso: solo informativo.

### F2 — Penalización por 100 OF
`F2 = 100 · P / OFx`
- Ejemplo: Juan trabajó 8 OF → 100·6/8 = **75**; Pedro 12 OF → **0**.
- Ventaja: simple de explicar ("puntos por cada 100 órdenes"). Limitación: una OF no es unidad homogénea (varía el tamaño; 90 % de las OF tiene varios operadores, por lo que `OFx` debe contar OF **con participación**, no responsabilidad exclusiva). Sesgo: operadores con muchas OF pequeñas.

### F3 — Penalización por 1.000 unidades producidas
`F3 = 1000 · P / U` (unidades atribuidas a las sesiones del operador)
- Ejemplo: Juan 80.000 u → 1000·6/80000 = **0,075**; Pedro 120.000 u → 0.
- Ventaja: normaliza el volumen. Limitaciones: `ProductionQuantity` depende del conteo GPIO con multiplicador; 12 % de sesiones con cantidad nula/0; unidades de distinto tipo (pliegos vs bandejas). Requiere validar equivalencias por proceso. Candidata **recomendada** como métrica principal una vez validada.

### F4 — Tasa de NC (sin ponderar por gravedad)
`F4 = 100 · N / OFx` (NC por 100 OF)
- Ejemplo: Juan 2 NC / 8 OF → **25**. Complementa F2: separa frecuencia de gravedad.

### F5 — Cumplimiento 0–100 (derivado, con tope aprobado)
`F5 = 100 · (1 − min(1, PPU / T))` donde `PPU = P / OFx` (penalización por OF) y `T` = penalización por OF que equivale a 0 %.
- Ejemplo con `T = 5` (una Mayor por OF = 0 %): Juan PPU=6/8=0,75 → 100·(1−0,15) = **85**. Pedro → **100**.
- Qué significa: "cuánto de la penalización tolerable por OF consumió el operador". **No es una probabilidad ni un % de órdenes sin defectos.** `T` es una decisión de Calidad; con otro `T` cambia todo (T=10 → Juan 92,5).
- Un operador con 0 NC no es "perfecto": solo "sin eventos detectados". Si su cobertura de inspección es baja, F5=100 es engañoso → ver §3.

### F6 — Tasa suavizada (Bayes empírico), para volúmenes pequeños
`F6 = (P + k·μ) / (E + k)` con `E` = exposición (OFx o U/1000), `μ` = tasa del grupo (misma máquina/proceso) y `k` = pseudo-exposición (p. ej. 5 OF).
- Ejemplo: μ=0,4 pen/OF, k=5. Operador con 1 OF y 1 Mayor: (5+5·0,4)/(1+5)=1,17 en vez de 5. Evita rankings dominados por azar con pocas OF.
- Limitación: más difícil de explicar; requiere aprobación de `k`.

## 3. Condiciones de evaluabilidad (propuesta)

| Estado | Condición |
|---|---|
| **Evaluable** | Exposición ≥ mínimo aprobado (p. ej. ≥ 5 OF o ≥ 40 h), ≥ 80 % de NC del período con fecha de fabricación y atribución A/B, cobertura de inspección ≥ umbral |
| **Evaluable con reservas** | Cumple exposición pero la atribución C/D supera 20 % |
| **Datos insuficientes** | Exposición bajo el mínimo, o sin sesiones FPS del período |
| **No evaluable** | Operador no resuelto a RUT, mes sin producción, o nivel pendiente de clasificación en > X % de sus NC |

Los umbrales (5 OF, 40 h, 80 %, 20 %) son valores de partida **PROPUESTA**, no aprobados.

## 4. Sesgos y riesgos de interpretación

- **Exposición/ruta:** máquinas con inspección más intensa detectan más NC (más NC = más inspección, no peor operador). Comparar solo dentro de máquina/proceso, o normalizar por cobertura.
- **Comparabilidad entre máquinas y entre meses:** procesos con tolerancias distintas; meses con mezcla de productos distinta.
- **Atribución C (compartida):** un cambio de operador a mitad de OF (535 casos en 90 d) reparte responsabilidad; el reparto proporcional es una convención.
- **NC tardías:** una NC registrada en diciembre sobre producción de octubre cambia octubre → requiere recálculo controlado (doc 06).
- **NC no atribuibles/internas:** sin operador; no deben contaminar el índice.
- **Cero NC ≠ calidad perfecta:** puede ser falta de inspección.
- **Reprocesos:** no hay flag; una OF reprocesada puede contar exposición dos veces.
- **Edición retroactiva:** nivel, operador y fecha son editables sin historial → el índice histórico puede moverse (doc 06 propone congelar y auditar).
- **Uso disciplinario:** índice individual con datos de atribución débil → riesgo laboral. Recomendado uso para mejora y revisión humana de Calidad antes de cualquier decisión sobre personas.

## 5. Mecanismo provisional (separado del oficial)

Mientras Calidad valida: publicar **"Panel indicativo"** con F1 y F4 (conteos y penalización bruta), etiquetado "Indicativo — no oficial", sin ranking individual por defecto (solo por máquina/proceso agregado), mostrando cobertura de atribución y exposición, y sin F5. Los snapshots se guardan con `estado='PROVISIONAL'`. La versión oficial (`OFICIAL`) solo se activa con aprobación registrada de Calidad.

## 6. Recomendación para presentar a Calidad

Presentar **F3 (por unidades) + F4 (frecuencia) como pareja**, con **F5 opcional** una vez fijado `T`, y F2 como alternativa si las unidades no resultan fiables. Evaluación mensual por **mes de fabricación** (atribuido por sesión), con estados "No evaluable / Datos insuficientes". Ver decisiones pendientes en doc 08.
