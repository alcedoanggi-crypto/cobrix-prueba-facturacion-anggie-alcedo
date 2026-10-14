/**
 * Screens of the panel. Pure functions: data in, HTML out (escaped by the `html` tag).
 */

import { today } from '../shared/dates.ts'
import type { Atencion, Expediente, FilaCliente, Totales, Tramo } from '../cobrix/consultas.ts'
import { ESTADOS_CONOCIDOS, ETIQUETA_IMPORTACION, ETIQUETA_PAGO, TIPOS_DOCUMENTO } from '../cobrix/reglas.ts'
import { numeroFactura, type Configuracion, type Corrida, type ItemCorrida } from '../cobrix/store.ts'
import { CONTRACT_STATUS_TONE, date, dateTime, html, pill, raw, usd, type Raw, type Tone } from './layout.ts'

type Row = Record<string, unknown>

// ---------------------------------------------------------------- shared bits

const TIPO_CORRIDA: Record<Corrida['tipo'], string> = { importacion: 'Importación', pagadas: 'Actualizar pagadas' }

export function estadoCorrida(c: Corrida): Raw {
	if (c.estado === 'en_curso') return pill('En curso', 'info')
	return c.estado === 'completada' ? pill('Completada', 'ok') : pill('Falló', 'bad')
}

const simBadge = (c: Corrida): Raw => (c.simulacion ? html`<span class="badge-sim" title="No escribió nada">Simulación</span>` : html``)

/** One-line human summary of a run, for lists. */
export function resumenCorrida(c: Corrida): string {
	const r = c.resumen
	if (c.estado === 'fallida') return c.error ?? 'Falló'
	if (c.estado === 'en_curso') return 'En curso…'
	if (c.tipo === 'importacion') {
		const verbo = c.simulacion ? 'se importarían' : 'importadas'
		const partes = [`${r.importadas ?? 0} ${verbo} (${usd(r.monto_importado_cents ?? 0)})`]
		if (r.ya_importadas) partes.push(`${r.ya_importadas} ya importadas`)
		const excluidas = (r.cuotas_revisadas ?? 0) - (r.importadas ?? 0) - (r.ya_importadas ?? 0)
		if (excluidas > 0) partes.push(`${excluidas} excluidas`)
		if (r.errores_api) partes.push(`${r.errores_api} con error`)
		return partes.join(' · ')
	}
	const partes = [`${r.pagadas ?? 0} ${c.simulacion ? 'se marcarían pagadas' : 'marcadas pagadas'} de ${r.facturas_revisadas ?? 0}`]
	if (r.abonos_parciales) partes.push(`${r.abonos_parciales} abono parcial`)
	if (r.sin_evidencia) partes.push(`${r.sin_evidencia} sin evidencia`)
	if (r.errores_api) partes.push(`${r.errores_api} con error`)
	return partes.join(' · ')
}

const RESULTADO_TONO: Record<string, Tone> = {
	importada: 'ok', ya_importada: 'mute', excluida_estado: 'mute', excluida_tipo_documento: 'mute', fuera_de_ventana: 'mute',
	excede_recientes: 'mute', frenada_tope: 'warn', saldo_residual: 'mute', moneda_incoherente: 'warn', moneda_no_usd: 'warn',
	identificacion_invalida: 'bad', estado_desconocido: 'bad', respuesta_inconsistente: 'bad', detalle_ilegible: 'bad',
	cuota_futura: 'mute', sin_deuda: 'mute', error_api: 'bad',
	pagada: 'ok', abono_parcial: 'warn', sigue_abierta: 'mute', exonerada: 'info', sin_evidencia: 'warn', inconsistente: 'bad',
}
const etiquetaResultado = (r: string): string =>
	(ETIQUETA_IMPORTACION as Record<string, string>)[r] ?? (ETIQUETA_PAGO as Record<string, string>)[r] ?? r
const pillResultado = (r: string): Raw => pill(etiquetaResultado(r), RESULTADO_TONO[r] ?? 'mute')

const periodoLegible = (p: unknown): string => (typeof p === 'string' && /^\d{4}-\d{2}$/.test(p) ? date(p) : '—')

function tablaCorridas(corridas: readonly Corrida[], vacio: Raw): Raw {
	if (!corridas.length) return vacio
	return html`<div class="table-wrap"><table>
		<thead><tr><th>#</th><th>Tipo</th><th>Fecha</th><th>Estado</th><th>Resultado</th></tr></thead>
		<tbody>${corridas.map(c => html`<tr class="link" data-href="/sincronizacion/${c.id}">
			<td class="mono"><a href="/sincronizacion/${c.id}">${c.id}</a></td>
			<td>${TIPO_CORRIDA[c.tipo]} ${simBadge(c)}${c.origen === 'automatica' ? html` <span class="subtle">· automática</span>` : ''}</td>
			<td class="nowrap">${dateTime(c.inicio)}</td>
			<td>${estadoCorrida(c)}</td>
			<td class="${c.estado === 'fallida' ? 'muted' : ''}">${resumenCorrida(c)}</td></tr>`)}</tbody></table></div>`
}

