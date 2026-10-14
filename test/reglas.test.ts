/**
 * Business rules of ENUNCIADO §4, one by one, as pure functions (no HTTP, no database).
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
	clasificarContrato, evaluarPago, normalizarIdentificacion, periodoDeDetalle, type ReglasImportacion,
} from '../src/cobrix/reglas.ts'

const REGLAS: ReglasImportacion = {
	estadosImportables: ['ACTIVO', 'CORTADO'], ventanaMeses: null, maxCuotasRecientes: null, diasGracia: 0,
	tiposExcluidos: [], umbralMonedaIncoherente: 0.01,
}
const HOY = '2026-10'

/** A contrato/individual row with sensible defaults; override what each test needs. */
function fila(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		contrato_id: 900101, codigo: '0900101', identificacion_contrato: 'V-12345678', nombre_contrato: 'ANA PEREZ',
		telefono: '04121234567', email: 'ANA@EXAMPLE.COM', estado: 'ACTIVO', direccion: 'CALLE 1', deuda: 25,
		deuda_id: '7000010', detalle_deuda: ['PLAN15MB25 - 2026 Octubre'], precio_servicio: '25.000000',
		nombre_plan: 'PLAN15MB25', sigla_sucursal: 'CCS', moneda_sigla: 'USD', ...over,
	}
}
const cuota = (id: string, periodo: string, deuda = 25) => fila({ deuda_id: id, deuda, detalle_deuda: [`PLAN15MB25 - ${periodo}`] })

describe('clientes: identificación', () => {
	it('normaliza separadores y ceros a la izquierda', () => {
		assert.equal(normalizarIdentificacion('V-12345678')?.id, 'V12345678')
		assert.equal(normalizarIdentificacion('09000123')?.id, '9000123')
		assert.equal(normalizarIdentificacion('J-40123456-7')?.id, 'J401234567')
		assert.equal(normalizarIdentificacion(' e 8.123.456 ')?.id, 'E8123456')
		assert.equal(normalizarIdentificacion('V-00012345678')?.id, 'V12345678')
	})
	it('J y G son jurídicas; V, E, P y sin letra, naturales', () => {
		assert.equal(normalizarIdentificacion('J-40123456-7')?.persona, 'juridica')
		assert.equal(normalizarIdentificacion('G-20000001-1')?.persona, 'juridica')
		for (const id of ['V-12345678', 'E-81234567', 'P-1234567', '09000123']) assert.equal(normalizarIdentificacion(id)?.persona, 'natural')
	})
	it('rechaza lo que no se puede leer con certeza', () => {
		for (const id of ['', 'X-12345678', 'V-12345', 'V-1234567890123', 'ABC', '00000', null, 12345678]) {
			assert.equal(normalizarIdentificacion(id), null, String(id))
		}
	})
})

describe('facturas: periodo y vencimiento', () => {
	it('lee «YYYY Mes» al final del detalle', () => {
		assert.equal(periodoDeDetalle('PLAN15MB25 - 2026 Agosto'), '2026-08')
		assert.equal(periodoDeDetalle('EMPRESA50MB - 2025 Diciembre'), '2025-12')
		assert.equal(periodoDeDetalle('X - 2026 septiembre'), '2026-09')
	})
	it('no adivina un detalle sin periodo', () => {
		assert.equal(periodoDeDetalle('PLAN15MB25'), null)
		assert.equal(periodoDeDetalle('PLAN - 2026 Agostto'), null)
		assert.equal(periodoDeDetalle(undefined), null)
	})
})

