/**
 * Styles and behaviour of the modals (modales.ts). The script only enhances: forms still post
 * normally without it, and every value it inserts goes through textContent.
 */

export const CSS_MODALES = `
dialog.modal { width: min(720px, calc(100% - 24px)); max-width: none; max-height: calc(100vh - 32px); padding: 0; border: 1px solid var(--line);
	border-radius: 16px; background: var(--surface); color: var(--fg); box-shadow: 0 24px 64px rgb(15 19 26 / 28%); overflow: auto; }
dialog.modal.angosto { width: min(480px, calc(100% - 24px)); }
dialog.modal[open] { animation: modal-entra .22s cubic-bezier(.2, .9, .3, 1.2); }
dialog.modal::backdrop { background: rgb(15 19 26 / 45%); backdrop-filter: blur(3px); animation: velo .2s ease; }
dialog.modal:not(:modal) { position: static; margin: 0 auto 20px; box-shadow: none; }
@keyframes modal-entra { from { opacity: 0; transform: translateY(14px) scale(.97); } to { opacity: 1; transform: none; } }
@keyframes velo { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { dialog.modal[open], dialog.modal::backdrop, .pasos li { animation: none !important; } }
.modal-cab { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 18px 20px;
	border-bottom: 1px solid var(--line); background: linear-gradient(135deg, var(--primary-soft), transparent 70%); }
.modal-cab h2 { font-size: 17px; }
.modal-cab p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
.modal-icono { width: 40px; height: 40px; border-radius: 12px; background: var(--primary); display: grid; place-items: center; box-shadow: 0 6px 16px color-mix(in srgb, var(--primary) 35%, transparent); }
.modal-icono svg { width: 22px; height: 22px; stroke: var(--primary-fg); fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.modal-x { border: 0; background: transparent; color: var(--muted); font-size: 24px; line-height: 1; cursor: pointer; width: 34px; height: 34px; border-radius: 8px; }
.modal-x:hover { background: var(--sunken); color: var(--fg); }
.modal-cuerpo { padding: 18px 20px; display: grid; gap: 14px; }
.modal-cuerpo.dos { grid-template-columns: minmax(0, 1fr) 230px; align-items: start; }
.modal-cuerpo.centro { justify-items: center; text-align: center; }
.modal-cuerpo .campos { display: grid; gap: 12px; }
.modal-pie { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--line); background: var(--sunken); }
.modal-error { margin: 0 20px 14px; padding: 10px 12px; border-radius: 8px; background: var(--bad-bg); color: var(--bad); font-size: 13px; font-weight: 500; }
input[aria-invalid="true"] { border-color: var(--bad) !important; box-shadow: 0 0 0 3px var(--bad-bg); }
.ficha { border: 1px solid var(--line); border-radius: 14px; padding: 18px 16px; display: grid; gap: 10px; justify-items: center; text-align: center;
	background: linear-gradient(180deg, var(--sunken), var(--surface)); position: sticky; top: 0; transition: border-color .2s; }
.ficha.valida { border-color: var(--ok); } .ficha.invalida { border-color: var(--bad); } .ficha.repetida { border-color: var(--warn); }
.ficha-avatar { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; font-size: 22px; font-weight: 700; color: var(--primary-fg);
	background: var(--primary); box-shadow: 0 0 0 4px var(--surface), 0 0 0 5px var(--line); transition: background .2s; }
.ficha.juridica .ficha-avatar { border-radius: 16px; background: var(--s2); }
.ficha-nombre { font-size: 14px; word-break: break-word; }
.ficha dl { margin: 0; display: grid; grid-template-columns: auto auto; gap: 4px 10px; font-size: 12.5px; text-align: left; }
.ficha dt { color: var(--muted); } .ficha dd { margin: 0; font-weight: 600; }
.ficha-nota { margin: 0; font-size: 12px; color: var(--muted); }
.ficha.invalida .ficha-nota { color: var(--bad); } .ficha.repetida .ficha-nota { color: var(--warn); } .ficha.valida .ficha-nota { color: var(--ok); }
.anillo { position: relative; width: 168px; height: 168px; }
.anillo svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.anillo circle { fill: none; stroke-width: 10; }
.pista-anillo { stroke: var(--meter-track); }
.valor-anillo { stroke: var(--s1); stroke-linecap: round; stroke-dasharray: 326.7; stroke-dashoffset: calc(326.7 - 326.7 * var(--p) / 100); transition: stroke-dashoffset .5s ease, stroke .3s; }
.anillo.ok .valor-anillo { stroke: var(--ok); } .anillo.mal .valor-anillo { stroke: var(--bad); }
.anillo-texto { position: absolute; inset: 0; display: grid; place-content: center; gap: 2px; }
.anillo-texto strong { font-size: 30px; letter-spacing: -0.02em; }
.anillo-texto span { font-size: 12px; color: var(--muted); max-width: 120px; }
.resumen-corrida { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.resumen-corrida div { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; text-align: left; display: grid; gap: 2px; }
.resumen-corrida span { font-size: 12px; color: var(--muted); }
.resumen-corrida strong { font-size: 18px; }
.pasos { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.pasos li { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 10px; align-items: start; padding: 12px; border-radius: 10px;
	background: var(--sunken); animation: paso-entra .3s ease both; }
.pasos li:nth-child(2) { animation-delay: .15s; } .pasos li:nth-child(3) { animation-delay: .3s; }
@keyframes paso-entra { from { opacity: 0; transform: translateX(-8px); } }
.pasos .marca { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 14px; color: #fff; }
.pasos .ok .marca { background: var(--ok); } .pasos .mal .marca { background: var(--bad); } .pasos .espera .marca { background: var(--mute); }
.pasos p { margin: 2px 0 0; font-size: 12.5px; color: var(--muted); word-break: break-word; }
.pasos .ms { font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.det-factura { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.det-factura div { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; display: grid; gap: 2px; }
.det-factura span { font-size: 11.5px; color: var(--muted); }
.det-factura strong { font-size: 14px; word-break: break-word; }
.det-linea { list-style: none; margin: 0; padding: 0 0 0 14px; border-left: 2px solid var(--line); display: grid; gap: 12px; }
.det-linea li { position: relative; font-size: 13px; }
.det-linea li::before { content: ''; position: absolute; left: -20px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--primary); box-shadow: 0 0 0 3px var(--surface); }
.det-linea time { display: block; font-size: 12px; color: var(--muted); }
@media (max-width: 640px) { .modal-cuerpo.dos { grid-template-columns: minmax(0, 1fr); } .ficha { position: static; order: -1; } .resumen-corrida { grid-template-columns: minmax(0, 1fr); } }
`