/** The four run buttons. Real runs ask for confirmation; simulations do not (they write nothing). */
function botonesCorrida(tipo: Corrida['tipo'], deshabilitado: boolean): Raw {
	const real = tipo === 'importacion'
		? { label: 'Importar', confirmar: 'Se crearán en Cobrix las facturas abiertas y los clientes nuevos que cumplan las reglas. Correrla dos veces no duplica nada.', ocupado: 'Importando…' }
		: { label: 'Actualizar pagadas', confirmar: 'Se marcarán pagadas en Cobrix las facturas que el ISP ya cobró por completo. Los abonos parciales se informan y la factura sigue abierta.', ocupado: 'Actualizando…' }
	return html`<form method="post" action="/sincronizacion/ejecutar" class="actions" data-titulo="${real.label}" data-boton="${real.label}">
		<input type="hidden" name="tipo" value="${tipo}">
		<button class="btn" name="simulacion" value="1" data-ocupado="Simulando…" ${deshabilitado ? raw('disabled') : ''}>Simular</button>
		<button class="btn primary" name="simulacion" value="0" data-confirmar="${real.confirmar}" data-ocupado="${real.ocupado}" ${deshabilitado ? raw('disabled') : ''}>${real.label}</button>
	</form>`
}

// ---------------------------------------------------------------- Resumen

