// Componente único de los dashboards de inicio de Calidad NP (solo INNPACK). Dibuja la estructura COMPLETA desde el primer
// momento (KPIs, gráficos, tabla) y solo la rellena: así el panel se ve igual de armado con datos, sin datos o sin conexión.
//   A) datos reales -> cifras y gráficos; B) consulta correcta sin registros -> ceros + "Aún no hay registros";
//   C) fuente caída -> "—" + "No disponible" + Reintentar. Nunca se inventan valores.
(function () {
  const esc = s => window.CalidadNp.esc(s)
  const ICONOS = {
    lupa: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
    caja: '<path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8"/>',
    alerta: '<path d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01"/>',
    sello: '<path d="M5 3h14v18l-7-4-7 4V3z"/>',
    balanza: '<path d="M12 3v18M6 21h12M5 7h14M5 7l-3 7a3 3 0 006 0L5 7zM19 7l-3 7a3 3 0 006 0l-3-7z"/>',
  }
  const ico = n => `<span class="npd-ico"><svg viewBox="0 0 24 24">${ICONOS[n] || ICONOS.lista}</svg></span>`
  const COL = { azul: "#2563EB", verde: "#16A34A", ambar: "#D97706", rojo: "#DC2626", gris: "#94A3B8", celeste: "#0EA5E9", violeta: "#7C3AED" }
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
  const mesTxt = m => { const [a, n] = String(m).split("-"); return `${MESES[Number(n) - 1] || n} ${String(a).slice(2)}` }
  const num = v => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("es-CL", { maximumFractionDigits: 2 }))
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

  function periodo(dias) {
    if (!Number(dias)) return {}
    const h = new Date(), d = new Date()
    d.setDate(d.getDate() - Number(dias))
    return { desde: iso(d), hasta: iso(h) }
  }

  // Cabecera común: buscador de NP (opcional), selector de período (opcional) y botones de acción.
  function cabecera(cfg) {
    const p = cfg.p
    const buscar = cfg.buscar
      ? `<form class="card npd-buscar" id="${p}Form"><span class="npd-buscar-ico"><svg viewBox="0 0 24 24">${ICONOS.lupa}</svg></span><input type="text" id="${p}Np" maxlength="40" placeholder="${esc(cfg.buscar.placeholder)}" autocomplete="off"><button type="submit" class="btn-primary">${esc(cfg.buscar.boton || "Consultar NP")}</button></form>`
      : ""
    const per = cfg.periodo
      ? `<div class="card npd-periodo"><label for="${p}Per">Período</label><select id="${p}Per"><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="365" selected>Últimos 12 meses</option><option value="0">Todo el historial</option></select></div>`
      : ""
    return `<div class="npd-top">${buscar}${per}</div>`
  }

  function esqueleto(cfg) {
    const p = cfg.p
    const kpis = (cfg.kpis || []).map((k, i) => `<div class="card npd-kpi ${k.tono ? "t-" + k.tono : ""}" id="${p}K${i}"><div class="npd-kpi-head">${ico(k.icono)}<span>${esc(k.label)}</span></div><div class="npd-kpi-val nd">—</div><div class="npd-kpi-sub"></div></div>`).join("")
    const charts = (cfg.charts || []).map((c, i) => `<div class="card npd-chart"><div class="npd-h">${esc(c.titulo)}</div><div class="npd-hs">${esc(c.sub || "")}</div><div class="npd-canvas sin-datos" id="${p}G${i}"><canvas></canvas><div class="npd-vacio">Cargando...</div></div></div>`).join("")
    const t = cfg.tabla
    const tabla = t
      ? `<div class="card npd-tabla"><div class="npd-h">${esc(t.titulo)}</div><div class="npd-hs">${esc(t.sub || "")}</div><div class="table-container"><table class="table"><thead><tr>${t.cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody id="${p}Tabla"><tr class="npd-vacia"><td colspan="${t.cols.length}">Cargando...</td></tr></tbody></table></div></div>`
      : ""
    return `<div class="npd" id="${p}Raiz">${cabecera(cfg)}<div class="npd-estado" id="${p}Estado"></div>${kpis ? `<div class="npd-kpis">${kpis}</div>` : ""}${charts ? `<div class="npd-charts">${charts}</div>` : ""}${tabla}${cfg.extra || ""}</div>`
  }

  // Monta el dashboard dentro de `cont`. cfg.cargar(periodo) -> {ok, data, error}; cfg.render(data, h) rellena.
  function montar(cont, cfg) {
    const p = cfg.p
    const charts = {}
    let seq = 0
    cont.innerHTML = esqueleto(cfg)
    const $ = id => cont.querySelector("#" + p + id)

    const h = {
      kpi(i, valor, sub) {
        const el = cont.querySelector(`#${p}K${i}`)
        const v = el.querySelector(".npd-kpi-val")
        const nd = valor === null || valor === undefined
        v.textContent = num(valor)
        v.classList.toggle("nd", nd)
        el.querySelector(".npd-kpi-sub").textContent = nd ? "No disponible" : sub || ""
      },
      // tipo: bar | barh | doughnut | line. series: [{label, data, color | colores}]. Sin datos -> marco con mensaje, nunca un gráfico inventado.
      grafico(i, tipo, labels, series, vacio) {
        const caja = cont.querySelector(`#${p}G${i}`)
        if (charts[i]) { charts[i].destroy(); delete charts[i] }
        const hay = labels && labels.length && series.some(s => s.data.some(v => Number(v) > 0))
        caja.classList.toggle("sin-datos", !hay)
        caja.querySelector(".npd-vacio").textContent = vacio === "nd" ? "No disponible" : vacio || "Aún no hay registros en este período"
        if (!hay || !window.Chart) return
        const dona = tipo === "doughnut"
        const linea = tipo === "line"
        charts[i] = new Chart(caja.querySelector("canvas"), {
          type: dona ? "doughnut" : linea ? "line" : "bar",
          data: {
            labels,
            datasets: series.map(s => ({
              label: s.label,
              data: s.data,
              backgroundColor: dona ? s.colores : s.color || COL.azul,
              borderColor: dona ? "#fff" : s.color || COL.azul,
              borderWidth: dona ? 2 : linea ? 2 : 0,
              borderRadius: linea || dona ? 0 : 4,
              tension: 0.3,
              fill: false,
              pointRadius: linea ? 3 : 0,
            })),
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            indexAxis: tipo === "barh" ? "y" : "x",
            plugins: { legend: { display: dona || series.length > 1, position: "bottom", labels: { boxWidth: 10, font: { size: 11 } } } },
            scales: dona ? {} : { x: { grid: { display: false }, ticks: { font: { size: 11 } } }, y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } } },
          },
        })
      },
      filas(rows) {
        $("Tabla").innerHTML = rows.length ? rows.join("") : `<tr class="npd-vacia"><td colspan="${cfg.tabla.cols.length}">${esc(cfg.tabla.vacio)}</td></tr>`
      },
    }

    function noDisponible(msg) {
      ;(cfg.kpis || []).forEach((_, i) => h.kpi(i, null))
      ;(cfg.charts || []).forEach((_, i) => h.grafico(i, "bar", [], [], "nd"))
      if (cfg.tabla) $("Tabla").innerHTML = `<tr class="npd-vacia"><td colspan="${cfg.tabla.cols.length}">No disponible</td></tr>`
      const e = $("Estado")
      e.className = "npd-estado err"
      e.innerHTML = `${esc(msg || "No se pudo obtener el resumen")} <button class="btn-secondary" type="button" data-npd-reintentar style="padding:2px 10px;">Reintentar</button>`
    }

    async function recargar() {
      const id = ++seq
      const raiz = $("Raiz")
      raiz.classList.add("npd-cargando")
      $("Estado").className = "npd-estado"
      $("Estado").textContent = "Actualizando..."
      let r
      try { r = await cfg.cargar(periodo(cfg.periodo ? $("Per").value : 0)) } catch (err) { r = { ok: false, error: err?.message } }
      if (id !== seq || !cont.contains(raiz)) return
      raiz.classList.remove("npd-cargando")
      if (!r || r.ok === false) return noDisponible(r?.error)
      try { cfg.render(r.data, h); $("Estado").textContent = "" } catch (err) { noDisponible("No se pudo interpretar el resumen: " + err.message) }
    }

    cont.addEventListener("click", e => {
      if (e.target.closest("[data-npd-reintentar]")) recargar()
      const b = e.target.closest("[data-npd-np]")
      if (b && cfg.buscar) cfg.buscar.onBuscar(b.dataset.npdNp)
    })
    cont.addEventListener("change", e => { if (e.target.id === p + "Per") recargar() })
    cont.addEventListener("submit", e => {
      e.preventDefault()
      const np = $("Np")?.value.trim()
      if (np && cfg.buscar) cfg.buscar.onBuscar(np)
      else $("Np")?.focus()
    })
    if (cfg.cargar) recargar()
    return { recargar, destruir() { Object.values(charts).forEach(c => c.destroy()) }, h, $ }
  }

  window.NpDash = { montar, ico, num, mesTxt, COL, esqueleto }
})()