describe('facturas: clasificación de un contrato', () => {
	it('una factura candidata por cuota, ordenadas de la más vieja a la más nueva', () => {
		const r = clasificarContrato(900101, [cuota('7000010', '2026 Octubre'), cuota('7000008', '2026 Agosto', 20)], REGLAS, HOY)
		assert.deepEqual(r.candidatas.map(c => [c.deudaId, c.periodo, c.montoCents]), [['7000008', '2026-08', 2000], ['7000010', '2026-10', 2500]])
		assert.equal(r.identificacion?.id, 'V12345678')
	})
	it('la fila deuda_id "0" es «sin deuda», no una cuota', () => {
		const r = clasificarContrato(900101, [fila({ deuda_id: '0', deuda: 0, detalle_deuda: [] })], REGLAS, HOY)
		assert.equal(r.candidatas.length, 0)
		assert.equal(r.excluidas[0]?.resultado, 'sin_deuda')
	})
	it('saldo residual (deuda 0) no se importa', () => {
		const r = clasificarContrato(900101, [cuota('1', '2026 Septiembre', 0), cuota('2', '2026 Octubre')], REGLAS, HOY)
		assert.deepEqual(r.candidatas.map(c => c.deudaId), ['2'])
		assert.equal(r.excluidas.find(i => i.deudaId === '1')?.resultado, 'saldo_residual')
	})
	it('estado no importable: una exclusión por cuota', () => {
		const r = clasificarContrato(900101, [fila({ estado: 'CORTESIA', deuda_id: '1' }), fila({ estado: 'CORTESIA', deuda_id: '2', detalle_deuda: ['P - 2026 Septiembre'] })], REGLAS, HOY)
		assert.equal(r.candidatas.length, 0)
		assert.deepEqual(r.excluidas.map(i => i.resultado), ['excluida_estado', 'excluida_estado'])
	})
	it('estado desconocido: el contrato queda fuera, no se adivina', () => {
		const r = clasificarContrato(900101, [fila({ estado: 'SUSPENDIDO' })], REGLAS, HOY)
		assert.equal(r.excluidas[0]?.resultado, 'estado_desconocido')
		assert.equal(r.candidatas.length, 0)
	})
	it('moneda incoherente: USD con cuotas de menos del 1 % del plan', () => {
		const r = clasificarContrato(900101, [fila({ deuda: 0.05, precio_servicio: '20.000000' })], REGLAS, HOY)
		assert.equal(r.excluidas.length, 1)
		assert.equal(r.excluidas[0]?.resultado, 'moneda_incoherente')
	})
	it('un abono parcial previo no vuelve incoherente la moneda', () => {
		const r = clasificarContrato(900101, [cuota('1', '2026 Agosto', 20)], REGLAS, HOY)
		assert.equal(r.candidatas.length, 1)
	})
	it('moneda distinta de USD no se importa', () => {
		assert.equal(clasificarContrato(900101, [fila({ moneda_sigla: 'VES' })], REGLAS, HOY).excluidas[0]?.resultado, 'moneda_no_usd')
	})
	it('respuestas que se contradicen dejan el contrato fuera', () => {
		const casos: Array<[string, unknown]> = [
			['no es una lista', { data: [] }],
			['lista vacía', []],
			['filas de otro contrato', [fila(), fila({ contrato_id: 900999, deuda_id: '7000099' })]],
			['cuota duplicada', [fila(), fila()]],
			['fila sin deuda mezclada con cuotas', [fila(), fila({ deuda_id: '0', deuda: 0 })]],
			['estado distinto entre filas', [fila({ deuda_id: '1' }), fila({ deuda_id: '2', estado: 'CORTADO' })]],
			['deuda no numérica', [fila({ deuda: '25' })]],
		]
		for (const [caso, respuesta] of casos) {
			const r = clasificarContrato(900101, respuesta, REGLAS, HOY)
			assert.equal(r.candidatas.length, 0, caso)
			assert.equal(r.excluidas[0]?.resultado, 'respuesta_inconsistente', caso)
		}
	})
	it('identificación inválida: el contrato no se importa', () => {
		assert.equal(clasificarContrato(900101, [fila({ identificacion_contrato: 'SIN-ID' })], REGLAS, HOY).excluidas[0]?.resultado, 'identificacion_invalida')
	})
	it('excluir por tipo de documento', () => {
		const r = clasificarContrato(900101, [fila({ identificacion_contrato: 'J-40123456-7' })], { ...REGLAS, tiposExcluidos: ['J'] }, HOY)
		assert.equal(r.excluidas[0]?.resultado, 'excluida_tipo_documento')
	})
	it('ventana de importación y máximo de recientes', () => {
		const filas = ['2026 Marzo', '2026 Abril', '2026 Mayo', '2026 Junio', '2026 Julio', '2026 Agosto', '2026 Septiembre', '2026 Octubre']
			.map((p, i) => cuota(String(i + 1), p, 35))
		const ventana = clasificarContrato(900101, filas, { ...REGLAS, ventanaMeses: 3 }, HOY)
		assert.deepEqual(ventana.candidatas.map(c => c.periodo), ['2026-07', '2026-08', '2026-09', '2026-10'])
		assert.equal(ventana.excluidas.filter(i => i.resultado === 'fuera_de_ventana').length, 4)
		const recientes = clasificarContrato(900101, filas, { ...REGLAS, maxCuotasRecientes: 2 }, HOY)
		assert.deepEqual(recientes.candidatas.map(c => c.periodo), ['2026-09', '2026-10'], 'se conservan las más recientes')
		assert.equal(recientes.excluidas.filter(i => i.resultado === 'excede_recientes').length, 6)
	})
	it('una cuota futura no se importa', () => {
		assert.equal(clasificarContrato(900101, [cuota('1', '2026 Noviembre')], REGLAS, HOY).excluidas[0]?.resultado, 'cuota_futura')
	})
})