export function vistaResumen(d: {
	totales: Totales; config: Configuracion; corridas: Corrida[]; tramos: Tramo[]; atencion: Atencion[]
	proxima: string | null; enCurso: number | null
}): Raw {
	const t = d.totales
	const proveedorListo = Boolean(d.config.proveedor.url && d.config.proveedor.usuario && d.config.proveedor.password)
	const maxTramo = Math.max(...d.tramos.map(x => x.montoCents), 1)
	const iconos: Record<Atencion['tipo'], Tone> = { abono_parcial: 'warn', sin_evidencia: 'warn', inconsistente: 'bad', descartado: 'bad', frenada: 'warn', error: 'bad' }
	const etiquetas: Record<Atencion['tipo'], string> = { abono_parcial: 'Abono parcial', sin_evidencia: 'Sin evidencia', inconsistente: 'Inconsistente', descartado: 'Contrato descartado', frenada: 'Frenada por tope', error: 'Error de la API' }

	return html`
	<div class="head"><div><h1>Resumen</h1><p>${d.config.empresa.nombre ? `Cobranza de ${d.config.empresa.nombre}` : 'Estado de la integración con el administrador de facturas.'} · datos al ${date(today())}</p></div>
		${d.enCurso ? html`<a class="btn" href="/sincronizacion/${d.enCurso}">Ver corrida en curso</a>` : ''}</div>

	${!proveedorListo ? html`<div class="flash warn">Falta configurar el proveedor: sin URL, usuario y contraseña no se puede sincronizar. <a href="/configuracion">Ir a Configuración</a></div>` : ''}

	<div class="kpis">
		<div class="kpi destacado"><span>Por cobrar</span><strong>${usd(t.porCobrarCents)}</strong><small>${t.abiertas} facturas abiertas</small></div>
		<div class="kpi"><span>Clientes</span><strong>${t.clientes}</strong><small>${t.contratos} contratos</small></div>
		<div class="kpi"><span>Facturas abiertas</span><strong>${t.abiertas}</strong><small>${t.vencimientoMasAntiguo ? `la más antigua vence el ${date(t.vencimientoMasAntiguo)}` : 'ninguna pendiente'}</small></div>
		<div class="kpi"><span>Facturas pagadas</span><strong>${t.pagadas}</strong><small>${usd(t.cobradoCents)} cobrados por el ISP</small></div>
	</div>

	<div class="cols">
		<div class="stack">
			<section class="card"><header><h2>Sincronizar</h2><a href="/sincronizacion">Historial completo</a></header>
				<div class="body">
					<div class="cols mitad">
						<div class="accion"><h3>Importar clientes y facturas</h3><p>Trae las cuotas pendientes del administrador como facturas abiertas.</p>${botonesCorrida('importacion', !proveedorListo || d.enCurso !== null)}</div>
						<div class="accion"><h3>Actualizar pagadas</h3><p>Revisa el libro de pagos del ISP y marca lo que ya se cobró.</p>${botonesCorrida('pagadas', !proveedorListo || d.enCurso !== null || t.abiertas === 0)}</div>
					</div>
				</div></section>

			<section class="card"><header><h2>Antigüedad de la deuda</h2><span class="subtle">días desde la fecha de corte</span></header>
				<div class="body">${t.abiertas === 0
					? html`<div class="vacio"><strong>No hay deuda abierta</strong><span>Cuando importes facturas verás aquí dónde está concentrada la deuda.</span></div>`
					: html`<div class="aging">${d.tramos.map((x, i) => html`<div class="fila"><span>${x.etiqueta}</span>
						<div class="barra t${i}" title="${x.facturas} facturas de ${x.clientes} clientes"><i style="width:${Math.round(100 * x.montoCents / maxTramo)}%"></i></div>
						<span class="num">${usd(x.montoCents)} <span class="subtle">· ${x.facturas}</span></span></div>`)}</div>
						<p class="subtle">Empieza a cobrar por la deuda más vieja: es la que más riesgo tiene de no recuperarse.</p>`}</div></section>

			<section class="card"><header><h2>Últimas corridas</h2><a href="/sincronizacion">Ver todas</a></header>
				${tablaCorridas(d.corridas, html`<div class="body"><div class="vacio"><strong>Todavía no hay corridas</strong><span>Empieza con «Simular» en Importar: muestra qué se importaría sin escribir nada.</span></div></div>`)}</section>
		</div>

		<div class="stack">
			<section class="card"><header><h2>Proveedor</h2><a href="/configuracion#proveedor">Editar</a></header>
				<div class="body"><dl class="facts">
					<dt>API</dt><dd class="mono">${d.config.proveedor.url || '— sin configurar —'}</dd>
					<dt>Usuario</dt><dd>${d.config.proveedor.usuario || '—'}</dd>
					<dt>Importa</dt><dd>${d.config.importacion.estados.join(', ') || 'ningún estado'}</dd>
					<dt>Automática</dt><dd>${d.config.automatica.activa
						? html`<span class="dot ok"></span>Activa · ${d.proxima ?? ''}`
						: html`<span class="dot"></span>Desactivada · <a href="/configuracion#automatica">activar</a>`}</dd>
				</dl></div></section>

			<section class="card"><header><h2>Requiere atención</h2><span class="subtle">${d.atencion.length || ''}</span></header>
				<div class="body">${d.atencion.length === 0
					? html`<div class="vacio"><strong>Todo en orden</strong><span>Aquí aparecen los abonos parciales, las cuotas sin evidencia de pago y los contratos que la API respondió de forma inconsistente.</span></div>`
					: html`<ul class="alertas">${d.atencion.slice(0, 8).map(a => html`<li>${pill(etiquetas[a.tipo], iconos[a.tipo])}<div><a href="${a.enlace}"><strong>${a.titulo}</strong></a><p>${a.detalle}</p></div></li>`)}</ul>
						${d.atencion.length > 8 ? html`<p class="subtle">Y ${d.atencion.length - 8} más en el detalle de las corridas.</p>` : ''}`}</div></section>
		</div>
	</div>`
}

// ---------------------------------------------------------------- Clientes

export function vistaClientes(filas: FilaCliente[], q: string, total: number): Raw {
	const vacio = total === 0
	return html`
	<div class="head"><div><h1>Clientes</h1><p>Un cliente por cédula o RIF: los contratos del mismo titular se agrupan.</p></div></div>
	<section class="card">
		<header>
			<form class="search" method="get" action="/clientes" role="search">
				<input type="search" name="q" value="${q}" placeholder="Nombre, cédula o RIF" aria-label="Buscar cliente" data-filtrar="tabla-clientes" autocomplete="off">
				<button class="btn">Buscar</button>
			</form>
			<span class="subtle"><span data-contador="tabla-clientes">${filas.length}</span> de ${total} clientes</span>
		</header>
		${vacio ? html`<div class="body"><div class="vacio"><strong>Aún no hay clientes</strong><span>Los clientes se crean al importar facturas desde el administrador.</span><a class="btn primary" href="/sincronizacion">Ir a Sincronización</a></div></div>`
		: filas.length === 0 ? html`<div class="body"><div class="vacio"><strong>Nada coincide con «${q}»</strong><span>Prueba con parte del nombre o solo los números del documento.</span><a href="/clientes">Ver todos</a></div></div>`
		: html`<div class="table-wrap"><table id="tabla-clientes">
			<thead><tr><th>Cliente</th><th>Documento</th><th>Tipo</th><th class="num">Contratos</th><th class="num">Abiertas</th><th class="num">Pagadas</th><th class="num">Deuda</th><th>Vencimiento más antiguo</th></tr></thead>
			<tbody>${filas.map(c => html`<tr class="link" data-href="/clientes/${c.id}" data-buscar="${c.nombre} ${c.documento} ${c.idExterno}">
				<td><a href="/clientes/${c.id}"><strong>${c.nombre}</strong></a></td>
				<td class="mono">${c.documento}</td>
				<td>${c.persona === 'juridica' ? pill('Jurídica', 'info') : pill('Natural', 'mute')}</td>
				<td class="num">${c.contratos}</td>
				<td class="num">${c.abiertas}</td>
				<td class="num">${c.pagadas}</td>
				<td class="num"><strong>${usd(c.deudaCents)}</strong></td>
				<td>${c.vencimientoMasAntiguo ? html`${date(c.vencimientoMasAntiguo)} ${antiguedadPill(c.vencimientoMasAntiguo)}` : html`<span class="muted">Al día</span>`}</td>
			</tr>`)}</tbody></table></div>`}
	</section>`
}

