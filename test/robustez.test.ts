/**
 * Robustness: failed runs are recorded, the API's quirks are handled and nothing is written
 * when a run cannot finish.
 */

import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { ClienteAdministrador } from '../src/cobrix/api.ts'
import { crearEntorno, totales, type Entorno } from './ayuda.ts'

describe('robustez', () => {
	let e: Entorno
	beforeEach(async () => { e = await crearEntorno() })
	afterEach(async () => { await e.cerrar() })

	it('credenciales malas: la corrida queda fallida, con el error y sin escribir nada', async () => {
		e.store.guardarConfig('proveedor', { url: e.apiUrl, usuario: 'cobrix', password: 'mala' })
		for (const tipo of ['importacion', 'pagadas'] as const) {
			const corrida = await e.sync.ejecutar(tipo, { simulacion: false })
			assert.equal(corrida.estado, 'fallida')
			assert.match(corrida.error ?? '', /Contraseña incorrecta/)
		}
		assert.equal(totales(e.store).abiertas, 0)
	})

	it('proveedor sin configurar: falla con un mensaje que dice qué hacer', async () => {
		e.store.guardarConfig('proveedor', { url: '', usuario: '', password: '' })
		const corrida = await e.sync.ejecutar('importacion', { simulacion: true })
		assert.equal(corrida.estado, 'fallida')
		assert.match(corrida.error ?? '', /Configuración/)
	})

	it('API caída a mitad de la importación: nada queda a medias', async () => {
		let llamadas = 0
		const fetchFalla: typeof fetch = async (input, init) => {
			if (String(input).includes('contrato/individual') && ++llamadas > 10) throw new TypeError('fetch failed')
			return fetch(input, init)
		}
		const { Sincronizador } = await import('../src/cobrix/sincronizacion.ts')
		const corrida = await new Sincronizador(e.store, fetchFalla).ejecutar('importacion', { simulacion: false })
		assert.equal(corrida.estado, 'fallida')
		assert.match(corrida.error ?? '', /no se pudo conectar/)
		assert.deepEqual(totales(e.store), { clientes: 0, abiertas: 0, pagadas: 0, montoAbiertoCents: 0 })
	})

	it('error HTTP en un contrato: se registra y el resto sigue', async () => {
		const fetch500: typeof fetch = async (input, init) => {
			if (String(input).includes('id_contrato=900101')) return new Response(JSON.stringify({ detail: 'boom' }), { status: 500 })
			return fetch(input, init)
		}
		const { Sincronizador } = await import('../src/cobrix/sincronizacion.ts')
		const corrida = await new Sincronizador(e.store, fetch500).ejecutar('importacion', { simulacion: false })
		assert.equal(corrida.estado, 'completada')
		assert.equal(corrida.resumen.errores_api, 1)
		assert.equal(corrida.resumen.importadas, 39, 'las 3 cuotas de ANA PEREZ quedan para la próxima corrida')
		const item = e.store.itemsCorrida(corrida.id).find(i => i.resultado === 'error_api')
		assert.match(item?.motivo ?? '', /error interno/)
	})

	it('no se pueden lanzar dos corridas a la vez', async () => {
		const primera = e.sync.iniciar('importacion', { simulacion: true })
		assert.throws(() => e.sync.iniciar('pagadas', { simulacion: true }), /Ya hay una corrida en curso/)
		await primera.terminada
		const segunda = await e.sync.ejecutar('pagadas', { simulacion: true })
		assert.equal(segunda.estado, 'completada')
	})

	it('token vencido o revocado: vuelve a iniciar sesión una vez y sigue', async () => {
		let rechazos = 0
		const fetch401: typeof fetch = async (input, init) => {
			if (String(input).includes('lista_ids_contratos') && rechazos++ === 0) return new Response('{"detail":{"type":"auth_api"}}', { status: 401 })
			return fetch(input, init)
		}
		const api = new ClienteAdministrador({ url: e.apiUrl, usuario: 'cobrix', password: 'cobrix-sandbox' }, fetch401)
		assert.equal((await api.listaContratos()).length, 27)
		assert.equal(rechazos, 2)
	})

	it('nunca manda «estado» a lista_ids_contratos (devolvería solo los activos)', async () => {
		const urls: string[] = []
		const espia: typeof fetch = async (input, init) => { urls.push(String(input)); return fetch(input, init) }
		await new ClienteAdministrador({ url: e.apiUrl, usuario: 'cobrix', password: 'cobrix-sandbox' }, espia).listaContratos()
		assert.ok(urls.some(u => u.includes('lista_ids_contratos')) && !urls.some(u => u.includes('estado=')))
	})

	it('el libro llega con success: false y aun así se usa', async () => {
		await e.sync.ejecutar('importacion', { simulacion: false })
		await e.sim('/__sim/pagar', { id_contrato: 900104 })
		const corrida = await e.sync.ejecutar('pagadas', { simulacion: false })
		assert.equal(corrida.resumen.pagadas, 2)
	})

	it('la restricción UNIQUE impide duplicar una cuota aunque se intente por fuera', async () => {
		await e.sync.ejecutar('importacion', { simulacion: false })
		const una = e.store.db.prepare('SELECT * FROM facturas LIMIT 1').get() as Record<string, string | number>
		assert.throws(() => e.store.db.prepare(`INSERT INTO facturas (deuda_id, cliente_id, contrato_id, periodo, descripcion, vencimiento, corte, total_cents, saldo_cents, estado, importada_en)
			VALUES (?, ?, ?, '2026-10', 'x', '2026-10-01', '2026-10-01', 100, 100, 'abierta', 'x')`).run(una.deuda_id!, una.cliente_id!, una.contrato_id!), /UNIQUE/)
	})

	it('topes por corrida: lo que excede queda frenado y entra en la siguiente', async () => {
		e.store.guardarConfig('importacion', { ...e.store.config().importacion, topeFacturas: 10, topeMontoCents: null })
		const primera = await e.sync.ejecutar('importacion', { simulacion: false })
		assert.equal(primera.resumen.importadas, 10)
		assert.equal(primera.resumen.frenadas_tope, 32)
		e.store.guardarConfig('importacion', { ...e.store.config().importacion, topeFacturas: null, topeMontoCents: 30_000 })
		const segunda = await e.sync.ejecutar('importacion', { simulacion: false })
		assert.ok(segunda.resumen.monto_importado_cents! <= 30_000)
		assert.equal(segunda.resumen.ya_importadas, 10)
	})

	it('días de gracia: el corte es el vencimiento más los días configurados', async () => {
		e.store.guardarConfig('importacion', { ...e.store.config().importacion, diasGracia: 5 })
		await e.sync.ejecutar('importacion', { simulacion: false })
		const f = e.store.db.prepare(`SELECT vencimiento, corte FROM facturas WHERE periodo = '2026-08' LIMIT 1`).get() as Record<string, string>
		assert.deepEqual({ ...f }, { vencimiento: '2026-08-01', corte: '2026-08-06' })
	})
})
