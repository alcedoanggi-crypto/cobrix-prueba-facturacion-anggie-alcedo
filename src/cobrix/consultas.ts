/**
 * Read models for the panel. SQL lives here so the views only format.
 */

import { today } from '../shared/dates.ts'
import { usdTexto } from './reglas.ts'
import type { Store } from './store.ts'

type Row = Record<string, unknown>
const num = (v: unknown): number => Number(v ?? 0)

export interface Totales {
	clientes: number; contratos: number; abiertas: number; pagadas: number
	porCobrarCents: number; cobradoCents: number; vencimientoMasAntiguo: string | null
}

export function totales(store: Store): Totales {
	const r = store.db.prepare(`SELECT
		(SELECT COUNT(*) FROM clientes) AS clientes,
		(SELECT COUNT(*) FROM contratos) AS contratos,
		(SELECT COUNT(*) FROM facturas WHERE estado = 'abierta') AS abiertas,
		(SELECT COUNT(*) FROM facturas WHERE estado = 'pagada') AS pagadas,
		(SELECT COALESCE(SUM(saldo_cents), 0) FROM facturas WHERE estado = 'abierta') AS por_cobrar,
		(SELECT COALESCE(SUM(total_cents), 0) FROM facturas WHERE estado = 'pagada') AS cobrado,
		(SELECT MIN(vencimiento) FROM facturas WHERE estado = 'abierta') AS mas_antiguo`).get() as Row
	return {
		clientes: num(r.clientes), contratos: num(r.contratos), abiertas: num(r.abiertas), pagadas: num(r.pagadas),
		porCobrarCents: num(r.por_cobrar), cobradoCents: num(r.cobrado), vencimientoMasAntiguo: (r.mas_antiguo as string | null) ?? null,
	}
}

export interface Tramo { etiqueta: string; facturas: number; montoCents: number; clientes: number }