function antiguedadPill(vencimiento: string): Raw {
	const dias = Math.round((Date.parse(`${today()}T00:00:00Z`) - Date.parse(`${vencimiento}T00:00:00Z`)) / 86_400_000)
	if (dias <= 30) return html``
	return pill(`${dias} días`, dias > 90 ? 'bad' : 'warn')
}

// ---------------------------------------------------------------- Expediente

export function vistaExpediente(e: Expediente): Raw {
	const c = e.cliente
	const juridica = c.persona === 'juridica'
	const iconoEvento: Record<string, Tone> = { cliente_creado: 'info', factura_importada: 'mute', factura_pagada: 'ok', abono_parcial: 'warn' }
	return html`
	<div class="head"><div><a href="/clientes">← Clientes</a><h1>${String(c.nombre)}</h1>
		<p>${juridica ? 'Persona jurídica' : 'Persona natural'} · <span class="mono">${String(c.documento)}</span></p></div></div>

	<div class="kpis">
		<div class="kpi destacado"><span>Deuda abierta</span><strong>${usd(e.resumen.deudaCents)}</strong></div>
		<div class="kpi"><span>Facturas abiertas</span><strong>${e.resumen.abiertas}</strong></div>
		<div class="kpi"><span>Facturas pagadas</span><strong>${e.resumen.pagadas}</strong></div>
		<div class="kpi"><span>Contratos</span><strong>${e.resumen.contratos}</strong></div>
	</div>

	<div class="cols mitad">
		<section class="card"><header><h2>Datos del cliente</h2></header><div class="body"><dl class="facts">
			<dt>ID de cliente</dt><dd class="mono">${String(c.id_externo)}</dd>
			<dt>Documento</dt><dd class="mono">${String(c.documento)}</dd>
			<dt>Correo</dt><dd>${String(c.correo || '—')}</dd>
			<dt>Teléfono</dt><dd>${String(c.telefono || '—')}</dd>
			<dt>Origen</dt><dd>${String(c.origen)}</dd>
			<dt>Creado</dt><dd>${dateTime(c.creado_en)}</dd>
		</dl></div></section>

		<section class="card"><header><h2>Contratos en el administrador</h2></header><div class="table-wrap"><table>
			<thead><tr><th>Contrato</th><th>Estado</th><th>Plan</th><th>Sucursal</th></tr></thead>
			<tbody>${e.contratos.map(k => html`<tr>
				<td><span class="mono">${String(k.id)}</span><div class="subtle">${String(k.direccion)}</div></td>
				<td>${pill(String(k.estado), CONTRACT_STATUS_TONE[String(k.estado)] ?? 'mute')}</td>
				<td>${String(k.plan)}<div class="subtle">${usd(k.precio_cents)}/mes</div></td>
				<td>${String(k.sucursal)}</td></tr>`)}</tbody></table></div></section>
	</div>

	<section class="card"><header><h2>Facturas</h2><span class="subtle">una factura por cuota del administrador</span></header>
		${e.facturas.length === 0 ? html`<div class="body"><div class="vacio"><strong>Sin facturas</strong></div></div>` : html`<div class="table-wrap"><table>
		<thead><tr><th>Factura</th><th>Cuota en el administrador</th><th>Periodo</th><th>Vence</th><th>Corte</th><th class="num">Total</th><th class="num">Saldo</th><th>Estado</th></tr></thead>
		<tbody>${e.facturas.map(f => {
			const parcial = f.estado === 'abierta' && typeof f.saldo_admin_cents === 'number' && (f.saldo_admin_cents as number) < (f.saldo_cents as number)
			return html`<tr>
				<td class="mono nowrap">${numeroFactura(f.id as number)}</td>
				<td><span class="mono">${String(f.deuda_id)}</span><div class="subtle">contrato ${String(f.contrato_id)} · ${String(f.descripcion)}</div></td>
				<td class="nowrap">${periodoLegible(f.periodo)}</td>
				<td class="nowrap">${date(f.vencimiento)}</td>
				<td class="nowrap">${date(f.corte)}</td>
				<td class="num">${usd(f.total_cents)}</td>
				<td class="num">${usd(f.saldo_cents)}${parcial ? html`<div class="subtle">ISP: ${usd(f.saldo_admin_cents)}</div>` : ''}</td>
				<td>${f.estado === 'pagada'
					? html`${pill('Pagada', 'ok')}<div class="subtle">${date(f.pagada_en)} · fact. ${String(f.factura_admin)}</div>`
					: parcial ? pill('Abono parcial', 'warn') : pill('Abierta', 'warn')}</td></tr>`
		})}</tbody></table></div>
		<div class="body"><p class="note">El vencimiento es el primer día del periodo: el administrador no da un vencimiento por cuota. El corte suma los días de gracia configurados. Un abono parcial no cambia el saldo en Cobrix hasta que el ISP cobre la cuota completa.</p></div>`}
	</section>

	<section class="card"><header><h2>Historial</h2></header><div class="body">
		<ol class="timeline">${e.eventos.map(ev => html`<li><time datetime="${String(ev.fecha)}">${dateTime(ev.fecha)}</time>
			<div>${pill(String(ev.titulo), iconoEvento[String(ev.tipo)] ?? 'mute')}${ev.fid ? html` <span class="mono">${numeroFactura(ev.fid as number)}</span>` : ''}
			<div class="subtle">${String(ev.detalle)}</div></div></li>`)}</ol></div></section>`
}

