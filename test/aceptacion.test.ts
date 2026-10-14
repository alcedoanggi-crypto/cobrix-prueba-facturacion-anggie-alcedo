/**
 * Acceptance criteria of ENUNCIADO §5, end to end over HTTP:
 * simulate → import → import again → pay in the cashier → simulate update → update → update again.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { crearEntorno, totales, type Entorno } from './ayuda.ts'

describe('criterios de aceptación (ciclo completo)', () => {
	let e: Entorno
	before(async () => { e = await crearEntorno() })
	after(async () => { await e.cerrar() })

	it('simular importación: 42 cuotas se importarían y no se crea nada', async () => {
		const corrida = await e.sync.ejecutar('importacion', { simulacion: true })
		assert.equal(corrida.estado, 'completada')
		assert.equal(corrida.simulacion, true)
		assert.equal(corrida.resumen.importadas, 42)
		assert.equal(corrida.resumen.monto_importado_cents, 123_500)
		assert.deepEqual(totales(e.store), { clientes: 0, abiertas: 0, pagadas: 0, montoAbiertoCents: 0 })
	})

	it('importar: 20 clientes y 42 facturas abiertas por USD 1.235,00, con las exclusiones esperadas', async () => {
		const corrida = await e.sync.ejecutar('importacion', { simulacion: false })
		assert.equal(corrida.estado, 'completada', corrida.error ?? '')
		assert.deepEqual(totales(e.store), { clientes: 20, abiertas: 42, pagadas: 0, montoAbiertoCents: 123_500 })
		assert.equal(corrida.resumen.clientes_nuevos, 20)
		assert.equal(corrida.resumen.excluidas_estado, 9)
		assert.equal(corrida.resumen.contratos_moneda_incoherente, 1)
		assert.equal(corrida.resumen.saldo_residual, 1)
		assert.equal(corrida.resumen.contratos, 27)
	})

	it('importar otra vez: 0 facturas nuevas', async () => {
		const corrida = await e.sync.ejecutar('importacion', { simulacion: false })
		assert.equal(corrida.resumen.importadas, 0)
		assert.equal(corrida.resumen.ya_importadas, 42)
		assert.deepEqual(totales(e.store), { clientes: 20, abiertas: 42, pagadas: 0, montoAbiertoCents: 123_500 })
	})

	it('LUIS GOMEZ es un cliente con 2 contratos y ELENA RUIZ tiene ID 9000123', () => {
		const luis = e.store.db.prepare(`SELECT c.id_externo, COUNT(k.id) AS contratos FROM clientes c JOIN contratos k ON k.cliente_id = c.id
			WHERE c.nombre = 'LUIS GOMEZ' GROUP BY c.id`).all() as Array<{ id_externo: string; contratos: number }>
		assert.deepEqual(luis.map(r => ({ ...r })), [{ id_externo: 'V9876543', contratos: 2 }])
		const elena = e.store.db.prepare(`SELECT id_externo, persona FROM clientes WHERE nombre = 'ELENA RUIZ'`).get() as Record<string, unknown>
		assert.deepEqual({ ...elena }, { id_externo: '9000123', persona: 'natural' })
	})

	it('no aparecen los titulares excluidos', () => {
		const nombres = (e.store.db.prepare('SELECT nombre FROM clientes').all() as Array<{ nombre: string }>).map(r => r.nombre)
		for (const excluido of ['CARLOS ROJAS', 'ROSA DIAZ', 'PEDRO LEON', 'ANDRES VARGAS', 'LAURA MENDEZ', 'JORGE CASTILLO']) {
			assert.ok(!nombres.includes(excluido), `${excluido} no debería ser cliente`)
		}
		const faro = e.store.db.prepare(`SELECT persona FROM clientes WHERE nombre = 'COMERCIAL EL FARO, C.A.'`).get() as { persona: string }
		assert.equal(faro.persona, 'juridica')
	})

	it('pagos en la caja del ISP → actualizar pagadas: 8 pagadas y 34 abiertas por USD 955,00', async () => {
		await e.sim('/__sim/pagar', { id_contrato: 900101 })
		await e.sim('/__sim/pagar', { id_contrato: 900103, monto: 25 })
		await e.sim('/__sim/pagar', { id_contrato: 900104 })
		await e.sim('/__sim/pagar', { id_contrato: 900114, monto: 70 })
		const elena = await e.sim('/__sim/pagar', { id_contrato: 900113 })
		await e.sim('/__sim/anular', { id_factura: elena.id_factura })

		const simulada = await e.sync.ejecutar('pagadas', { simulacion: true })
		assert.equal(simulada.resumen.pagadas, 8)
		assert.equal(totales(e.store).pagadas, 0, 'la simulación no escribe')

		const corrida = await e.sync.ejecutar('pagadas', { simulacion: false })
		assert.equal(corrida.estado, 'completada', corrida.error ?? '')
		assert.equal(corrida.resumen.pagadas, 8)
		assert.equal(corrida.resumen.abonos_parciales, 1)
		assert.equal(corrida.resumen.sin_evidencia, 0)
		assert.deepEqual(totales(e.store), { clientes: 20, abiertas: 34, pagadas: 8, montoAbiertoCents: 95_500 })

		const porCliente = (nombre: string) => e.store.db.prepare(`SELECT f.estado, f.periodo, f.contrato_id FROM facturas f JOIN clientes c ON c.id = f.cliente_id
			WHERE c.nombre = ? ORDER BY f.contrato_id, f.periodo`).all(nombre) as Array<{ estado: string; periodo: string; contrato_id: number }>
		assert.ok(porCliente('ANA PEREZ').every(f => f.estado === 'pagada'))
		assert.equal(porCliente('ANA PEREZ').length, 3)
		assert.deepEqual(porCliente('LUIS GOMEZ').filter(f => f.contrato_id === 900103).map(f => f.estado), ['pagada', 'abierta', 'abierta', 'abierta'])
		assert.ok(porCliente('COMERCIAL EL FARO, C.A.').every(f => f.estado === 'pagada'))
		assert.deepEqual(porCliente('MIGUEL ANGEL SOTO').map(f => f.estado).slice(0, 3), ['pagada', 'pagada', 'abierta'])
		assert.ok(porCliente('ELENA RUIZ').every(f => f.estado === 'abierta'), 'el pago anulado no cuenta')
	})

	it('repetir la actualización no cambia nada', async () => {
		const corrida = await e.sync.ejecutar('pagadas', { simulacion: false })
		assert.equal(corrida.resumen.pagadas, 0)
		assert.deepEqual(totales(e.store), { clientes: 20, abiertas: 34, pagadas: 8, montoAbiertoCents: 95_500 })
		const abonos = e.store.db.prepare(`SELECT COUNT(*) AS n FROM eventos WHERE tipo = 'abono_parcial'`).get() as { n: number }
		assert.equal(abonos.n, 1, 'el mismo abono no se registra dos veces en el historial')
	})
})
