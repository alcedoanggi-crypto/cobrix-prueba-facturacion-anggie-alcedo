/**
 * The panel over HTTP: forms validate and save, runs start from the UI, every screen renders
 * with real data, and the daily automatic run fires once a day.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { ejecutarSiCorresponde, horaCaracas, proximaAutomatica } from '../src/cobrix/programador.ts'
import { createApp } from '../src/web/app.ts'
import { crearEntorno, totales, type Entorno } from './ayuda.ts'

describe('panel', () => {
	let e: Entorno
	let panel: ReturnType<typeof createApp>
	let base: string

	before(async () => {
		e = await crearEntorno()
		panel = createApp({ simulatorUrl: e.apiUrl, assignmentPath: fileURLToPath(new URL('../docs/ENUNCIADO.md', import.meta.url)), store: e.store, sync: e.sync })
		await new Promise<void>(resolve => panel.listen(0, '127.0.0.1', resolve))
		const address = panel.address()
		base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
	})
	after(async () => {
		await new Promise(resolve => panel.close(resolve))
		await e.cerrar()
	})

	const post = (path: string, campos: Record<string, string | string[]>) => {
		const body = new URLSearchParams()
		for (const [k, v] of Object.entries(campos)) for (const x of [v].flat()) body.append(k, x)
		return fetch(`${base}${path}`, { method: 'POST', body, redirect: 'manual' })
	}
	const flash = (res: Response) => decodeURIComponent(new URL(res.headers.get('location')!, base).searchParams.get('msg') ?? '')

	it('valida la empresa y explica qué corregir', async () => {
		const mala = await post('/configuracion/empresa', { nombre: 'X', rif: '123', correo: 'no-es-correo' })
		assert.equal(mala.status, 303)
		assert.match(flash(mala), /correo de cobranza no es válido/)
		const buena = await post('/configuracion/empresa', { nombre: 'Cobranzas Andinas', rif: 'j-41234567-8', correo: 'cobranza@andinas.com' })
		assert.match(flash(buena), /guardados/)
		assert.equal(e.store.config().empresa.rif, 'J-41234567-8')
	})

	it('la contraseña del proveedor no se muestra y, vacía, se conserva', async () => {
		const html = await (await fetch(`${base}/configuracion`)).text()
		assert.ok(!html.includes('cobrix-sandbox'), 'la contraseña nunca llega al HTML')
		await post('/configuracion/proveedor', { url: e.apiUrl, usuario: 'cobrix', password: '' })
		assert.equal(e.store.config().proveedor.password, 'cobrix-sandbox')
	})

	it('probar conexión dice cuántos contratos hay, o por qué falló', async () => {
		assert.match(flash(await post('/configuracion/probar', { url: e.apiUrl, usuario: 'cobrix', password: '' })), /27 contratos/)
		assert.match(flash(await post('/configuracion/probar', { url: e.apiUrl, usuario: 'cobrix', password: 'mala' })), /Contraseña incorrecta/)
		assert.match(flash(await post('/configuracion/probar', { url: 'http://127.0.0.1:1', usuario: 'cobrix', password: 'x' })), /no se pudo conectar/)
	})

	it('valida las reglas de importación', async () => {
		assert.match(flash(await post('/configuracion/importacion', { dias_gracia: '0' })), /al menos un estado/)
		assert.match(flash(await post('/configuracion/importacion', { estados: ['ACTIVO'], dias_gracia: '90' })), /entre 0 y 60/)
		assert.match(flash(await post('/configuracion/importacion', { estados: ['ACTIVO'], dias_gracia: '0', max_recientes: '61' })), /entre 1 y 60/)
		await post('/configuracion/importacion', { estados: ['ACTIVO', 'CORTADO'], ventana: '', dias_gracia: '0', tope_monto: '' })
		assert.deepEqual(e.store.config().importacion.estados, ['ACTIVO', 'CORTADO'])
	})

	it('lanzar una corrida desde el panel lleva a su detalle con el progreso', async () => {
		const res = await post('/sincronizacion/ejecutar', { tipo: 'importacion', simulacion: '0' })
		assert.equal(res.status, 303)
		const id = Number(res.headers.get('location')!.split('/').pop())
		const vivo = await (await fetch(`${base}/api/corridas/${id}`)).json() as { estado: string }
		assert.ok(['en_curso', 'completada'].includes(vivo.estado))
		while (e.sync.corridaEnCurso !== null) await new Promise(r => setTimeout(r, 50))
		assert.equal(totales(e.store).abiertas, 42)
		const detalle = await (await fetch(`${base}/sincronizacion/${id}?resultado=excluida_estado`)).text()
		assert.match(detalle, /Excluida por estado <b>9<\/b>/)
		const csv = await (await fetch(`${base}/sincronizacion/${id}/csv`)).text()
		assert.equal(csv.trim().split('\r\n').length, 1 + 54, 'cabecera + una fila por cuota o contrato excluido')
	})

	it('las pantallas muestran los datos importados', async () => {
		const resumen = await (await fetch(`${base}/`)).text()
		assert.match(resumen, /USD 1\.235,00/)
		const clientes = await (await fetch(`${base}/clientes?q=9876543`)).text()
		assert.match(clientes, /LUIS GOMEZ/)
		assert.doesNotMatch(clientes, /ANA PEREZ/)
		assert.match(await (await fetch(`${base}/clientes?q=V-9.876.543`)).text(), /LUIS GOMEZ/, 'busca con separadores')
		const id = (e.store.db.prepare(`SELECT id FROM clientes WHERE nombre = 'LUIS GOMEZ'`).get() as { id: number }).id
		const exp = await (await fetch(`${base}/clientes/${id}`)).text()
		assert.match(exp, /900102/)
		assert.match(exp, /900103/)
		assert.match(exp, /Cliente creado/)
	})

	it('vaciar datos exige confirmación explícita', async () => {
		assert.match(flash(await post('/configuracion/vaciar', {})), /Entiendo que no se puede deshacer/)
		assert.equal(totales(e.store).abiertas, 42)
		await post('/configuracion/vaciar', { confirmo: '1' })
		assert.deepEqual(totales(e.store), { clientes: 0, abiertas: 0, pagadas: 0, montoAbiertoCents: 0 })
	})

	it('corrida automática: corre una vez al día después de la hora elegida', async () => {
		const ahora = new Date()
		const hora = horaCaracas(ahora)
		e.store.guardarConfig('automatica', { activa: true, hora: '00:00' })
		assert.ok(await ejecutarSiCorresponde(e.store, e.sync, ahora))
		assert.equal(totales(e.store).abiertas, 42)
		const automaticas = e.store.corridas().filter(c => c.origen === 'automatica').map(c => c.tipo)
		assert.deepEqual(automaticas, ['pagadas', 'importacion'], 'importa y después actualiza pagadas')
		assert.equal(await ejecutarSiCorresponde(e.store, e.sync, ahora), false, 'no se repite el mismo día')
		assert.match(proximaAutomatica(e.store, ahora) ?? '', /Mañana a las 00:00/)
		e.store.guardarConfig('automatica', { activa: false, hora })
		assert.equal(proximaAutomatica(e.store, ahora), null)
	})
})

describe('script del panel', () => {
	it('se ejecuta sin errores (los dos módulos unidos no se interpretan como una sola llamada)', async () => {
		const vm = await import('node:vm')
		const { JS_PANEL } = await import('../src/web/estilos.ts')
		const { JS_MODALES } = await import('../src/web/estilos-modales.ts')
		// A do-nothing DOM: any property is another stub, any call returns a stub, lists are empty.
		const stub: object = new Proxy(function () {}, {
			get: (_t, k) => (k === Symbol.iterator ? function* () {} : k === 'then' ? undefined : k === 'dataset' ? {} : stub),
			apply: () => stub, construct: () => stub, set: () => true,
		})
		const contexto = { document: stub, window: stub, location: stub, fetch: stub, FormData: stub, setTimeout: () => 0, clearTimeout: () => {}, URLSearchParams, Intl, JSON, Math, console }
		assert.doesNotThrow(() => vm.runInNewContext(`${JS_PANEL};\n${JS_MODALES}`, contexto))
		assert.throws(() => vm.runInNewContext(`${JS_PANEL}\n${JS_MODALES}`, contexto), /is not a function/, 'sin «;» falla: así se detectó el error')
	})
})