// ---------------------------------------------------------------- Sincronización

export function vistaSincronizacion(d: { corridas: Corrida[]; filtro: string; proveedorListo: boolean; enCurso: number | null; hayAbiertas: boolean }): Raw {
	const filtros: Array<[string, string]> = [['', 'Todas'], ['importacion', 'Importación'], ['pagadas', 'Pagadas'], ['reales', 'Solo reales'], ['simulaciones', 'Simulaciones'], ['fallidas', 'Fallidas']]
	return html`
	<div class="head"><div><h1>Sincronización</h1><p>Las dos corridas que traen datos del administrador a Cobrix. «Simular» hace lo mismo sin escribir nada.</p></div></div>
	${!d.proveedorListo ? html`<div class="flash warn">Configura el proveedor antes de sincronizar. <a href="/configuracion#proveedor">Ir a Configuración</a></div>` : ''}
	${d.enCurso ? html`<div class="flash info">Hay una corrida en curso. <a href="/sincronizacion/${d.enCurso}">Ver su progreso</a></div>` : ''}
	<div class="cols mitad">
		<div class="accion"><h3>Importar clientes y facturas</h3>
			<p>Recorre todos los contratos y crea una factura abierta por cada cuota pendiente que cumpla las reglas, y su cliente si no existe.</p>
			${botonesCorrida('importacion', !d.proveedorListo || d.enCurso !== null)}</div>
		<div class="accion"><h3>Actualizar facturas pagadas</h3>
			<p>Compara cada factura abierta con el libro de cuotas del ISP y marca pagadas las que ya se cobraron por completo.</p>
			${botonesCorrida('pagadas', !d.proveedorListo || d.enCurso !== null || !d.hayAbiertas)}
			${!d.hayAbiertas ? html`<p class="subtle">No hay facturas abiertas que revisar.</p>` : ''}</div>
	</div>
	<section class="card"><header><h2>Historial de corridas</h2>
		<nav class="chips" aria-label="Filtrar corridas">${filtros.map(([v, l]) => html`<a class="chip" href="/sincronizacion${v ? `?ver=${v}` : ''}" aria-current="${d.filtro === v ? 'true' : 'false'}">${l}</a>`)}</nav></header>
		${tablaCorridas(d.corridas, html`<div class="body"><div class="vacio"><strong>${d.filtro ? 'Ninguna corrida con este filtro' : 'Todavía no hay corridas'}</strong><span>Lanza una simulación para ver qué haría cada corrida.</span></div></div>`)}
	</section>`
}

