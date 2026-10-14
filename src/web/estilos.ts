/**
 * Styles and the small client script added on top of the skeleton's base (layout.ts).
 * The panel works without JavaScript; the script adds confirmation dialogs, live run
 * progress and instant filtering.
 */

export const CSS_PANEL = `
.portada { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 12px; align-items: stretch; }
.hero-card .body { gap: 8px; height: 100%; align-content: start; }
.kpis-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.kpis-3 .kpi { align-content: start; }
.side nav a { display: flex; align-items: center; gap: 10px; }
.side nav svg { width: 17px; height: 17px; flex: none; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; opacity: .85; }
@media (max-width: 1000px) { .portada { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 560px) { .kpis-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); } .side nav svg { display: none; } }

/* ---------------- charts (palette validated: CVD + contrast, light and dark) ---------------- */
:root { --s1: #2a78d6; --s2: #eb6834; --o1: #86b6ef; --o2: #5598e7; --o3: #2a78d6; --o4: #1c5cab; --o5: #104281;
	--meter-track: #cde2fb; --grid: #e7eaef; }
@media (prefers-color-scheme: dark) { :root { --s1: #3987e5; --s2: #d95926; --o1: #184f95; --o2: #256abf; --o3: #3987e5; --o4: #6da7ec; --o5: #9ec5f4;
	--meter-track: #1c2b47; --grid: #242c3a; } }
.grafico { margin: 0; display: grid; gap: 10px; min-width: 0; }
.leyenda { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: var(--muted); }
.leyenda span { display: inline-flex; align-items: center; gap: 6px; }
.sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.sw.s1, .columnas i.s1, .hbarras i.s1 { background: var(--s1); }
.sw.s2, .columnas i.s2 { background: var(--s2); }
.hbarras i.o1 { background: var(--o1); } .hbarras i.o2 { background: var(--o2); } .hbarras i.o3 { background: var(--o3); }
.hbarras i.o4 { background: var(--o4); } .hbarras i.o5 { background: var(--o5); }
.columnas { position: relative; height: 200px; margin-left: 64px; }
.eje-y { position: absolute; inset: 0; pointer-events: none; }
.eje-y .tick { position: absolute; left: 0; right: 0; border-top: 1px solid var(--grid); }
.eje-y .tick span { position: absolute; right: calc(100% + 8px); top: -8px; font-size: 11.5px; color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
.barras { position: absolute; inset: 0; display: flex; align-items: flex-end; justify-content: space-around; gap: 2px; }
.col { position: relative; flex: 1; height: 100%; display: flex; align-items: flex-end; justify-content: center; outline: none; border-radius: 6px; }
.col:hover, .col:focus-visible { background: color-mix(in srgb, var(--sunken) 70%, transparent); }
.col:focus-visible { box-shadow: 0 0 0 2px var(--primary); }
.pila { width: min(24px, 70%); display: flex; flex-direction: column; gap: 2px; border-radius: 4px 4px 0 0; overflow: hidden; }
.pila i { display: block; min-height: 2px; }
.cap { position: absolute; transform: translateY(-4px); font-size: 11.5px; font-weight: 600; white-space: nowrap; color: var(--fg); }
.eje-x { display: flex; justify-content: space-around; margin-left: 64px; font-size: 11.5px; color: var(--muted); }
.eje-x span { flex: 1; text-align: center; white-space: nowrap; }
.hbarras { display: grid; gap: 8px; }
.hfila { display: grid; grid-template-columns: minmax(90px, 38%) minmax(0, 1fr) auto; gap: 10px; align-items: center; font-size: 13px; border-radius: 6px; padding: 2px 4px; outline: none; }
.hfila:hover, .hfila:focus-visible { background: var(--sunken); }
.hfila:focus-visible { box-shadow: 0 0 0 2px var(--primary); }
.hetiqueta a { color: var(--fg); }
.hetiqueta a:hover { color: var(--primary); }
.hetiqueta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pista { height: 14px; }
.pista i { display: block; height: 100%; border-radius: 0 4px 4px 0; }
.hvalor { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--fg); font-weight: 600; }
.tabla-datos summary { font-size: 12.5px; color: var(--muted); font-weight: 500; }
.tabla-datos table { margin-top: 8px; font-size: 13px; }
.medidor { display: grid; gap: 6px; outline: none; }
.medidor-cab { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; font-size: 13px; color: var(--muted); }
.medidor-cab strong { color: var(--fg); font-size: 18px; }
.medidor-pista { height: 10px; border-radius: 99px; background: var(--meter-track); overflow: hidden; }
.medidor-pista i { display: block; height: 100%; background: var(--s1); border-radius: 99px; }
.medidor small { color: var(--muted); font-size: 12px; }
.tooltip { position: fixed; z-index: 50; pointer-events: none; background: var(--surface); color: var(--fg); border: 1px solid var(--line);
	border-radius: 8px; padding: 8px 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 14%); font-size: 12.5px; display: grid; gap: 3px; min-width: 150px; max-width: 280px; }
.tooltip[hidden] { display: none; }
.tooltip .t { color: var(--muted); font-size: 12px; }
.tooltip .r { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
.tooltip .r b { font-variant-numeric: tabular-nums; }
.tooltip .k { display: inline-block; width: 12px; height: 2px; margin-right: 6px; vertical-align: middle; }
.tooltip .k.s1 { background: var(--s1); } .tooltip .k.s2 { background: var(--s2); }
.hero { font-size: 44px !important; line-height: 1.05; letter-spacing: -0.02em; font-variant-numeric: normal !important; }
@media (max-width: 560px) { .columnas, .eje-x { margin-left: 52px; } .eje-x span:nth-child(even) { visibility: hidden; } .hero { font-size: 34px !important; } }
input[type=email], input[type=time] { font: 14px var(--font); padding: 7px 10px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); color: var(--fg); width: 100%; }
.field-row { align-items: start; }
.contadores { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 4px 24px; margin: 0; }
.contadores div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-bottom: 1px dashed var(--line); font-size: 13px; }
.contadores dt { color: var(--muted); }
.contadores dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.contadores .cero dd { color: var(--muted); font-weight: 400; }
td.nowrap, th.nowrap { white-space: nowrap; }
td.motivo { min-width: 220px; }
.brand small { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; }
.kpi { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 4px; }
.kpi span { color: var(--muted); font-size: 12.5px; }
.kpi strong { font-size: 22px; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.kpi small { color: var(--muted); font-size: 12px; }
.kpi.destacado { border-color: var(--primary); box-shadow: inset 3px 0 0 var(--primary); }
.cols { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 20px; align-items: start; }
.cols.mitad { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.stack { display: grid; gap: 20px; min-width: 0; }
.vacio { text-align: center; padding: 28px 16px; display: grid; gap: 8px; justify-items: center; color: var(--muted); }
.vacio strong { color: var(--fg); font-size: 15px; }
.accion { display: grid; gap: 10px; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
.accion h3 { margin: 0; font-size: 15px; }
.accion p { margin: 0; color: var(--muted); font-size: 13px; }
.btn.danger { background: var(--bad); border-color: var(--bad); color: #fff; }
.btn.ghost { background: transparent; }
.btn[disabled] { opacity: .5; cursor: not-allowed; }
.barra { height: 8px; background: var(--sunken); border-radius: 99px; overflow: hidden; }
.barra > i { display: block; height: 100%; background: var(--primary); border-radius: 99px; transition: width .4s ease; }
.aging { display: grid; gap: 10px; }
.aging .fila { display: grid; grid-template-columns: 110px minmax(0, 1fr) 110px; gap: 10px; align-items: center; font-size: 13px; }
.aging .fila .num { text-align: right; font-variant-numeric: tabular-nums; }
.aging .fila .barra { height: 12px; }
.aging .t0 > i { background: var(--ok); } .aging .t1 > i { background: var(--info); } .aging .t2 > i { background: var(--warn); }
.aging .t3 > i, .aging .t4 > i { background: var(--bad); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border: 1px solid var(--line); border-radius: 99px; padding: 3px 10px; font-size: 12.5px; color: var(--fg); background: var(--surface); }
.chip[aria-current="true"] { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); font-weight: 600; }
.chip b { font-variant-numeric: tabular-nums; }
.alertas { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.alertas li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; padding: 10px 12px; border-radius: 8px; background: var(--sunken); }
.alertas li p { margin: 2px 0 0; color: var(--muted); font-size: 12.5px; }
.error-box { border: 1px solid var(--bad); background: var(--bad-bg); color: var(--bad); border-radius: 10px; padding: 14px 16px; display: grid; gap: 6px; }
.error-box p { margin: 0; color: var(--fg); }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; background: var(--mute); margin-right: 6px; }
.dot.ok { background: var(--ok); } .dot.bad { background: var(--bad); } .dot.warn { background: var(--warn); }
.subtle { font-size: 12.5px; color: var(--muted); }
.right { text-align: right; }
tr.link { cursor: pointer; }
tr.link:hover td { background: var(--sunken); }
.field-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
.form-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; border-top: 1px solid var(--line); padding-top: 14px; }
input:invalid:not(:placeholder-shown) { border-color: var(--bad); }
dialog { border: 1px solid var(--line); border-radius: 12px; padding: 0; max-width: 440px; width: calc(100% - 32px); background: var(--surface); color: var(--fg); }
dialog::backdrop { background: rgb(15 19 26 / 45%); }
dialog .body { padding: 18px; display: grid; gap: 10px; }
dialog h2 { font-size: 17px; }
dialog p { margin: 0; color: var(--muted); }
dialog footer { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--line); background: var(--sunken); border-radius: 0 0 12px 12px; }
.badge-sim { border: 1px dashed var(--info); color: var(--info); border-radius: 99px; padding: 0 8px; font-size: 12px; font-weight: 600; }
@media (max-width: 1000px) { .cols, .cols.mitad { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 560px) {
	.aging .fila { grid-template-columns: 90px minmax(0, 1fr); }
	.aging .fila .num { grid-column: 1 / -1; text-align: left; color: var(--muted); }
	.kpi strong { font-size: 19px; }
	th, td { padding: 8px; }
}
`

