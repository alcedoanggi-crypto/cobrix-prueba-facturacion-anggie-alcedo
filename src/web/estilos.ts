/**
 * Styles and the small client script added on top of the skeleton's base (layout.ts).
 * The panel works without JavaScript; the script adds confirmation dialogs, live run
 * progress and instant filtering.
 */

export const CSS_PANEL = `
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

	// Whole row clickable (the name keeps a real link for keyboard and screen readers).
	document.addEventListener('click', event => {
		const tr = event.target.closest('tr[data-href]')
		if (tr && !event.target.closest('a, button')) location.href = tr.dataset.href
	})
})()
`