const CONTADORES: Record<Corrida['tipo'], Array<[string, string, 'dinero' | 'n']>> = {
	importacion: [
		['contratos', 'Contratos revisados', 'n'], ['cuotas_revisadas', 'Cuotas revisadas', 'n'], ['importadas', 'Facturas importadas', 'n'],
		['monto_importado_cents', 'Monto importado', 'dinero'], ['clientes_nuevos', 'Clientes nuevos', 'n'], ['ya_importadas', 'Ya importadas', 'n'],
		['excluidas_estado', 'Excluidas por estado', 'n'], ['excluidas_tipo_documento', 'Excluidas por tipo de documento', 'n'],
		['fuera_de_ventana', 'Fuera de la ventana', 'n'], ['excede_recientes', 'Exceden el máximo de recientes', 'n'], ['frenadas_tope', 'Frenadas por tope', 'n'],
		['saldo_residual', 'Saldo residual', 'n'], ['contratos_moneda_incoherente', 'Contratos con moneda incoherente', 'n'],
		['contratos_sin_deuda', 'Contratos sin deuda', 'n'], ['contratos_descartados', 'Contratos descartados (respuesta, estado o identificación)', 'n'],
		['otras_excluidas', 'Otras excluidas (periodo ilegible o futuras)', 'n'], ['errores_api', 'Errores de la API', 'n'],
	],
	pagadas: [
		['contratos', 'Contratos consultados', 'n'], ['facturas_revisadas', 'Facturas revisadas', 'n'], ['pagadas', 'Marcadas pagadas', 'n'],
		['monto_pagado_cents', 'Monto pagado', 'dinero'], ['abonos_parciales', 'Abonos parciales', 'n'], ['siguen_abiertas', 'Siguen abiertas', 'n'],
		['exoneradas', 'Exoneradas', 'n'], ['sin_evidencia', 'Sin evidencia', 'n'], ['inconsistentes', 'Inconsistentes', 'n'], ['errores_api', 'Errores de la API', 'n'],
	],
}
const DESTACADOS: Record<Corrida['tipo'], string[]> = {
	importacion: ['importadas', 'monto_importado_cents', 'clientes_nuevos', 'ya_importadas'],
	pagadas: ['pagadas', 'monto_pagado_cents', 'abonos_parciales', 'sin_evidencia'],
}

export function vistaCorrida(c: Corrida, items: ItemCorrida[], filtro: string): Raw {
	const fmt = (k: string, tipo: 'dinero' | 'n') => (tipo === 'dinero' ? usd(c.resumen[k] ?? 0) : String(c.resumen[k] ?? 0))
	const contadores = CONTADORES[c.tipo]
	const porResultado = new Map<string, number>()
	for (const i of items) porResultado.set(i.resultado, (porResultado.get(i.resultado) ?? 0) + 1)
	const visibles = filtro ? items.filter(i => i.resultado === filtro) : items
	const duracion = c.fin ? Math.max(0, Math.round((Date.parse(c.fin) - Date.parse(c.inicio)) / 100) / 10) : null
	const pct = c.progresoTotal ? Math.round(100 * c.progresoHecho / c.progresoTotal) : 5

	return html`
	<div class="head"><div><a href="/sincronizacion">← Sincronización</a>
		<h1>${TIPO_CORRIDA[c.tipo]} #${c.id} ${estadoCorrida(c)} ${simBadge(c)}</h1>
		<p>${dateTime(c.inicio)}${duracion !== null ? ` · ${duracion} s` : ''} · ${c.origen === 'automatica' ? 'corrida automática' : 'lanzada a mano'}${c.simulacion ? ' · no escribió nada en Cobrix' : ''}</p></div>
		${c.estado !== 'en_curso' && items.length ? html`<a class="btn" href="/sincronizacion/${c.id}/csv" download>Descargar CSV</a>` : ''}</div>

	${c.estado === 'en_curso' ? html`<section class="card"><div class="body">
		<strong>Corrida en curso…</strong>
		<div class="barra" data-corrida-en-curso="${c.id}"><i style="width:${pct}%"></i></div>
		<span class="subtle" data-progreso-texto>${c.progresoTotal ? `${c.progresoHecho} de ${c.progresoTotal} contratos` : 'Conectando con el administrador…'}</span>
		<noscript><a href="/sincronizacion/${c.id}">Actualizar</a></noscript></div></section>` : ''}

	${c.estado === 'fallida' ? html`<div class="error-box" role="alert"><strong>La corrida falló</strong><p>${c.error ?? 'Error desconocido'}</p>
		<p class="subtle">No se escribió nada en Cobrix: la corrida se aplica completa o no se aplica. Corrige la causa y vuelve a lanzarla; no duplicará nada.</p></div>` : ''}

	${c.estado === 'completada' ? html`
	<div class="kpis">${DESTACADOS[c.tipo].map(k => {
		const def = contadores.find(x => x[0] === k)!
		return html`<div class="kpi ${k === DESTACADOS[c.tipo][0] ? 'destacado' : ''}"><span>${def[1]}</span><strong>${fmt(k, def[2])}</strong></div>`
	})}</div>

	<section class="card"><header><h2>Todos los contadores</h2></header><div class="body"><dl class="contadores">
		${contadores.map(([k, label, tipo]) => html`<div class="${(c.resumen[k] ?? 0) === 0 ? 'cero' : ''}"><dt>${label}</dt><dd>${fmt(k, tipo)}</dd></div>`)}
	</dl></div></section>

	<section class="card"><header><h2>${c.tipo === 'importacion' ? 'Una fila por cuota' : 'Una fila por factura'}</h2>
		<span class="subtle">${visibles.length} de ${items.length}</span></header>
		<div class="body"><nav class="chips" aria-label="Filtrar por resultado">
			<a class="chip" href="/sincronizacion/${c.id}" aria-current="${filtro ? 'false' : 'true'}">Todas <b>${items.length}</b></a>
			${[...porResultado].map(([r, n]) => html`<a class="chip" href="/sincronizacion/${c.id}?resultado=${r}" aria-current="${filtro === r ? 'true' : 'false'}">${etiquetaResultado(r)} <b>${n}</b></a>`)}
		</nav></div>
		<div class="table-wrap"><table>
			<thead><tr><th>Titular</th><th>Contrato</th><th>Cuota</th><th>Periodo</th><th class="num">Monto</th><th>Resultado</th><th>Motivo</th></tr></thead>
			<tbody>${visibles.map(i => html`<tr>
				<td>${i.titular || html`<span class="muted">—</span>`}<div class="subtle mono">${i.documento}</div></td>
				<td class="mono">${i.contratoId ?? '—'}</td>
				<td class="mono nowrap">${i.deudaId ?? html`<span class="muted">todo el contrato</span>`}${i.factura ? html`<div class="subtle">${i.factura}</div>` : ''}</td>
				<td class="nowrap">${periodoLegible(i.periodo)}</td>
				<td class="num">${i.montoCents !== null ? usd(i.montoCents) : '—'}</td>
				<td>${pillResultado(i.resultado)}</td>
				<td class="subtle motivo">${i.motivo}</td></tr>`)}</tbody></table></div></section>
	</div>` : ''}`
}