export const JS_MODALES = `
(() => {
	const $ = (sel, root = document) => root.querySelector(sel)
	const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e }
	const usd = cents => 'USD ' + new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format((cents || 0) / 100)
	const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
	const fecha = v => { if (!v) return '—'; const [y, m, d] = String(v).slice(0, 10).split('-'); return d ? Number(d) + ' ' + MESES[m - 1] + ' ' + y : MESES[m - 1] + ' ' + y }
	const fechaHora = v => v ? new Intl.DateTimeFormat('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v)) : '—'

	// Open / close. A link with data-abrir keeps working without JS (it goes to ?nuevo=1).
	document.addEventListener('click', e => {
		const abrir = e.target.closest('[data-abrir]')
		if (abrir) { e.preventDefault(); const d = document.getElementById(abrir.dataset.abrir); if (d) { if (d.open) d.close(); d.showModal(); d.querySelector('input')?.focus() } return }
		const cerrar = e.target.closest('[data-cerrar]')
		if (cerrar) { const d = cerrar.closest('dialog'); if (cerrar.hasAttribute('data-recargar') && d.dataset.recargar) location.reload(); else d.close() }
	})
	// Click on the backdrop closes (the dialog element itself is the backdrop target).
	for (const d of document.querySelectorAll('dialog.modal')) d.addEventListener('click', e => { if (e.target === d && !d.dataset.ocupado) d.close() })
	// The no-JS «open» dialog becomes a real modal once the script runs.
	const abiertoSinJs = document.querySelector('dialog.modal[open]')
	if (abiertoSinJs) { abiertoSinJs.close(); abiertoSinJs.showModal() }

	// Forms inside modals post with fetch and show errors in place.
	document.addEventListener('submit', async e => {
		const form = e.target
		if (!form.matches('form[data-ajax]')) return
		e.preventDefault()
		const err = $('[data-error]', form), boton = e.submitter
		err.hidden = true
		for (const i of form.querySelectorAll('[aria-invalid]')) i.removeAttribute('aria-invalid')
		const texto = boton?.textContent
		if (boton) { boton.disabled = true; if (boton.dataset.ocupado) boton.textContent = boton.dataset.ocupado }
		try {
			const r = await fetch(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)), headers: { accept: 'application/json' } })
			const data = await r.json()
			if (data.ok) { location.href = data.ir; return }
			err.textContent = data.error || 'No se pudo guardar.'; err.hidden = false
			const campo = data.campo && form.elements[data.campo]
			if (campo) { campo.setAttribute('aria-invalid', 'true'); campo.focus() }
		} catch { err.textContent = 'No se pudo contactar al servidor. Revisa tu conexión y reintenta.'; err.hidden = false }
		if (boton) { boton.disabled = false; boton.textContent = texto }
	})

	// «Nuevo cliente»: live preview of how Cobrix will store the holder.
	const ficha = $('[data-ficha]')
	if (ficha) {
		const doc = $('[data-vista-documento]'), nombre = $('[data-vista-nombre]')
		const iniciales = t => t.trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?'
		nombre.addEventListener('input', () => {
			$('[data-avatar]', ficha).textContent = iniciales(nombre.value)
			$('[data-ficha-nombre]', ficha).textContent = nombre.value.trim().toUpperCase() || 'Nombre del cliente'
		})
		let timer
		doc.addEventListener('input', () => {
			clearTimeout(timer)
			timer = setTimeout(async () => {
				ficha.classList.remove('valida', 'invalida', 'repetida', 'juridica')
				if (!doc.value.trim()) { $('[data-ficha-id]', ficha).textContent = '—'; $('[data-ficha-persona]', ficha).textContent = '—'; $('[data-ficha-nota]', ficha).textContent = 'Escribe el documento para ver cómo lo guarda Cobrix.'; return }
				try {
					const r = await (await fetch('/api/identificacion?doc=' + encodeURIComponent(doc.value), { headers: { accept: 'application/json' } })).json()
					if (!r.ok) { ficha.classList.add('invalida'); $('[data-ficha-id]', ficha).textContent = '—'; $('[data-ficha-persona]', ficha).textContent = '—'; $('[data-ficha-nota]', ficha).textContent = r.error; return }
					$('[data-ficha-id]', ficha).textContent = r.id
					$('[data-ficha-persona]', ficha).textContent = r.persona === 'juridica' ? 'Jurídica' : 'Natural'
					if (r.persona === 'juridica') ficha.classList.add('juridica')
					if (r.existe) { ficha.classList.add('repetida'); $('[data-ficha-nota]', ficha).textContent = 'Ya existe: ' + r.existe.nombre + '. No se puede repetir.' }
					else { ficha.classList.add('valida'); $('[data-ficha-nota]', ficha).textContent = 'Documento válido. Si el ISP trae a este titular, sus facturas se agregarán a este cliente.' }
				} catch {}
			}, 250)
		})
	}

	// Invoice detail.
	const mf = document.getElementById('m-factura')
	const abrirFactura = async id => {
		const cuerpo = $('[data-factura-cuerpo]', mf)
		cuerpo.replaceChildren(el('p', 'subtle', 'Cargando…'))
		mf.showModal()
		try {
			const f = await (await fetch('/api/facturas/' + id, { headers: { accept: 'application/json' } })).json()
			$('#t-factura').textContent = f.numero + ' · ' + (f.estado === 'pagada' ? 'Pagada' : 'Abierta')
			$('[data-subtitulo]', mf).textContent = f.cliente + ' · ' + f.descripcion
			const grid = el('div', 'det-factura')
			const dato = (k, v) => { const d = el('div'); d.append(el('span', '', k), el('strong', '', v)); grid.appendChild(d) }
			dato('Cuota en el ISP', f.deuda_id); dato('Contrato', String(f.contrato_id) + (f.estado_contrato ? ' · ' + f.estado_contrato : ''))
			dato('Periodo', fecha(f.periodo)); dato('Vence', fecha(f.vencimiento)); dato('Corte', fecha(f.corte))
			dato('Total', usd(f.total_cents)); dato('Saldo en Cobrix', usd(f.saldo_cents))
			if (f.saldo_admin_cents !== null && f.saldo_admin_cents !== undefined) dato('Saldo en el ISP', usd(f.saldo_admin_cents))
			if (f.estado === 'pagada') { dato('Pagada el', fecha(f.pagada_en)); dato('Factura del ISP', f.factura_admin) }
			const linea = el('ol', 'det-linea')
			for (const ev of f.eventos) { const li = el('li'); li.append(el('time', '', fechaHora(ev.fecha)), el('strong', '', ev.titulo), el('div', 'subtle', ev.detalle)); linea.appendChild(li) }
			cuerpo.replaceChildren(grid, el('h3', '', 'Historia de la factura'), linea)
		} catch { cuerpo.replaceChildren(el('p', 'modal-error', 'No se pudo cargar la factura.')) }
	}
	if (mf) document.addEventListener('click', e => {
		const fila = e.target.closest('[data-factura]')
		if (fila) { e.preventDefault(); abrirFactura(fila.dataset.factura) }
	})
	if (mf) document.addEventListener('keydown', e => { const fila = e.target.closest?.('[data-factura]'); if (fila && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirFactura(fila.dataset.factura) } })

	// Connection diagnosis.
	const mc = document.getElementById('m-conexion')
	document.addEventListener('click', async e => {
		const b = e.target.closest('[data-probar]')
		if (!b || !mc) return
		e.preventDefault()
		const lista = $('[data-pasos]', mc)
		const titulos = ['Datos del proveedor', 'Iniciar sesión', 'Listar contratos']
		lista.replaceChildren(...titulos.map(t => { const li = el('li', 'espera'); li.append(el('span', 'marca', '…'), (() => { const d = el('div'); d.append(el('strong', '', t), el('p', '', 'Probando…')); return d })(), el('span', 'ms', '')); return li }))
		mc.showModal()
		try {
			const r = await (await fetch('/api/probar-conexion', { method: 'POST', body: new URLSearchParams(new FormData(b.form)), headers: { accept: 'application/json' } })).json()
			lista.replaceChildren(...r.pasos.map(p => { const li = el('li', p.ok ? 'ok' : 'mal'); const d = el('div'); d.append(el('strong', '', p.titulo), el('p', '', p.detalle)); li.append(el('span', 'marca', p.ok ? '✓' : '✕'), d, el('span', 'ms', p.ms + ' ms')); return li }))
			const saltados = titulos.slice(r.pasos.length)
			for (const t of saltados) { const li = el('li', 'espera'); const d = el('div'); d.append(el('strong', '', t), el('p', '', 'No se probó: falló el paso anterior.')); li.append(el('span', 'marca', '–'), d, el('span', 'ms', '')); lista.appendChild(li) }
		} catch { lista.replaceChildren(el('li', 'mal', 'No se pudo contactar al servidor de Cobrix.')) }
	})

	// Runs in a modal with a live progress ring; ends with the key numbers.
	const mr = document.getElementById('m-corrida')
	const CLAVES = {
		importacion: [['importadas', 'Facturas importadas'], ['monto_importado_cents', 'Monto importado', 1], ['clientes_nuevos', 'Clientes nuevos'], ['ya_importadas', 'Ya importadas']],
		pagadas: [['pagadas', 'Marcadas pagadas'], ['monto_pagado_cents', 'Monto pagado', 1], ['abonos_parciales', 'Abonos parciales'], ['sin_evidencia', 'Sin evidencia']],
	}
	document.addEventListener('submit', async e => {
		const form = e.target
		if (!mr || !form.matches('form[action="/sincronizacion/ejecutar"]') || e.defaultPrevented) return
		const boton = e.submitter
		if (boton?.dataset.confirmar && form.dataset.confirmado !== '1') return  // the confirm dialog goes first
		e.preventDefault()
		delete form.dataset.confirmado
		const datos = new URLSearchParams(new FormData(form)); if (boton?.name) datos.set(boton.name, boton.value)
		const sim = datos.get('simulacion') !== '0', tipo = datos.get('tipo')
		const anillo = $('[data-anillo]', mr), pct = $('[data-anillo-pct]', mr), sub = $('[data-anillo-sub]', mr), res = $('[data-resumen]', mr), err = $('[data-error]', mr), ver = $('[data-ver-detalle]', mr)
		anillo.className = 'anillo'; anillo.style.setProperty('--p', 3); pct.textContent = '0 %'; sub.textContent = 'conectando…'
		res.hidden = true; err.hidden = true; ver.hidden = true
		$('#t-corrida').textContent = (sim ? 'Simulación: ' : '') + (tipo === 'importacion' ? 'Importar clientes y facturas' : 'Actualizar pagadas')
		$('[data-subtitulo]', mr).textContent = sim ? 'No escribe nada en Cobrix: solo muestra qué pasaría.' : 'Escribe en Cobrix al terminar, en una sola transacción.'
		mr.dataset.ocupado = '1'; mr.dataset.recargar = '1'; mr.showModal()
		try {
			const r = await fetch('/sincronizacion/ejecutar', { method: 'POST', body: datos, headers: { accept: 'application/json' } })
			const inicio = await r.json()
			if (!inicio.ok) throw new Error(inicio.error)
			ver.href = '/sincronizacion/' + inicio.id
			let c
			do {
				await new Promise(ok => setTimeout(ok, 350))
				c = await (await fetch('/api/corridas/' + inicio.id, { headers: { accept: 'application/json' } })).json()
				const p = c.progresoTotal ? Math.round(100 * c.progresoHecho / c.progresoTotal) : 3
				anillo.style.setProperty('--p', p); pct.textContent = p + ' %'
				sub.textContent = c.progresoTotal ? c.progresoHecho + ' de ' + c.progresoTotal + (tipo === 'importacion' ? ' contratos' : ' contratos con facturas') : 'conectando…'
			} while (c.estado === 'en_curso')
			anillo.style.setProperty('--p', 100)
			if (c.estado === 'completada') {
				anillo.classList.add('ok'); pct.textContent = '✓'; sub.textContent = sim ? 'simulación lista' : 'corrida completada'
				res.replaceChildren(...CLAVES[c.tipo].map(([k, label, dinero]) => { const d = el('div'); d.append(el('span', '', label), el('strong', '', dinero ? usd(c.resumen[k]) : String(c.resumen[k] ?? 0))); return d }))
				res.hidden = false
			} else {
				anillo.classList.add('mal'); pct.textContent = '✕'; sub.textContent = 'la corrida falló'
				err.textContent = c.error + ' No se escribió nada en Cobrix.'; err.hidden = false
			}
			ver.hidden = false
			mr.dataset.recargar = '1'
		} catch (error) {
			anillo.classList.add('mal'); pct.textContent = '✕'; sub.textContent = 'no se pudo iniciar'
			err.textContent = error.message || 'No se pudo iniciar la corrida.'; err.hidden = false
		}
		delete mr.dataset.ocupado
	})
	mr?.addEventListener('close', () => { if (mr.dataset.recargar) location.reload() })
	// While a run is starting, Escape must not hide it.
	mr?.addEventListener('cancel', e => { if (mr.dataset.ocupado) e.preventDefault() })
})()
`