/** Open debt by days past the cut-off date: a quick view of where to collect first. */
export function antiguedad(store: Store, hoy = today()): Tramo[] {
	const tramos: Array<[string, number, number]> = [
		['Sin vencer', -Infinity, 0], ['1 a 30 días', 1, 30], ['31 a 60 días', 31, 60], ['61 a 90 días', 61, 90], ['Más de 90 días', 91, Infinity],
	]
	const abiertas = store.db.prepare(`SELECT corte, saldo_cents, cliente_id FROM facturas WHERE estado = 'abierta'`).all() as Row[]
	const dias = (corte: string) => Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${corte}T00:00:00Z`)) / 86_400_000)
	return tramos.map(([etiqueta, desde, hasta]) => {
		const enTramo = abiertas.filter(f => { const d = dias(String(f.corte)); return d >= desde && d <= hasta })
		return { etiqueta, facturas: enTramo.length, montoCents: enTramo.reduce((s, f) => s + num(f.saldo_cents), 0), clientes: new Set(enTramo.map(f => f.cliente_id)).size }
	})
}

export interface Atencion { tipo: 'abono_parcial' | 'sin_evidencia' | 'inconsistente' | 'descartado' | 'frenada' | 'error'; titulo: string; detalle: string; enlace: string }

/** Things an operator should look at, from the latest real run of each kind. */
export function requiereAtencion(store: Store): Atencion[] {
	const out: Atencion[] = []
	const parciales = store.db.prepare(`SELECT f.id, f.deuda_id, f.saldo_cents, f.saldo_admin_cents, c.id AS cliente, c.nombre FROM facturas f
		JOIN clientes c ON c.id = f.cliente_id WHERE f.estado = 'abierta' AND f.saldo_admin_cents IS NOT NULL AND f.saldo_admin_cents < f.saldo_cents
		ORDER BY c.nombre`).all() as Row[]
	for (const p of parciales) {
		out.push({ tipo: 'abono_parcial', titulo: `${String(p.nombre)}: abono parcial`, enlace: `/clientes/${num(p.cliente)}`,
			detalle: `Cuota ${String(p.deuda_id)}: el ISP cobró ${usdTexto(num(p.saldo_cents) - num(p.saldo_admin_cents))}; en el ISP quedan ${usdTexto(num(p.saldo_admin_cents))}` })
	}
	for (const tipo of ['importacion', 'pagadas'] as const) {
		const ultima = store.db.prepare(`SELECT id FROM corridas WHERE tipo = ? AND simulacion = 0 AND estado = 'completada' ORDER BY id DESC LIMIT 1`).get(tipo) as Row | undefined
		if (!ultima) continue
		const items = store.db.prepare(`SELECT resultado, motivo, titular, deuda_id, contrato_id FROM corrida_items WHERE corrida_id = ?
			AND resultado IN ('sin_evidencia','inconsistente','respuesta_inconsistente','estado_desconocido','identificacion_invalida','frenada_tope','error_api')`).all(ultima.id as number) as Row[]
		const enlace = `/sincronizacion/${num(ultima.id)}`
		for (const it of items) {
			const quien = String(it.titular || `Contrato ${String(it.contrato_id)}`)
			const r = String(it.resultado)
			const tipoA: Atencion['tipo'] = r === 'sin_evidencia' ? 'sin_evidencia' : r === 'inconsistente' ? 'inconsistente' : r === 'frenada_tope' ? 'frenada' : r === 'error_api' ? 'error' : 'descartado'
			out.push({ tipo: tipoA, titulo: quien, detalle: String(it.motivo), enlace })
		}
	}
	return out
}

export interface FilaCliente {
	id: number; nombre: string; documento: string; idExterno: string; persona: string
	contratos: number; abiertas: number; pagadas: number; deudaCents: number; vencimientoMasAntiguo: string | null
}

export function clientes(store: Store, busqueda = ''): FilaCliente[] {
	const q = busqueda.trim()
	// Searching «V-12.345.678» or «12345678» must find V12345678: compare against the normalized id too.
	const digitos = q.toUpperCase().replace(/[\s.\-_/]/g, '').replace(/^([VEJGP]?)0+/, '$1')
	const rows = store.db.prepare(`SELECT c.id, c.nombre, c.documento, c.id_externo, c.persona,
			(SELECT COUNT(*) FROM contratos k WHERE k.cliente_id = c.id) AS contratos,
			COUNT(f.id) FILTER (WHERE f.estado = 'abierta') AS abiertas,
			COUNT(f.id) FILTER (WHERE f.estado = 'pagada') AS pagadas,
			COALESCE(SUM(f.saldo_cents) FILTER (WHERE f.estado = 'abierta'), 0) AS deuda,
			MIN(f.vencimiento) FILTER (WHERE f.estado = 'abierta') AS mas_antiguo
		FROM clientes c LEFT JOIN facturas f ON f.cliente_id = c.id
		WHERE ? = '' OR c.nombre LIKE '%' || ? || '%' OR c.documento LIKE '%' || ? || '%' OR c.id_externo LIKE '%' || ? || '%'
		GROUP BY c.id ORDER BY deuda DESC, c.nombre`).all(q, q, q, digitos || q) as Row[]
	return rows.map(r => ({
		id: num(r.id), nombre: String(r.nombre), documento: String(r.documento), idExterno: String(r.id_externo), persona: String(r.persona),
		contratos: num(r.contratos), abiertas: num(r.abiertas), pagadas: num(r.pagadas), deudaCents: num(r.deuda),
		vencimientoMasAntiguo: (r.mas_antiguo as string | null) ?? null,
	}))
}

export interface Expediente {
	cliente: Row
	contratos: Row[]
	facturas: Row[]
	eventos: Row[]
	resumen: { deudaCents: number; abiertas: number; pagadas: number; contratos: number }
}

export function expediente(store: Store, id: number): Expediente | undefined {
	const cliente = store.db.prepare('SELECT * FROM clientes WHERE id = ?').get(id) as Row | undefined
	if (!cliente) return undefined
	const contratos = store.db.prepare('SELECT * FROM contratos WHERE cliente_id = ? ORDER BY id').all(id) as Row[]
	const facturas = store.db.prepare(`SELECT * FROM facturas WHERE cliente_id = ? ORDER BY CASE estado WHEN 'abierta' THEN 0 ELSE 1 END, periodo DESC, contrato_id`).all(id) as Row[]
	const eventos = store.db.prepare('SELECT e.*, f.id AS fid FROM eventos e LEFT JOIN facturas f ON f.id = e.factura_id WHERE e.cliente_id = ? ORDER BY e.fecha DESC, e.id DESC').all(id) as Row[]
	const abiertas = facturas.filter(f => f.estado === 'abierta')
	return {
		cliente, contratos, facturas, eventos,
		resumen: { deudaCents: abiertas.reduce((s, f) => s + num(f.saldo_cents), 0), abiertas: abiertas.length, pagadas: facturas.length - abiertas.length, contratos: contratos.length },
	}
}

/** Days between a civil date and today (positive = in the past). */
export function diasDesde(fecha: string, hoy = today()): number {
	return Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${fecha}T00:00:00Z`)) / 86_400_000)
}