// ---------------------------------------------------------------- Configuración

export function vistaConfiguracion(c: Configuracion, d: { proxima: string | null; datos: { clientes: number; facturas: number; corridas: number } }): Raw {
	const imp = c.importacion
	const sel = (actual: number | null, valor: number | null) => (actual === valor ? raw('selected') : '')
	const chk = (on: boolean) => (on ? raw('checked') : '')
	return html`
	<div class="head"><div><h1>Configuración</h1><p>Datos de la empresa y del proveedor, y las reglas de importación. Cada bloque se guarda por separado.</p></div></div>

	<div class="cols mitad">
		<section class="card" id="empresa"><header><h2>Empresa</h2></header>
			<form class="body" method="post" action="/configuracion/empresa">
				<label class="field">Nombre<input type="text" name="nombre" value="${c.empresa.nombre}" required maxlength="120" placeholder="Mi empresa, C.A."></label>
				<label class="field">RIF<input type="text" name="rif" value="${c.empresa.rif}" required pattern="[JGVEPjgvep]-?\\d{6,9}-?\\d?" placeholder="J-12345678-9"><small>Letra, número y dígito verificador.</small></label>
				<label class="field">Correo de cobranza<input type="email" name="correo" value="${c.empresa.correo}" required placeholder="cobranza@empresa.com"></label>
				<div class="form-actions"><button class="btn primary">Guardar empresa</button></div>
			</form></section>

		<section class="card" id="proveedor"><header><h2>Proveedor</h2><span class="subtle">administrador de facturas</span></header>
			<form class="body" method="post" action="/configuracion/proveedor">
				<label class="field">URL de la API<input type="url" name="url" value="${c.proveedor.url}" required placeholder="https://facturas.isp.com"></label>
				<div class="field-row">
					<label class="field">Usuario<input type="text" name="usuario" value="${c.proveedor.usuario}" required autocomplete="off"></label>
					<label class="field">Contraseña<input type="password" name="password" value="" autocomplete="new-password" placeholder="${c.proveedor.password ? '•••••••• (guardada)' : 'Escribe la contraseña'}" ${c.proveedor.password ? '' : raw('required')}>
						<small>${c.proveedor.password ? 'Déjala vacía para conservar la actual.' : 'Aún no hay contraseña guardada.'}</small></label>
				</div>
				<div class="form-actions">
					<button class="btn" formaction="/configuracion/probar" data-ocupado="Probando…">Probar conexión</button>
					<button class="btn primary">Guardar proveedor</button>
				</div>
			</form></section>
	</div>

	<section class="card" id="importacion"><header><h2>Reglas de importación</h2></header>
		<form class="body" method="post" action="/configuracion/importacion">
			<fieldset><legend>Estados de contrato que se importan</legend>
				${ESTADOS_CONOCIDOS.map(e => html`<label><input type="checkbox" name="estados" value="${e}" ${chk(imp.estados.includes(e))}> ${e}</label>`)}</fieldset>
			<div class="field-row">
				<label class="field">Ventana de importación<select name="ventana">
					<option value="" ${sel(imp.ventanaMeses, null)}>Sin ventana: todas las cuotas</option>
					${[3, 6, 9, 12].map(n => html`<option value="${n}" ${sel(imp.ventanaMeses, n)}>Desde hace ${n} meses</option>`)}
				</select><small>Solo cuotas desde el mes actual menos N meses.</small></label>
				<label class="field">Máximo de cuotas recientes por contrato<input type="number" name="max_recientes" min="1" max="60" step="1" value="${imp.maxRecientes ?? ''}" placeholder="Todas"><small>1 a 60. Se conservan las más recientes.</small></label>
				<label class="field">Días de gracia<input type="number" name="dias_gracia" min="0" max="60" step="1" value="${imp.diasGracia}" required><small>Corte = vencimiento + días de gracia.</small></label>
			</div>
			<div class="field-row">
				<label class="field">Tope de facturas nuevas por corrida<input type="number" name="tope_facturas" min="1" step="1" value="${imp.topeFacturas ?? ''}" placeholder="Sin tope"></label>
				<label class="field">Tope de monto nuevo por corrida (USD)<input type="number" name="tope_monto" min="0.01" step="0.01" value="${imp.topeMontoCents !== null ? (imp.topeMontoCents / 100).toFixed(2) : ''}" placeholder="Sin tope"><small>Lo que exceda queda frenado y entra en una corrida posterior.</small></label>
			</div>
			<fieldset><legend>Excluir por tipo de documento del titular</legend>
				${TIPOS_DOCUMENTO.map(t => html`<label><input type="checkbox" name="tipos_excluidos" value="${t}" ${chk(imp.tiposExcluidos.includes(t))}> ${t}${t === 'J' || t === 'G' ? html` <span class="subtle">(jurídica)</span>` : ''}</label>`)}</fieldset>
			<div class="form-actions"><button class="btn primary">Guardar reglas</button></div>
		</form></section>

	<div class="cols mitad">
		<section class="card" id="automatica"><header><h2>Corrida automática</h2>${c.automatica.activa ? pill('Activa', 'ok') : pill('Desactivada', 'mute')}</header>
			<form class="body" method="post" action="/configuracion/automatica">
				<label class="field" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="activa" value="1" ${chk(c.automatica.activa)}> Ejecutar todos los días</label>
				<label class="field">Hora (America/Caracas)<input type="time" name="hora" value="${c.automatica.hora}" required></label>
				<p class="subtle">Importa y después actualiza pagadas. ${d.proxima ? `Próxima: ${d.proxima}.` : ''}</p>
				<div class="form-actions"><button class="btn primary">Guardar</button></div>
			</form></section>

		<section class="card"><header><h2>Empezar de cero</h2></header>
			<form class="body" method="post" action="/configuracion/vaciar" data-peligro="1" data-titulo="Vaciar los datos de Cobrix"
				data-confirmar="Se borrarán ${d.datos.clientes} clientes, ${d.datos.facturas} facturas y ${d.datos.corridas} corridas de Cobrix. La configuración se conserva y el administrador no se toca. No se puede deshacer." data-boton="Vaciar datos">
				<p class="subtle">Borra clientes, facturas, historial y corridas de Cobrix para volver a importar desde cero. No toca el administrador de facturas ni la configuración.</p>
				<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="confirmo" value="1" required> Entiendo que no se puede deshacer</label>
				<div class="form-actions"><button class="btn danger" ${d.datos.clientes + d.datos.corridas === 0 ? raw('disabled') : ''}>Vaciar datos de Cobrix</button></div>
			</form></section>
	</div>`
}

export function noEncontrado(que: string, volver: string): Raw {
	return html`<div class="vacio"><strong>${que}</strong><a class="btn" href="${volver}">Volver</a></div>`
}

export type { Row }
