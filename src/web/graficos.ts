/**
 * Small charts in plain HTML + CSS (no library): text stays readable at any width and the
 * page works without JavaScript. Every chart has a hover/focus tooltip (estilos.ts) and a
 * table view, so no value depends on color or on hovering.
 *
 * Palette (validated for color-blind separation and contrast in light and dark):
 * two categorical series (blue, orange) and a one-hue ordinal blue ramp for ordered buckets.
 */

import { html, type Raw } from './layout.ts'

export interface Serie { readonly nombre: string; readonly clase: 's1' | 's2' }

/** Tooltip payload, read by the client script with textContent (never innerHTML). */
const tip = (titulo: string, filas: Array<[string, string, string?]>): Raw =>
	html`data-tip="${JSON.stringify({ titulo, filas })}" tabindex="0"`

/** Clean axis ticks: 0, step, 2·step… with step in {1, 2, 2.5, 5}·10^n. */
export function ticks(max: number, objetivo = 4): number[] {
	if (max <= 0) return [0]
	const crudo = max / objetivo
	const pot = 10 ** Math.floor(Math.log10(crudo))
	const paso = [1, 2, 2.5, 5, 10].map(m => m * pot).find(p => p >= crudo) ?? crudo
	const out: number[] = []
	for (let v = 0; v <= max + paso * 0.999; v += paso) out.push(Math.round(v * 100) / 100)
	return out
}

function tablaDatos(cabecera: string[], filas: string[][]): Raw {
	return html`<details class="tabla-datos"><summary>Ver como tabla</summary><div class="table-wrap"><table>
		<thead><tr>${cabecera.map((c, i) => html`<th class="${i ? 'num' : ''}">${c}</th>`)}</tr></thead>
		<tbody>${filas.map(f => html`<tr>${f.map((c, i) => html`<td class="${i ? 'num' : ''}">${c}</td>`)}</tr>`)}</tbody></table></div></details>`
}

/**
 * Stacked columns (two series max): one column per category, segments separated by a 2 px
 * surface gap, rounded top, value on the cap of the tallest column only.
 */
export function columnasApiladas(d: {
	etiqueta: string
	categorias: readonly string[]
	series: readonly Serie[]
	valores: ReadonlyArray<readonly number[]>   // [serie][categoria], in cents or units
	formato: (n: number) => string
	formatoEje: (n: number) => string
}): Raw {
	const totales = d.categorias.map((_, i) => d.series.reduce((s, _x, k) => s + (d.valores[k]?.[i] ?? 0), 0))
	const marcas = ticks(Math.max(...totales, 1))
	const tope = marcas.at(-1)!
	const mayor = totales.indexOf(Math.max(...totales))
	return html`<figure class="grafico">
		<div class="leyenda">${d.series.map(s => html`<span><i class="sw ${s.clase}"></i>${s.nombre}</span>`)}</div>
		<div class="columnas" role="img" aria-label="${d.etiqueta}">
			<div class="eje-y">${marcas.map(v => html`<div class="tick" style="bottom:${(100 * v) / tope}%"><span>${d.formatoEje(v)}</span></div>`)}</div>
			<div class="barras">${d.categorias.map((cat, i) => html`<div class="col" ${tip(cat, [
				...d.series.map((s, k): [string, string, string] => [s.nombre, d.formato(d.valores[k]?.[i] ?? 0), s.clase]),
				['Total', d.formato(totales[i] ?? 0)],
			])}>
				${i === mayor && totales[i] ? html`<span class="cap" style="bottom:${(100 * (totales[i] ?? 0)) / tope}%">${d.formato(totales[i] ?? 0)}</span>` : ''}
				<div class="pila" style="height:${(100 * (totales[i] ?? 0)) / tope}%">
					${[...d.series.keys()].reverse().map(k => (d.valores[k]?.[i] ?? 0) > 0 ? html`<i class="${d.series[k]!.clase}" style="flex-grow:${d.valores[k]![i]}"></i>` : '')}
				</div></div>`)}</div>
		</div>
		<div class="eje-x">${d.categorias.map(c => html`<span>${c}</span>`)}</div>
		${tablaDatos(['Periodo', ...d.series.map(s => s.nombre), 'Total'],
			d.categorias.map((c, i) => [c, ...d.series.map((_, k) => d.formato(d.valores[k]?.[i] ?? 0)), d.formato(totales[i] ?? 0)]))}
	</figure>`
}

/**
 * Horizontal bars, one series. `rampa` paints ordered buckets with the ordinal ramp
 * (o1 → o5, light to dark) instead of the single series color.
 */
export function barrasHorizontales(d: {
	etiqueta: string
	filas: ReadonlyArray<{ etiqueta: string | Raw; valor: number; texto: string; detalle?: string; enlace?: string }>
	rampa?: boolean
	cabecera?: [string, string]
}): Raw {
	const max = Math.max(...d.filas.map(f => f.valor), 1)
	return html`<figure class="grafico">
		<div class="hbarras" role="img" aria-label="${d.etiqueta}">${d.filas.map((f, i) => {
			const nombre = typeof f.etiqueta === 'string' ? f.etiqueta : f.etiqueta.html.replace(/<[^>]+>/g, '')
			const barra = html`<div class="pista"><i class="${d.rampa ? `o${i + 1}` : 's1'}" style="width:${f.valor > 0 ? Math.max(1.5, (100 * f.valor) / max) : 0}%"></i></div>`
			return html`<div class="hfila" ${tip(nombre, [['Valor', f.texto], ...(f.detalle ? [['', f.detalle] as [string, string]] : [])])}>
				<span class="hetiqueta">${f.enlace ? html`<a href="${f.enlace}">${f.etiqueta}</a>` : f.etiqueta}</span>${barra}<span class="hvalor">${f.texto}</span></div>`
		})}</div>
		${tablaDatos(d.cabecera ?? ['Categoría', 'Valor'], d.filas.map(f => [typeof f.etiqueta === 'string' ? f.etiqueta : f.etiqueta.html.replace(/<[^>]+>/g, ''), f.texto]))}
	</figure>`
}

/** A meter: the fill carries the share, the track is a lighter step of the same hue. */
export function medidor(d: { etiqueta: string; fraccion: number; texto: string; detalle: string }): Raw {
	const pct = Math.max(0, Math.min(1, d.fraccion)) * 100
	return html`<div class="medidor" ${tip(d.etiqueta, [['', d.texto], ['', d.detalle]])}>
		<div class="medidor-cab"><span>${d.etiqueta}</span><strong>${d.texto}</strong></div>
		<div class="medidor-pista" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}" aria-label="${d.etiqueta}"><i style="width:${pct}%"></i></div>
		<small>${d.detalle}</small></div>`
}