describe('pagos: libro de cuotas', () => {
	/** A pago_informacion row (CUOTA mode). */
	const libro = (over: Record<string, unknown> = {}, idFactura = 8800100) => ({
		id_factura: idFactura, num_factura: idFactura ? String(idFactura).padStart(9, '0') : '', fecha_emision: '2026-10-13', id_contrato: 900101,
		detalle_pago: { id_contrato: 900101, id_cuota: 7000010, periodo_cuota: '2026-10', tarifa: 25, valor_pago: 25, saldo_cuota: 0, descuento: 0, ...over },
	})

	it('pagada: todas las filas coinciden, saldo 0 y algo pagado', () => {
		const ev = evaluarPago('7000010', 900101, 2500, [libro()])
		assert.equal(ev.resultado, 'pagada')
		assert.deepEqual(ev.facturaAdmin, { id: 8800100, numero: '008800100', fecha: '2026-10-13' })
	})
	it('varias facturas de cobro: se toma la última como la que la pagó', () => {
		const ev = evaluarPago('7000010', 900101, 2000, [
			{ ...libro({}, 8800001), fecha_emision: '2026-08-06' }, { ...libro({}, 8800200), fecha_emision: '2026-10-13' },
		])
		assert.equal(ev.facturaAdmin?.numero, '008800200')
	})
	it('abono parcial: saldo menor que el de Cobrix → sigue abierta', () => {
		const ev = evaluarPago('7000010', 900101, 2000, [libro({ saldo_cuota: 15, valor_pago: 5 })])
		assert.equal(ev.resultado, 'abono_parcial')
		assert.equal(ev.saldoAdminCents, 1500)
	})
	it('exonerada (saldo 0 sin nada pagado) no es un pago', () => {
		assert.equal(evaluarPago('7000010', 900101, 2500, [libro({ valor_pago: 0, descuento: -25 }, 0)]).resultado, 'exonerada')
	})
	it('sin evidencia: la cuota no aparece en el libro', () => {
		assert.equal(evaluarPago('7000010', 900101, 2500, [libro({ id_cuota: 7000099 })]).resultado, 'sin_evidencia')
		assert.equal(evaluarPago('7000010', 900101, 2500, []).resultado, 'sin_evidencia')
	})
	it('filas de la misma cuota que no coinciden: no se adivina', () => {
		assert.equal(evaluarPago('7000010', 900101, 2500, [libro(), libro({ saldo_cuota: 10, valor_pago: 15 }, 8800101)]).resultado, 'inconsistente')
	})
	it('pago anulado: la cuota vuelve a deber → sigue abierta', () => {
		assert.equal(evaluarPago('7000010', 900101, 2500, [libro({ saldo_cuota: 25, valor_pago: 0 })]).resultado, 'sigue_abierta')
	})
	it('la cuota asociada a otro contrato es inconsistente', () => {
		assert.equal(evaluarPago('7000010', 900101, 2500, [libro({ id_contrato: 900555 })]).resultado, 'inconsistente')
	})
	it('saldo 0 con pago pero sin factura de cobro: inconsistente', () => {
		assert.equal(evaluarPago('7000010', 900101, 2500, [libro({}, 0)]).resultado, 'inconsistente')
	})
})

describe('gráficos: marcas del eje', () => {
	it('usa pasos limpios (1, 2, 2.5 o 5 por potencia de 10) que cubren el máximo', async () => {
		const { ticks } = await import('../src/web/graficos.ts')
		assert.deepEqual(ticks(61_500), [0, 20_000, 40_000, 60_000, 80_000])
		assert.deepEqual(ticks(100), [0, 25, 50, 75, 100])
		assert.deepEqual(ticks(0), [0])
	})
})