export const JS_PANEL = `
(() => {
	// Confirmation before actions that write: <form data-confirmar="…" data-titulo="…" data-boton="…">.
	const dialog = document.getElementById('confirmar')
	let pendiente = null
	document.addEventListener('submit', event => {
		const form = event.target
		const submitter = event.submitter
		const texto = (submitter && submitter.dataset.confirmar) || form.dataset.confirmar
		if (!texto || !dialog || form.dataset.confirmado === '1') return
		event.preventDefault()
		pendiente = { form, submitter }
		dialog.querySelector('[data-titulo]').textContent = (submitter && submitter.dataset.titulo) || form.dataset.titulo || '¿Continuar?'
		dialog.querySelector('[data-texto]').textContent = texto
		const ok = dialog.querySelector('[data-ok]')
		ok.textContent = (submitter && submitter.dataset.boton) || form.dataset.boton || 'Continuar'
		ok.className = 'btn ' + (form.dataset.peligro ? 'danger' : 'primary')
		dialog.showModal()
	})
	dialog?.addEventListener('close', () => {
		if (dialog.returnValue === 'ok' && pendiente) {
			const { form, submitter } = pendiente
			form.dataset.confirmado = '1'
			form.requestSubmit(submitter || undefined)
		}
		pendiente = null
	})

	// Busy state: avoid double submits of run buttons.
	document.addEventListener('submit', event => {
		if (event.defaultPrevented) return
		const b = event.submitter
		if (b && b.dataset.ocupado) { setTimeout(() => { b.disabled = true; b.textContent = b.dataset.ocupado }, 0) }
	})

	// Live progress of a running run.
	const vivo = document.querySelector('[data-corrida-en-curso]')
	if (vivo) {
		const id = vivo.dataset.corridaEnCurso
		const barra = vivo.querySelector('i')
		const texto = document.querySelector('[data-progreso-texto]')
		const tick = async () => {
			try {
				const r = await fetch('/api/corridas/' + id, { headers: { accept: 'application/json' } })
				const c = await r.json()
				if (c.estado !== 'en_curso') return location.reload()
				const pct = c.progresoTotal ? Math.round(100 * c.progresoHecho / c.progresoTotal) : 5
				barra.style.width = pct + '%'
				if (texto) texto.textContent = c.progresoTotal ? c.progresoHecho + ' de ' + c.progresoTotal + ' contratos (' + pct + ' %)' : 'Conectando con el administrador…'
			} catch {}
			setTimeout(tick, 600)
		}
		tick()
	}

	// Instant filter on tables with <input data-filtrar="tableId">.
	for (const input of document.querySelectorAll('[data-filtrar]')) {
		const tabla = document.getElementById(input.dataset.filtrar)
		const contador = document.querySelector('[data-contador="' + input.dataset.filtrar + '"]')
		const norm = s => s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[\\s.\\-]/g, '').toLowerCase()
		input.addEventListener('input', () => {
			const q = norm(input.value)
			let visibles = 0
			for (const tr of tabla.tBodies[0].rows) {
				const ok = !q || norm(tr.dataset.buscar || tr.textContent).includes(q)
				tr.hidden = !ok
				if (ok) visibles++
			}
			if (contador) contador.textContent = visibles
		})
	}


	// Chart tooltip: one floating element, filled with textContent (labels are data, not HTML).
	const tt = document.createElement('div')
	tt.className = 'tooltip'; tt.hidden = true; tt.setAttribute('role', 'tooltip')
	document.body.appendChild(tt)
	const mostrar = (el, x, y) => {
		let data
		try { data = JSON.parse(el.dataset.tip) } catch { return }
		tt.replaceChildren()
		const t = document.createElement('div'); t.className = 't'; t.textContent = data.titulo; tt.appendChild(t)
		for (const [label, value, clase] of data.filas) {
			const r = document.createElement('div'); r.className = 'r'
			const l = document.createElement('span')
			if (clase) { const k = document.createElement('i'); k.className = 'k ' + clase; l.appendChild(k) }
			l.appendChild(document.createTextNode(label))
			const v = document.createElement('b'); v.textContent = value
			r.append(l, v); tt.appendChild(r)
		}
		tt.hidden = false
		const w = tt.offsetWidth, h = tt.offsetHeight
		tt.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x + 14)) + 'px'
		tt.style.top = Math.max(8, y - h - 12) + 'px'
	}
	document.addEventListener('pointermove', e => {
		const el = e.target.closest && e.target.closest('[data-tip]')
		if (el) mostrar(el, e.clientX, e.clientY); else tt.hidden = true
	})
	document.addEventListener('focusin', e => {
		const el = e.target.closest && e.target.closest('[data-tip]')
		if (el) { const r = el.getBoundingClientRect(); mostrar(el, r.left + r.width / 2, r.top) } else tt.hidden = true
	})
	document.addEventListener('focusout', () => { tt.hidden = true })
	document.addEventListener('keydown', e => { if (e.key === 'Escape') tt.hidden = true })

	// Whole row clickable (the name keeps a real link for keyboard and screen readers).
	document.addEventListener('click', event => {
		const tr = event.target.closest('tr[data-href]')
		if (tr && !event.target.closest('a, button')) location.href = tr.dataset.href
	})
})()
`
