if (!window.MuestraLaboratorioController) {
  class MuestraLaboratorioController {
    constructor() {
      this._clickHandler = null
      this._changeHandler = null
      this._muestraActualId = null
      this._corrigiendoEnsayoId = null
      this.deepLinkEstado = null
      // Catálogos reales (máquinas/tipos de onda) y snapshot FPS de la muestra en edición —
      // ver _consultarNp/_renderRegistrosFps.
      this._catalogos = { maquinas: [], tiposOnda: [], metodos: [] }
      this._fpsDatos = null
      this._fpsRegistrosVisibles = []
      this._fpsSnapshot = null
      this._fpsAutollenado = null
      this._fpsConsultaSeq = 0
      this._fpsNpConsultada = null
      this._fpsNpEnConsulta = null
      this._fpsClienteAuto = null
    }

    async init() {
      console.log("INIT MUESTRA LABORATORIO")
      this.consumirDeepLink()
      this.bindEvents()
      await this.cargarCatalogos()
      await this._cargarConfigMuestras()
      await this.cargarLista()
      await this.cargarIndicadores()
    }

    // Máquinas (mismo catálogo que Talleres Externos/Producto Terminado) y tipos de onda (mismo
    // catálogo que ya usa la app móvil Flutter) — se cargan una vez al iniciar el módulo.
    async cargarCatalogos() {
      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.catalogos", data: {} })
        if (!res || res.ok === false) return
        this._catalogos = res.data || { maquinas: [], tiposOnda: [] }

        const selMaquina = document.getElementById("mlbNmMaquina")
        const selOnda = document.getElementById("mlbNmTipoOnda")
        const selFiltroMaquina = document.getElementById("mlbFiltroMaquina")
        if (selMaquina) {
          selMaquina.innerHTML = `<option value="">-- Seleccionar --</option>` +
            this._catalogos.maquinas.map(m => `<option value="${m.id}">${this._esc(m.nombre)}</option>`).join("")
        }
        if (selOnda) {
          selOnda.innerHTML = `<option value="">-- Seleccionar --</option>` +
            this._catalogos.tiposOnda.map(t => `<option value="${t.id}">${this._esc(t.nombre)}</option>`).join("")
        }
        if (selFiltroMaquina) {
          selFiltroMaquina.innerHTML = `<option value="">Todas</option>` +
            this._catalogos.maquinas.map(m => `<option value="${m.id}">${this._esc(m.nombre)}</option>`).join("")
        }
      } catch {
        // Sin catálogos no se bloquea el módulo — los selects quedan solo con "-- Seleccionar --".
      }
    }

    _esc(v) {
      if (v === null || v === undefined) return ""
      return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    }

    // Para valores dentro de atributos HTML (title="…", value="…"): además de & < > escapa comillas.
    _escAttr(v) {
      return this._esc(v).replace(/"/g, "&quot;").replace(/'/g, "&#39;")
    }

    // Unidades en español SOLO para mostrar (pedido REG-LAB-04 v2): lo guardado en la BD y lo que
    // viaja a la API sigue igual ("lb/in", "in"...). lbf, kgf, psi, g/m², mm y % no se tocan.
    _u(u) {
      if (u === null || u === undefined) return ""
      return String(u).replace(/(?<![A-Za-z])(lbf?)\/in(²?)(?![A-Za-z])/g, "$1/pulg$2").replace(/(^|[\s(\[])in(²?)(?=$|[\s)\]·,.;])/g, "$1pulg$2")
    }

    // Solo etiqueta visible — el valor real guardado en BD (m.estado) no cambia, para no migrar
    // histórico ni romper el filtro. Alinea con la terminología del REG-LAB-04 (punto 34).
    _labelEstado(estado) {
      const map = { "En analisis": "En ensayo", "Finalizada": "Finalizado" }
      return map[estado] || estado || "-"
    }

    // Si "Gestionar" de una alerta en Inicio dejó un filtro de estado pendiente para este
    // módulo, lo toma y lo borra de inmediato (mismo mecanismo que registros-control).
    consumirDeepLink() {
      const raw = sessionStorage.getItem("qccDeepLinkId")
      if (!raw) return

      try {
        const info = JSON.parse(raw)
        if (info?.modulo === "muestra-laboratorio" && info.estadoFiltro) {
          this.deepLinkEstado = info.estadoFiltro
        }
      } catch { /* ignorar */ }

      sessionStorage.removeItem("qccDeepLinkId")
    }

    quitarDeepLink() {
      this.deepLinkEstado = null
      this.cargarLista()
    }

    renderDeepLinkBanner(total) {
      const banner = document.getElementById("mlbDeepLinkBanner")
      if (!banner) return

      if (!this.deepLinkEstado) {
        banner.style.display = "none"
        banner.innerHTML = ""
        return
      }

      banner.style.display = "block"
      banner.innerHTML = `
        <div class="card" style="
          border-left:4px solid #3b82f6;
          background:#eff6ff;
          margin-bottom:16px;
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:12px;
        ">
          <span>Mostrando ${total} muestra(s) pendiente(s) desde una alerta de Inicio.</span>
          <button class="btn-secondary" id="mlbBtnVerTodosDeepLink">Ver todas</button>
        </div>
      `
    }

    // A5: protección común contra doble envío de TODOS los guardados de este módulo (nuevos e
    // históricos). Un solo guardado a la vez: una segunda orden mientras hay uno en curso se ignora, y el
    // botón queda deshabilitado hasta terminar. El bloqueo se libera SIEMPRE (finally), incluso si el
    // guardado lanza un error, para que el usuario pueda reintentar.
    async _conGuardado(btn, fn) {
      if (this._guardando) return
      this._guardando = true
      if (btn) btn.disabled = true
      try {
        return await fn()
      } finally {
        this._guardando = false
        if (btn) btn.disabled = false
      }
    }

    bindEvents() {
      if (this._clickHandler) return

      this._clickHandler = (e) => {
        const id = e.target.id

        if (id === "mlbBtnMetodos") return this.abrirMetodos()
        if (id === "mlbMetodoCerrar") return this.cerrarModal("mlbModalMetodos")
        if (id === "mlbMetodoLimpiar") return this.limpiarFormMetodo()
        if (id === "mlbMetodoGuardar") return this._conGuardado(e.target, () => this.guardarMetodo())
        if (e.target.classList?.contains("mlb-metodo-editar-btn")) {
          return this.editarMetodo(JSON.parse(e.target.dataset.metodo))
        }
        if (e.target.classList?.contains("mlb-metodo-toggle-btn")) {
          return this.toggleMetodo(parseInt(e.target.dataset.id, 10), e.target.dataset.activo === "true")
        }

        if (id === "mlbBtnEspecificaciones") return this.abrirEspecificaciones()
        if (id === "mlbEspecCerrar") return this.cerrarModal("mlbModalEspecificaciones")
        if (id === "mlbEspecLimpiar") return this.limpiarFormEspecificacion()
        if (id === "mlbEspecGuardar") return this._conGuardado(e.target, () => this.guardarEspecificacion())
        if (e.target.classList?.contains("mlb-espec-editar-btn")) {
          return this.editarEspecificacion(JSON.parse(e.target.dataset.espec))
        }
        if (e.target.classList?.contains("mlb-espec-toggle-btn")) {
          return this.toggleEspecificacion(parseInt(e.target.dataset.id, 10), e.target.dataset.activo === "true")
        }

        if (id === "mlbBtnNuevaMuestra") return this.abrirNuevaMuestra()
        if (id === "mlbNmCancelar") return this.cerrarModal("mlbModalNuevaMuestra")
        if (id === "mlbNmGuardar") return this._conGuardado(e.target, () => this.guardarNuevaMuestra())
        if (id === "mlbNmBtnConsultarNp") return this._consultarNp()
        if (e.target.classList?.contains("mlb-btn-resolver-bobina")) {
          return this._resolverBobina(e.target.dataset.input, e.target.dataset.info)
        }

        if (id === "mlbBtnFiltrar") return this.cargarLista()
        if (id === "mlbBtnLimpiarFiltros") return this.limpiarFiltros()
        if (id === "mlbBtnVerTodosDeepLink") return this.quitarDeepLink()

        if (e.target.classList?.contains("mlb-ver-btn")) {
          return this.abrirDetalle(parseInt(e.target.dataset.id, 10))
        }
        if (e.target.classList?.contains("mlb-eliminar-btn")) {
          return this.eliminarMuestra(parseInt(e.target.dataset.id, 10))
        }
        if (id === "mlbDetCerrar") return this.cerrarModal("mlbModalDetalle")
        if (id === "mlbBtnInforme") return this.generarInforme()
        if (id === "mlbBtnExcel") return this.exportarExcel()
        if (id === "mlbBtnPdf") return this.exportarPdf()
        if (id === "mlbDetBtnEditarFecha") return this._abrirEditarFecha()
        if (id === "mlbDetBtnAnularRegistro") return this.anularMuestra()
        if (id === "mlbDetBtnVerRegistroProduccion") return this.verRegistroProduccion()
        if (id === "mlbDetBtnMaterialesFps") return this._verMaterialesFps()
        if (id === "mlbRegProdCerrar") return this.cerrarModal("mlbModalRegistroProduccion")
        if (e.target.classList?.contains("mlb-regprod-ver-btn")) {
          this.cerrarModal("mlbModalRegistroProduccion")
          return this.abrirDetalle(parseInt(e.target.dataset.id, 10))
        }
        if (id === "mlbNmBtnBuscarMonotapa") return this._buscarMonotapaRelacionada()
        if (id === "mlbEditarFechaCancelar") return this._cerrarEditarFecha()
        if (id === "mlbEditarFechaGuardar") return this._conGuardado(e.target, () => this._guardarFechaEnsayo())
        if (id === "mlbBtnCrearNc") return this.crearNoConformidad()

        if (id === "mlbBtnNuevoHumedad") {
          this._prepararHumedadNueva()
          return this.abrirModal("mlbModalHumedad")
        }
        if (id === "mlbHumCancelar") return this.cerrarModal("mlbModalHumedad")
        if (id === "mlbHumGuardar") return this._conGuardado(e.target, () => this.guardarHumedad())
        if (id === "mlbHumGuardarBorrador") return this._conGuardado(e.target, () => this._guardarEnsayoMuestras("mlbModalHumedad", false))

        // REG-LAB-04 v2: muestras y determinaciones
        if (e.target.classList?.contains("mlb-em-agregar")) return this._emAgregarMuestra()
        if (e.target.classList?.contains("mlb-em-eliminar")) return this._emEliminarMuestra(parseInt(e.target.dataset.idx, 10))
        if (e.target.classList?.contains("mlb-em-deshacer")) return this._emDeshacerEliminar(parseInt(e.target.dataset.idx, 10))
        if (e.target.classList?.contains("mlb-em-det-agregar")) return this._emAgregarDeterminacion(parseInt(e.target.dataset.idx, 10))
        if (e.target.classList?.contains("mlb-em-det-quitar")) return this._emQuitarDeterminacion(parseInt(e.target.dataset.idx, 10), parseInt(e.target.dataset.di, 10))
        if (e.target.classList?.contains("mlb-em-det-deshacer")) return this._emDeshacerQuitarDeterminacion(parseInt(e.target.dataset.idx, 10), parseInt(e.target.dataset.di, 10))
        if (id === "mlbEmCancelar") return this.cerrarModal("mlbModalEnsayoMuestras")
        if (id === "mlbEmGuardar") return this._conGuardado(e.target, () => this._guardarEnsayoMuestras("mlbModalEnsayoMuestras", true))
        if (id === "mlbEmGuardarBorrador") return this._conGuardado(e.target, () => this._guardarEnsayoMuestras("mlbModalEnsayoMuestras", false))
        if (e.target.classList?.contains("mlb-em-continuar-btn")) return this.abrirEnsayoMuestras(parseInt(e.target.dataset.id, 10), false)
        if (e.target.classList?.contains("mlb-em-ver-btn")) return this.abrirEnsayoMuestras(parseInt(e.target.dataset.id, 10), true)

        if (id === "mlbBtnNuevoGramaje") return this._nuevoEnsayo("GRAMAJE", () => this.abrirModal("mlbModalGramaje"))
        if (id === "mlbGraCancelar") return this.cerrarModal("mlbModalGramaje")
        if (id === "mlbGraGuardar") return this._conGuardado(e.target, () => this.guardarGramaje())

        if (id === "mlbBtnNuevoCobb") return this._nuevoEnsayo("COBB", () => this.abrirModal("mlbModalCobb"))
        if (id === "mlbCobbCancelar") return this.cerrarModal("mlbModalCobb")
        if (id === "mlbCobbGuardar") return this._conGuardado(e.target, () => this.guardarCobb())

        if (id === "mlbBtnNuevoEspesor") return this._nuevoEnsayo("ESPESOR", () => this.abrirModal("mlbModalEspesor"))
        if (id === "mlbEspCancelar") return this.cerrarModal("mlbModalEspesor")
        if (id === "mlbEspGuardar") return this._conGuardado(e.target, () => this.guardarEspesor())

        if (id === "mlbBtnNuevoRct") return this._nuevoEnsayo("RCT", () => this.abrirModal("mlbModalRct"))
        if (id === "mlbRctCancelar") return this.cerrarModal("mlbModalRct")
        if (id === "mlbRctGuardar") return this._conGuardado(e.target, () => this.guardarRct())

        if (id === "mlbBtnNuevoFct") return this._nuevoEnsayo("FCT", () => this.abrirModal("mlbModalFct"))
        if (id === "mlbFctCancelar") return this.cerrarModal("mlbModalFct")
        if (id === "mlbFctGuardar") return this._conGuardado(e.target, () => this.guardarFct())

        if (id === "mlbBtnNuevoEct") return this._nuevoEnsayo("ECT", () => this.abrirModal("mlbModalEct"))
        if (id === "mlbEctCancelar") return this.cerrarModal("mlbModalEct")
        if (id === "mlbEctGuardar") return this._conGuardado(e.target, () => this.guardarEct())

        if (id === "mlbBtnNuevoBctMedido") return this._nuevoEnsayo("BCT_MEDIDO", () => this.abrirModalBctMedido())
        if (id === "mlbBctMedCancelar") return this.cerrarModal("mlbModalBctMedido")
        if (id === "mlbBctMedGuardar") return this._conGuardado(e.target, () => this.guardarBctMedido())

        if (id === "mlbBtnNuevoBctTeorico") return this.abrirModalBctTeorico()
        if (id === "mlbBctTeoCancelar") return this.cerrarModal("mlbModalBctTeorico")
        if (id === "mlbBctTeoGuardar") return this._conGuardado(e.target, () => this.guardarBctTeorico())

        if (id === "mlbBtnNuevoViscosidad") return this.abrirModal("mlbModalViscosidad")
        if (id === "mlbViscCancelar") return this.cerrarModal("mlbModalViscosidad")
        if (id === "mlbViscGuardar") return this._conGuardado(e.target, () => this.guardarViscosidad())

        if (id === "mlbBtnNuevoPh") return this.abrirModal("mlbModalPh")
        if (id === "mlbPhCancelar") return this.cerrarModal("mlbModalPh")
        if (id === "mlbPhGuardar") return this._conGuardado(e.target, () => this.guardarPh())

        if (id === "mlbBtnNuevoSolidos") return this.abrirModal("mlbModalSolidos")
        if (id === "mlbSolCancelar") return this.cerrarModal("mlbModalSolidos")
        if (id === "mlbSolGuardar") return this._conGuardado(e.target, () => this.guardarSolidos())

        if (id === "mlbBtnNuevoFiltracion") return this.abrirFiltracion()
        if (id === "mlbFilCancelar") return this.cerrarModal("mlbModalFiltracion")
        if (id === "mlbFilGuardar") return this._conGuardado(e.target, () => this.guardarFiltracion())

        if (id === "mlbBtnNuevoLugol") return this.abrirModal("mlbModalLugol")
        if (id === "mlbLugolCancelar") return this.cerrarModal("mlbModalLugol")
        if (id === "mlbLugolGuardar") return this._conGuardado(e.target, () => this.guardarLugol())

        if (e.target.classList?.contains("mlb-anular-btn")) {
          return this.anularEnsayo(parseInt(e.target.dataset.id, 10))
        }
        if (e.target.classList?.contains("mlb-historial-btn")) {
          return this._verHistorialEnsayo(parseInt(e.target.dataset.id, 10))
        }
        if (e.target.classList?.contains("mlb-corregir-btn")) {
          return this.corregirEnsayo(parseInt(e.target.dataset.id, 10))
        }

        if (e.target.classList?.contains("mlb-bob-agregar")) {
          return this._agregarFilaBobina(e.target.dataset.container, e.target.dataset.labels)
        }
        if (e.target.classList?.contains("mlb-bob-quitar")) {
          return e.target.closest(".mlb-bobina-row")?.remove()
        }

        if (id === "mlbBtnAdjuntar") return this._pedirArchivoAdjunto()
        if (id === "mlbAdjuntoCerrar") return this.cerrarModal("mlbModalAdjunto")
        if (e.target.classList?.contains("mlb-ver-adjunto-btn")) {
          return this._verAdjunto(parseInt(e.target.dataset.adjuntoId, 10))
        }
        if (e.target.classList?.contains("mlb-eliminar-adjunto-btn")) {
          return this._eliminarAdjunto(parseInt(e.target.dataset.adjuntoId, 10))
        }
      }
      document.addEventListener("click", this._clickHandler)

      this._changeHandler = (e) => {
        if (e.target.id === "mlbHumMetodoEquipo") {
          this.actualizarCamposHumedad()
          this._refrescarMetodoAuto("HUMEDAD", "mlbHumMetodo", e.target.value)
        }
        if (e.target.id === "mlbBctMedCajas") this.renderBctMedCajas()
        if (e.target.id === "mlbNmNp") {
          // M8b: NP de la consulta ya hecha o en curso; si el analista lo cambia, esa consulta deja de valer.
          const npRef = this._fpsNpConsultada ?? this._fpsNpEnConsulta
          if (npRef !== null && npRef !== undefined && e.target.value.trim() !== npRef) this._limpiarSeleccionFps()
        }
        if (e.target.id === "mlbNmOrdenFps") this._onCambiarOrdenFps()
        if (e.target.id === "mlbNmItemFps" || e.target.id === "mlbNmEtapaFps") this._renderRegistrosFps()
        if (e.target.name === "mlbNmRegistroRadio") this._onSeleccionarRegistroProduccion(e.target.value)
        if (e.target.id === "mlbNmOrigen") {
          document.getElementById("mlbNmPruebaSolicitadaBloque").style.display = e.target.value === "Pruebas" ? "block" : "none"
          document.getElementById("mlbNmMonotapaBloque").style.display = e.target.value === "Monotapa" ? "block" : "none"
          document.getElementById("mlbNmEmplacadoBloque").style.display = e.target.value === "Emplacado" ? "block" : "none"
        }
        if (e.target.id === "mlbAdjuntoInput") {
          const file = e.target.files[0]
          if (file) this._subirAdjunto(file)
        }
      }
      document.addEventListener("change", this._changeHandler)

      this._inputHandler = (e) => {
        if (e.target.closest?.(".mlb-em-panel")) this._emOnInput(e.target)
      }
      document.addEventListener("input", this._inputHandler)
      document.addEventListener("change", this._inputHandler)
    }

    abrirModal(id) {
      document.getElementById(id).style.display = "flex"

      // Punto 32 del REG-LAB-04: el método ya no lo escribe el analista — se muestra (bloqueado)
      // el que aplicará el backend al guardar, resuelto desde el maestro de métodos.
      const metodoPorModal = {
        mlbModalHumedad: () => this._refrescarMetodoAuto("HUMEDAD", "mlbHumMetodo", document.getElementById("mlbHumMetodoEquipo")?.value),
        mlbModalGramaje: () => this._refrescarMetodoAuto("GRAMAJE", "mlbGraMetodo"),
        mlbModalCobb: () => this._refrescarMetodoAuto("COBB", "mlbCobbMetodo"),
        mlbModalEspesor: () => this._refrescarMetodoAuto("ESPESOR", "mlbEspMetodo"),
        mlbModalRct: () => this._refrescarMetodoAuto("RCT", "mlbRctMetodo"),
        mlbModalFct: () => this._refrescarMetodoAuto("FCT", "mlbFctMetodo"),
        mlbModalEct: () => this._refrescarMetodoAuto("ECT", "mlbEctMetodo"),
        mlbModalBctMedido: () => this._refrescarMetodoAuto("BCT_MEDIDO", "mlbBctMedMetodo"),
      }
      if (metodoPorModal[id]) metodoPorModal[id]()

      // Punto 11 REG-LAB-04: al abrir Humedad/Gramaje/Espesor "en blanco" (no en modo corrección,
      // que ya precarga sus propias bobinas vía _precargarXxx) se limpia el muestreo de bobinas.
      const bobinasContainerPorModal = {
        mlbModalHumedad: "mlbHumBobinasFilas",
        mlbModalGramaje: "mlbGraBobinasFilas",
        mlbModalEspesor: "mlbEspBobinasFilas",
      }
      if (bobinasContainerPorModal[id] && !this._corrigiendoEnsayoId) {
        document.getElementById(bobinasContainerPorModal[id]).innerHTML = ""
      }
    }

    // ---------- Muestreo de 3+ bobinas (Punto 11 del REG-LAB-04) ----------

    _renderFilaBobina(labels) {
      const [l1, l2, l3] = labels
      const div = document.createElement("div")
      div.className = "mlb-form-row mlb-bobina-row"
      div.innerHTML = `
        <div class="mlb-form-campo">
          <label>N° bobina</label><input type="text" class="mlb-bob-numero">
          <div class="mlb-bob-historial" style="font-size:11px;color:#b45309;"></div>
        </div>
        <div class="mlb-form-campo"><label>Lote</label><input type="text" class="mlb-bob-lote"></div>
        <div class="mlb-form-campo"><label>Posición</label>
          <select class="mlb-bob-posicion">
            <option value="Onda">Onda</option>
            <option value="Liner">Liner</option>
            <option value="Cartulina">Cartulina</option>
          </select>
        </div>
        <div class="mlb-form-campo"><label>${l1}</label><input type="number" step="0.0001" class="mlb-bob-v1"></div>
        <div class="mlb-form-campo"><label>${l2}</label><input type="number" step="0.0001" class="mlb-bob-v2"></div>
        <div class="mlb-form-campo"><label>${l3}</label><input type="number" step="0.0001" class="mlb-bob-v3"></div>
        <div class="mlb-form-campo" style="align-self:flex-end;"><button type="button" class="btn-secondary mlb-bob-quitar">Quitar</button></div>
      `
      div.querySelector(".mlb-bob-numero").addEventListener("blur", e => this._chequearHistorialBobina(e.target))
      return div
    }

    // Punto 12 del REG-LAB-04: avisa (sin bloquear el registro) si la bobina ya fue muestreada
    // antes en otra producción. Best-effort — un error de red acá no debe impedir guardar el ensayo.
    async _chequearHistorialBobina(inputEl) {
      const notaEl = inputEl.parentElement.querySelector(".mlb-bob-historial")
      if (!notaEl) return
      notaEl.textContent = ""

      const numero = inputEl.value.trim()
      if (!numero || !this._muestraActualId) return

      try {
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.bobinaHistorial",
          data: { numeroBobina: numero, excluirMuestraId: this._muestraActualId }
        })
        if (!res || res.ok === false) return

        const historial = res.data || []
        if (historial.length === 0) return

        const primero = historial[0]
        const extra = historial.length > 1 ? ` (+${historial.length - 1} más)` : ""
        notaEl.textContent = `⚠ Ya analizada antes: NP ${primero.np}, ${primero.fechaEnsayo || primero.fechaIngreso} (${primero.tipoEnsayo})${extra}`
      } catch {
        // Best-effort, ver comentario del método.
      }
    }

    _agregarFilaBobina(containerId, labelsCsv) {
      const contenedor = document.getElementById(containerId)
      if (!contenedor) return
      contenedor.appendChild(this._renderFilaBobina(labelsCsv.split(",")))
    }

    // Recolecta las filas con al menos un campo con datos — filas vacías (el analista agregó una
    // de más y no la usó) se ignoran en vez de mandarlas como bobina en blanco.
    _leerBobinas(containerId) {
      const contenedor = document.getElementById(containerId)
      if (!contenedor) return []

      const num = (input) => (input.value === "" ? null : parseFloat(input.value))
      const filas = []
      contenedor.querySelectorAll(".mlb-bobina-row").forEach(row => {
        const numeroBobina = row.querySelector(".mlb-bob-numero").value.trim()
        const lote = row.querySelector(".mlb-bob-lote").value.trim()
        const posicion = row.querySelector(".mlb-bob-posicion").value
        const valor1 = num(row.querySelector(".mlb-bob-v1"))
        const valor2 = num(row.querySelector(".mlb-bob-v2"))
        const valor3 = num(row.querySelector(".mlb-bob-v3"))
        if (!numeroBobina && !lote && valor1 === null && valor2 === null && valor3 === null) return
        filas.push({ numeroBobina: numeroBobina || null, lote: lote || null, posicion, valor1, valor2, valor3 })
      })
      return filas
    }

    _refrescarMetodoAuto(tipoEnsayo, inputId, variante) {
      const input = document.getElementById(inputId)
      if (!input) return

      const candidatos = (this._catalogos.metodos || []).filter(m => m.tipoEnsayo === tipoEnsayo)
      const match = variante ? candidatos.find(m => m.variante === variante) : candidatos.find(m => !m.variante)

      if (!match) {
        input.value = "(sin método configurado en el maestro)"
        return
      }
      const codigoVersion = [match.codigo, match.version ? `v${match.version}` : null].filter(Boolean).join(" ")
      input.value = codigoVersion ? `${match.nombre} (${codigoVersion})` : match.nombre
    }
    cerrarModal(id) {
      document.getElementById(id).style.display = "none"
      this._limpiarCorreccion()
    }

    // =====================================================================
    // LISTA
    // =====================================================================
    limpiarFiltros() {
      document.getElementById("mlbFiltroEstado").value = ""
      document.getElementById("mlbFiltroNp").value = ""
      document.getElementById("mlbFiltroFechaDesde").value = ""
      document.getElementById("mlbFiltroFechaHasta").value = ""
      document.getElementById("mlbFiltroCliente").value = ""
      document.getElementById("mlbFiltroCodigo").value = ""
      document.getElementById("mlbFiltroDescripcion").value = ""
      document.getElementById("mlbFiltroOrigen").value = ""
      document.getElementById("mlbFiltroMaquina").value = ""
      document.getElementById("mlbFiltroAnalista").value = ""
      document.getElementById("mlbFiltroBobina").value = ""
      this.deepLinkEstado = null
      this.cargarLista()
    }

    async cargarLista() {
      const body = document.getElementById("mlbMuestrasBody")
      body.innerHTML = '<tr><td colspan="12" style="text-align:center;">Cargando...</td></tr>'

      try {
        const estado = this.deepLinkEstado || document.getElementById("mlbFiltroEstado")?.value || ""
        const np = document.getElementById("mlbFiltroNp")?.value?.trim() || ""
        const fechaDesde = document.getElementById("mlbFiltroFechaDesde")?.value || ""
        const fechaHasta = document.getElementById("mlbFiltroFechaHasta")?.value || ""
        const cliente = document.getElementById("mlbFiltroCliente")?.value?.trim() || ""
        const codigoProducto = document.getElementById("mlbFiltroCodigo")?.value?.trim() || ""
        const descripcion = document.getElementById("mlbFiltroDescripcion")?.value?.trim() || ""
        const origen = document.getElementById("mlbFiltroOrigen")?.value || ""
        const maquinaIdFiltro = document.getElementById("mlbFiltroMaquina")?.value || ""
        const analistaNombre = document.getElementById("mlbFiltroAnalista")?.value?.trim() || ""
        const bobina = document.getElementById("mlbFiltroBobina")?.value?.trim() || ""

        const res = await window.PhotinoBridge.send({
          action: "muestraLab.list",
          data: {
            estado, np, fechaDesde, fechaHasta, cliente, codigoProducto, descripcion, origen,
            maquinaId: maquinaIdFiltro ? parseInt(maquinaIdFiltro, 10) : null,
            analistaNombre, bobina
          }
        })

        if (!res || res.ok === false) throw new Error(res?.error || "Error cargando muestras")

        const items = res.data || []
        this.renderDeepLinkBanner(items.length)

        if (items.length === 0) {
          body.innerHTML = '<tr><td colspan="12" style="text-align:center;">Sin muestras registradas</td></tr>'
          return
        }

        body.innerHTML = items.map(m => `
          <tr>
            <td>${m.id}</td>
            <td>${this._esc(m.fechaIngreso || "-")}</td>
            <td>${this._esc(m.origen || "-")}</td>
            <td>${this._esc(m.tipoMuestra || "-")}</td>
            <td>${this._esc(m.np || "-")}</td>
            <td>${this._esc(m.cliente || "-")}</td>
            <td>${this._esc(m.codigoProducto || "-")}</td>
            <td class="mlb-articulos" data-np="${this._escAttr(String(m.np || "").trim())}">${this._celdaArticulos(this._articulosCache.get(this._claveArticulos(m.np, 0)), m.np)}</td>
            <td>${this._esc(m.totalEnsayos)}</td>
            <td>${this._esc(this._labelEstado(m.estado))}</td>
            <td>${this._esc(m.evaluacion || "-")}</td>
            <td>
              <button class="btn-secondary mlb-ver-btn" data-id="${m.id}">Ver</button>
              <button class="btn-danger mlb-eliminar-btn" data-id="${m.id}">Eliminar</button>
            </td>
          </tr>
        `).join("")
        this._resolverArticulosLista(items)
      } catch (err) {
        console.error(err)
        body.innerHTML = `<tr><td colspan="12" style="text-align:center;">${this._esc(err.message)}</td></tr>`
      }
    }

    // =====================================================================
    // ARTÍCULOS (números de artículo de la NV INNPACK en SAP, vía fps-api)
    // Se resuelven al mostrar, a partir de la NP guardada: no se guardan ni reemplazan el código
    // registrado. Si la relación NP → NV INNPACK no es inequívoca, se muestra "-".
    // =====================================================================
    get _articulosCache() {
      if (!this.__articulosCache) this.__articulosCache = new Map()
      return this.__articulosCache
    }

    _claveArticulos(np, idProcesoFps) {
      return `${String(np || "").trim()}|${Number(idProcesoFps) > 0 ? Number(idProcesoFps) : 0}`
    }

    _npValida(np) {
      return /^[0-9]{1,9}$/.test(String(np || "").trim()) && Number(np) > 0
    }

    _motivoArticulos(estado) {
      return {
        SIN_NV_INNPACK: "La NP no tiene nota de venta INNPACK asociada en FPS",
        SIN_ARTICULOS: "La nota de venta INNPACK no tiene artículos en SAP",
        AMBIGUO: "La NP corresponde a más de una nota de venta INNPACK; no se puede determinar cuál",
        SAP_NO_DISPONIBLE: "SAP no respondió; intenta más tarde",
        FPS_NO_DISPONIBLE: "FPS no respondió; intenta más tarde",
        NP_NO_ENCONTRADA: "La NP no existe en FPS",
        NO_DISPONIBLE: "Artículos aún no disponibles: FPS API todavía no los entrega",
      }[estado] || "Sin dato"
    }

    // r = resultado del backend ({estado, articulos}) o undefined si aún no se consulta.
    _celdaArticulos(r, np) {
      if (!this._npValida(np)) return "-"
      if (!r) return '<span style="color:#94A3B8;">…</span>'
      if (r.estado === "OK" && r.articulos?.length) return this._htmlItemsArticulos(r.items, r.articulos)
      return `<span title="${this._escAttr(this._motivoArticulos(r.estado))}">-</span>`
    }

    // Una línea por relación ítem → artículo de la NV ("Ítem 2: 4637007530603"). Sin número de ítem, solo el artículo.
    _textosItemsArticulos(items, articulos) {
      const pares = (items || []).filter(p => p && p.articulo)
      if (!pares.length) return (articulos || []).filter(Boolean)
      return pares.map(p => (p.item ? `Ítem ${p.item}: ${p.articulo}` : p.articulo))
    }

    _htmlItemsArticulos(items, articulos) {
      return this._textosItemsArticulos(items, articulos).map(t => `<div style="white-space:nowrap;">${this._esc(t)}</div>`).join("")
    }

    // Resuelve las NP del listado en lotes (sin repetir NP ya consultadas en esta sesión) y
    // actualiza solo la celda Artículo(s); la tabla no se vuelve a pintar. Un error deja "-".
    async _resolverArticulosLista(items) {
      const seq = this._articulosSeq = (this._articulosSeq || 0) + 1
      const nps = [...new Set(items.map(m => String(m.np || "").trim()))]
        .filter(np => this._npValida(np) && !this._articulosCache.has(this._claveArticulos(np, 0)))
      const LOTE = 50
      const t0 = performance.now()
      for (let i = 0; i < nps.length; i += LOTE) {
        const lote = nps.slice(i, i + LOTE)
        let resultados = []
        try {
          const res = await window.PhotinoBridge.send({ action: "muestraLab.articulosNp", data: { muestras: lote.map(np => ({ np })) } })
          if (res && res.ok !== false) resultados = res.data || []
        } catch (err) {
          console.error("Artículos NV INNPACK:", err)
        }
        for (const np of lote) {
          const r = resultados.find(x => String(x.np) === np && !(Number(x.idProcesoFps) > 0))
          // Solo se recuerdan los resultados definitivos; un fallo temporal se reintenta al recargar.
          const definitivo = r && !["SAP_NO_DISPONIBLE", "FPS_NO_DISPONIBLE", "NO_DISPONIBLE"].includes(r.estado)
          if (definitivo) this._articulosCache.set(this._claveArticulos(np, 0), r)
          if (seq !== this._articulosSeq) continue
          this._pintarCeldasArticulos(np, r || { estado: "NO_DISPONIBLE", articulos: [] })
        }
        if (seq !== this._articulosSeq) return
      }
      if (nps.length) console.log(`[Laboratorio] Artículos de ${nps.length} NP en ${Math.round(performance.now() - t0)} ms`)
    }

    _pintarCeldasArticulos(np, r) {
      document.querySelectorAll("#mlbMuestrasBody td.mlb-articulos").forEach(td => {
        if (td.dataset.np === np) td.innerHTML = this._celdaArticulos(r, np)
      })
    }

    // Ver muestra: con idProcesoFps se resuelven también las NP con varias NV INNPACK.
    async _mostrarArticulosDetalle(m) {
      const el = document.getElementById("mlbDetArticulos")
      if (!el) return
      if (!this._npValida(m.np)) { el.textContent = "-"; return }
      const clave = this._claveArticulos(m.np, m.idProcesoFps)
      let r = this._articulosCache.get(clave)
      if (!r) {
        el.innerHTML = '<span style="color:#94A3B8;">Consultando…</span>'
        try {
          const res = await window.PhotinoBridge.send({
            action: "muestraLab.articulosNp",
            data: { muestras: [{ np: String(m.np).trim(), idProcesoFps: Number(m.idProcesoFps) > 0 ? Number(m.idProcesoFps) : null }] },
          })
          r = res && res.ok !== false ? (res.data || [])[0] : null
        } catch (err) {
          console.error("Artículos NV INNPACK:", err)
        }
        if (r && !["SAP_NO_DISPONIBLE", "FPS_NO_DISPONIBLE", "NO_DISPONIBLE"].includes(r.estado)) this._articulosCache.set(clave, r)
      }
      // Si mientras tanto se abrió otra muestra, no se pisa su dato.
      if (document.getElementById("mlbDetId")?.textContent !== String(m.id)) return
      el.innerHTML = this._celdaArticulos(r || { estado: "NO_DISPONIBLE", articulos: [] }, m.np)
    }

    // Borrado lógico (columna `eliminado`, distinto de "Anular" — que solo cambia el estado del
    // registro conservando el historial). Eliminar oculta la fila de todos los listados/filtros.
    async eliminarMuestra(id) {
      if (!confirm(`¿Eliminar la muestra #${id}? Esta acción la ocultará de todos los listados y no se puede deshacer desde la interfaz.`)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.eliminar", data: { id } })
        if (!res || res.ok === false) throw new Error(res?.error || "Error eliminando la muestra")
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ESPECIFICACIONES
    // =====================================================================
    // ---------- Métodos de ensayo (Punto 32 del REG-LAB-04) ----------

    async abrirMetodos() {
      this.limpiarFormMetodo()
      await this.cargarMetodos()
      this.abrirModal("mlbModalMetodos")
    }

    async cargarMetodos() {
      const body = document.getElementById("mlbMetodoBody")
      body.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando...</td></tr>'

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.metodo.list", data: {} })
        if (!res || res.ok === false) throw new Error(res?.error || "Error cargando métodos")

        const items = res.data || []
        if (items.length === 0) {
          body.innerHTML = '<tr><td colspan="8" style="text-align:center;">Sin métodos cargados</td></tr>'
          return
        }

        body.innerHTML = items.map(m => `
          <tr>
            <td>${this._esc(m.tipoEnsayo)}</td>
            <td>${this._esc(m.variante || "-")}</td>
            <td>${this._esc(m.nombre)}${m.cara || m.tiempoSegundos ? `<br><small>Cara: ${this._esc(m.cara || "la elige el analista")} · Tiempo: ${m.tiempoSegundos ? `${m.tiempoSegundos} s` : "lo elige el analista"}</small>` : ""}</td>
            <td>${this._esc(m.codigo || "-")}</td>
            <td>${this._esc(m.version || "-")}</td>
            <td>${this._esc(this._u(m.unidad) || "-")}</td>
            <td>${m.activo ? "Sí" : "No"}</td>
            <td>
              <button class="btn-secondary mlb-metodo-editar-btn" data-metodo='${JSON.stringify(m).replace(/'/g, "&apos;")}'>Editar</button>
              <button class="btn-secondary mlb-metodo-toggle-btn" data-id="${m.id}" data-activo="${m.activo}">${m.activo ? "Desactivar" : "Activar"}</button>
            </td>
          </tr>
        `).join("")
      } catch (err) {
        body.innerHTML = `<tr><td colspan="8" style="text-align:center;">${this._esc(err.message)}</td></tr>`
      }

      // Refresca los catálogos en memoria para que los modales de ensayo reflejen el cambio
      // sin esperar a recargar el módulo completo.
      await this.cargarCatalogos()
    }

    limpiarFormMetodo() {
      document.getElementById("mlbMetodoId").value = ""
      document.getElementById("mlbMetodoTipoEnsayo").value = "HUMEDAD"
      document.getElementById("mlbMetodoVariante").value = ""
      document.getElementById("mlbMetodoNombre").value = ""
      document.getElementById("mlbMetodoCodigo").value = ""
      document.getElementById("mlbMetodoVersion").value = ""
      document.getElementById("mlbMetodoUnidad").value = ""
      document.getElementById("mlbMetodoCara").value = ""
      document.getElementById("mlbMetodoTiempo").value = ""
      document.getElementById("mlbMetodoFormTitulo").textContent = "Nuevo método"
    }

    editarMetodo(m) {
      document.getElementById("mlbMetodoId").value = m.id
      document.getElementById("mlbMetodoTipoEnsayo").value = m.tipoEnsayo
      document.getElementById("mlbMetodoVariante").value = m.variante || ""
      document.getElementById("mlbMetodoNombre").value = m.nombre || ""
      document.getElementById("mlbMetodoCodigo").value = m.codigo || ""
      document.getElementById("mlbMetodoVersion").value = m.version || ""
      document.getElementById("mlbMetodoUnidad").value = m.unidad || ""
      document.getElementById("mlbMetodoCara").value = m.cara || ""
      document.getElementById("mlbMetodoTiempo").value = m.tiempoSegundos ?? ""
      document.getElementById("mlbMetodoFormTitulo").textContent = `Editando método #${m.id}`
    }

    async guardarMetodo() {
      const idVal = document.getElementById("mlbMetodoId").value

      const data = {
        id: idVal ? parseInt(idVal, 10) : null,
        tipoEnsayo: document.getElementById("mlbMetodoTipoEnsayo").value,
        variante: document.getElementById("mlbMetodoVariante").value,
        nombre: document.getElementById("mlbMetodoNombre").value.trim(),
        codigo: document.getElementById("mlbMetodoCodigo").value.trim(),
        version: document.getElementById("mlbMetodoVersion").value.trim(),
        unidad: document.getElementById("mlbMetodoUnidad").value.trim(),
        cara: document.getElementById("mlbMetodoCara").value || null,
        tiempoSegundos: document.getElementById("mlbMetodoTiempo").value ? parseInt(document.getElementById("mlbMetodoTiempo").value, 10) : null
      }

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.metodo.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando el método")

        this.limpiarFormMetodo()
        await this.cargarMetodos()
        // La cara y el tiempo de Cobb definidos por el administrador viajan en la configuración.
        await this._cargarConfigMuestras()
      } catch (err) {
        alert(err.message)
      }
    }

    async toggleMetodo(id, activoActual) {
      try {
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.metodo.activar",
          data: { id, activo: !activoActual }
        })
        if (!res || res.ok === false) throw new Error(res?.error || "Error actualizando el método")

        await this.cargarMetodos()
        await this._cargarConfigMuestras()
      } catch (err) {
        alert(err.message)
      }
    }

    async abrirEspecificaciones() {
      this.limpiarFormEspecificacion()
      await this.cargarEspecificaciones()
      this.abrirModal("mlbModalEspecificaciones")
    }

    async cargarEspecificaciones() {
      const body = document.getElementById("mlbEspecBody")
      body.innerHTML = '<tr><td colspan="8" style="text-align:center;">Cargando...</td></tr>'

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.especificacion.list", data: {} })
        if (!res || res.ok === false) throw new Error(res?.error || "Error cargando especificaciones")

        const items = res.data || []
        if (items.length === 0) {
          body.innerHTML = '<tr><td colspan="8" style="text-align:center;">Sin especificaciones cargadas</td></tr>'
          return
        }

        body.innerHTML = items.map(s => `
          <tr>
            <td>${this._esc(s.tipoMuestra)}</td>
            <td>${this._esc(s.tipoEnsayo)}</td>
            <td>${this._esc(s.codigoProducto || "(todos)")}</td>
            <td>${this._esc(s.limiteMin ?? "-")}</td>
            <td>${this._esc(s.limiteMax ?? "-")}</td>
            <td>${this._esc(this._u(s.unidad) || "-")}</td>
            <td>${s.activo ? "Sí" : "No"}</td>
            <td>
              <button class="btn-secondary mlb-espec-editar-btn" data-espec='${JSON.stringify(s).replace(/'/g, "&apos;")}'>Editar</button>
              <button class="btn-secondary mlb-espec-toggle-btn" data-id="${s.id}" data-activo="${s.activo}">${s.activo ? "Desactivar" : "Activar"}</button>
            </td>
          </tr>
        `).join("")
      } catch (err) {
        body.innerHTML = `<tr><td colspan="8" style="text-align:center;">${this._esc(err.message)}</td></tr>`
      }
    }

    limpiarFormEspecificacion() {
      document.getElementById("mlbEspecId").value = ""
      document.getElementById("mlbEspecTipoMuestra").value = "Papel"
      document.getElementById("mlbEspecTipoEnsayo").value = "HUMEDAD"
      document.getElementById("mlbEspecCodigo").value = ""
      document.getElementById("mlbEspecMin").value = ""
      document.getElementById("mlbEspecMax").value = ""
      document.getElementById("mlbEspecUnidad").value = ""
      document.getElementById("mlbEspecFormTitulo").textContent = "Nueva especificación"
    }

    editarEspecificacion(s) {
      document.getElementById("mlbEspecId").value = s.id
      document.getElementById("mlbEspecTipoMuestra").value = s.tipoMuestra
      document.getElementById("mlbEspecTipoEnsayo").value = s.tipoEnsayo
      document.getElementById("mlbEspecCodigo").value = s.codigoProducto || ""
      document.getElementById("mlbEspecMin").value = s.limiteMin ?? ""
      document.getElementById("mlbEspecMax").value = s.limiteMax ?? ""
      document.getElementById("mlbEspecUnidad").value = s.unidad || ""
      document.getElementById("mlbEspecFormTitulo").textContent = `Editando especificación #${s.id}`
    }

    async guardarEspecificacion() {
      const idVal = document.getElementById("mlbEspecId").value
      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }

      const data = {
        id: idVal ? parseInt(idVal, 10) : null,
        tipoMuestra: document.getElementById("mlbEspecTipoMuestra").value,
        tipoEnsayo: document.getElementById("mlbEspecTipoEnsayo").value,
        codigoProducto: document.getElementById("mlbEspecCodigo").value.trim(),
        limiteMin: num("mlbEspecMin"),
        limiteMax: num("mlbEspecMax"),
        unidad: document.getElementById("mlbEspecUnidad").value.trim()
      }

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.especificacion.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando la especificación")

        this.limpiarFormEspecificacion()
        await this.cargarEspecificaciones()
      } catch (err) {
        alert(err.message)
      }
    }

    async toggleEspecificacion(id, activoActual) {
      try {
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.especificacion.activar",
          data: { id, activo: !activoActual }
        })
        if (!res || res.ok === false) throw new Error(res?.error || "Error actualizando la especificación")

        await this.cargarEspecificaciones()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // NUEVA MUESTRA
    // =====================================================================
    abrirNuevaMuestra() {
      document.getElementById("mlbNmNp").value = ""
      document.getElementById("mlbNmCliente").value = ""
      document.getElementById("mlbNmCodigo").value = ""
      document.getElementById("mlbNmDescripcion").value = ""
      document.getElementById("mlbNmMaquina").value = ""
      document.getElementById("mlbNmTipoOnda").value = ""
      document.getElementById("mlbNmTurno").value = ""
      document.getElementById("mlbNmLote").value = ""
      document.getElementById("mlbNmProveedor").value = ""
      document.getElementById("mlbNmObservacion").value = ""
      document.getElementById("mlbNmSolicitante").value = ""
      document.getElementById("mlbNmEtapaOrigen").value = ""
      document.getElementById("mlbNmMotivoSolicitud").value = ""
      document.getElementById("mlbNmEnsayosRequeridos").value = ""
      document.getElementById("mlbNmOrigen").value = "ControlRecepcion"
      document.getElementById("mlbNmOrigenMaterial").value = ""
      document.getElementById("mlbNmTipoControl").value = ""
      document.getElementById("mlbNmPruebaSolicitadaBloque").style.display = "none"
      document.getElementById("mlbNmMonotapaBloque").style.display = "none"
      document.getElementById("mlbNmEmplacadoBloque").style.display = "none"
      document.getElementById("mlbNmPesoOndaExtendida").value = ""
      document.getElementById("mlbNmPesoRecorte10x10").value = ""
      document.getElementById("mlbNmLongitudOndaExtendida").value = ""
      document.getElementById("mlbNmAlturaOnda").value = ""
      document.getElementById("mlbNmMonotapaRelacionadaId").value = ""
      document.getElementById("mlbNmMonotapaRelacionadaInfo").textContent = ""
      document.getElementById("mlbNmPliegoRelacionado").value = ""

      document.getElementById("mlbNmCliente").disabled = false
      document.getElementById("mlbNmCodigo").disabled = false
      document.getElementById("mlbNmDescripcion").disabled = false
      this._limpiarSeleccionFps()
      this._ponerDatosNotaVentaFps(null)
      ;["mlbNmLargoNominal", "mlbNmAnchoNominal", "mlbNmAltoNominal"].forEach(id => { document.getElementById(id).value = "" })

      this.abrirModal("mlbModalNuevaMuestra")
    }

    // Punto 20 REG-LAB-04: valida el id de la muestra Monotapa relacionada y muestra un resumen
    // (no bloquea el campo — igual criterio que "resolver bobina", solo informativo/de apoyo).
    async _buscarMonotapaRelacionada() {
      const info = document.getElementById("mlbNmMonotapaRelacionadaInfo")
      const idVal = document.getElementById("mlbNmMonotapaRelacionadaId").value
      if (!idVal) { info.textContent = ""; return }

      info.textContent = "Buscando..."
      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.detalle", data: { id: parseInt(idVal, 10) } })
        if (!res || res.ok === false || !res.data) throw new Error("No se encontró esa muestra")
        if (res.data.origen !== "Monotapa") throw new Error(`La muestra #${res.data.id} no es de origen Monotapa (es ${res.data.origen})`)

        info.textContent = `✓ Muestra #${res.data.id} — NP ${res.data.np || "-"} — ${res.data.fechaIngreso}`
      } catch (err) {
        info.textContent = `⚠ ${err.message}`
      }
    }

    // Puntos 1/8/9/10/38 REG-LAB-04: abre la vista agrupada de todos los controles que comparten
    // la misma NP + N.º de registro de producción que la muestra actualmente abierta.
    async verRegistroProduccion() {
      const m = this._muestraActualDetalle
      if (!m || !m.np) return

      const lote = m.lote || (m.registroProduccionRecordKey ? String(m.registroProduccionRecordKey) : "")
      document.getElementById("mlbRegProdSubtitulo").textContent = `NP ${m.np}${lote ? ` — N.º de registro de producción ${lote}` : ""}`
      const body = document.getElementById("mlbRegProdBody")
      body.innerHTML = '<tr><td colspan="9" style="text-align:center;">Cargando...</td></tr>'
      this.abrirModal("mlbModalRegistroProduccion")

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.registroProduccion.list", data: { np: m.np, lote } })
        if (!res || res.ok === false) throw new Error(res?.error || "Error cargando los controles de esta producción")

        const items = res.data || []
        if (items.length === 0) {
          body.innerHTML = '<tr><td colspan="9" style="text-align:center;">Sin otros controles registrados para esta producción</td></tr>'
          return
        }

        body.innerHTML = items.map(c => `
          <tr${c.id === m.id ? ' style="font-weight:700; background:#f1f5f9;"' : ""}>
            <td>${this._esc(c.origen)}</td>
            <td>${this._esc(c.tipoMuestra)}</td>
            <td>${this._esc(c.fechaEnsayo || c.fechaIngreso)}</td>
            <td>${this._esc(c.maquina || "-")}</td>
            <td>${this._esc(c.turno || "-")}</td>
            <td>${this._esc(this._labelEstado(c.estado))}</td>
            <td>${this._esc(c.evaluacion || "-")}</td>
            <td>${this._esc(c.totalEnsayos)}</td>
            <td><button class="btn-secondary mlb-regprod-ver-btn" data-id="${c.id}">${c.id === m.id ? "(actual)" : "Ver"}</button></td>
          </tr>
        `).join("")
      } catch (err) {
        body.innerHTML = `<tr><td colspan="9" style="text-align:center;">${this._esc(err.message)}</td></tr>`
      }
    }

    // REG-LAB-04 (Prioridad 1): una sola consulta a FPS (fps-api, vía muestraLab.consultarRegistrosFps)
    // por NP Faret o Innpack. Trae las órdenes que coinciden (los dos correlativos se cruzan: si hay
    // más de una, el analista elige), los procesos de laboratorio (Corrugado/Emplacado/Troquel/
    // Termoformado/Pegado) y TODAS sus sesiones. Nunca se preselecciona un registro.
    async _consultarNp() {
      const np = document.getElementById("mlbNmNp").value.trim()
      if (!np) return alert("Ingresa la NP antes de consultar")
      if (!/^[0-9]+$/.test(np)) return alert("La NP debe ser numérica (Faret o Innpack)")

      this._limpiarSeleccionFps()
      const seq = ++this._fpsConsultaSeq
      this._fpsNpEnConsulta = np
      const btn = document.getElementById("mlbNmBtnConsultarNp")
      btn.disabled = true
      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.consultarRegistrosFps", data: { np } })
        // M8b: si mientras tanto se cambió el NP o se limpió la selección, esta respuesta ya no vale.
        if (seq !== this._fpsConsultaSeq) return
        if (!res || res.ok === false) throw new Error(res?.error || "No se pudo consultar la NP en FPS")

        const datos = res.data || {}
        const ordenes = datos.ordenes || []
        if (ordenes.length === 0) throw new Error(`No se encontró la NP ${np} en FPS`)
        this._fpsDatos = { ordenes, procesos: datos.procesos || [], registros: datos.registros || [] }
        this._fpsNpConsultada = np

        const selOrden = document.getElementById("mlbNmOrdenFps")
        const coincide = o => [o.coincideNpFaret ? "NP Faret" : null, o.coincideNpInnpack ? "NP Innpack" : null].filter(Boolean).join(" y ")
        selOrden.innerHTML = (ordenes.length > 1 ? '<option value="">-- Seleccionar orden --</option>' : "") +
          ordenes.map(o => `<option value="${o.ordenTrabajo}">NP Faret ${this._esc(o.npFaret || "-")} / NP Innpack ${this._esc(o.npInnpack || "-")} — ${this._esc(o.cliente || "-")} (coincide como ${coincide(o)})</option>`).join("")
        document.getElementById("mlbNmOrdenWrap").style.display = ""
        this._onCambiarOrdenFps()
      } catch (err) {
        if (seq === this._fpsConsultaSeq) alert(err.message)
      } finally {
        btn.disabled = false
      }
    }

    _limpiarSeleccionFps() {
      this._fpsConsultaSeq++
      this._fpsNpConsultada = null
      this._fpsNpEnConsulta = null
      this._soltarRegistroFps()
      this._fpsDatos = null
      this._fpsRegistrosVisibles = []
      ;["mlbNmOrdenWrap", "mlbNmItemWrap", "mlbNmEtapaWrap", "mlbNmRegistroWrap", "mlbNmFpsInfo"].forEach(id => {
        document.getElementById(id).style.display = "none"
      })
      document.getElementById("mlbNmTablaRegistrosBody").innerHTML = ""
      this._ponerDatosNotaVentaFps(null)
      this._soltarClienteFps()
      document.getElementById("mlbNmCodigo").disabled = false
      document.getElementById("mlbNmDescripcion").disabled = false
    }

    // Deshace lo que llenó el registro FPS elegido (código, descripción y turno) para que un
    // cambio de NP/orden/filtro no deje datos de otro registro. El turno solo se borra si el
    // analista no lo cambió a mano.
    _soltarRegistroFps() {
      const auto = this._fpsAutollenado
      this._fpsSnapshot = null
      this._fpsAutollenado = null
      document.getElementById("mlbNmFpsInfo").style.display = "none"
      this._mostrarCampoMaquina(true)
      if (!auto) return
      document.getElementById("mlbNmCodigo").value = ""
      document.getElementById("mlbNmDescripcion").value = ""
      document.getElementById("mlbNmCodigo").disabled = false
      document.getElementById("mlbNmDescripcion").disabled = false
      const turno = document.getElementById("mlbNmTurno")
      if (auto.turno && turno.value === auto.turno) turno.value = ""
      const maquina = document.getElementById("mlbNmMaquina")
      if (auto.maquina && maquina.value === auto.maquina) maquina.value = ""
      const origen = document.getElementById("mlbNmOrigen")
      if (auto.origen && origen.value === auto.origen) {
        origen.value = "ControlRecepcion"
        origen.dispatchEvent(new Event("change", { bubbles: true }))
      }
    }

    // M8: el cliente que puso la orden FPS se borra (y el campo se rehabilita) cuando ya no hay orden
    // elegida; si el analista lo cambió a mano, no se toca.
    _soltarClienteFps() {
      const cliente = document.getElementById("mlbNmCliente")
      if (this._fpsClienteAuto !== null && this._fpsClienteAuto !== undefined && cliente.value === this._fpsClienteAuto) cliente.value = ""
      this._fpsClienteAuto = null
      cliente.disabled = false
    }

    // REG-LAB-04 v2, sección 16 ("de FPS, en la nota de venta sale la información"): formato y
    // antecedentes técnicos de la OF/NV tal como los entrega FPS. Lo que FPS no trae queda vacío
    // (no se deduce ni se inventa). orden = null limpia los campos.
    _ponerDatosNotaVentaFps(orden) {
      const formato = (orden?.formato || "").trim()
      const fmt = document.getElementById("mlbNmFormatoFps")
      fmt.value = formato
      fmt.disabled = !!formato
      const lineas = []
      if (orden?.sustrato?.trim()) lineas.push(`Sustrato: ${orden.sustrato.trim()}`)
      if (orden?.guiaTecnica?.trim()) lineas.push(`Guía técnica: ${orden.guiaTecnica.trim()}`)
      if (orden?.ordenDeCompra?.trim()) lineas.push(`Orden de compra: ${orden.ordenDeCompra.trim()}`)
      const antecedentes = document.getElementById("mlbNmAntecedentesFps")
      antecedentes.value = lineas.join("\n")
      antecedentes.readOnly = lineas.length > 0 // si FPS no trae nada, el analista puede escribirlos

      // Artículos de la NV INNPACK de la orden elegida (solo informativo, no se guarda).
      const wrapArt = document.getElementById("mlbNmArticulosWrap")
      const pares = []
      for (const a of orden?.articulosInnpack || []) {
        if (!a?.itemCode) continue
        for (const item of (a.items?.length ? a.items : [""])) {
          if (!pares.some(p => p.item === item && p.articulo === a.itemCode)) pares.push({ item, articulo: a.itemCode })
        }
      }
      pares.sort((x, y) => (parseInt(x.item, 10) || Infinity) - (parseInt(y.item, 10) || Infinity))
      const textos = this._textosItemsArticulos(pares, [])
      document.getElementById("mlbNmArticulosTexto").textContent = textos.length ? textos.join(" · ")
        : !orden?.npInnpack ? "la orden no tiene nota de venta INNPACK" : "sin dato en SAP"
      // Sin el campo (backend anterior, p. ej. la web) no se afirma nada: el bloque queda oculto.
      wrapArt.style.display = orden && Array.isArray(orden.articulosInnpack) ? "" : "none"
    }

    _numeroONull(id) {
      const v = document.getElementById(id).value.trim()
      return v === "" ? null : Number(v)
    }

    // "L × A × H mm" con lo que haya (nunca se completa lo que falta).
    _textoDimensiones(m) {
      const partes = [["L", m.largoNominalMm], ["A", m.anchoNominalMm], ["H", m.altoNominalMm]]
        .filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => `${k} ${this._emFormato(v, 2)}`)
      return partes.length ? `${partes.join(" × ")} mm` : ""
    }

    _ordenFpsActual() {
      const valor = document.getElementById("mlbNmOrdenFps").value
      if (!this._fpsDatos || !valor) return null
      return this._fpsDatos.ordenes.find(o => String(o.ordenTrabajo) === valor) || null
    }

    _etapaLaboratorio(categoria) {
      return { CORRUGADO: "Corrugado", EMPLACADO: "Emplacado", TROQUEL: "Troquelado", TERMOFORMADO: "Termoformado", PEGADO: "Pegado" }[categoria] || categoria || "-"
    }

    _onCambiarOrdenFps() {
      this._soltarRegistroFps()
      const orden = this._ordenFpsActual()
      if (!orden) {
        ;["mlbNmItemWrap", "mlbNmEtapaWrap", "mlbNmRegistroWrap"].forEach(id => { document.getElementById(id).style.display = "none" })
        // M8: sin orden elegida no quedan cliente, formato ni antecedentes de la orden anterior.
        this._ponerDatosNotaVentaFps(null)
        this._soltarClienteFps()
        return
      }

      document.getElementById("mlbNmCliente").value = orden.cliente || ""
      this._fpsClienteAuto = orden.cliente || ""
      document.getElementById("mlbNmCliente").disabled = true
      this._ponerDatosNotaVentaFps(orden)

      const procesos = this._fpsDatos.procesos.filter(p => p.ordenTrabajo === orden.ordenTrabajo)
      const items = [...new Set(procesos.map(p => p.item || ""))].sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
      const ordenEtapas = ["CORRUGADO", "EMPLACADO", "TROQUEL", "TERMOFORMADO", "PEGADO"]
      const etapas = [...new Set(procesos.map(p => p.categoria))]
      etapas.sort((a, b) => ordenEtapas.indexOf(a) - ordenEtapas.indexOf(b))

      document.getElementById("mlbNmItemFps").innerHTML = '<option value="">Todos</option>' +
        items.map(i => `<option value="${this._escAttr(i)}">${i ? `Ítem ${this._esc(i)}` : "Sin ítem"}</option>`).join("")
      document.getElementById("mlbNmEtapaFps").innerHTML = '<option value="">Todos</option>' +
        etapas.map(c => `<option value="${this._escAttr(c)}">${this._esc(this._etapaLaboratorio(c))}</option>`).join("")
      document.getElementById("mlbNmItemWrap").style.display = ""
      document.getElementById("mlbNmEtapaWrap").style.display = ""
      this._renderRegistrosFps()
    }

    _renderRegistrosFps() {
      this._soltarRegistroFps()
      const orden = this._ordenFpsActual()
      if (!orden) return

      const item = document.getElementById("mlbNmItemFps").value
      const etapa = document.getElementById("mlbNmEtapaFps").value
      const procesos = new Map(this._fpsDatos.procesos
        .filter(p => p.ordenTrabajo === orden.ordenTrabajo && (!item || p.item === item) && (!etapa || p.categoria === etapa))
        .map(p => [p.idProceso, p]))

      this._fpsRegistrosVisibles = this._fpsDatos.registros
        .filter(r => procesos.has(r.idProceso))
        .map(r => ({ registro: r, proceso: procesos.get(r.idProceso) }))

      const body = document.getElementById("mlbNmTablaRegistrosBody")
      const total = this._fpsRegistrosVisibles.length
      document.getElementById("mlbNmRegistrosConteo").textContent = `— ${total} registro${total === 1 ? "" : "s"}`
      document.getElementById("mlbNmRegistroWrap").style.display = ""

      if (total === 0) {
        body.innerHTML = `<tr><td colspan="13" style="text-align:center;">${procesos.size === 0
          ? "Esta orden no tiene procesos de Corrugado, Emplacado, Troquelado, Termoformado ni Pegado para el filtro elegido"
          : "Sin sesiones de producción registradas en FPS para el filtro elegido"}</td></tr>`
        return
      }

      body.innerHTML = this._fpsRegistrosVisibles.map(({ registro: r, proceso: p }) => {
        const [fIni, hIni] = this._partirFechaFps(r.productionStartDate)
        const [fFin, hFin] = this._partirFechaFps(r.productionEndDate)
        const cantidad = this._numeroFps(r.productionQuantity)
        const etiquetas = [
          cantidad === 0 ? '<span style="display:inline-block; padding:1px 6px; border-radius:8px; font-size:11px; background:#fef3c7; color:#92400e;">Sin producción</span>' : "",
          r.status !== 1 ? '<span style="display:inline-block; padding:1px 6px; border-radius:8px; font-size:11px; background:#e2e8f0; color:#334155;" title="Status del registro en FPS distinto de 1">No vigente en FPS</span>' : "",
        ].join(" ")
        return `
          <tr>
            <td><input type="radio" name="mlbNmRegistroRadio" value="${this._escAttr(r.recordKey)}"></td>
            <td>${this._esc(r.recordKey)}</td>
            <td>${this._esc(orden.npFaret || "-")}</td>
            <td>${this._esc(orden.npInnpack || "-")}</td>
            <td>${this._esc(p.item || "-")}</td>
            <td title="${this._escAttr(p.nombreProceso || "")}">${this._esc(this._etapaLaboratorio(p.categoria))}</td>
            <td title="${this._escAttr(r.maquinaDescripcion || "")}">${this._esc(r.maquina || r.maquinaDescripcion || "-")}</td>
            <td>${this._esc(r.operador || "-")}</td>
            <td>${fIni}</td>
            <td>${hIni}</td>
            <td>${fFin}</td>
            <td>${hFin}</td>
            <td style="text-align:right;">${cantidad === null ? "-" : cantidad.toLocaleString("es-CL")} ${etiquetas}</td>
          </tr>`
      }).join("")
    }

    // Las fechas de FPS llegan como texto local "aaaa-mm-dd hh:mm:ss" (sin zona horaria). No se
    // pasan por new Date(): se separan como texto para no correr la hora.
    _partirFechaFps(texto) {
      const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(texto || "")
      if (!m) return ["-", "-"]
      return [`${m[3]}-${m[2]}-${m[1]}`, `${m[4]}:${m[5]}`]
    }

    _numeroFps(valor) {
      if (valor === null || valor === undefined || valor === "") return null
      const n = Number(valor)
      return Number.isFinite(n) ? n : null
    }

    _onSeleccionarRegistroProduccion(recordKey) {
      const elegido = this._fpsRegistrosVisibles.find(x => String(x.registro.recordKey) === String(recordKey))
      const orden = this._ordenFpsActual()
      if (!elegido || !orden) return

      // Cambiar de un registro a otro: primero se deshace lo que llenó el anterior.
      this._soltarRegistroFps()
      const { registro, proceso } = elegido
      this._fpsSnapshot = {
        orden,
        // `proceso.proceso` se conserva por compatibilidad con guardarNuevaMuestra (procesoTextoFps).
        proceso: { ...proceso, proceso: proceso.nombreProceso },
        registro,
        fechaConsultaFps: new Date().toISOString(),
      }

      document.getElementById("mlbNmCodigo").value = proceso.itemCode || ""
      document.getElementById("mlbNmDescripcion").value = proceso.itemName || ""
      document.getElementById("mlbNmCodigo").disabled = true
      document.getElementById("mlbNmDescripcion").disabled = true

      const [fIni, hIni] = this._partirFechaFps(registro.productionStartDate)
      document.getElementById("mlbNmRegistroTexto").textContent = `${registro.recordKey} (${this._etapaLaboratorio(proceso.categoria)}, ítem ${proceso.item || "-"})`
      document.getElementById("mlbNmOperadorTexto").textContent = registro.operador || "-"
      document.getElementById("mlbNmFechaProduccionTexto").textContent = fIni === "-" ? "-" : `${fIni} ${hIni}`
      document.getElementById("mlbNmFpsInfo").style.display = ""

      const turno = this._calcularTurnoDesdeTexto(registro.productionStartDate)
      if (turno) document.getElementById("mlbNmTurno").value = turno
      this._fpsAutollenado = { turno, maquina: null, origen: null }

      // Origen: si sigue en el valor por defecto, se toma la etapa del registro elegido (dato de
      // FPS, no una suposición). Si el analista ya eligió otro origen (ej. Monotapa), se respeta.
      const selOrigen = document.getElementById("mlbNmOrigen")
      const origenEtapa = { CORRUGADO: "Corrugado", EMPLACADO: "Emplacado", TROQUEL: "Troquelado", TERMOFORMADO: "Termoformado", PEGADO: "Pegado" }[proceso.categoria]
      if (origenEtapa && selOrigen.value === "ControlRecepcion") {
        selOrigen.value = origenEtapa
        selOrigen.dispatchEvent(new Event("change", { bubbles: true }))
        this._fpsAutollenado.origen = origenEtapa
      }

      // Sugiere la máquina por nombre si coincide con el catálogo real — el analista puede
      // corregirla igual, FPS y el catálogo QCC no son la misma fuente.
      const nombreFps = (registro.maquinaDescripcion || "").trim().toLowerCase()
      const nombreCortoFps = (registro.maquina || "").trim().toLowerCase()
      if (nombreFps || nombreCortoFps) {
        const match = this._catalogos.maquinas.find(m => {
          const n = m.nombre.trim().toLowerCase()
          return (nombreFps && n === nombreFps) || (nombreCortoFps && n === nombreCortoFps)
        })
        if (match) {
          document.getElementById("mlbNmMaquina").value = match.id
          this._fpsAutollenado.maquina = String(match.id)
          // La máquina ya se ve en el registro FPS elegido: el selector de abajo se oculta (conserva
          // su valor para guardar). Si no hubo coincidencia, queda visible para elegirla a mano.
          this._mostrarCampoMaquina(false)
        }
      }
    }

    _mostrarCampoMaquina(visible) {
      const campo = document.getElementById("mlbNmMaquina")?.closest(".mlb-form-campo")
      if (campo) campo.style.display = visible ? "" : "none"
    }

    // FPS entrega hora local como texto: se toma hh:mm directo del texto.
    _calcularTurnoDesdeTexto(texto) {
      const m = /^\d{4}-\d{2}-\d{2}[ T](\d{2}):(\d{2})/.exec(texto || "")
      if (!m) return null
      return this._calcularTurno(new Date(2000, 0, 1, parseInt(m[1], 10), parseInt(m[2], 10)))
    }

    // Misma regla de turno que ya usa la app móvil Flutter (core/utils/turno_calculator.dart):
    // A 07:00-14:29, B 14:30-23:29, C 23:30-06:59.
    _calcularTurno(fecha) {
      const minutos = fecha.getHours() * 60 + fecha.getMinutes()
      if (minutos >= 7 * 60 && minutos < 14 * 60 + 30) return "A"
      if (minutos >= 14 * 60 + 30 && minutos < 23 * 60 + 30) return "B"
      return "C"
    }

    // Resuelve un lote/bobina contra SAP (apisapfaret) — mismo endpoint que ya usa la app móvil
    // Flutter para el escaneo de bobinas. Solo informa; el valor tipeado por el analista es el
    // que se guarda, se use o no la resolución.
    async _resolverBobina(inputId, infoId) {
      const input = document.getElementById(inputId)
      const info = document.getElementById(infoId)
      if (!input || !info) return

      const lote = input.value.trim()
      if (!lote) return alert("Ingresa el número de bobina/lote antes de resolver")

      info.textContent = "Consultando SAP..."
      info.classList.remove("mlb-bobina-info-error")

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.resolverBobina", data: { lote } })
        if (!res || res.ok === false) throw new Error(res?.error || "No se encontró el lote en SAP")

        const d = res.data
        info.textContent = `${d.itemName || d.itemCode || "Sin descripción"}${d.ubicacion ? " · " + d.ubicacion : ""}`
      } catch (err) {
        info.textContent = err.message
        info.classList.add("mlb-bobina-info-error")
      }
    }

    async guardarNuevaMuestra() {
      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }
      const maquinaSel = document.getElementById("mlbNmMaquina")
      const tipoOndaSel = document.getElementById("mlbNmTipoOnda")
      const maquinaNombre = maquinaSel.selectedOptions[0]?.textContent || ""
      const registro = this._fpsSnapshot?.registro
      // M8b: el NP guardado debe ser el del registro FPS elegido (nunca uno editado después).
      if (this._fpsSnapshot && document.getElementById("mlbNmNp").value.trim() !== this._fpsNpConsultada) {
        return alert("El NP cambió después de elegir el registro de FPS. Vuelve a consultar la NP y selecciona el registro.")
      }

      const data = {
        origen: document.getElementById("mlbNmOrigen").value,
        origenMaterial: document.getElementById("mlbNmOrigenMaterial").value || null,
        tipoControl: document.getElementById("mlbNmTipoControl").value || null,
        tipoMuestra: document.getElementById("mlbNmTipoMuestra").value,
        np: document.getElementById("mlbNmNp").value.trim(),
        cliente: document.getElementById("mlbNmCliente").value.trim(),
        codigoProducto: document.getElementById("mlbNmCodigo").value.trim(),
        descripcion: document.getElementById("mlbNmDescripcion").value.trim(),
        maquina: maquinaSel.value ? maquinaNombre : "",
        maquinaId: maquinaSel.value ? parseInt(maquinaSel.value, 10) : null,
        tipoOndaId: tipoOndaSel.value ? parseInt(tipoOndaSel.value, 10) : null,
        turno: document.getElementById("mlbNmTurno").value.trim(),
        registroProduccionRecordKey: registro ? registro.recordKey : null,
        idProcesoFps: this._fpsSnapshot ? this._fpsSnapshot.proceso.idProceso : null,
        procesoTextoFps: this._fpsSnapshot ? this._fpsSnapshot.proceso.proceso : null,
        operadorTexto: registro ? registro.operador : null,
        fechaProduccionFps: registro ? registro.productionStartDate : null,
        fechaConsultaFps: this._fpsSnapshot ? this._fpsSnapshot.fechaConsultaFps : null,
        lote: document.getElementById("mlbNmLote").value.trim(),
        proveedor: document.getElementById("mlbNmProveedor").value.trim(),
        observacion: document.getElementById("mlbNmObservacion").value.trim(),
        solicitante: document.getElementById("mlbNmSolicitante").value.trim() || null,
        motivoSolicitud: document.getElementById("mlbNmMotivoSolicitud").value.trim() || null,
        etapaOrigen: document.getElementById("mlbNmEtapaOrigen").value || null,
        ensayosRequeridos: document.getElementById("mlbNmEnsayosRequeridos").value.trim() || null,
        pesoOndaExtendida: num("mlbNmPesoOndaExtendida"),
        pesoRecorte10x10: num("mlbNmPesoRecorte10x10"),
        longitudOndaExtendida: num("mlbNmLongitudOndaExtendida"),
        alturaOnda: num("mlbNmAlturaOnda"),
        monotapaRelacionadaId: document.getElementById("mlbNmMonotapaRelacionadaId").value
          ? parseInt(document.getElementById("mlbNmMonotapaRelacionadaId").value, 10) : null,
        pliegoRelacionado: document.getElementById("mlbNmPliegoRelacionado").value.trim() || null,
        formatoFps: document.getElementById("mlbNmFormatoFps").value.trim() || null,
        antecedentesFps: document.getElementById("mlbNmAntecedentesFps").value.trim() || null,
        largoNominalMm: this._numeroONull("mlbNmLargoNominal"),
        anchoNominalMm: this._numeroONull("mlbNmAnchoNominal"),
        altoNominalMm: this._numeroONull("mlbNmAltoNominal")
      }

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.crear", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error creando la muestra")

        this.cerrarModal("mlbModalNuevaMuestra")
        await this.cargarLista()
        await this.cargarIndicadores()
        await this.abrirDetalle(res.data.id)
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // DETALLE
    // =====================================================================
    async abrirDetalle(id) {
      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.detalle", data: { id } })
        if (!res || res.ok === false) throw new Error(res?.error || "Error cargando el detalle")

        this._muestraActualId = id
        this._muestraActualDetalle = res.data
        const m = res.data

        const maquinaNombre = this._catalogos.maquinas.find(x => x.id === m.maquinaId)?.nombre
        const tipoOndaNombre = this._catalogos.tiposOnda.find(x => x.id === m.tipoOndaId)?.nombre

        document.getElementById("mlbDetId").textContent = m.id
        document.getElementById("mlbDetResumen").innerHTML = `
          <div><b>${this._esc(this._labelEtapa(m.origen))}</b>Etapa productiva</div>
          <div><b>${this._esc(this._labelOrigenMaterial(m.origenMaterial))}</b>Origen del material</div>
          <div><b>${this._esc(m.tipoControl || "-")}</b>Tipo de control</div>
          <div><b>${this._esc(m.tipoMuestra || "-")}</b>Tipo de muestra</div>
          <div><b>${this._esc(m.np || "-")}</b>NP</div>
          <div><b>${this._esc(m.cliente || "-")}</b>Cliente</div>
          <div><b id="mlbDetArticulos">-</b>Ítem / Artículo (NV INNPACK)</div>
          <div><b>${this._esc(m.codigoProducto || "-")}</b>Cód. producción (registrado)</div>
          <div><b>${this._esc(this._labelEstado(m.estado))}</b>Estado</div>
          <div><b>${this._esc(m.evaluacion || "-")}</b>Evaluación</div>
          <div><b>${this._esc(maquinaNombre || m.maquina || "-")}</b>Máquina</div>
          <div><b>${this._esc(tipoOndaNombre || "-")}</b>Tipo de onda</div>
          <div><b>${this._esc(m.formatoFps || "-")}</b>Formato (FPS)</div>
          <div><b>${this._esc(this._textoDimensiones(m) || "-")}</b>Dimensiones nominales</div>
          ${m.antecedentesFps ? `<div style="grid-column:1/-1;white-space:pre-line;"><b>${this._esc(m.antecedentesFps)}</b>Antecedentes técnicos de la nota de venta (FPS)</div>` : ""}
          ${m.registroProduccionRecordKey ? `
            <div><b>${this._esc(m.registroProduccionRecordKey)}</b>Registro de producción (FPS)</div>
            <div><b>${this._esc(m.operadorTexto || "-")}</b>Operador (FPS)</div>
            <div><b>${this._esc(m.fechaProduccionFps || "-")}</b>Fecha producción (FPS)</div>
          ` : ""}
        `
        this._mostrarArticulosDetalle(m)

        const auditoriaFecha = document.getElementById("mlbDetAuditoriaFecha")
        if (m.fechaEnsayoModificadaPor) {
          auditoriaFecha.style.display = "block"
          auditoriaFecha.innerHTML = `<small>Fecha efectiva modificada por <b>${this._esc(m.fechaEnsayoModificadaPor)}</b> el ${this._esc(m.fechaEnsayoFechaModificacion)}</small>`
        } else {
          auditoriaFecha.style.display = "none"
          auditoriaFecha.innerHTML = ""
        }
        this._cerrarEditarFecha()

        const anulado = m.estado === "Anulado"
        const bannerAnulado = document.getElementById("mlbDetAnuladoBanner")
        if (anulado) {
          bannerAnulado.style.display = "block"
          bannerAnulado.innerHTML = `<b>Registro anulado</b> por ${this._esc(m.anuladoPor || "-")} el ${this._esc(m.fechaAnulacion || "-")}. Motivo: ${this._esc(m.motivoAnulacionRegistro || "-")}`
        } else {
          bannerAnulado.style.display = "none"
          bannerAnulado.innerHTML = ""
        }
        document.getElementById("mlbDetAccionesEnsayo").style.display = anulado ? "none" : "flex"
        document.getElementById("mlbDetBtnEditarFecha").style.display = anulado ? "none" : "inline-block"
        document.getElementById("mlbDetBtnAnularRegistro").style.display = anulado ? "none" : "inline-block"

        document.getElementById("mlbDetBtnVerRegistroProduccion").style.display = m.np ? "inline-block" : "none"
        document.getElementById("mlbDetBtnMaterialesFps").style.display = m.idProcesoFps ? "inline-block" : "none"
        document.getElementById("mlbDetMaterialesFps").style.display = "none"
        document.getElementById("mlbDetMaterialesFps").innerHTML = ""
        this._renderFiltroEnsayosPorEtapa(m.origen)
        this._renderInfoMonotapaEmplacado(m)

        document.getElementById("mlbDetNc").innerHTML = this.renderBloqueNc(m)
        this.renderAdjuntos(m.adjuntos || [])

        this._ensayosActuales = m.ensayos || []
        this.renderEnsayos(this._ensayosActuales)
        this.abrirModal("mlbModalDetalle")
      } catch (err) {
        alert(err.message)
      }
    }

    // Vínculo a No Conformidades: solo aparece cuando la muestra evaluó "No cumple". Si ya tiene
    // una NC vinculada, muestra el código; si no, ofrece crearla (queda gestionada desde el
    // módulo No Conformidades, acá solo se crea y se vincula).
    // Punto 8 REG-LAB-04: la etapa (Origen) determina qué ensayos tienen sentido — Corrugado
    // trabaja sobre papeles (Humedad/Gramaje/Espesor/Cobb/RCT), Emplacado/Troquelado/Pegado/
    // Producto terminado trabajan sobre el complejo (Humedad/Gramaje/Espesor/ECT/FCT/BCT).
    // Pruebas/Otro/MuestraExterna no restringen nada (una prueba puntual puede pedir cualquiera).
    // REG-LAB-04 v2 (Laboratorio, 03-11-2026): "a Termoformado solo ensayo de filtración".
    // Paletizado y Producto terminado son solo etapas de donde se extraen muestras (sin búsqueda en FPS).
    _ensayosPorEtapa(origen) {
      if (origen === "Termoformado") return ["mlbBtnNuevoFiltracion"]
      const sustrato = ["mlbBtnNuevoHumedad", "mlbBtnNuevoGramaje", "mlbBtnNuevoEspesor", "mlbBtnNuevoCobb", "mlbBtnNuevoRct"]
      const complejo = ["mlbBtnNuevoHumedad", "mlbBtnNuevoGramaje", "mlbBtnNuevoEspesor", "mlbBtnNuevoEct", "mlbBtnNuevoFct", "mlbBtnNuevoBctMedido", "mlbBtnNuevoBctTeorico"]
      const extra = ["mlbBtnNuevoViscosidad", "mlbBtnNuevoPh", "mlbBtnNuevoSolidos", "mlbBtnNuevoLugol"]
      const mapa = {
        ControlRecepcion: sustrato,
        Corrugado: sustrato,
        Monotapa: ["mlbBtnNuevoHumedad"],
        Emplacado: complejo,
        Troquelado: complejo,
        Pegado: complejo,
        ProductoTerminado: complejo,
      }
      return mapa[origen] ? [...mapa[origen], ...extra] : null // null = sin restricción (Pruebas/Otro/MuestraExterna)
    }

    // Sección 17 REG-LAB-04 v2: etiquetas de los 3 campos de identificación (valores guardados).
    _labelEtapa(v) {
      const mapa = {
        ControlRecepcion: "Control de recepción", ProductoTerminado: "Producto terminado",
        MuestraExterna: "Muestra externa",
      }
      return v ? (mapa[v] || v) : "-"
    }

    _labelOrigenMaterial(v) {
      const mapa = {
        Bobina: "Bobina", SeparacionPapeles: "Separación de papeles o descape",
        MaterialEnProceso: "Material en proceso", ProductoTerminado: "Producto terminado",
      }
      return v ? (mapa[v] || v) : "-"
    }

    _renderFiltroEnsayosPorEtapa(origen) {
      const permitidos = this._ensayosPorEtapa(origen)
      document.querySelectorAll("#mlbDetAccionesEnsayo button").forEach(btn => {
        btn.style.display = (!permitidos || permitidos.includes(btn.id)) ? "inline-block" : "none"
      })
    }

    // Puntos 19/20 REG-LAB-04: muestra los campos propios de Monotapa/Emplacado cuando corresponde.
    _renderInfoMonotapaEmplacado(m) {
      const monotapaDiv = document.getElementById("mlbDetMonotapaInfo")
      if (m.origen === "Monotapa" && (m.pesoOndaExtendida != null || m.pesoRecorte10x10 != null || m.longitudOndaExtendida != null || m.alturaOnda != null)) {
        monotapaDiv.style.display = "block"
        monotapaDiv.innerHTML = `
          <div class="module-title" style="font-size:13px;">Control de Monotapa</div>
          <div><b>${this._esc(m.pesoOndaExtendida ?? "-")}</b> Peso onda extendida (g) &nbsp; · &nbsp;
               <b>${this._esc(m.pesoRecorte10x10 ?? "-")}</b> Peso recorte 10×10 (g) &nbsp; · &nbsp;
               <b>${this._esc(m.gramajeRecorte ?? "-")}</b> Gramaje recorte (g/m²) &nbsp; · &nbsp;
               <b>${this._esc(m.longitudOndaExtendida ?? "-")}</b> Longitud onda extendida (mm) &nbsp; · &nbsp;
               <b>${this._esc(m.alturaOnda ?? "-")}</b> Altura de onda (mm)</div>
        `
      } else {
        monotapaDiv.style.display = "none"
        monotapaDiv.innerHTML = ""
      }

      const emplacadoDiv = document.getElementById("mlbDetEmplacadoInfo")
      if (m.origen === "Emplacado" && (m.monotapaRelacionadaResumen || m.pliegoRelacionado)) {
        emplacadoDiv.style.display = "block"
        emplacadoDiv.innerHTML = `
          <div class="module-title" style="font-size:13px;">Control de Emplacado</div>
          <div>${m.monotapaRelacionadaResumen ? `<b>Monotapa relacionada:</b> ${this._esc(m.monotapaRelacionadaResumen)}` : ""}
               ${m.pliegoRelacionado ? ` &nbsp; · &nbsp; <b>Pliego:</b> ${this._esc(m.pliegoRelacionado)}` : ""}</div>
        `
      } else {
        emplacadoDiv.style.display = "none"
        emplacadoDiv.innerHTML = ""
      }
    }

    // Punto 5 del REG-LAB-04: materiales/insumos de FPS (ZZZMateriasPrimasOT, Tipo INSUMO) usados
    // en el proceso de esta producción. Se consulta bajo demanda (no en cada abrirDetalle) porque
    // es una llamada a un sistema externo (FPS) y no todas las muestras tienen idProcesoFps.
    async _verMaterialesFps() {
      const m = this._muestraActualDetalle
      if (!m || !m.idProcesoFps) return

      const div = document.getElementById("mlbDetMaterialesFps")
      div.style.display = "block"
      div.innerHTML = '<div class="module-title" style="font-size:13px;">Materiales utilizados (FPS)</div><div>Consultando...</div>'

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.materialesFps", data: { idProceso: m.idProcesoFps } })
        if (!res || res.ok === false) throw new Error(res?.error || "Error consultando materiales en FPS")

        const materiales = res.data || []
        if (materiales.length === 0) {
          div.innerHTML = '<div class="module-title" style="font-size:13px;">Materiales utilizados (FPS)</div><div class="subtitle">Sin materiales/insumos registrados para este proceso en FPS.</div>'
          return
        }

        div.innerHTML = `
          <div class="module-title" style="font-size:13px;">Materiales utilizados (FPS)</div>
          <ul style="margin:4px 0 0; padding-left:18px;">
            ${materiales.map(mat => `<li><b>${this._esc(mat.itemCode)}</b> — ${this._esc(mat.itemName)}</li>`).join("")}
          </ul>
        `
      } catch (err) {
        div.innerHTML = `<div class="module-title" style="font-size:13px;">Materiales utilizados (FPS)</div><div class="subtitle">${this._esc(err.message)}</div>`
      }
    }

    renderBloqueNc(m) {
      if (m.evaluacion !== "No cumple") return ""

      if (m.ncId) {
        return `<div class="subtitle" style="margin-top:8px;">No Conformidad vinculada: <b>${this._esc(m.ncCodigo || `#${m.ncId}`)}</b> (gestiónala desde el módulo No Conformidades).</div>`
      }

      return `
        <div class="subtitle" style="margin-top:8px; display:flex; align-items:center; gap:10px;">
          <span>Esta muestra no cumple especificación y no tiene una No Conformidad vinculada.</span>
          <button class="btn-secondary" id="mlbBtnCrearNc">Crear No Conformidad</button>
        </div>
      `
    }

    async crearNoConformidad() {
      if (!this._muestraActualId) return
      if (!confirm("¿Crear una No Conformidad vinculada a esta muestra?")) return

      try {
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.nc.crear",
          data: { muestraId: this._muestraActualId }
        })
        if (!res || res.ok === false) throw new Error(res?.error || "Error creando la No Conformidad")

        alert(`No Conformidad creada (${res.data.codigo}). Gestiónala desde el módulo No Conformidades.`)
        await this.abrirDetalle(this._muestraActualId)
      } catch (err) {
        alert(err.message)
      }
    }

    // Punto 2/34 del REG-LAB-04: anular el registro completo (distinto de anular un ensayo
    // puntual, que ya existía). No hay borrado físico — el registro queda visible con su
    // motivo/usuario/fecha de anulación, sin poder agregarle más ensayos.
    async anularMuestra() {
      if (!this._muestraActualId) return
      const motivo = prompt("Motivo de anulación del registro completo:")
      if (!motivo) return

      try {
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.anular",
          data: { id: this._muestraActualId, motivo }
        })
        if (!res || res.ok === false) throw new Error(res?.error || "Error anulando el registro")

        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // ---------- Adjuntos (Punto 3 del REG-LAB-04) ----------

    renderAdjuntos(adjuntos) {
      const cont = document.getElementById("mlbDetAdjuntos")
      if (!adjuntos.length) {
        cont.innerHTML = `<div class="subtitle">Sin adjuntos.</div>`
        return
      }
      cont.innerHTML = `
        <ul style="margin:0; padding-left:18px;">
          ${adjuntos.map(a => `
            <li style="margin-bottom:4px;">
              ${this._esc(a.nombreArchivo)} <small style="color:#64748b;">(${this._esc(a.subidoPor || "-")}, ${this._esc(a.fechaSubida)})</small>
              <button class="btn-secondary mlb-ver-adjunto-btn" data-adjunto-id="${a.id}" style="padding:2px 8px;">Ver</button>
              <button class="btn-secondary mlb-eliminar-adjunto-btn" data-adjunto-id="${a.id}" style="padding:2px 8px;">Eliminar</button>
            </li>
          `).join("")}
        </ul>
      `
    }

    _pedirArchivoAdjunto() {
      const input = document.getElementById("mlbAdjuntoInput")
      input.value = ""
      input.click()
    }

    _leerArchivoComoBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result || "").toString().split(",")[1] || "")
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
    }

    _validarArchivoAdjunto(file) {
      const extensionesValidas = [".pdf", ".doc", ".docx", ".jpg", ".jpeg", ".png", ".webp"]
      const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase()
      if (!extensionesValidas.includes(extension)) {
        return `Tipo de archivo no permitido. Formatos válidos: ${extensionesValidas.join(", ")}`
      }
      const MAX_BYTES = 10 * 1024 * 1024
      if (file.size > MAX_BYTES) {
        return "El archivo supera el tamaño máximo permitido (10 MB)"
      }
      return null
    }

    async _subirAdjunto(file) {
      if (!this._muestraActualId) return

      const error = this._validarArchivoAdjunto(file)
      if (error) {
        alert(error)
        return
      }

      try {
        const contenidoBase64 = await this._leerArchivoComoBase64(file)
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.adjunto.subir",
          data: { muestraId: this._muestraActualId, nombreArchivo: file.name, contenidoBase64 }
        })
        if (!res || res.ok === false) throw new Error(res?.error || "Error al subir el adjunto")

        await this.abrirDetalle(this._muestraActualId)
      } catch (err) {
        alert(err.message)
      }
    }

    async _verAdjunto(adjuntoId) {
      try {
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.adjunto.abrir",
          data: { adjuntoId }
        })
        if (!res || res.ok === false) throw new Error(res?.error || "Error al abrir el adjunto")

        if (!res.data.previsualizable) return

        document.getElementById("mlbAdjuntoTitulo").textContent = res.data.nombreArchivo
        const contenedor = document.getElementById("mlbAdjuntoContenido")
        const dataUri = `data:${res.data.tipoMime};base64,${res.data.contenidoBase64}`
        contenedor.innerHTML = res.data.tipoMime.startsWith("image/")
          ? `<img src="${this._escAttr(dataUri)}" style="max-width:100%; max-height:60vh;">`
          : `<iframe src="${this._escAttr(dataUri)}" style="width:100%; height:60vh; border:0;"></iframe>`
        this.abrirModal("mlbModalAdjunto")
      } catch (err) {
        alert(err.message)
      }
    }

    async _eliminarAdjunto(adjuntoId) {
      if (!confirm("¿Eliminar este adjunto?")) return

      try {
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.adjunto.eliminar",
          data: { adjuntoId }
        })
        if (!res || res.ok === false) throw new Error(res?.error || "Error al eliminar el adjunto")

        await this.abrirDetalle(this._muestraActualId)
      } catch (err) {
        alert(err.message)
      }
    }

    // Solo visualización (Registros → Ver): número con exactamente 2 decimales y coma decimal; null si
    // no hay valor numérico. No cambia lo guardado ni el informe impreso (que usa sus propias funciones).
    _num2(v) {
      if (v === null || v === undefined || v === "") return null
      const n = Number(v)
      return Number.isFinite(n) ? this._emFormato(n, 2) : null
    }

    // Texto de la columna "Resultado" de la tabla de Ensayos. ECT muestra el promedio de fuerza real de
    // la muestra ("Promedio fuerza: 112,02 lbf"); el resto, su valor consolidado con 2 decimales.
    _resultadoPantalla(e) {
      if (e.tipoEnsayo === "ECT") {
        const fuerza = this._num2(e.detalle?.promedioForce)
        if (fuerza !== null) return `Promedio fuerza: ${fuerza} lbf`
      }
      const valor = this._num2(e.resultadoValor)
      return valor !== null ? `${valor} ${this._u(e.resultadoUnidad)}` : "-"
    }

    renderEnsayos(ensayos) {
      const body = document.getElementById("mlbEnsayosBody")
      if (!ensayos || ensayos.length === 0) {
        body.innerHTML = '<tr><td colspan="9" style="text-align:center;">Sin ensayos todavía</td></tr>'
        return
      }

      body.innerHTML = ensayos.map(e => {
        let resultado = this._resultadoPantalla(e)
        // REG-LAB-04 v2: un ensayo con varias muestras puede no tener consolidado (muestras no
        // comparables); el detalle por muestra se ve con "Ver muestras".
        if (e.modeloMuestras) {
          const n = (e.muestras || []).filter(m => !m.eliminada).length
          resultado = `${e.resultadoValor != null ? `${resultado} · ` : ""}${n} muestra${n === 1 ? "" : "s"}`
        }
        if (e.tipoEnsayo === "FILTRACION" && e.detalle?.resultado) resultado = `${e.detalle.resultado} · ${e.detalle.tiempoMinutos} min`
        const enEnsayo = e.modeloMuestras && e.estado === "En ensayo"
        const spec = (e.especificacionMin != null || e.especificacionMax != null)
          ? `${e.especificacionMin ?? ""} - ${e.especificacionMax ?? ""} ${this._u(e.especificacionUnidad)}`
          : "-"
        const puedeAnular = e.estado !== "Anulado"
        const puedeCorregir = e.estado === "Finalizado" && !!this._tipoEnsayoConfig(e.tipoEnsayo)
        const motivoAnulTitle = e.estado === "Anulado" && e.motivoAnulacion ? ` title="${this._escAttr(e.motivoAnulacion)}"` : ""
        // A3: quién anuló el ensayo y cuándo (lo registra la API con el usuario del token). Las
        // anulaciones anteriores a 1.8.28 no tienen el dato: no se muestra nada extra.
        const anulInfo = e.estado === "Anulado" && (e.anuladoPor || e.fechaAnulacion)
          ? `<br><small>Anulado por ${this._esc(e.anuladoPor || "-")} el ${this._esc(e.fechaAnulacion || "-")}</small>`
          : ""
        const corrigeBadge = e.ensayoReemplazaId
          ? ` <button type="button" class="mlb-historial-btn" data-id="${e.id}" title="Ver historial de valores (Punto 36)" style="border:none;background:none;cursor:pointer;font-size:14px;">&#9998;</button>`
          : ""

        return `
          <tr>
            <td>${this._esc(e.tipoEnsayo)}</td>
            <td>${this._esc(e.metodo || "-")}</td>
            <td>${this._esc(e.analistaNombre || "-")}</td>
            <td>${this._esc(e.fecha || "-")}</td>
            <td>${this._esc(resultado)}</td>
            <td>${this._esc(spec)}</td>
            <td>${this._esc(e.cumplimiento)}</td>
            <td${motivoAnulTitle}>${this._esc(e.estado)}${anulInfo}${e.observacion ? ` <span title="${this._escAttr(e.observacion)}">&#9432;</span>` : ""}${corrigeBadge}</td>
            <td>
              ${enEnsayo ? `<button class="btn-primary mlb-em-continuar-btn" data-id="${e.id}">Continuar</button>` : ""}
              ${e.modeloMuestras && !enEnsayo ? `<button class="btn-secondary mlb-em-ver-btn" data-id="${e.id}">Ver muestras</button>` : ""}
              ${puedeAnular ? `<button class="btn-secondary mlb-anular-btn" data-id="${e.id}">Anular</button>` : ""}
              ${puedeCorregir ? `<button class="btn-secondary mlb-corregir-btn" data-id="${e.id}">Corregir</button>` : ""}
            </td>
          </tr>
        `
      }).join("")
    }

    // Punto 36 del REG-LAB-04: "valor anterior → valor nuevo" cuando un ensayo fue corregido.
    // No requiere backend nuevo — cada corrección ya crea un ensayo NUEVO vinculado al original
    // (ensayoReemplazaId/motivoReemplazo, columnas ya existentes) y el original queda Anulado con
    // su valor intacto en la misma lista de ensayos de la muestra. Solo hace falta recorrer esa
    // cadena, que puede tener más de un eslabón si el ensayo fue corregido más de una vez.
    _verHistorialEnsayo(ensayoId) {
      const lista = this._ensayosActuales || []
      const actual = lista.find(x => x.id === ensayoId)
      if (!actual) return

      const cadena = []
      let cursor = actual
      while (cursor) {
        cadena.unshift(cursor)
        cursor = cursor.ensayoReemplazaId ? lista.find(x => x.id === cursor.ensayoReemplazaId) : null
      }

      const fmtUno = e => e.resultadoValor != null ? this._resultadoPantalla(e).trim() : (e.detalle?.resultado || "-")
      // REG-LAB-04 v2: además del consolidado, el promedio de cada muestra vigente (los valores
      // completos de un ensayo anulado se siguen viendo con "Ver muestras").
      const fmt = e => {
        if (!e.modeloMuestras) return fmtUno(e)
        const porMuestra = (e.muestras || []).filter(m => !m.eliminada)
          .map(m => `M${m.numero} ${m.promedio != null ? `${this._num2(m.promedio) ?? m.promedio} ${this._u(m.unidad)}`.trim() : "incompleta"}`)
        return `${fmtUno(e)}${porMuestra.length ? ` (${porMuestra.join("; ")})` : ""}`
      }
      const lineas = cadena.map((e, i) => {
        if (i === 0) return `Valor original (#${e.id}, ${e.fecha || "-"}): ${fmt(e)}`
        return `→ Corrección ${i} (#${e.id}, ${e.fecha || "-"}), motivo "${e.motivoReemplazo || "-"}": ${fmt(e)}`
      })

      alert(`Historial de valores — ${actual.tipoEnsayo}\n\n${lineas.join("\n")}`)
    }

    // =====================================================================
    // INFORME (impresión/guardar como PDF, mismo mecanismo que No Conformidades)
    // =====================================================================
    // Punto 7 del REG-LAB-04: corrige la fecha efectiva de un registro ya creado, sin tocar
    // fecha_ingreso (creación, siempre automática) — deja auditoría de quién/cuándo del lado API.
    _abrirEditarFecha() {
      const m = this._muestraActualDetalle
      if (!m) return
      const input = document.getElementById("mlbEditarFechaInput")
      input.value = m.fechaEnsayo ? m.fechaEnsayo.replace(" ", "T").substring(0, 16) : ""
      document.getElementById("mlbEditarFechaBloque").style.display = ""
    }

    _cerrarEditarFecha() {
      document.getElementById("mlbEditarFechaBloque").style.display = "none"
    }

    async _guardarFechaEnsayo() {
      const fechaEnsayo = document.getElementById("mlbEditarFechaInput").value
      if (!fechaEnsayo) return alert("Ingresa la nueva fecha/hora")

      try {
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.actualizarFechaEnsayo",
          data: { id: this._muestraActualId, fechaEnsayo }
        })
        if (!res || res.ok === false) throw new Error(res?.error || "Error actualizando la fecha")

        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // Excel con el formato del REG-LAB-04: lo arma el backend (ClosedXML) a partir del detalle real.
    async exportarExcel() {
      const m = this._muestraActualDetalle
      if (!m) return
      const res = await window.PhotinoBridge.send({ action: "muestraLab.exportarExcel", data: { id: m.id } })
      if (!res?.ok) return alert(res?.error || "No se pudo generar el Excel")
      const g = await window.PhotinoBridge.send({
        action: "excel.guardar",
        data: { fileName: res.data.fileName, base64: res.data.base64 },
      })
      if (g && g.ok === false) alert(g.error || "No se pudo guardar el Excel")
    }

    // PDF con el formato del REG-LAB-04: el backend arma las mismas hojas que el Excel (misma fuente de datos)
    // como HTML imprimible; se abre el diálogo de impresión del sistema (Guardar como PDF), igual que el resto
    // de reportes de QCC. El informe anterior sigue disponible en "Generar informe".
    async exportarPdf() {
      const m = this._muestraActualDetalle
      if (!m) return
      const btn = document.getElementById("mlbBtnPdf")
      if (btn) btn.disabled = true
      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.exportarPdf", data: { id: m.id } })
        if (!res?.ok || !res.data?.html) return alert(res?.error || "No se pudo generar el PDF")
        const iframe = document.createElement("iframe")
        iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"
        document.body.appendChild(iframe)
        const doc = iframe.contentDocument
        doc.open()
        doc.write(res.data.html)
        doc.close()
        doc.title = res.data.fileName.replace(/\.pdf$/i, "")
        const limpiar = () => iframe.remove()
        iframe.contentWindow.onafterprint = limpiar
        setTimeout(limpiar, 120000)
        const imgs = Array.from(doc.querySelectorAll("img"))
        await Promise.all(imgs.map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r })))
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
      } catch (err) {
        alert(err?.message || "No se pudo generar el PDF")
      } finally {
        if (btn) btn.disabled = false
      }
    }

    generarInforme() {
      const m = this._muestraActualDetalle
      if (!m) return

      const maquinaNombre = this._catalogos.maquinas.find(x => x.id === m.maquinaId)?.nombre
      const tipoOndaNombre = this._catalogos.tiposOnda.find(x => x.id === m.tipoOndaId)?.nombre

      const resumen = [
        { label: "Etapa productiva", valor: this._labelEtapa(m.origen) },
        { label: "Origen del material", valor: this._labelOrigenMaterial(m.origenMaterial) },
        { label: "Tipo de control", valor: m.tipoControl || "-" },
        { label: "Tipo de muestra", valor: m.tipoMuestra || "-" },
        { label: "NP", valor: m.np || "-" },
        { label: "Cliente", valor: m.cliente || "-" },
        { label: "Código", valor: m.codigoProducto || "-" },
        { label: "Descripción", valor: m.descripcion || "-" },
        { label: "Máquina", valor: maquinaNombre || m.maquina || "-" },
        { label: "Tipo de onda", valor: tipoOndaNombre || "-" },
        { label: "Formato (FPS)", valor: m.formatoFps || "-" },
        { label: "Dimensiones nominales", valor: this._textoDimensiones(m) || "-" },
        ...(m.antecedentesFps ? [{ label: "Antecedentes técnicos (FPS)", valor: m.antecedentesFps }] : []),
        { label: "Turno", valor: m.turno || "-" },
        { label: "N.º de registro de producción", valor: m.registroProduccionRecordKey || m.lote || "-" },
        { label: "Proveedor", valor: m.proveedor || "-" },
        { label: "Fecha ingreso", valor: m.fechaIngreso || "-" },
        { label: "Fecha ensayo", valor: m.fechaEnsayo || "-" },
        { label: "Analista", valor: m.analistaNombre || "-" },
        { label: "Estado", valor: this._labelEstado(m.estado) },
        { label: "Evaluación", valor: m.evaluacion || "-" }
      ]

      if (m.registroProduccionRecordKey) {
        resumen.push(
          { label: "Proceso (FPS)", valor: m.procesoTextoFps || "-" },
          { label: "Operador (FPS)", valor: m.operadorTexto || "-" },
          { label: "Fecha producción (FPS)", valor: m.fechaProduccionFps || "-" },
        )
      }
      if (m.fechaEnsayoModificadaPor) {
        resumen.push({ label: "Fecha efectiva modificada por", valor: `${m.fechaEnsayoModificadaPor} (${m.fechaEnsayoFechaModificacion})` })
      }
      if (m.origen === "Monotapa" && (m.pesoOndaExtendida != null || m.pesoRecorte10x10 != null)) {
        resumen.push(
          { label: "Peso onda extendida (g)", valor: m.pesoOndaExtendida ?? "-" },
          { label: "Peso recorte 10×10 (g)", valor: m.pesoRecorte10x10 ?? "-" },
          { label: "Gramaje recorte (g/m²)", valor: m.gramajeRecorte ?? "-" },
          { label: "Longitud onda extendida (mm)", valor: m.longitudOndaExtendida ?? "-" },
          { label: "Altura de onda (mm)", valor: m.alturaOnda ?? "-" },
        )
      }
      if (m.origen === "Emplacado" && (m.monotapaRelacionadaResumen || m.pliegoRelacionado)) {
        if (m.monotapaRelacionadaResumen) resumen.push({ label: "Monotapa relacionada", valor: m.monotapaRelacionadaResumen })
        if (m.pliegoRelacionado) resumen.push({ label: "Pliego relacionado", valor: m.pliegoRelacionado })
      }

      const ensayos = this._ensayosActuales || []
      const tablas = []
      // Solo ensayos vigentes (Finalizado) — un ensayo Anulado (ej. una corrección histórica)
      // no debe aparecer en el informe impreso junto al que lo reemplazó.
      const porTipo = tipo => ensayos.filter(e => e.tipoEnsayo === tipo && e.estado === "Finalizado")

      // Hoja 1 del REG-LAB-04 (papel/sustrato): Control Recepción, Corrugado, Monotapa.
      // Hoja 2 (complejo): Emplacado, Troquelado, Pegado, Producto terminado.
      const esHoja1 = ["ControlRecepcion", "Corrugado", "Monotapa"].includes(m.origen)
      const esMonotapa = m.origen === "Monotapa"
      const cubiertos = new Set()
      // REG-LAB-04 v2: un ensayo con muestras (modeloMuestras) no tiene "detalle" plano; se imprime
      // con todas sus muestras y determinaciones bajo el mismo título de sección del formulario.
      const push = (tipo, fn, titulo) => {
        porTipo(tipo).forEach(e => tablas.push(e.modeloMuestras ? this._tablaEnsayoMuestras(e, titulo) : fn(e)))
        cubiertos.add(tipo)
      }

      if (esHoja1) {
        if (esMonotapa) push("HUMEDAD", e => this._tablaHumedadMonotapa(e, m), "6. HUMEDAD MONOTAPA (%)")
        else push("HUMEDAD", e => this._tablaSustrato(e, "1. HUMEDAD DE SUSTRATOS (%)", ["Punto izquierdo (%)", "Centro (%)", "Punto derecho (%)"]), "1. HUMEDAD DE SUSTRATOS (%)")
        push("GRAMAJE", e => this._tablaSustrato(e, "2. GRAMAJE DE SUSTRATOS (g/m²)", ["Peso (g) Punto izq.", "Peso (g) Centro", "Peso (g) Punto der."]), "2. GRAMAJE DE SUSTRATOS (g/m²)")
        push("ESPESOR", e => this._tablaSustrato(e, "3. ESPESOR DE SUSTRATOS (mm)", ["Punto izquierdo", "Centro", "Punto derecho"]), "3. ESPESOR DE SUSTRATOS (mm)")
        push("COBB", e => this._tablaCobbDoc(e), "4. COBB (g/m²) – Área efectiva: 100 cm²")
        push("RCT", e => this._tablaRctDoc(e), "5. RCT (lbf)")
      } else if (m.origen) {
        push("HUMEDAD", e => this._tablaHumedadComplejo(e), "1. HUMEDAD DEL COMPLEJO (%)")
        push("GRAMAJE", e => this._tablaGramajeComplejo(e), "2. GRAMAJE DEL COMPLEJO (g/m²)")
        push("ESPESOR", e => this._tablaEspesorComplejo(e), "3. ESPESOR DEL COMPLEJO (mm)")
        push("ECT", e => this._tablaEct(e), "4. ECT (lbf)")
        push("FCT", e => this._tablaFctDoc(e), "5. FCT (lbf)")
        push("BCT_MEDIDO", e => this._tablaBctMedido(e), "6. BCT (lbf)")
      }

      // Cualquier ensayo cuyo tipo no haya sido cubierto por la hoja correspondiente (ej. un tipo
      // excepcional registrado en un origen atípico, o BCT_TEORICO/VISCOSIDAD/PH/SOLIDOS/LUGOL,
      // que no tienen sección propia en el formulario físico) igual se lista, en formato genérico,
      // para no perder datos.
      ;["HUMEDAD", "GRAMAJE", "ESPESOR", "COBB", "RCT", "FCT", "ECT", "BCT_MEDIDO", "BCT_TEORICO", "VISCOSIDAD", "PH", "SOLIDOS", "LUGOL", "FILTRACION"]
        .forEach(tipo => { if (!cubiertos.has(tipo)) porTipo(tipo).forEach(e => tablas.push(e.modeloMuestras ? this._tablaEnsayoMuestras(e, tipo) : this._tablaGenerica(e))) })

      window.PrintExporter.printReport({
        titulo: this._esc(`Informe de Laboratorio - Muestra #${m.id}`),
        empresa: "INNPACK",
        subtitulo: m.observacion ? this._esc(`Observación general: ${m.observacion}`) : "",
        totalRegistros: ensayos.length,
        resumen: resumen.map(r => ({ label: this._esc(r.label), valor: this._esc(r.valor) })),
        tablas: tablas.map(t => this._escaparTablaInforme(t))
      })
    }

    // ---------- Punto 37 REG-LAB-04: secciones del informe con el layout del formulario físico ----------
    // Cada sección es una tabla "transpuesta" (columnas = bobinas/probetas, filas = atributos),
    // igual al REG-LAB-04 real (columnas Onda/Liner/Cartulina lado a lado). El título de cada
    // sección lleva la metadata del ensayo (método/analista/fecha/resultado/cumplimiento/estado).

    _metaEnsayo(e) {
      // Ensayos categóricos (Filtración, Lugol): sin valor numérico, el resultado es el texto guardado.
      const resultado = e.resultadoValor != null ? `${e.resultadoValor} ${this._u(e.resultadoUnidad)}`.trim() : (e.detalle?.resultado || "-")
      const partes = [
        `#${e.id}`, `Método: ${e.metodo || "-"}`, `Analista: ${e.analistaNombre || "-"}`, `Fecha: ${e.fecha || "-"}`,
        `Resultado: ${resultado}`, `Cumplimiento: ${e.cumplimiento || "-"}`, `Estado: ${this._labelEstado(e.estado)}`
      ]
      if (e.variante) partes.splice(1, 0, `Método de equipo: ${e.variante}`)
      if (e.ensayoReemplazaId) partes.push(`Corrige el ensayo #${e.ensayoReemplazaId}${e.motivoReemplazo ? ` (motivo: ${e.motivoReemplazo})` : ""}`)
      if (e.observacion) partes.push(`Obs: ${e.observacion}`)
      return partes.join(" · ")
    }

    // REG-LAB-04 v2: una fila por determinación (valores ingresados y resultados calculados tal
    // como quedaron guardados por la API) y una fila de promedio por muestra. Las muestras
    // eliminadas se listan con usuario, fecha y motivo (no desaparecen del informe).
    _tablaEnsayoMuestras(e, titulo) {
      const cfg = this._cfgEnsayo(e.tipoEnsayo, e.variante) || this._emCfgSoloLectura(e)
      const esc = (v) => this._esc(v)
      const entradas = cfg.entradas || []
      const codigosEntrada = new Set(entradas.map(x => x.codigo))
      const resultados = (cfg.resultados || []).filter(r => !codigosEntrada.has(r.codigo))
      const fmt = (v, dec) => (v === null || v === undefined ? "-" : this._emFormato(v, dec))
      const columnas = ["Muestra", "Identificación", "Determinación",
        ...entradas.map(x => esc(`${x.etiqueta}${x.unidad ? ` (${this._u(x.unidad)})` : ""}`)),
        ...resultados.map(x => esc(`${x.etiqueta}${x.unidad ? ` (${this._u(x.unidad)})` : ""}`)),
        "Validez"]
      const vacias = () => Array(columnas.length - 3).fill("")
      const filas = []
      const origenes = { Bobinas: "Bobina", SeparacionPapeles: "Separación de papeles o descape" }
      for (const mu of e.muestras || []) {
        if (mu.eliminada) {
          filas.push([`N.º ${mu.numero}`, esc(`Eliminada por ${mu.eliminadaPor || "-"} el ${mu.fechaEliminacion || "-"}${mu.motivoEliminacion ? ` — Motivo: ${mu.motivoEliminacion}` : ""}`), "", ...vacias()])
          continue
        }
        const ident = []
        if (mu.sustrato) ident.push(`${cfg.etiquetaSustrato || "Sustrato"}: ${mu.sustrato}`)
        if (mu.bobinaNumero) ident.push(`Bobina: ${mu.bobinaNumero}`)
        if (mu.bobinaLote) ident.push(`Lote: ${mu.bobinaLote}`)
        if (mu.origenMuestra) ident.push(`Origen: ${origenes[mu.origenMuestra] || mu.origenMuestra}`)
        if (mu.tipoAnalisis) ident.push(`Análisis: ${mu.tipoAnalisis}`)
        for (const [codigo, valor] of Object.entries(mu.parametros || {})) {
          if (!valor) continue
          const p = (cfg.parametros || []).find(x => x.codigo === codigo)
          ident.push(`${p?.etiqueta || codigo}: ${valor}`)
        }
        if (mu.observacion) ident.push(`Obs: ${mu.observacion}`)
        const dets = mu.determinaciones || []
        dets.forEach((d, i) => filas.push([
          i === 0 ? `N.º ${mu.numero}` : "",
          i === 0 ? esc(ident.join(" · ") || "-") : "",
          esc(this._emEtiquetaDet(cfg, d.numero)),
          ...entradas.map(x => esc(d.valores?.[x.codigo] ?? "-")),
          ...resultados.map(x => fmt(d.resultados?.[x.codigo], x.decimales ?? 2)),
          d.valida === false ? esc(`No válida: ${d.motivoInvalida || "-"}`) : "Válida",
        ]))
        if (dets.length === 0) filas.push([`N.º ${mu.numero}`, esc(ident.join(" · ") || "-"), "Sin determinaciones", ...vacias()])
        const promedio = mu.completa && mu.promedio !== null && mu.promedio !== undefined
          ? `Promedio muestra N.º ${mu.numero}: ${fmt(mu.promedio, cfg.decimales ?? 2)} ${this._u(mu.unidad || cfg.unidad)}${this._emTextoCantidad(cfg, mu.determinacionesValidas)}`
          : `Muestra N.º ${mu.numero} incompleta (sin promedio)`
        filas.push(["", "", `<b>${esc(promedio)}</b>${mu.completa ? this._emTextoOtros(cfg, mu.otrosPromedios) : ""}`, ...vacias().slice(0, -1), esc(`Cumplimiento: ${mu.cumplimiento || "-"}`)])
      }
      // preescapada: celdas y columnas ya salen escapadas (algunas llevan <b> legítimo); el título se escapa acá.
      return { titulo: esc(`${titulo || e.tipoEnsayo} — ${this._metaEnsayo(e)}`), columnas, filas, preescapada: true }
    }

    // PrintExporter.printReport inserta todo como HTML crudo: se escapa acá, una sola vez, todo dato
    // de usuario/FPS. Las tablas ya marcadas como preescapadas (_tablaEnsayoMuestras) no se tocan.
    _escaparTablaInforme(t) {
      if (t.preescapada) return t
      const esc = v => this._esc(v)
      return { titulo: esc(t.titulo), columnas: t.columnas.map(esc), filas: t.filas.map(f => f.map(esc)) }
    }

    // Agrupa las bobinas muestreadas (Punto 11) en las 3 columnas fijas del REG-LAB-04
    // (ONDA/LINER/CARTULINA), igual que el formulario físico, en vez de una columna dinámica por
    // bobina. Si hay más de una bobina en la misma posición, sus valores van juntos en la misma
    // celda separados por "/".
    _agruparBobinasPorPosicion(bobinas) {
      const grupos = { Onda: [], Liner: [], Cartulina: [] }
      bobinas.forEach(b => {
        const pos = ["Onda", "Liner", "Cartulina"].includes(b.posicion) ? b.posicion : "Onda"
        grupos[pos].push(b)
      })
      return grupos
    }

    _celdaBobinas(lista, campo) {
      if (!lista || !lista.length) return "-"
      return lista.map(b => (b[campo] ?? "-")).join(" / ")
    }

    // Humedad/Gramaje/Espesor de SUSTRATOS (Hoja 1): columnas fijas ONDA/LINER/CARTULINA, igual
    // que el REG-LAB-04 físico. Si el ensayo no tiene bobinas muestreadas (Punto 11, flujo simple
    // de 1 bobina), cae a la tabla genérica.
    _tablaSustrato(e, titulo, labels) {
      const d = e.detalle || {}
      const bobinas = d.bobinas || []
      if (bobinas.length === 0) return this._tablaGenerica(e, titulo)

      const grupos = this._agruparBobinasPorPosicion(bobinas)
      const posiciones = ["Onda", "Liner", "Cartulina"]
      // Punto 8/9 REG-LAB-04: "Origen de la muestra" (Bobinas / Separación de papeles o descape)
      // solo existe en el detalle de Humedad — no aplica a Gramaje/Espesor.
      const origenMuestraLabel = { Bobinas: "Bobinas", SeparacionPapeles: "Separación de papeles o descape" }
      return {
        titulo: `${titulo} — ${this._metaEnsayo(e)}`,
        columnas: ["", ...posiciones.map(p => p.toUpperCase())],
        filas: [
          ...(d.origenMuestra ? [["Origen de la muestra", origenMuestraLabel[d.origenMuestra] || d.origenMuestra, "", ""]] : []),
          ["Lote de bobina de origen", ...posiciones.map(p => this._celdaBobinas(grupos[p], "lote"))],
          [labels[0], ...posiciones.map(p => this._celdaBobinas(grupos[p], "valor1"))],
          [labels[1], ...posiciones.map(p => this._celdaBobinas(grupos[p], "valor2"))],
          [labels[2], ...posiciones.map(p => this._celdaBobinas(grupos[p], "valor3"))],
          ["Promedio", ...posiciones.map(p => this._celdaBobinas(grupos[p], "promedio"))],
        ]
      }
    }

    // 6. HUMEDAD MONOTAPA (%) — sección propia del REG-LAB-04 para el ensayo de Humedad hecho
    // directo sobre una muestra de origen Monotapa (distinto de "Humedad de sustratos", sección 1).
    _tablaHumedadMonotapa(e, m) {
      const d = e.detalle || {}
      return {
        titulo: `6. HUMEDAD MONOTAPA (%) — ${this._metaEnsayo(e)}`,
        columnas: ["Atributo", "Valor"],
        filas: [
          ["Hora", e.fecha || "-"],
          ["Punto izquierdo (%)", d.higrometroIzquierdo ?? "-"],
          ["Centro (%)", d.higrometroCentro ?? "-"],
          ["Punto derecho (%)", d.higrometroDerecho ?? "-"],
          ["Peso onda (g)", m.pesoOndaExtendida ?? "-"],
          ["Peso onda 10 x 10 (g)", m.pesoRecorte10x10 ?? "-"],
          ["Medida onda extendida (cm)", m.longitudOndaExtendida ?? "-"],
        ]
      }
    }

    // 4. COBB (g/m²): el formulario físico solo contempla ONDA/LINER (2 probetas); si el ensayo
    // registró una 3ª probeta se agrega igual como columna adicional, sin perder el dato.
    _tablaCobbDoc(e) {
      const d = e.detalle || {}
      const cols = [{ label: "ONDA", p: d.p1 }, { label: "LINER", p: d.p2 }]
      if (d.p3) cols.push({ label: "Adicional", p: d.p3 })
      return {
        titulo: `4. COBB (g/m²) – Área efectiva: 100 cm² — ${this._metaEnsayo(e)}`,
        columnas: ["", ...cols.map(c => c.label)],
        filas: [
          ["Lote de bobina de origen", ...cols.map(c => c.p?.bobina || "-")],
          ["Cara", ...cols.map(c => c.p?.cara || "-")],
          ["Peso inicial (g)", ...cols.map(c => c.p?.pesoInicial ?? "-")],
          ["Peso final (g)", ...cols.map(c => c.p?.pesoFinal ?? "-")],
          ["Seg.", ...cols.map(c => c.p?.tiempo || "-")],
          ["Resultado (g/m²)", ...cols.map(c => c.p?.resultado ?? "-")],
        ]
      }
    }

    // 5. RCT (lbf): igual que Cobb, columnas fijas ONDA/LINER.
    _tablaRctDoc(e) {
      const d = e.detalle || {}
      const cols = [{ label: "ONDA", p: d.p1 }, { label: "LINER", p: d.p2 }]
      if (d.p3) cols.push({ label: "Adicional", p: d.p3 })
      return {
        titulo: `5. RCT (lbf) — ${this._metaEnsayo(e)} · Promedio fuerza: ${d.promedioForce ?? "-"} · Promedio resistencia: ${d.promedioStrength ?? "-"}`,
        columnas: ["", ...cols.map(c => c.label)],
        filas: [
          ["Lote de bobina de origen", ...cols.map(c => c.p?.bobina || "-")],
          ["Fuerza (lbf)", ...cols.map(c => c.p?.force ?? "-")],
          [`Resistencia (${this._u(d.strengthUnidad || "lbf/m")})`, ...cols.map(c => c.p?.strength ?? "-")],
        ]
      }
    }

    // 5. FCT (lbf) — Hoja 2: N° de muestra + M1/M2/M3, sin fila de bobina (no aplica al complejo).
    _tablaFctDoc(e) {
      const d = e.detalle || {}
      const probetas = [d.p1, d.p2, d.p3].filter(Boolean)
      return {
        titulo: `5. FCT (lbf) — ${this._metaEnsayo(e)} · Promedio fuerza: ${d.promedioForce ?? "-"} · Promedio resistencia: ${d.promedioStrength ?? "-"}`,
        columnas: ["", ...probetas.map((_, i) => `M${i + 1}`)],
        filas: [
          ["Fuerza (lbf)", ...probetas.map(p => p.force ?? "-")],
          [`Resistencia (${this._u(d.strengthUnidad || "psi")})`, ...probetas.map(p => p.strength ?? "-")],
        ]
      }
    }

    _tablaEct(e) {
      const d = e.detalle || {}
      const probetas = [d.p1, d.p2, d.p3, d.p4, d.p5].filter(Boolean)
      return {
        titulo: `4. ECT (lbf) — ${this._metaEnsayo(e)} · Promedio fuerza: ${d.promedioForce ?? "-"} · Promedio resistencia: ${d.promedioStrengthLbfM ?? "-"} lbf/m (${d.promedioStrengthLbIn ?? "-"} lb/pulg)`,
        columnas: ["", ...probetas.map((_, i) => `M${i + 1}`)],
        filas: [
          ["Fuerza (lbf)", ...probetas.map(p => p.force ?? "-")],
          ["Resistencia (lbf/m)", ...probetas.map(p => p.strength ?? "-")],
        ]
      }
    }

    _tablaBctMedido(e) {
      const d = e.detalle || {}
      const cajas = [d.c1, d.c2, d.c3].filter(Boolean)
      return {
        titulo: `6. BCT (lbf) — ${this._metaEnsayo(e)} · Promedio: ${d.promedioLbf ?? "-"} lbf${d.motivoMenos3 ? ` · Motivo <3 cajas: ${d.motivoMenos3}` : ""}`,
        columnas: ["", ...cajas.map((_, i) => `M${i + 1}`)],
        filas: [
          ["Largo (mm)", ...cajas.map(c => c.largo ?? "-")],
          ["Ancho (mm)", ...cajas.map(c => c.ancho ?? "-")],
          ["Alto (mm)", ...cajas.map(c => c.alto ?? "-")],
          ["Tipo de onda", ...cajas.map(c => c.tipoOnda || "-")],
          ["Gramaje complejo (g/m²)", ...cajas.map(c => c.gramajeComplejo ?? "-")],
          ["Espesor complejo (mm)", ...cajas.map(c => c.espesorComplejo ?? "-")],
          ["Resultado (lbf)", ...cajas.map(c => c.resultadoLbf ?? "-")],
        ]
      }
    }

    // 1/2/3. HUMEDAD/GRAMAJE/ESPESOR DEL COMPLEJO — Hoja 2: sin columnas Onda/Liner/Cartulina (el
    // complejo ya no distingue sustratos), un único set de valores por "N° de muestra".
    _tablaHumedadComplejo(e) {
      const d = e.detalle || {}
      return {
        titulo: `1. HUMEDAD DEL COMPLEJO (%) — ${this._metaEnsayo(e)}`,
        columnas: ["Atributo", "Valor"],
        filas: [
          ["Método", d.metodoEquipo || "-"],
          ["Punto izquierdo (%)", d.higrometroIzquierdo ?? "-"],
          ["Centro (%)", d.higrometroCentro ?? "-"],
          ["Punto derecho (%)", d.higrometroDerecho ?? "-"],
          ["Peso inicial (g)", d.horno1PesoInicial ?? "-"],
          ["Peso final (g)", d.horno1PesoFinal ?? "-"],
          ["Resultado (%)", d.hornoPromedio ?? d.higrometroPromedio ?? "-"],
        ]
      }
    }

    _tablaGramajeComplejo(e) {
      const d = e.detalle || {}
      return {
        titulo: `2. GRAMAJE DEL COMPLEJO (g/m²) — ${this._metaEnsayo(e)}`,
        columnas: ["Atributo", "Valor"],
        filas: [
          ["Tamaño de probeta", d.tamanoProbeta || "-"],
          ["Peso probeta (g) — Punto izquierdo", d.muestra1 ?? "-"],
          ["Peso probeta (g) — Centro", d.muestra2 ?? "-"],
          ["Peso probeta (g) — Punto derecho", d.muestra3 ?? "-"],
          ["Resultado promedio (g/m²)", d.promedio ?? "-"],
        ]
      }
    }

    _tablaEspesorComplejo(e) {
      const d = e.detalle || {}
      return {
        titulo: `3. ESPESOR DEL COMPLEJO (mm) — ${this._metaEnsayo(e)}`,
        columnas: ["Atributo", "Valor"],
        filas: [
          ["Punto izquierdo (mm)", d.medicion1 ?? "-"],
          ["Centro (mm)", d.medicion2 ?? "-"],
          ["Punto derecho (mm)", d.medicion3 ?? "-"],
          ["Resultado promedio (mm)", d.promedio ?? "-"],
        ]
      }
    }

    // Fallback universal: tabla de 2 columnas (Atributo/Valor) a partir del detalle plano del
    // ensayo — usado por BCT Teórico/Viscosidad/pH/Sólidos/Lugol (sin layout de columnas por
    // bobina/probeta en el REG-LAB-04) y por Humedad/Gramaje/Espesor cuando no hay bobinas
    // muestreadas (flujo simple de 1 bobina, el que ya existía).
    _tablaGenerica(e, tituloOverride) {
      const d = e.detalle || {}
      const etiquetas = {
        metodoEquipo: "Método de equipo", higrometroIzquierdo: "Higrómetro - Punto izquierdo (%)",
        higrometroCentro: "Higrómetro - Centro (%)", higrometroDerecho: "Higrómetro - Punto derecho (%)",
        higrometroPromedio: "Higrómetro - Promedio (%)", termobalanzaValor: "Termobalanza (%)",
        horno1PesoInicial: "Horno 1 - Peso inicial (g)", horno1PesoFinal: "Horno 1 - Peso final (g)",
        horno2PesoInicial: "Horno 2 - Peso inicial (g)", horno2PesoFinal: "Horno 2 - Peso final (g)",
        horno3PesoInicial: "Horno 3 - Peso inicial (g)", horno3PesoFinal: "Horno 3 - Peso final (g)",
        hornoPromedio: "Horno - Promedio (%)", diferenciaMetodos: "Diferencia entre métodos (%)",
        bobinaOnda: "Bobina Onda", bobinaLiner: "Bobina Liner", bobinaCartulina: "Bobina Cartulina",
        origenMuestra: "Origen de la muestra",
        tipoMaterial: "Tipo de material", modalidad: "Modalidad", tamanoProbeta: "Tamaño de probeta",
        muestra1: "Muestra 1", muestra2: "Muestra 2", muestra3: "Muestra 3", promedio: "Promedio",
        tipoMedicion: "Tipo de medición", medicion1: "Medición 1", medicion2: "Medición 2", medicion3: "Medición 3",
        tipoAdhesivo: "Tipo de adhesivo", temperatura: "Temperatura", equipo: "Equipo", husillo: "Husillo",
        velocidadRpm: "Velocidad (RPM)", resultadoCp: "Resultado (cP)",
        valorTexto: "Valor / rango", colorObservado: "Color observado",
        puntoMuestra: "Punto de muestra", coloracion: "Coloración", resultado: "Resultado", interpretacion: "Interpretación",
        tiempoMinutos: "Tiempo de prueba (min)",
        cumplimiento: "Cumplimiento",
        ectLbfM: "ECT usado (lbf/m)", ectLbIn: "ECT usado (lb/pulg)", espesorMm: "Espesor usado (mm)",
        espesorIn: "Espesor usado (pulg)", largoMm: "Largo interno (mm)", anchoMm: "Ancho interno (mm)",
        perimetroIn: "Perímetro (pulg)", bctTeoricoLbf: "BCT teórico (lbf)", bctTeoricoKgf: "BCT teórico (kgf)",
        aviso: "Aviso",
      }
      const excluir = new Set(["bobinas", "ectEnsayoId", "espesorEnsayoId", "largoIn", "anchoIn", "d1", "d2", "d3"])

      const filas = Object.keys(d)
        .filter(k => !excluir.has(k) && d[k] !== null && d[k] !== undefined && d[k] !== "" && typeof d[k] !== "object")
        .map(k => [etiquetas[k] || k, d[k]])

      // Sólidos totales: 3 determinaciones anidadas (d1/d2/d3), no capturadas por el filtro plano de arriba.
      ;["d1", "d2", "d3"].forEach((key, i) => {
        const det = d[key]
        if (det) filas.push([`Determinación ${i + 1} (m1/m2/m3)`, `${det.m1 ?? "-"} / ${det.m2 ?? "-"} / ${det.m3 ?? "-"}`])
      })

      return {
        titulo: `${tituloOverride || e.tipoEnsayo} — ${this._metaEnsayo(e)}`,
        columnas: ["Atributo", "Valor"],
        filas
      }
    }

    // =====================================================================
    // EDICIÓN CON AUDITORÍA DE UN ENSAYO FINALIZADO ("Corregir")
    // No edita in-place: reabre el mismo modal de "+ Tipo" precargado con los valores actuales,
    // pide un motivo obligatorio, y al guardar crea un ensayo NUEVO vinculado al original (que
    // queda anulado conservando su fila intacta) — mismo guardarXxx() de siempre, sin duplicar
    // su lógica. Ver MuestraLaboratorioHandler.FinalizarGuardado / Repository.ReemplazarEnsayo.
    // =====================================================================
    _tipoEnsayoConfig(tipo) {
      const map = {
        HUMEDAD: { modalId: "mlbModalHumedad", precargar: e => this._precargarHumedad(e) },
        GRAMAJE: { modalId: "mlbModalGramaje", precargar: e => this._precargarGramaje(e) },
        COBB: { modalId: "mlbModalCobb", precargar: e => this._precargarCobb(e) },
        ESPESOR: { modalId: "mlbModalEspesor", precargar: e => this._precargarEspesor(e) },
        RCT: { modalId: "mlbModalRct", precargar: e => this._precargarResistencia(e, "Rct", true) },
        FCT: { modalId: "mlbModalFct", precargar: e => this._precargarResistencia(e, "Fct", false) },
        ECT: { modalId: "mlbModalEct", precargar: e => this._precargarEct(e) },
        BCT_MEDIDO: { modalId: "mlbModalBctMedido", precargar: e => this._precargarBctMedido(e) },
        BCT_TEORICO: { modalId: "mlbModalBctTeorico", precargar: e => this._precargarBctTeorico(e) },
        VISCOSIDAD: { modalId: "mlbModalViscosidad", precargar: e => this._precargarViscosidad(e) },
        PH: { modalId: "mlbModalPh", precargar: e => this._precargarPh(e) },
        SOLIDOS: { modalId: "mlbModalSolidos", precargar: e => this._precargarSolidos(e) },
        LUGOL: { modalId: "mlbModalLugol", precargar: e => this._precargarLugol(e) },
        FILTRACION: { modalId: "mlbModalFiltracion", precargar: e => this._precargarFiltracion(e) },
      }
      return map[tipo]
    }

    corregirEnsayo(ensayoId) {
      const ensayo = (this._ensayosActuales || []).find(e => e.id === ensayoId)
      if (!ensayo) return

      // REG-LAB-04 v2: los ensayos con muestras (salvo Humedad, que lo maneja _precargarHumedad)
      // se corrigen en el formulario genérico, con las muestras vigentes precargadas.
      if (ensayo.modeloMuestras && ensayo.tipoEnsayo !== "HUMEDAD") {
        const cfgMuestras = this._cfgEnsayo(ensayo.tipoEnsayo, ensayo.variante)
        if (!cfgMuestras) {
          alert("La configuración de este ensayo no está disponible. Revisa la conexión con la API.")
          return
        }
        this._corrigiendoEnsayoId = ensayoId
        this._abrirEnsayoGenerico(cfgMuestras, ensayo, "corregir")
        this._mostrarMotivoCorreccion("mlbModalEnsayoMuestras")
        return
      }

      const cfg = this._tipoEnsayoConfig(ensayo.tipoEnsayo)
      if (!cfg) {
        alert("Este tipo de ensayo aún no soporta corrección desde esta pantalla.")
        return
      }

      this._corrigiendoEnsayoId = ensayoId
      cfg.precargar(ensayo)
      this._mostrarMotivoCorreccion(cfg.modalId)
      this.abrirModal(cfg.modalId)
    }

    _mostrarMotivoCorreccion(modalId) {
      let bloque = document.getElementById("mlbMotivoCorreccionBloque")
      if (!bloque) {
        bloque = document.createElement("div")
        bloque.id = "mlbMotivoCorreccionBloque"
        bloque.className = "mlb-form-campo mlb-form-campo-full"
        bloque.innerHTML = '<label>Motivo de la corrección *</label><textarea id="mlbMotivoCorreccionInput" rows="2"></textarea>'
      }
      document.getElementById("mlbMotivoCorreccionInput") // asegura que exista antes de limpiar
      bloque.querySelector("textarea").value = ""

      const modal = document.getElementById(modalId)
      const acciones = modal.querySelector(".mlb-form-acciones")
      acciones.parentNode.insertBefore(bloque, acciones)
    }

    _limpiarCorreccion() {
      this._corrigiendoEnsayoId = null
      const bloque = document.getElementById("mlbMotivoCorreccionBloque")
      if (bloque) bloque.remove()
    }

    // Si se está corrigiendo un ensayo, agrega ensayoOriginalId/motivoReemplazo al payload y
    // valida que el motivo esté completo. Devuelve false (y muestra la alerta) si falta el
    // motivo, para que el guardarXxx() que la llama corte el flujo con un simple `if (!... ) return`.
    _aplicarDatosCorreccion(data) {
      if (!this._corrigiendoEnsayoId) return true

      const motivo = document.getElementById("mlbMotivoCorreccionInput")?.value?.trim()
      if (!motivo) {
        alert("Debes indicar el motivo de la corrección")
        return false
      }

      data.ensayoOriginalId = this._corrigiendoEnsayoId
      data.motivoReemplazo = motivo
      return true
    }

    // Punto 11 REG-LAB-04: reconstruye las filas de bobinas ya guardadas al corregir un ensayo.
    _precargarBobinas(containerId, labelsCsv, bobinas) {
      const contenedor = document.getElementById(containerId)
      contenedor.innerHTML = ""
      ;(bobinas || []).forEach(b => {
        const fila = this._renderFilaBobina(labelsCsv.split(","))
        fila.querySelector(".mlb-bob-numero").value = b.numeroBobina || ""
        fila.querySelector(".mlb-bob-lote").value = b.lote || ""
        fila.querySelector(".mlb-bob-posicion").value = b.posicion || "Onda"
        fila.querySelector(".mlb-bob-v1").value = b.valor1 ?? ""
        fila.querySelector(".mlb-bob-v2").value = b.valor2 ?? ""
        fila.querySelector(".mlb-bob-v3").value = b.valor3 ?? ""
        contenedor.appendChild(fila)
      })
    }

    _precargarHumedad(e) {
      const sel = document.getElementById("mlbHumMetodoEquipo")
      // REG-LAB-04 v2: corregir un ensayo con muestras crea uno nuevo con las mismas muestras
      // precargadas; corregir un ensayo histórico sigue con su formulario de siempre.
      if (e.modeloMuestras) {
        const cfg = this._cfgEnsayo(e.tipoEnsayo, e.variante)
        if (!cfg) {
          alert("La configuración de este ensayo no está disponible. Revisa la conexión con la API.")
          return
        }
        this._humModoLegacy = false
        sel.value = e.variante || "Termobalanza"
        sel.disabled = true
        document.getElementById("mlbHumMetodo").value = e.metodo || ""
        document.getElementById("mlbHumObservacion").value = e.observacion || ""
        this._emIniciar("mlbHumMuestrasPanel", cfg, e, "corregir")
        this.actualizarCamposHumedad()
        return
      }
      this._humModoLegacy = true
      this._em = null
      sel.disabled = false
      const d = e.detalle || {}
      document.getElementById("mlbHumMetodoEquipo").value = d.metodoEquipo || "Higrometro"
      document.getElementById("mlbHumIzq").value = d.higrometroIzquierdo ?? ""
      document.getElementById("mlbHumCentro").value = d.higrometroCentro ?? ""
      document.getElementById("mlbHumDer").value = d.higrometroDerecho ?? ""
      document.getElementById("mlbHumTermo").value = d.termobalanzaValor ?? ""
      document.getElementById("mlbHum1i").value = d.horno1PesoInicial ?? ""
      document.getElementById("mlbHum1f").value = d.horno1PesoFinal ?? ""
      document.getElementById("mlbHum2i").value = d.horno2PesoInicial ?? ""
      document.getElementById("mlbHum2f").value = d.horno2PesoFinal ?? ""
      document.getElementById("mlbHum3i").value = d.horno3PesoInicial ?? ""
      document.getElementById("mlbHum3f").value = d.horno3PesoFinal ?? ""
      document.getElementById("mlbHumBobinaOnda").value = d.bobinaOnda || ""
      document.getElementById("mlbHumBobinaLiner").value = d.bobinaLiner || ""
      document.getElementById("mlbHumBobinaCartulina").value = d.bobinaCartulina || ""
      document.getElementById("mlbHumOrigenMuestra").value = d.origenMuestra || ""
      document.getElementById("mlbHumMetodo").value = e.metodo || ""
      document.getElementById("mlbHumObservacion").value = e.observacion || ""
      this._precargarBobinas("mlbHumBobinasFilas", "Punto izquierdo,Centro,Punto derecho", d.bobinas)
      this.actualizarCamposHumedad()
    }

    _precargarGramaje(e) {
      const d = e.detalle || {}
      document.getElementById("mlbGraTipoMaterial").value = d.tipoMaterial || "Papel"
      document.getElementById("mlbGraModalidad").value = d.modalidad || "ProbetaPeso"
      document.getElementById("mlbGraTamanoProbeta").value = d.tamanoProbeta || "10x10"
      document.getElementById("mlbGra1").value = d.muestra1 ?? ""
      document.getElementById("mlbGra2").value = d.muestra2 ?? ""
      document.getElementById("mlbGra3").value = d.muestra3 ?? ""
      document.getElementById("mlbGraBobinaOnda").value = d.bobinaOnda || ""
      document.getElementById("mlbGraBobinaLiner").value = d.bobinaLiner || ""
      document.getElementById("mlbGraBobinaCartulina").value = d.bobinaCartulina || ""
      document.getElementById("mlbGraMetodo").value = e.metodo || ""
      document.getElementById("mlbGraObservacion").value = e.observacion || ""
      this._precargarBobinas("mlbGraBobinasFilas", "Muestra 1,Muestra 2,Muestra 3", d.bobinas)
    }

    _precargarCobb(e) {
      const d = e.detalle || {}
      ;[1, 2, 3].forEach(n => {
        const p = d[`p${n}`] || {}
        document.getElementById(`mlbCobb${n}Bobina`).value = p.bobina || ""
        document.getElementById(`mlbCobb${n}Cara`).value = p.cara || "Externa"
        document.getElementById(`mlbCobb${n}Inicial`).value = p.pesoInicial ?? ""
        document.getElementById(`mlbCobb${n}Final`).value = p.pesoFinal ?? ""
        document.getElementById(`mlbCobb${n}Tiempo`).value = p.tiempo || ""
      })
      document.getElementById("mlbCobbMetodo").value = e.metodo || ""
      document.getElementById("mlbCobbObservacion").value = e.observacion || ""
    }

    _precargarEspesor(e) {
      const d = e.detalle || {}
      document.getElementById("mlbEspTipoMedicion").value = d.tipoMedicion || "Ubicacion"
      document.getElementById("mlbEsp1").value = d.medicion1 ?? ""
      document.getElementById("mlbEsp2").value = d.medicion2 ?? ""
      document.getElementById("mlbEsp3").value = d.medicion3 ?? ""
      document.getElementById("mlbEspBobinaOnda").value = d.bobinaOnda || ""
      document.getElementById("mlbEspBobinaLiner").value = d.bobinaLiner || ""
      document.getElementById("mlbEspBobinaCartulina").value = d.bobinaCartulina || ""
      document.getElementById("mlbEspMetodo").value = e.metodo || ""
      document.getElementById("mlbEspObservacion").value = e.observacion || ""
      this._precargarBobinas("mlbEspBobinasFilas", "Punto izquierdo,Centro,Punto derecho", d.bobinas)
    }

    _precargarResistencia(e, prefijoIds, esRct) {
      const d = e.detalle || {}
      if (esRct) document.getElementById("mlbRctComponente").value = d.componente || "Liner"
      ;[1, 2, 3].forEach(n => {
        const p = d[`p${n}`] || {}
        if (esRct) document.getElementById(`mlb${prefijoIds}${n}Bobina`).value = p.bobina || ""
        document.getElementById(`mlb${prefijoIds}${n}Force`).value = p.force ?? ""
        document.getElementById(`mlb${prefijoIds}${n}Strength`).value = p.strength ?? ""
      })
      document.getElementById(`mlb${prefijoIds}StrengthUnidad`).value = d.strengthUnidad || ""
      document.getElementById(`mlb${prefijoIds}Metodo`).value = e.metodo || ""
      document.getElementById(`mlb${prefijoIds}Observacion`).value = e.observacion || ""
    }

    _precargarEct(e) {
      const d = e.detalle || {}
      ;[1, 2, 3, 4, 5].forEach(n => {
        const p = d[`p${n}`] || {}
        document.getElementById(`mlbEct${n}`).value = p.force ?? ""
      })
      document.getElementById("mlbEctMetodo").value = e.metodo || ""
      document.getElementById("mlbEctObservacion").value = e.observacion || ""
    }

    _precargarBctMedido(e) {
      const d = e.detalle || {}
      document.getElementById("mlbBctMedCajas").value = String(d.cajasEnsayadas || 3)
      document.getElementById("mlbBctMedMotivo").value = d.motivoMenos3 || ""
      this.renderBctMedCajas()
      ;[1, 2, 3].forEach(n => {
        const c = d[`c${n}`]
        const largoEl = document.getElementById(`mlbBctMedC${n}Largo`)
        if (!c || !largoEl) return
        largoEl.value = c.largo ?? ""
        document.getElementById(`mlbBctMedC${n}Ancho`).value = c.ancho ?? ""
        document.getElementById(`mlbBctMedC${n}Alto`).value = c.alto ?? ""
        document.getElementById(`mlbBctMedC${n}TipoOnda`).value = c.tipoOnda || ""
        document.getElementById(`mlbBctMedC${n}Gramaje`).value = c.gramajeComplejo ?? ""
        document.getElementById(`mlbBctMedC${n}Espesor`).value = c.espesorComplejo ?? ""
        document.getElementById(`mlbBctMedC${n}Resultado`).value = c.resultadoLbf ?? ""
      })
      document.getElementById("mlbBctMedMetodo").value = e.metodo || ""
      document.getElementById("mlbBctMedObservacion").value = e.observacion || ""
    }

    _precargarBctTeorico(e) {
      const d = e.detalle || {}
      const ects = (this._ensayosActuales || []).filter(x => x.tipoEnsayo === "ECT" && x.estado === "Finalizado" && x.resultadoValor != null)
      const espesores = (this._ensayosActuales || []).filter(x => x.tipoEnsayo === "ESPESOR" && x.estado === "Finalizado" && x.resultadoValor != null)

      const selEct = document.getElementById("mlbBctTeoEct")
      const selEsp = document.getElementById("mlbBctTeoEspesor")
      selEct.innerHTML = ects.map(x => `<option value="${x.id}">Ensayo #${x.id} - ${this._esc(x.resultadoValor)} ${this._esc(this._u(x.resultadoUnidad))} (${this._esc(x.fecha)})</option>`).join("")
      selEsp.innerHTML = espesores.map(x => `<option value="${x.id}">Ensayo #${x.id} - ${this._esc(x.resultadoValor)} ${this._esc(this._u(x.resultadoUnidad))} (${this._esc(x.fecha)})</option>`).join("")

      if (d.ectEnsayoId) selEct.value = String(d.ectEnsayoId)
      if (d.espesorEnsayoId) selEsp.value = String(d.espesorEnsayoId)
      document.getElementById("mlbBctTeoLargo").value = d.largoMm ?? ""
      document.getElementById("mlbBctTeoAncho").value = d.anchoMm ?? ""
      document.getElementById("mlbBctTeoObservacion").value = e.observacion || ""
    }

    _precargarViscosidad(e) {
      const d = e.detalle || {}
      document.getElementById("mlbViscTipoAdhesivo").value = d.tipoAdhesivo || ""
      document.getElementById("mlbViscTemperatura").value = d.temperatura ?? ""
      document.getElementById("mlbViscEquipo").value = d.equipo || ""
      document.getElementById("mlbViscHusillo").value = d.husillo || ""
      document.getElementById("mlbViscRpm").value = d.velocidadRpm ?? ""
      document.getElementById("mlbViscResultado").value = d.resultadoCp ?? ""
      document.getElementById("mlbViscObservacion").value = e.observacion || ""
    }

    _precargarPh(e) {
      const d = e.detalle || {}
      document.getElementById("mlbPhValor").value = d.valorTexto || ""
      document.getElementById("mlbPhColor").value = d.colorObservado || ""
      document.getElementById("mlbPhObservacion").value = e.observacion || ""
    }

    _precargarSolidos(e) {
      const d = e.detalle || {}
      ;[1, 2, 3].forEach(n => {
        const det = d[`d${n}`] || {}
        document.getElementById(`mlbSol${n}M1`).value = det.m1 ?? ""
        document.getElementById(`mlbSol${n}M2`).value = det.m2 ?? ""
        document.getElementById(`mlbSol${n}M3`).value = det.m3 ?? ""
      })
      document.getElementById("mlbSolObservacion").value = e.observacion || ""
    }

    _precargarFiltracion(e) {
      document.getElementById("mlbFilResultado").value = e.detalle?.resultado || ""
      document.getElementById("mlbFilObservacion").value = e.observacion || ""
    }

    _precargarLugol(e) {
      const d = e.detalle || {}
      document.getElementById("mlbLugolPunto").value = d.puntoMuestra || ""
      document.getElementById("mlbLugolColoracion").value = d.coloracion || ""
      document.getElementById("mlbLugolResultado").value = d.resultado || "Negativo"
      document.getElementById("mlbLugolInterpretacion").value = d.interpretacion || ""
      document.getElementById("mlbLugolCumplimiento").value = e.cumplimiento || "Sin especificacion"
      document.getElementById("mlbLugolObservacion").value = e.observacion || ""
    }

    // =====================================================================
    // REG-LAB-04 v2 (Fase 2): ENSAYO -> MUESTRAS -> DETERMINACIONES
    // =====================================================================
    // Editor genérico de muestras. Lo que se puede registrar (cuántas determinaciones, mínimo,
    // máximo, unidad) lo define la API por ensayo (muestraLab.ensayoMuestras.config): acá no se
    // fija ninguna regla de laboratorio. Si la API no lo informa (versión anterior), el ensayo sigue
    // con su formulario de siempre. Piloto: Humedad por termobalanza.
    async _cargarConfigMuestras() {
      this._cfgMuestras = []
      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.ensayoMuestras.config", data: {} })
        if (res && res.ok !== false && Array.isArray(res.data)) this._cfgMuestras = res.data
      } catch {
        // Sin configuración: los ensayos usan su formulario histórico.
      }
    }

    _cfgEnsayo(tipoEnsayo, variante) {
      const v = (variante || "").toLowerCase()
      return (this._cfgMuestras || []).find(c =>
        c.tipoEnsayo === tipoEnsayo && (c.variante || "").toLowerCase() === v) || null
    }

    // Dónde vive cada editor de muestras: Humedad usa su propio formulario (selector de método);
    // el resto de los ensayos del modelo nuevo usa el formulario genérico mlbModalEnsayoMuestras.
    _emHost(panelId) {
      return panelId === "mlbHumMuestrasPanel"
        ? { modalId: "mlbModalHumedad", observacionId: "mlbHumObservacion" }
        : { modalId: "mlbModalEnsayoMuestras", observacionId: "mlbEmObservacion" }
    }

    _emDetVacia(numero) {
      return { id: null, numero, valores: {}, resultados: {}, valida: true, motivoInvalida: "", eliminar: false, guardada: false, error: null }
    }

    // Datos de muestra (tamaño de probeta, cara, tiempo...): el valor guardado o, en una muestra
    // nueva, el valor por defecto que informa la API (visible y modificable por el analista).
    _emParametrosIniciales(cfg, guardados) {
      const p = {}
      for (const par of cfg.parametros || []) p[par.codigo] = guardados ? (guardados[par.codigo] ?? "") : (par.defecto ?? "")
      return p
    }

    _emMuestraVacia(cfg) {
      return {
        id: null, numero: null, sustrato: "", bobinaNumero: "", bobinaLote: "", origenMuestra: "",
        tipoAnalisis: "Inicial", observacion: "", eliminar: false, motivoEliminacion: null, eliminada: false,
        parametros: this._emParametrosIniciales(cfg, null), otrosGuardados: [], calculo: null,
        determinaciones: Array.from({ length: cfg.determinacionesIniciales }, (_, i) => this._emDetVacia(i + 1)),
      }
    }

    _emDesdeServidor(m, cfg, comoNueva) {
      const dets = (m.determinaciones || []).map(d => ({
        id: comoNueva ? null : d.id, numero: d.numero,
        valores: Object.fromEntries(Object.entries(d.valores || {}).filter(([, v]) => v !== null && v !== undefined)),
        resultados: d.resultados || {}, valida: d.valida !== false, motivoInvalida: d.motivoInvalida || "",
        eliminar: false, guardada: !comoNueva, error: null,
      }))
      // Se completa hasta el mínimo exigido (nunca hasta las probetas "ofrecidas": una muestra guardada con 1 o 2
      // probetas debe reabrirse con 1 o 2, no con 3 filas vacías). Una muestra sin determinaciones sí parte de las iniciales.
      const hasta = dets.length ? Math.min(cfg.determinacionesIniciales, cfg.determinacionesMinimas) : cfg.determinacionesIniciales
      for (let n = 1; n <= hasta; n++) {
        if (!dets.some(d => d.numero === n)) dets.push(this._emDetVacia(n))
      }
      dets.sort((a, b) => a.numero - b.numero)
      return {
        id: comoNueva ? null : m.id, numero: comoNueva ? null : m.numero,
        sustrato: m.sustrato || "", bobinaNumero: m.bobinaNumero || "", bobinaLote: m.bobinaLote || "",
        origenMuestra: m.origenMuestra || "", tipoAnalisis: m.tipoAnalisis || "", observacion: m.observacion || "",
        parametros: this._emParametrosIniciales(cfg, m.parametros || {}),
        eliminar: false, motivoEliminacion: null, eliminada: !comoNueva && !!m.eliminada,
        eliminadaPor: m.eliminadaPor, fechaEliminacion: m.fechaEliminacion, motivoEliminacionGuardado: m.motivoEliminacion,
        unidad: m.unidad || null, promedioGuardado: m.promedio ?? null, completaGuardada: !!m.completa,
        cumplimientoGuardado: m.cumplimiento || null, otrosGuardados: m.otrosPromedios || [], calculo: null,
        determinaciones: dets,
      }
    }

    // Para ver un ensayo guardado cuyo tipo ya no está en la configuración de la API: se arma una
    // configuración mínima con lo que trae el propio ensayo (el dato guardado nunca se oculta).
    _emCfgSoloLectura(e) {
      const codigos = new Set()
      ;(e.muestras || []).forEach(m => (m.determinaciones || []).forEach(d => Object.keys(d.valores || {}).forEach(k => codigos.add(k))))
      return {
        tipoEnsayo: e.tipoEnsayo, variante: e.variante, nombre: e.tipoEnsayo, determinacionesIniciales: 0, determinacionesMinimas: 0,
        determinacionesMaximas: 0, nombreDeterminacion: "Determinación", unidad: e.resultadoUnidad || "", decimales: 2,
        entradas: [...codigos].map(c => ({ codigo: c, etiqueta: c, unidad: null, obligatoria: true })),
        resultados: [], parametros: [], derivados: [], usaBobina: true, usaOrigen: true, sustratos: null,
      }
    }

    // modo: "nuevo" | "continuar" | "ver" | "corregir"
    _emIniciar(panelId, cfg, ensayo, modo) {
      let muestras
      if (!ensayo) muestras = [this._emMuestraVacia(cfg)]
      else if (modo === "corregir") muestras = (ensayo.muestras || []).filter(m => !m.eliminada).map(m => this._emDesdeServidor(m, cfg, true))
      else muestras = (ensayo.muestras || []).map(m => this._emDesdeServidor(m, cfg, false))
      if (muestras.length === 0) muestras = [this._emMuestraVacia(cfg)]

      this._em = {
        panelId, cfg, modo, ...this._emHost(panelId),
        ensayoId: modo === "continuar" || modo === "ver" ? ensayo.id : null,
        revision: modo === "continuar" ? ensayo.revision : null,
        soloLectura: modo === "ver",
        numeroMaximo: Math.max(0, ...((ensayo?.muestras || []).map(m => m.numero))),
        muestras,
      }
      const panel = document.getElementById(panelId)
      const estado = panel?.querySelector(".mlb-em-estado")
      if (estado) estado.textContent = ""
      const formula = panel?.querySelector(".mlb-em-formula")
      if (formula) {
        formula.textContent = cfg.formula ? `Fórmula: ${this._u(cfg.formula)}` : ""
        formula.style.display = cfg.formula ? "" : "none"
      }
      this._emRender()
      this._emProgramarCalculo(0)
    }

    _emNum(v) {
      if (v === null || v === undefined || v === "") return null
      if (typeof v === "number") return Number.isFinite(v) ? v : null
      const t = String(v).trim().replace(",", ".")
      if (t === "") return null
      const n = Number(t)
      return Number.isFinite(n) ? n : null
    }

    _emFormato(v, dec) {
      return Number(v).toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec })
    }

    _emEtiquetaDet(cfg, numero) {
      const et = cfg.etiquetasDeterminaciones
      if (et && numero >= 1 && numero <= et.length) return et[numero - 1]
      const nombre = cfg.nombreDeterminacion || "Determinación"
      return nombre.length === 1 ? `${nombre}${numero}` : `${nombre} ${numero}`
    }

    _emDecimales(cfg, codigoValor) {
      const codigo = codigoValor.slice(codigoValor.indexOf(":") + 1)
      const def = codigoValor.startsWith("derivado:")
        ? (cfg.derivados || []).find(x => x.codigo === codigo)
        : (cfg.resultados || []).find(x => x.codigo === codigo)
      return def?.decimales ?? cfg.decimales ?? 2
    }

    // dosDecimales: solo en la vista de lectura (Registros → Ver); el informe impreso no lo pasa y conserva su formato.
    _emTextoOtros(cfg, otros, dosDecimales = false) {
      return (otros || []).filter(o => o.valor !== null && o.valor !== undefined)
        .map(o => ` · ${this._esc(o.etiqueta)}: ${this._emFormato(o.valor, dosDecimales ? 2 : this._emDecimales(cfg, o.codigo))}${o.unidad ? ` ${this._esc(this._u(o.unidad))}` : ""}`)
        .join("")
    }

    // Resultado de la muestra. Mientras se escribe sale de muestraLab.ensayoMuestras.calcular (las
    // mismas fórmulas y reglas que el guardado, en la API); al ver un ensayo, de lo guardado.
    _emTextoPromedio(m) {
      const cfg = this._em.cfg
      if (this._em.soloLectura) {
        if (!m.completaGuardada || m.promedioGuardado === null) return `<span class="mlb-em-incompleta">Incompleta</span>`
        const unidad = this._u(m.unidad || cfg.unidad)
        return `Promedio: ${this._emFormato(m.promedioGuardado, 2)} ${this._esc(unidad)}${this._emTextoOtros(cfg, m.otrosGuardados, true)}${m.cumplimientoGuardado ? ` · ${this._esc(m.cumplimientoGuardado)}` : ""}`
      }
      const c = m.calculo
      if (this._em.calculoError) return `<span class="mlb-em-incompleta">${this._esc(this._em.calculoError)}</span>`
      if (!c) return `<span class="mlb-em-incompleta">Calculando…</span>`
      if (c.error) return `<span class="mlb-em-incompleta">${this._esc(c.error)}</span>`
      if (!c.completa || c.promedio === null || c.promedio === undefined) {
        return `<span class="mlb-em-incompleta">Incompleta: ${this._esc(c.faltante || "faltan datos")}</span>`
      }
      return `Promedio: ${this._emFormato(c.promedio, cfg.decimales ?? 2)} ${this._esc(this._u(c.unidad || cfg.unidad))}${this._emTextoOtros(cfg, c.otrosPromedios)}${this._emTextoCantidad(cfg, c.validas)}`
    }

    // Ensayos con cantidad de determinaciones configurable (mínimo menor que las ofrecidas: Cobb/RCT, probetas desde 1): el promedio indica
    // con cuántas probetas válidas se calculó, para que no se lea como si fueran siempre las 3 de referencia.
    _emTextoCantidad(cfg, validas) {
      if (!(cfg.determinacionesMinimas < cfg.determinacionesIniciales) || !Number.isInteger(validas)) return ""
      const nombre = (cfg.nombreDeterminacion || "determinación").toLowerCase()
      return ` · ${validas} ${validas === 1 ? nombre : nombre + "s"} válida${validas === 1 ? "" : "s"}`
    }

    // Resultados calculados de una determinación (solo los que no son el mismo valor ingresado).
    _emTextoResultadosDet(cfg, d) {
      if (d.error) return `<span class="mlb-em-incompleta">${this._esc(d.error)}</span>`
      if (!d.valida) return `<span class="mlb-em-incompleta">No válida: queda fuera de los promedios${d.motivoInvalida && this._em?.soloLectura ? ` (${this._esc(d.motivoInvalida)})` : ""}</span>`
      const entradas = new Set((cfg.entradas || []).map(x => x.codigo))
      return (cfg.resultados || [])
        .filter(r => !entradas.has(r.codigo) && d.resultados?.[r.codigo] !== null && d.resultados?.[r.codigo] !== undefined)
        .map(r => `${this._esc(r.etiqueta)}: ${this._emFormato(d.resultados[r.codigo], this._em?.soloLectura ? 2 : (r.decimales ?? 2))}${r.unidad ? ` ${this._esc(this._u(r.unidad))}` : ""}`)
        .join(" · ")
    }

    _emRenderDet(cfg, idx, di, d, ro) {
      const etiqueta = this._esc(this._emEtiquetaDet(cfg, d.numero))
      const attrs = `data-idx="${idx}" data-di="${di}"`
      if (d.eliminar) {
        return `<div class="mlb-em-det-fila mlb-em-eliminada">${etiqueta}: se eliminará al guardar. <button type="button" class="btn-secondary mlb-em-det-deshacer" ${attrs}>Deshacer</button></div>`
      }
      const entradas = (cfg.entradas || []).map(en => `
          <div class="mlb-form-campo"><label>${this._esc(en.etiqueta)}${en.unidad ? ` (${this._esc(this._u(en.unidad))})` : ""}${en.obligatoria === false ? " (opcional)" : ""}</label>
            <input type="number" step="any" class="mlb-em-det" ${attrs} data-codigo="${this._escAttr(en.codigo)}" value="${this._escAttr(d.valores[en.codigo] ?? "")}" ${ro}></div>`).join("")
      const quitar = !ro && d.numero > cfg.determinacionesMinimas
        ? `<button type="button" class="btn-secondary mlb-em-det-quitar" ${attrs}>Quitar</button>` : ""
      return `
        <div class="mlb-em-det-fila" ${attrs}>
          <div class="mlb-em-det-titulo">${etiqueta}</div>
          <div class="mlb-form-row">
            ${entradas}
            <div class="mlb-form-campo mlb-em-det-validez">
              <label><input type="checkbox" class="mlb-em-det-invalida" ${attrs} ${d.valida ? "" : "checked"} ${ro}> No válida</label>
              <input type="text" class="mlb-em-det-motivo" ${attrs} placeholder="Motivo (obligatorio)" maxlength="500" value="${this._escAttr(d.motivoInvalida)}" style="${d.valida ? "display:none;" : ""}" ${ro}>
            </div>
            ${quitar}
          </div>
          <div class="mlb-em-det-res" ${attrs}>${this._emTextoResultadosDet(cfg, d)}</div>
        </div>`
    }

    _emRender() {
      const em = this._em
      const panel = document.getElementById(em.panelId)
      if (!panel) return
      const cfg = em.cfg
      const ro = em.soloLectura ? "disabled" : ""
      const opciones = (lista, valor) => {
        const items = valor && !lista.some(([v]) => v === valor) ? [...lista, [valor, valor]] : lista
        return items.map(([v, t]) => `<option value="${this._escAttr(v)}" ${v === valor ? "selected" : ""}>${this._esc(t)}</option>`).join("")
      }
      const origenes = [["", "-- No informado --"], ["Bobinas", "Bobina"], ["SeparacionPapeles", "Separación de papeles o descape"]]
      const tipos = [["", "-- Seleccionar --"], ["Inicial", "Inicial"], ["Contramuestra", "Contramuestra"], ["Reensayo", "Reensayo"]]

      let nuevas = 0
      panel.querySelector(".mlb-em-lista").innerHTML = em.muestras.map((m, idx) => {
        if (m.eliminada) {
          return `<div class="mlb-em-muestra mlb-em-eliminada">Muestra N.º ${m.numero} eliminada por ${this._esc(m.eliminadaPor || "-")} el ${this._esc(m.fechaEliminacion || "-")}${m.motivoEliminacionGuardado ? ` — Motivo: ${this._esc(m.motivoEliminacionGuardado)}` : ""}</div>`
        }
        const numero = m.numero ?? (em.numeroMaximo + (++nuevas))
        if (m.eliminar) {
          return `<div class="mlb-em-muestra mlb-em-eliminada" data-idx="${idx}">Muestra N.º ${numero}: se eliminará al guardar. <button type="button" class="btn-secondary mlb-em-deshacer" data-idx="${idx}">Deshacer</button></div>`
        }
        const campo = (etiqueta, html) => `<div class="mlb-form-campo"><label>${etiqueta}</label>${html}</div>`
        const ident = []
        if (cfg.sustratos && cfg.sustratos.length) {
          ident.push(campo(this._esc(cfg.etiquetaSustrato || "Sustrato"),
            `<select class="mlb-em-campo" data-idx="${idx}" data-campo="sustrato" ${ro}>${opciones([["", "-- Seleccionar --"], ...cfg.sustratos.map(s => [s, s])], m.sustrato)}</select>`))
        }
        if (cfg.usaBobina) {
          ident.push(campo("N.º de bobina", `<input type="text" class="mlb-em-campo" data-idx="${idx}" data-campo="bobinaNumero" value="${this._escAttr(m.bobinaNumero)}" ${ro}>`))
          ident.push(campo("Lote de bobina", `<input type="text" class="mlb-em-campo" data-idx="${idx}" data-campo="bobinaLote" value="${this._escAttr(m.bobinaLote)}" ${ro}>`))
        }
        if (cfg.usaOrigen) {
          ident.push(campo("Origen de la muestra", `<select class="mlb-em-campo" data-idx="${idx}" data-campo="origenMuestra" ${ro}>${opciones(origenes, m.origenMuestra)}</select>`))
        }
        ident.push(campo("Tipo de análisis", `<select class="mlb-em-campo" data-idx="${idx}" data-campo="tipoAnalisis" ${ro}>${opciones(tipos, m.tipoAnalisis)}</select>`))
        const params = (cfg.parametros || []).map(p => {
          // Sección 9: si lo definió el administrador (maestro de métodos), el analista no lo cambia.
          const etiqueta = `${this._esc(p.etiqueta)}${p.obligatorio ? " *" : ""}${p.fijo ? " (definido por el administrador)" : ""}`
          const valor = m.parametros?.[p.codigo] || (p.fijo && !m.id ? p.defecto : "") || ""
          const roP = p.fijo ? "disabled" : ro
          return p.opciones && p.opciones.length
            ? campo(etiqueta, `<select class="mlb-em-param" data-idx="${idx}" data-codigo="${this._escAttr(p.codigo)}" ${roP}>${opciones([["", "-- Seleccionar --"], ...p.opciones.map(o => [o, o])], valor)}</select>`)
            : campo(etiqueta, `<input type="text" class="mlb-em-param" data-idx="${idx}" data-codigo="${this._escAttr(p.codigo)}" maxlength="150" value="${this._escAttr(valor)}" ${roP}>`)
        }).join("")
        const activas = m.determinaciones.filter(d => !d.eliminar).length
        const agregarDet = !em.soloLectura && activas < cfg.determinacionesMaximas
          ? `<button type="button" class="btn-secondary mlb-em-det-agregar" data-idx="${idx}">+ Agregar ${this._esc((cfg.nombreDeterminacion || "determinación").toLowerCase())}</button>` : ""
        return `
          <div class="mlb-em-muestra" data-idx="${idx}">
            <div class="mlb-em-cabecera">
              <span>Muestra N.º ${numero}${m.id ? "" : " (nueva)"}</span>
              ${em.soloLectura ? "" : `<button type="button" class="btn-secondary mlb-em-eliminar" data-idx="${idx}">Eliminar muestra</button>`}
            </div>
            <div class="mlb-form-row">${ident.join("")}</div>
            ${params ? `<div class="mlb-form-row">${params}</div>` : ""}
            ${m.determinaciones.map((d, di) => this._emRenderDet(cfg, idx, di, d, ro)).join("")}
            ${agregarDet}
            <div class="mlb-em-promedio" data-idx="${idx}">${this._emTextoPromedio(m)}</div>
          </div>`
      }).join("")

      panel.querySelector(".mlb-em-agregar").style.display = em.soloLectura ? "none" : "inline-block"
    }

    // Repinta solo los resultados (sin redibujar los campos, para no perder el foco).
    _emPintarCalculos() {
      const em = this._em
      if (!em) return
      em.muestras.forEach((m, idx) => {
        const prom = document.querySelector(`#${em.panelId} .mlb-em-promedio[data-idx="${idx}"]`)
        if (prom) prom.innerHTML = this._emTextoPromedio(m)
        m.determinaciones.forEach((d, di) => {
          const res = document.querySelector(`#${em.panelId} .mlb-em-det-res[data-idx="${idx}"][data-di="${di}"]`)
          if (res) res.innerHTML = this._emTextoResultadosDet(em.cfg, d)
        })
      })
    }

    _emProgramarCalculo(ms = 250) {
      clearTimeout(this._emTimer)
      if (!this._em || this._em.soloLectura) return
      this._emTimer = setTimeout(() => this._emCalcular(), ms)
    }

    async _emCalcular() {
      const em = this._em
      if (!em || em.soloLectura) return
      const idxs = []
      const muestras = []
      em.muestras.forEach((m, idx) => {
        if (m.eliminada || m.eliminar) return
        idxs.push(idx)
        muestras.push(this._emPayloadMuestra(m))
      })
      const token = (this._emCalcToken = (this._emCalcToken || 0) + 1)
      let res
      try {
        res = await window.PhotinoBridge.send({
          action: "muestraLab.ensayoMuestras.calcular",
          data: { tipoEnsayo: em.cfg.tipoEnsayo, variante: em.cfg.variante, muestras },
        })
      } catch {
        res = null
      }
      if (token !== this._emCalcToken || this._em !== em) return // llegó una respuesta vieja
      if (!res || res.ok === false || !res.data) {
        em.calculoError = `No se pudo calcular: ${res?.error || "sin respuesta de la API"}. El guardado igual valida y calcula todo.`
        this._emPintarCalculos()
        return
      }
      em.calculoError = null
      ;(res.data.muestras || []).forEach((c, i) => {
        const m = em.muestras[idxs[i]]
        if (!m) return
        m.calculo = c
        for (const d of m.determinaciones) {
          const dc = (c.determinaciones || []).find(x => x.numero === d.numero)
          d.error = dc?.error || null
          d.resultados = dc?.resultados || {}
        }
      })
      this._emPintarCalculos()
    }

    // Sincroniza lo escrito con el estado (sin redibujar, para no perder el foco).
    _emOnInput(target) {
      const em = this._em
      if (!em || em.soloLectura) return
      const m = em.muestras[parseInt(target.dataset.idx, 10)]
      if (!m) return
      const d = target.dataset.di !== undefined ? m.determinaciones[parseInt(target.dataset.di, 10)] : null
      const cl = target.classList
      if (cl.contains("mlb-em-det") && d) {
        d.valores[target.dataset.codigo] = target.value === "" ? null : target.value
      } else if (cl.contains("mlb-em-det-invalida") && d) {
        d.valida = !target.checked
        const motivo = target.closest(".mlb-em-det-fila")?.querySelector(".mlb-em-det-motivo")
        if (motivo) motivo.style.display = d.valida ? "none" : ""
      } else if (cl.contains("mlb-em-det-motivo") && d) {
        d.motivoInvalida = target.value
        return
      } else if (cl.contains("mlb-em-param")) {
        m.parametros[target.dataset.codigo] = target.value
      } else if (cl.contains("mlb-em-campo")) {
        m[target.dataset.campo] = target.value
        if (target.dataset.campo !== "sustrato") return
      } else {
        return
      }
      this._emProgramarCalculo()
    }

    _emAgregarMuestra() {
      if (!this._em || this._em.soloLectura) return
      this._em.muestras.push(this._emMuestraVacia(this._em.cfg))
      this._emRender()
      this._emProgramarCalculo(0)
    }

    _emEliminarMuestra(idx) {
      const m = this._em?.muestras[idx]
      if (!m) return
      if (!m.id) {
        if (!confirm("¿Quitar esta muestra nueva? Lo escrito en ella se perderá.")) return
        this._em.muestras.splice(idx, 1)
        if (this._em.muestras.filter(x => !x.eliminada).length === 0) this._em.muestras.push(this._emMuestraVacia(this._em.cfg))
      } else {
        const motivo = prompt(`Motivo para eliminar la muestra N.º ${m.numero} (queda registrado):`, "")
        if (motivo === null) return
        m.eliminar = true
        m.motivoEliminacion = motivo.trim() || null
      }
      this._emRender()
      this._emProgramarCalculo(0)
    }

    _emDeshacerEliminar(idx) {
      const m = this._em?.muestras[idx]
      if (!m) return
      m.eliminar = false
      m.motivoEliminacion = null
      this._emRender()
      this._emProgramarCalculo(0)
    }

    // Determinaciones adicionales (solo entre el mínimo y el máximo del ensayo, p. ej. 4.ª/5.ª caja de BCT).
    _emAgregarDeterminacion(idx) {
      const em = this._em
      const m = em?.muestras[idx]
      if (!m || em.soloLectura) return
      if (m.determinaciones.filter(d => !d.eliminar).length >= em.cfg.determinacionesMaximas) return
      const usados = new Set(m.determinaciones.map(d => d.numero))
      let n = 1
      while (usados.has(n)) n++
      if (n > em.cfg.determinacionesMaximas) return
      m.determinaciones.push(this._emDetVacia(n))
      m.determinaciones.sort((a, b) => a.numero - b.numero)
      this._emRender()
      this._emProgramarCalculo(0)
    }

    _emQuitarDeterminacion(idx, di) {
      const m = this._em?.muestras[idx]
      const d = m?.determinaciones[di]
      if (!d || d.numero <= this._em.cfg.determinacionesMinimas) return
      if (d.guardada) d.eliminar = true
      else m.determinaciones.splice(di, 1)
      this._emRender()
      this._emProgramarCalculo(0)
    }

    _emDeshacerQuitarDeterminacion(idx, di) {
      const d = this._em?.muestras[idx]?.determinaciones[di]
      if (!d) return
      d.eliminar = false
      this._emRender()
      this._emProgramarCalculo(0)
    }

    _emPayloadMuestra(m) {
      const cfg = this._em.cfg
      const texto = (v) => (v ?? "").toString().trim() || null
      return {
        id: m.id,
        sustrato: cfg.sustratos && cfg.sustratos.length ? texto(m.sustrato) : null,
        bobinaNumero: cfg.usaBobina ? texto(m.bobinaNumero) : null,
        bobinaLote: cfg.usaBobina ? texto(m.bobinaLote) : null,
        origenMuestra: cfg.usaOrigen ? texto(m.origenMuestra) : null,
        tipoAnalisis: texto(m.tipoAnalisis),
        observacion: texto(m.observacion),
        parametros: Object.fromEntries((cfg.parametros || []).map(p => [p.codigo, texto(m.parametros?.[p.codigo])])),
        determinaciones: m.determinaciones.map(d => d.eliminar
          ? { numero: d.numero, eliminar: true }
          : {
            numero: d.numero,
            valores: Object.fromEntries((cfg.entradas || []).map(en => [en.codigo, this._emNum(d.valores[en.codigo])])),
            valida: d.valida,
            motivoInvalida: d.valida ? null : texto(d.motivoInvalida),
          }),
      }
    }

    _emPayloadMuestras() {
      const lista = []
      for (const m of this._em.muestras) {
        if (m.eliminada) continue
        if (m.eliminar) {
          if (m.id) lista.push({ id: m.id, eliminar: true, motivoEliminacion: m.motivoEliminacion })
          continue
        }
        lista.push(this._emPayloadMuestra(m))
      }
      return lista
    }

    // finalizar = false deja el ensayo "En ensayo" (se retoma con "Continuar" desde el detalle).
    async _guardarEnsayoMuestras(modalId, finalizar) {
      const em = this._em
      if (!em || em.soloLectura || !this._muestraActualId) return

      // Un texto que no es número nunca se envía como vacío sin avisar.
      let nuevas = 0
      for (const m of em.muestras) {
        if (m.eliminada) continue
        const numero = m.numero ?? em.numeroMaximo + (++nuevas)
        if (m.eliminar) continue
        for (const d of m.determinaciones) {
          if (d.eliminar) continue
          for (const en of em.cfg.entradas || []) {
            const v = d.valores[en.codigo]
            if (v !== null && v !== undefined && String(v).trim() !== "" && this._emNum(v) === null) {
              alert(`Muestra N.º ${numero}, ${this._emEtiquetaDet(em.cfg, d.numero)}: "${v}" no es un número válido para ${en.etiqueta.toLowerCase()}.`)
              return
            }
          }
        }
      }

      const data = {
        muestraId: this._muestraActualId,
        ensayoId: em.ensayoId,
        revision: em.revision,
        tipoEnsayo: em.cfg.tipoEnsayo,
        variante: em.cfg.variante,
        finalizar,
        observacion: document.getElementById(em.observacionId)?.value.trim() || null,
        muestras: this._emPayloadMuestras(),
      }
      if (em.modo === "corregir" && !this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.ensayoMuestras.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando el ensayo")

        const ensayoId = res.data?.ensayoId
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()

        if (finalizar) {
          this.cerrarModal(modalId)
          return
        }
        // Borrador: se queda en el formulario con la revisión nueva, listo para seguir.
        const ensayo = (this._ensayosActuales || []).find(e => e.id === ensayoId)
        if (ensayo) this._emIniciar(em.panelId, em.cfg, ensayo, "continuar")
        if (em.panelId === "mlbEmMuestrasPanel") this._emActualizarBotonesGenerico()
        const estado = document.querySelector(`#${em.panelId} .mlb-em-estado`)
        if (estado) {
          const hora = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
          estado.textContent = `Guardado como "En ensayo" a las ${hora}. Puedes cerrarlo y continuarlo después desde el detalle.`
        }
      } catch (err) {
        alert(err.message)
      }
    }

    // ---------- Formulario genérico (todos los ensayos del modelo nuevo salvo Humedad) ----------
    // Botones "Nuevo X": con configuración del modelo nuevo en la API se abre el formulario de
    // muestras; sin ella (API anterior), el formulario histórico de siempre.
    _nuevoEnsayo(tipoEnsayo, abrirHistorico) {
      const cfg = this._cfgEnsayo(tipoEnsayo, null)
      if (!cfg) return abrirHistorico()
      this._abrirEnsayoGenerico(cfg, null, "nuevo")
    }

    _abrirEnsayoGenerico(cfg, ensayo, modo) {
      document.getElementById("mlbEmTitulo").textContent = `Ensayo de ${cfg.nombre || cfg.tipoEnsayo}`
      // El método lo resuelve la API desde el maestro al crear el ensayo; acá solo se muestra.
      if (modo === "nuevo" || modo === "corregir") this._refrescarMetodoAuto(cfg.tipoEnsayo, "mlbEmMetodo")
      else document.getElementById("mlbEmMetodo").value = ensayo?.metodo || ""
      document.getElementById("mlbEmObservacion").value = ensayo?.observacion || ""
      this._emIniciar("mlbEmMuestrasPanel", cfg, ensayo, modo)
      this._emActualizarBotonesGenerico()
      document.getElementById("mlbModalEnsayoMuestras").style.display = "flex"
    }

    _emActualizarBotonesGenerico() {
      const em = this._em
      const soloLectura = !!em?.soloLectura
      document.getElementById("mlbEmGuardarBorrador").style.display = !soloLectura && em?.modo !== "corregir" ? "inline-block" : "none"
      document.getElementById("mlbEmGuardar").style.display = soloLectura ? "none" : ""
      document.getElementById("mlbEmCancelar").textContent = soloLectura ? "Cerrar" : "Cancelar"
      document.getElementById("mlbEmObservacion").disabled = soloLectura
    }

    // ---------- Humedad: qué formulario usa ----------
    _humUsaModeloMuestras() {
      const metodo = document.getElementById("mlbHumMetodoEquipo")?.value
      return !this._humModoLegacy && !!this._cfgEnsayo("HUMEDAD", metodo)
    }

    _prepararHumedadNueva() {
      this._humModoLegacy = false
      this._em = null
      const sel = document.getElementById("mlbHumMetodoEquipo")
      sel.disabled = false
      document.getElementById("mlbHumObservacion").value = ""
      this.actualizarCamposHumedad()
    }

    // Continuar un ensayo "En ensayo" (o verlo, si ya está finalizado/anulado).
    abrirEnsayoMuestras(ensayoId, soloLectura) {
      const e = (this._ensayosActuales || []).find(x => x.id === ensayoId)
      if (!e) return
      // Para ver un ensayo ya guardado basta lo que trae; la configuración solo hace falta para editar.
      const cfg = this._cfgEnsayo(e.tipoEnsayo, e.variante) || (soloLectura ? this._emCfgSoloLectura(e) : null)
      if (!cfg) {
        alert("La configuración de este ensayo no está disponible. Revisa la conexión con la API.")
        return
      }
      if (e.tipoEnsayo !== "HUMEDAD") {
        this._abrirEnsayoGenerico(cfg, e, soloLectura ? "ver" : "continuar")
        return
      }
      this._humModoLegacy = false
      const sel = document.getElementById("mlbHumMetodoEquipo")
      sel.value = e.variante || "Termobalanza"
      sel.disabled = true
      document.getElementById("mlbHumObservacion").value = e.observacion || ""
      this._emIniciar("mlbHumMuestrasPanel", cfg, e, soloLectura ? "ver" : "continuar")
      this.actualizarCamposHumedad()
      this.abrirModal("mlbModalHumedad")
    }

    // =====================================================================
    // ENSAYO HUMEDAD
    // =====================================================================
    actualizarCamposHumedad() {
      const metodo = document.getElementById("mlbHumMetodoEquipo").value
      // REG-LAB-04 v2: si la API habilitó varias muestras para este método, se usa el panel de
      // muestras; si no (o al corregir un ensayo histórico), el formulario de siempre.
      const enCurso = !!this._em && this._em.panelId === "mlbHumMuestrasPanel" && this._em.modo !== "nuevo"
      const nuevo = enCurso || this._humUsaModeloMuestras()
      if (nuevo && !enCurso && (!this._em || this._em.cfg.variante !== metodo)) {
        this._emIniciar("mlbHumMuestrasPanel", this._cfgEnsayo("HUMEDAD", metodo), null, "nuevo")
      }
      const soloLectura = nuevo && !!this._em?.soloLectura
      const corrigiendo = !!this._corrigiendoEnsayoId

      document.getElementById("mlbHumHigrometroCampos").style.display = metodo === "Higrometro" && !nuevo ? "flex" : "none"
      document.getElementById("mlbHumTermobalanzaCampos").style.display = metodo === "Termobalanza" && !nuevo ? "flex" : "none"
      document.getElementById("mlbHumHornoCampos").style.display = metodo === "Horno" && !nuevo ? "block" : "none"
      document.getElementById("mlbHumMuestrasPanel").style.display = nuevo ? "block" : "none"
      document.getElementById("mlbHumOrigenCampo").style.display = nuevo ? "none" : ""
      document.getElementById("mlbHumBobinasLegacy").style.display = nuevo ? "none" : ""
      document.getElementById("mlbHumGuardarBorrador").style.display = nuevo && !soloLectura && !corrigiendo ? "inline-block" : "none"
      const btnGuardar = document.getElementById("mlbHumGuardar")
      btnGuardar.style.display = soloLectura ? "none" : ""
      btnGuardar.textContent = nuevo ? "Finalizar ensayo" : "Guardar"
      document.getElementById("mlbHumCancelar").textContent = soloLectura ? "Cerrar" : "Cancelar"
      document.getElementById("mlbHumObservacion").disabled = soloLectura
      document.querySelector("#mlbModalHumedad .mlb-modal").classList.toggle("mlb-modal-ancho", nuevo)
    }

    async guardarHumedad() {
      if (!this._muestraActualId) return
      if (document.getElementById("mlbHumMuestrasPanel").style.display !== "none") {
        return this._guardarEnsayoMuestras("mlbModalHumedad", true)
      }

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }

      const data = {
        muestraId: this._muestraActualId,
        metodoEquipo: document.getElementById("mlbHumMetodoEquipo").value,
        metodo: document.getElementById("mlbHumMetodo").value.trim(),
        observacion: document.getElementById("mlbHumObservacion").value.trim(),
        higrometroIzquierdo: num("mlbHumIzq"),
        higrometroCentro: num("mlbHumCentro"),
        higrometroDerecho: num("mlbHumDer"),
        termobalanzaValor: num("mlbHumTermo"),
        horno1PesoInicial: num("mlbHum1i"),
        horno1PesoFinal: num("mlbHum1f"),
        horno2PesoInicial: num("mlbHum2i"),
        horno2PesoFinal: num("mlbHum2f"),
        horno3PesoInicial: num("mlbHum3i"),
        horno3PesoFinal: num("mlbHum3f"),
        bobinaOnda: document.getElementById("mlbHumBobinaOnda").value.trim() || null,
        bobinaLiner: document.getElementById("mlbHumBobinaLiner").value.trim() || null,
        bobinaCartulina: document.getElementById("mlbHumBobinaCartulina").value.trim() || null,
        bobinas: this._leerBobinas("mlbHumBobinasFilas"),
        origenMuestra: document.getElementById("mlbHumOrigenMuestra").value || null,
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.humedad.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando el ensayo de humedad")

        this.cerrarModal("mlbModalHumedad")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ENSAYO GRAMAJE
    // =====================================================================
    async guardarGramaje() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }

      const data = {
        muestraId: this._muestraActualId,
        tipoMaterial: document.getElementById("mlbGraTipoMaterial").value,
        modalidad: document.getElementById("mlbGraModalidad").value,
        tamanoProbeta: document.getElementById("mlbGraTamanoProbeta").value,
        metodo: document.getElementById("mlbGraMetodo").value.trim(),
        observacion: document.getElementById("mlbGraObservacion").value.trim(),
        muestra1: num("mlbGra1"),
        muestra2: num("mlbGra2"),
        muestra3: num("mlbGra3"),
        bobinaOnda: document.getElementById("mlbGraBobinaOnda").value.trim() || null,
        bobinaLiner: document.getElementById("mlbGraBobinaLiner").value.trim() || null,
        bobinaCartulina: document.getElementById("mlbGraBobinaCartulina").value.trim() || null,
        bobinas: this._leerBobinas("mlbGraBobinasFilas")
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.gramaje.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando el ensayo de gramaje")

        this.cerrarModal("mlbModalGramaje")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ENSAYO COBB
    // =====================================================================
    async guardarCobb() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }
      const txt = (id) => document.getElementById(id).value.trim() || null

      const probeta = (n) => ({
        bobina: txt(`mlbCobb${n}Bobina`),
        cara: document.getElementById(`mlbCobb${n}Cara`).value,
        pesoInicial: num(`mlbCobb${n}Inicial`),
        pesoFinal: num(`mlbCobb${n}Final`),
        tiempo: txt(`mlbCobb${n}Tiempo`)
      })

      const data = {
        muestraId: this._muestraActualId,
        metodo: document.getElementById("mlbCobbMetodo").value.trim(),
        observacion: document.getElementById("mlbCobbObservacion").value.trim(),
        p1: probeta(1),
        p2: probeta(2),
        p3: probeta(3)
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.cobb.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando el ensayo Cobb")

        this.cerrarModal("mlbModalCobb")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ENSAYO ESPESOR
    // =====================================================================
    async guardarEspesor() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }

      const data = {
        muestraId: this._muestraActualId,
        tipoMedicion: document.getElementById("mlbEspTipoMedicion").value,
        metodo: document.getElementById("mlbEspMetodo").value.trim(),
        observacion: document.getElementById("mlbEspObservacion").value.trim(),
        medicion1: num("mlbEsp1"),
        medicion2: num("mlbEsp2"),
        medicion3: num("mlbEsp3"),
        bobinaOnda: document.getElementById("mlbEspBobinaOnda").value.trim() || null,
        bobinaLiner: document.getElementById("mlbEspBobinaLiner").value.trim() || null,
        bobinaCartulina: document.getElementById("mlbEspBobinaCartulina").value.trim() || null,
        bobinas: this._leerBobinas("mlbEspBobinasFilas")
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.espesor.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando el ensayo de espesor")

        this.cerrarModal("mlbModalEspesor")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ENSAYO RCT / FCT
    // =====================================================================
    async guardarRct() {
      await this._guardarResistencia("rct", "Rct")
    }

    async guardarFct() {
      await this._guardarResistencia("fct", "Fct")
    }

    async _guardarResistencia(accionSufijo, prefijoIds) {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }
      const txt = (id) => document.getElementById(id)?.value?.trim() || null

      const probeta = (n) => ({
        bobina: txt(`mlb${prefijoIds}${n}Bobina`),
        force: num(`mlb${prefijoIds}${n}Force`),
        strength: num(`mlb${prefijoIds}${n}Strength`)
      })

      const data = {
        muestraId: this._muestraActualId,
        metodo: document.getElementById(`mlb${prefijoIds}Metodo`).value.trim(),
        observacion: document.getElementById(`mlb${prefijoIds}Observacion`).value.trim(),
        strengthUnidad: txt(`mlb${prefijoIds}StrengthUnidad`),
        p1: probeta(1),
        p2: probeta(2),
        p3: probeta(3)
      }
      if (prefijoIds === "Rct") {
        data.componente = document.getElementById("mlbRctComponente").value
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: `muestraLab.${accionSufijo}.guardar`, data })
        if (!res || res.ok === false) throw new Error(res?.error || `Error guardando el ensayo ${accionSufijo.toUpperCase()}`)

        this.cerrarModal(`mlbModal${prefijoIds}`)
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ENSAYO ECT
    // =====================================================================
    async guardarEct() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }

      const data = {
        muestraId: this._muestraActualId,
        metodo: document.getElementById("mlbEctMetodo").value.trim(),
        observacion: document.getElementById("mlbEctObservacion").value.trim(),
        p1Force: num("mlbEct1"),
        p2Force: num("mlbEct2"),
        p3Force: num("mlbEct3"),
        p4Force: num("mlbEct4"),
        p5Force: num("mlbEct5")
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.ect.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando el ensayo ECT")

        this.cerrarModal("mlbModalEct")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // BCT MEDIDO
    // =====================================================================
    abrirModalBctMedido() {
      document.getElementById("mlbBctMedCajas").value = "3"
      document.getElementById("mlbBctMedMotivo").value = ""
      document.getElementById("mlbBctMedMetodo").value = ""
      document.getElementById("mlbBctMedObservacion").value = ""
      this.renderBctMedCajas()
      this.abrirModal("mlbModalBctMedido")
    }

    renderBctMedCajas() {
      const n = parseInt(document.getElementById("mlbBctMedCajas").value, 10)
      document.getElementById("mlbBctMedMotivoBloque").style.display = n < 3 ? "block" : "none"

      const bloque = document.getElementById("mlbBctMedCajasBloque")
      let html = ""
      for (let i = 1; i <= n; i++) {
        html += `
          <div class="module-title" style="font-size:13px; margin-top:8px;">Caja ${i}</div>
          <div class="mlb-form-row">
            <div class="mlb-form-campo"><label>Largo</label><input type="number" step="0.01" id="mlbBctMedC${i}Largo"></div>
            <div class="mlb-form-campo"><label>Ancho</label><input type="number" step="0.01" id="mlbBctMedC${i}Ancho"></div>
            <div class="mlb-form-campo"><label>Alto</label><input type="number" step="0.01" id="mlbBctMedC${i}Alto"></div>
            <div class="mlb-form-campo"><label>Tipo de onda</label><input type="text" id="mlbBctMedC${i}TipoOnda"></div>
          </div>
          <div class="mlb-form-row">
            <div class="mlb-form-campo"><label>Gramaje complejo</label><input type="number" step="0.01" id="mlbBctMedC${i}Gramaje"></div>
            <div class="mlb-form-campo"><label>Espesor complejo</label><input type="number" step="0.0001" id="mlbBctMedC${i}Espesor"></div>
            <div class="mlb-form-campo"><label>Resultado (lbf)</label><input type="number" step="0.0001" id="mlbBctMedC${i}Resultado"></div>
          </div>
        `
      }
      bloque.innerHTML = html
    }

    async guardarBctMedido() {
      if (!this._muestraActualId) return

      const cajasEnsayadas = parseInt(document.getElementById("mlbBctMedCajas").value, 10)
      const num = (id) => {
        const el = document.getElementById(id)
        if (!el || el.value === "") return null
        return parseFloat(el.value)
      }
      const txt = (id) => document.getElementById(id)?.value?.trim() || null

      const caja = (i) => ({
        largo: num(`mlbBctMedC${i}Largo`),
        ancho: num(`mlbBctMedC${i}Ancho`),
        alto: num(`mlbBctMedC${i}Alto`),
        tipoOnda: txt(`mlbBctMedC${i}TipoOnda`),
        gramajeComplejo: num(`mlbBctMedC${i}Gramaje`),
        espesorComplejo: num(`mlbBctMedC${i}Espesor`),
        resultadoLbf: num(`mlbBctMedC${i}Resultado`)
      })

      const data = {
        muestraId: this._muestraActualId,
        cajasEnsayadas,
        motivoMenos3: document.getElementById("mlbBctMedMotivo").value.trim(),
        metodo: document.getElementById("mlbBctMedMetodo").value.trim(),
        observacion: document.getElementById("mlbBctMedObservacion").value.trim(),
        c1: caja(1),
        c2: cajasEnsayadas >= 2 ? caja(2) : null,
        c3: cajasEnsayadas >= 3 ? caja(3) : null
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.bctMedido.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando BCT Medido")

        this.cerrarModal("mlbModalBctMedido")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // BCT TEORICO (McKee)
    // =====================================================================
    abrirModalBctTeorico() {
      const ects = (this._ensayosActuales || []).filter(e => e.tipoEnsayo === "ECT" && e.estado === "Finalizado" && e.resultadoValor != null)
      const espesores = (this._ensayosActuales || []).filter(e => e.tipoEnsayo === "ESPESOR" && e.estado === "Finalizado" && e.resultadoValor != null)

      const selEct = document.getElementById("mlbBctTeoEct")
      const selEsp = document.getElementById("mlbBctTeoEspesor")

      if (ects.length === 0 || espesores.length === 0) {
        alert("Necesitas al menos un ECT y un Espesor finalizados en esta muestra (con resultado consolidado) antes de calcular el BCT teórico.")
        return
      }

      selEct.innerHTML = ects.map(e => `<option value="${e.id}">Ensayo #${e.id} - ${this._esc(e.resultadoValor)} ${this._esc(this._u(e.resultadoUnidad))} (${this._esc(e.fecha)})</option>`).join("")
      selEsp.innerHTML = espesores.map(e => `<option value="${e.id}">Ensayo #${e.id} - ${this._esc(e.resultadoValor)} ${this._esc(this._u(e.resultadoUnidad))} (${this._esc(e.fecha)})</option>`).join("")

      document.getElementById("mlbBctTeoLargo").value = ""
      document.getElementById("mlbBctTeoAncho").value = ""
      document.getElementById("mlbBctTeoObservacion").value = ""

      this.abrirModal("mlbModalBctTeorico")
    }

    async guardarBctTeorico() {
      if (!this._muestraActualId) return

      const data = {
        muestraId: this._muestraActualId,
        ectEnsayoId: parseInt(document.getElementById("mlbBctTeoEct").value, 10),
        espesorEnsayoId: parseInt(document.getElementById("mlbBctTeoEspesor").value, 10),
        largoMm: parseFloat(document.getElementById("mlbBctTeoLargo").value),
        anchoMm: parseFloat(document.getElementById("mlbBctTeoAncho").value),
        observacion: document.getElementById("mlbBctTeoObservacion").value.trim()
      }

      if (!data.largoMm || !data.anchoMm) {
        alert("Largo y ancho interno son obligatorios")
        return
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.bctTeorico.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error calculando BCT teórico")

        this.cerrarModal("mlbModalBctTeorico")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // VISCOSIDAD
    // =====================================================================
    async guardarViscosidad() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }

      const data = {
        muestraId: this._muestraActualId,
        observacion: document.getElementById("mlbViscObservacion").value.trim(),
        tipoAdhesivo: document.getElementById("mlbViscTipoAdhesivo").value.trim(),
        temperatura: num("mlbViscTemperatura"),
        equipo: document.getElementById("mlbViscEquipo").value.trim(),
        husillo: document.getElementById("mlbViscHusillo").value.trim(),
        velocidadRpm: num("mlbViscRpm"),
        resultadoCp: num("mlbViscResultado")
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.viscosidad.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando Viscosidad")

        this.cerrarModal("mlbModalViscosidad")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // pH
    // =====================================================================
    async guardarPh() {
      if (!this._muestraActualId) return

      const valorTexto = document.getElementById("mlbPhValor").value.trim()
      if (!valorTexto) {
        alert("Ingresa el valor o rango leído")
        return
      }

      const data = {
        muestraId: this._muestraActualId,
        observacion: document.getElementById("mlbPhObservacion").value.trim(),
        valorTexto,
        colorObservado: document.getElementById("mlbPhColor").value.trim()
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.ph.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando pH")

        this.cerrarModal("mlbModalPh")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // SOLIDOS TOTALES
    // =====================================================================
    async guardarSolidos() {
      if (!this._muestraActualId) return

      const num = (id) => {
        const v = document.getElementById(id).value
        return v === "" ? null : parseFloat(v)
      }
      const det = (n) => ({ m1: num(`mlbSol${n}M1`), m2: num(`mlbSol${n}M2`), m3: num(`mlbSol${n}M3`) })

      const data = {
        muestraId: this._muestraActualId,
        observacion: document.getElementById("mlbSolObservacion").value.trim(),
        d1: det(1),
        d2: det(2),
        d3: det(3)
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.solidos.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando Sólidos totales")

        this.cerrarModal("mlbModalSolidos")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // FILTRACIÓN (solo Termoformado): Filtra / No filtra, prueba de 15 min (lo fija la API)
    // =====================================================================
    abrirFiltracion() {
      document.getElementById("mlbFilResultado").value = ""
      document.getElementById("mlbFilObservacion").value = ""
      this.abrirModal("mlbModalFiltracion")
    }

    async guardarFiltracion() {
      if (!this._muestraActualId) return
      const resultado = document.getElementById("mlbFilResultado").value
      if (!resultado) return alert("Indica el resultado de la filtración (Filtra / No filtra)")

      const data = {
        muestraId: this._muestraActualId,
        resultado,
        observacion: document.getElementById("mlbFilObservacion").value.trim()
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.filtracion.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando la filtración")

        this.cerrarModal("mlbModalFiltracion")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // LUGOL
    // =====================================================================
    async guardarLugol() {
      if (!this._muestraActualId) return

      const data = {
        muestraId: this._muestraActualId,
        observacion: document.getElementById("mlbLugolObservacion").value.trim(),
        puntoMuestra: document.getElementById("mlbLugolPunto").value.trim(),
        coloracion: document.getElementById("mlbLugolColoracion").value.trim(),
        resultado: document.getElementById("mlbLugolResultado").value,
        interpretacion: document.getElementById("mlbLugolInterpretacion").value.trim(),
        cumplimiento: document.getElementById("mlbLugolCumplimiento").value
      }
      if (!this._aplicarDatosCorreccion(data)) return

      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.lugol.guardar", data })
        if (!res || res.ok === false) throw new Error(res?.error || "Error guardando Lugol")

        this.cerrarModal("mlbModalLugol")
        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    // =====================================================================
    // ANULAR ENSAYO
    // =====================================================================
    async anularEnsayo(ensayoId) {
      const motivo = prompt("Motivo de anulación:")
      if (!motivo) return

      try {
        const res = await window.PhotinoBridge.send({
          action: "muestraLab.ensayo.anular",
          data: { ensayoId, motivo }
        })
        if (!res || res.ok === false) throw new Error(res?.error || "Error anulando el ensayo")

        await this.abrirDetalle(this._muestraActualId)
        await this.cargarLista()
      } catch (err) {
        alert(err.message)
      }
    }

    destroy() {
      console.log("DESTROY MUESTRA LABORATORIO")
      this._guardando = false
      if (this._clickHandler) {
        document.removeEventListener("click", this._clickHandler)
        this._clickHandler = null
      }
      if (this._changeHandler) {
        document.removeEventListener("change", this._changeHandler)
        this._changeHandler = null
      }
      if (this._inputHandler) {
        document.removeEventListener("input", this._inputHandler)
        document.removeEventListener("change", this._inputHandler)
        this._inputHandler = null
      }
      (this._statsCharts || []).forEach(c => c.destroy())
      this._statsCharts = []
    }

    // =====================================================================
    // INDICADORES (KPIs + gráficos) — reemplaza el resumen del módulo "Laboratorio" (app móvil)
    // eliminado. Fuente propia de este módulo (muestra_laboratorio/muestra_laboratorio_ensayos),
    // histórico completo sin filtros propios por ahora.
    // =====================================================================
    async cargarIndicadores() {
      try {
        const res = await window.PhotinoBridge.send({ action: "muestraLab.indicadores" })
        if (!res || res.ok === false) throw new Error(res?.error || "Error cargando indicadores")

        const ind = res.data || {}
        document.getElementById("mlbKpiTotalMuestras").textContent = ind.totalMuestras ?? 0
        document.getElementById("mlbKpiPendientes").textContent = ind.muestrasPendientes ?? 0
        document.getElementById("mlbKpiEnsayosFinalizados").textContent = ind.ensayosFinalizados ?? 0
        document.getElementById("mlbKpiPctCumplimiento").textContent =
          ind.pctCumplimiento === null || ind.pctCumplimiento === undefined ? "-" : `${ind.pctCumplimiento}%`

        this._renderChartBarras("mlbChartPorTipoEnsayo", ind.porTipoEnsayo || [], "Ensayos", { scroll: true })
        this._renderChartBarras("mlbChartPorOrigen", ind.porOrigen || [], "Muestras", { scroll: true })
        this._renderChartDoughnut("mlbChartCumplimiento", ind.porCumplimiento || [])
      } catch (err) {
        console.error("Error cargando indicadores de Laboratorio - Muestras:", err)
      }
    }

    // Barra horizontal, mismo patrón ya usado en No Conformidades: todas las categorías reales
    // (sin agrupar en "Otros"), alto dinámico + scroll interno para no romper el layout cuando
    // hay muchas (ej. hasta 13 tipos de ensayo), paleta cíclica para que cualquier cantidad de
    // barras tenga siempre un color real.
    _renderChartBarras(canvasId, rows, label, opts = {}) {
      const ctx = document.getElementById(canvasId)
      if (!ctx) return

      this._statsCharts = this._statsCharts || []
      const existente = this._statsCharts.find(c => c.canvas.id === canvasId)
      if (existente) { existente.destroy(); this._statsCharts = this._statsCharts.filter(c => c !== existente) }

      if (opts.scroll) {
        const alto = Math.max(180, rows.length * 26)
        ctx.style.setProperty("height", `${alto}px`, "important")
      }

      const paleta = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#16a34a", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#14b8a6"]

      const chart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: rows.map(r => r.categoria || "-"),
          datasets: [{
            label,
            data: rows.map(r => Number(r.total || 0)),
            backgroundColor: rows.map((_, i) => paleta[i % paleta.length]),
            borderRadius: 8,
          }],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true }, y: { ticks: { font: { size: 11 } } } },
        },
      })
      this._statsCharts.push(chart)
    }

    _renderChartDoughnut(canvasId, rows) {
      const ctx = document.getElementById(canvasId)
      if (!ctx) return

      this._statsCharts = this._statsCharts || []
      const existente = this._statsCharts.find(c => c.canvas.id === canvasId)
      if (existente) { existente.destroy(); this._statsCharts = this._statsCharts.filter(c => c !== existente) }

      const colores = { "Cumple": "#22c55e", "No cumple": "#ef4444", "Sin especificacion": "#94a3b8", "Sin especificación": "#94a3b8" }
      const paleta = ["#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#14b8a6"]

      const chart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels: rows.map(r => r.categoria || "-"),
          datasets: [{
            data: rows.map(r => Number(r.total || 0)),
            backgroundColor: rows.map((r, i) => colores[r.categoria] || paleta[i % paleta.length]),
            borderWidth: 0,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom", labels: { font: { size: 11 } } } },
          cutout: "62%",
        },
      })
      this._statsCharts.push(chart)
    }
  }

  window.MuestraLaboratorioController = MuestraLaboratorioController
}
