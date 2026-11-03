// Modal de novedades ("inducción" breve a los operadores tras una actualización).
// Se muestra una sola vez por versión (localStorage) al abrir la pantalla de Inicio, en INNPACK y Faret.
// Al publicar una versión nueva: cambiar ID y revisar SLIDES (máximo 3 ventanas). Para volver a verlo
// en pruebas: localStorage.removeItem("qcc_novedades_visto") desde la consola.
window.Novedades = (() => {
    const ID = "1.8.26";
    const CLAVE = "qcc_novedades_visto";

    // `solo` (opcional): el punto aplica únicamente a esa empresa.
    const SLIDES = [
        {
            titulo: "Nuevo filtro: Operador en No Conformidades",
            icono: '<path d="M3 5h18l-7 8v6l-4-2v-4z"/>',
            puntos: [
                { t: "En No Conformidades ahora puedes filtrar por Operador, junto a Cliente, Área y los demás filtros." },
                { t: "El Excel, el reporte imprimible y los indicadores respetan el mismo filtro." },
                { t: "También puedes hacer clic en una barra del gráfico «Operadores involucrados» para filtrar por ese operador." },
            ],
        },
    ];

    let abierto = null;

    const leer = () => {
        try { return localStorage.getItem(CLAVE); } catch { return null; }
    };

    const marcarVisto = () => {
        try { localStorage.setItem(CLAVE, ID); } catch { /* sin almacenamiento: se mostrará de nuevo */ }
    };

    const inyectarEstilos = () => {
        if (document.getElementById("nov-estilos")) return;
        const st = document.createElement("style");
        st.id = "nov-estilos";
        st.textContent = `
.nov-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center;
    padding: 20px; background: rgba(15, 23, 42, .62); backdrop-filter: blur(3px); animation: nov-fade .25s ease; }
.nov-card { position: relative; width: 100%; max-width: 560px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden;
    background: #fff; border-radius: 18px; box-shadow: 0 24px 60px rgba(15, 23, 42, .35); animation: nov-pop .3s ease; }
.nov-head { position: relative; padding: 26px 30px 22px; color: #fff; background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%); }
.nov-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .06em;
    text-transform: uppercase; background: rgba(255, 255, 255, .2); }
.nov-head h2 { margin: 10px 0 2px; font-size: 21px; font-weight: 700; }
.nov-head p { margin: 0; font-size: 13px; opacity: .85; }
.nov-x { position: absolute; top: 14px; right: 14px; width: 32px; height: 32px; border: 0; border-radius: 50%; cursor: pointer;
    color: #fff; font-size: 20px; line-height: 1; background: rgba(255, 255, 255, .18); transition: background .15s; }
.nov-x:hover { background: rgba(255, 255, 255, .34); }
.nov-x:focus-visible, .nov-btn:focus-visible, .nov-dot:focus-visible { outline: 2px solid #f59e0b; outline-offset: 2px; }
.nov-viewport { flex: 1; overflow: hidden; }
.nov-track { display: flex; transition: transform .35s ease; }
.nov-slide { flex: 0 0 100%; max-height: 46vh; overflow-y: auto; padding: 24px 30px 8px; box-sizing: border-box; }
.nov-slide-top { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
.nov-ico { flex: 0 0 auto; width: 46px; height: 46px; border-radius: 13px; display: flex; align-items: center; justify-content: center;
    color: #2563eb; background: #eff6ff; }
.nov-ico svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.nov-slide h3 { margin: 0; font-size: 17px; font-weight: 700; color: #0f172a; }
.nov-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
.nov-list li { position: relative; padding-left: 22px; font-size: 14px; line-height: 1.5; color: #334155; }
.nov-list li::before { content: ""; position: absolute; left: 2px; top: 8px; width: 8px; height: 8px; border-radius: 50%; background: #2563eb; }
.nov-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 30px 20px; border-top: 1px solid #e5e9f0; }
.nov-dots { display: flex; gap: 8px; }
.nov-dot { width: 9px; height: 9px; padding: 0; border: 0; border-radius: 999px; cursor: pointer; background: #cbd5e1; transition: all .2s; }
.nov-dot.activo { width: 24px; background: #2563eb; }
.nov-nav { display: flex; gap: 8px; }
.nov-btn { padding: 9px 18px; border-radius: 9px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid #cbd5e1; background: #fff; color: #334155; }
.nov-btn:hover { background: #f1f5f9; }
.nov-btn.primario { border-color: #2563eb; background: #2563eb; color: #fff; }
.nov-btn.primario:hover { background: #1d4ed8; }
@keyframes nov-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes nov-pop { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .nov-overlay, .nov-card, .nov-track, .nov-dot { animation: none; transition: none; } }
@media (max-width: 520px) { .nov-head, .nov-slide, .nov-foot { padding-left: 20px; padding-right: 20px; } }`;
        document.head.appendChild(st);
    };

    const cerrar = () => {
        if (!abierto) return;
        document.removeEventListener("keydown", abierto.teclas);
        abierto.el.remove();
        abierto = null;
        marcarVisto();
    };

    const abrir = () => {
        inyectarEstilos();
        const empresa = sessionStorage.getItem("empresa") || "INNPACK";
        const slides = SLIDES.slice(0, 3).map(s => ({
            ...s,
            puntos: s.puntos.filter(p => !p.solo || p.solo === empresa),
        }));

        const el = document.createElement("div");
        el.className = "nov-overlay";
        el.setAttribute("role", "dialog");
        el.setAttribute("aria-modal", "true");
        el.setAttribute("aria-label", "Novedades de la versión");
        el.innerHTML = `
            <div class="nov-card">
                <div class="nov-head">
                    <span class="nov-badge">Novedades · v${ID}</span>
                    <h2>¡Quality Control Center se actualizó!</h2>
                    <p>Esto es lo nuevo, en un minuto.</p>
                    <button type="button" class="nov-x" aria-label="Cerrar">&times;</button>
                </div>
                <div class="nov-viewport">
                    <div class="nov-track">
                        ${slides.map(s => `
                            <section class="nov-slide">
                                <div class="nov-slide-top">
                                    <div class="nov-ico"><svg viewBox="0 0 24 24">${s.icono}</svg></div>
                                    <h3>${s.titulo}</h3>
                                </div>
                                <ul class="nov-list">${s.puntos.map(p => `<li>${p.t}</li>`).join("")}</ul>
                            </section>`).join("")}
                    </div>
                </div>
                <div class="nov-foot">
                    <div class="nov-dots">${slides.map((_, i) => `<button type="button" class="nov-dot" data-i="${i}" aria-label="Ir a la ventana ${i + 1}"></button>`).join("")}</div>
                    <div class="nov-nav">
                        <button type="button" class="nov-btn" data-nav="prev">Anterior</button>
                        <button type="button" class="nov-btn primario" data-nav="next">Siguiente</button>
                    </div>
                </div>
            </div>`;

        const track = el.querySelector(".nov-track");
        const dots = [...el.querySelectorAll(".nov-dot")];
        const prev = el.querySelector('[data-nav="prev"]');
        const next = el.querySelector('[data-nav="next"]');
        let i = 0;

        const ir = n => {
            i = Math.max(0, Math.min(slides.length - 1, n));
            track.style.transform = `translateX(-${i * 100}%)`;
            dots.forEach((d, k) => d.classList.toggle("activo", k === i));
            prev.style.visibility = i === 0 ? "hidden" : "visible";
            next.textContent = i === slides.length - 1 ? "Entendido" : "Siguiente";
            el.querySelectorAll(".nov-slide")[i].scrollTop = 0;
        };

        const teclas = e => {
            if (e.key === "Escape") cerrar();
            else if (e.key === "ArrowRight") ir(i + 1);
            else if (e.key === "ArrowLeft") ir(i - 1);
        };

        el.querySelector(".nov-x").addEventListener("click", cerrar);
        el.addEventListener("click", e => { if (e.target === el) cerrar(); });
        prev.addEventListener("click", () => ir(i - 1));
        next.addEventListener("click", () => (i === slides.length - 1 ? cerrar() : ir(i + 1)));
        dots.forEach(d => d.addEventListener("click", () => ir(Number(d.dataset.i))));
        document.addEventListener("keydown", teclas);

        document.body.appendChild(el);
        abierto = { el, teclas };
        ir(0);
    };

    // Se llama desde el Inicio de cada empresa; solo abre si esta versión aún no se mostró en este equipo.
    const mostrarSiCorresponde = () => {
        if (abierto || leer() === ID) return;
        abrir();
    };

    return { mostrarSiCorresponde, ID };
})();
