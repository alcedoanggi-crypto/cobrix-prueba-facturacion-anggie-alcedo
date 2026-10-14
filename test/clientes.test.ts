/**
 * Customers created by hand and the JSON endpoints behind the modals.
 */

import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createApp } from '../src/web/app.ts'
import { crearEntorno, totales, type Entorno } from './ayuda.ts'

describe('clientes creados a mano y modales', () => {
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

	const postJson = async (path: string, campos: Record<string, string>) => {
		const res = await fetch(`${base}${path}`, { method: 'POST', body: new URLSearchParams(campos), headers: { accept: 'application/json' } })
		return { status: res.status, body: await res.json() as Record<string, unknown> }
	}

	it('vista previa del documento: la misma normalización que la importación', async () => {
		const ok = await (await fetch(`${base}/api/identificacion?doc=${encodeURIComponent('j-40.123.456-7')}`)).json() as Record<string, unknown>
		assert.deepEqual({ id: ok.id, persona: ok.persona, existe: ok.existe }, { id: 'J401234567', persona: 'juridica', existe: null })
		const mal = await (await fetch(`${base}/api/identificacion?doc=123`)).json() as Record<string, unknown>
		assert.equal(mal.ok, false)
		assert.match(String(mal.error), /6 a 12 dígitos/)
	})

	it('crear cliente valida cada campo y dice cuál corregir', async () => {
		const sinNombre = await postJson('/clientes', { documento: 'V-30111222', nombre: 'A', correo: '', telefono: '' })
		assert.equal(sinNombre.status, 422)
		assert.equal(sinNombre.body.campo, 'nombre')
		assert.equal((await postJson('/clientes', { documento: 'X1', nombre: 'Ana Ruiz', correo: '', telefono: '' })).body.campo, 'documento')
		assert.equal((await postJson('/clientes', { documento: 'V-30111222', nombre: 'Ana Ruiz', correo: 'no-es-correo', telefono: '' })).body.campo, 'correo')
	})

	it('crea el cliente y no permite repetir el documento aunque se escriba distinto', async () => {
		const creado = await postJson('/clientes', { documento: 'V-30.111.222', nombre: 'ana  ruiz', correo: 'ANA@X.COM', telefono: '0412 1234567' })
		assert.equal(creado.body.ok, true)
		const fila = e.store.db.prepare(`SELECT id_externo, nombre, correo, origen FROM clientes WHERE id_externo = 'V30111222'`).get() as Record<string, unknown>
		assert.deepEqual({ ...fila }, { id_externo: 'V30111222', nombre: 'ANA RUIZ', correo: 'ana@x.com', origen: 'Creado en Cobrix' })
		const repetido = await postJson('/clientes', { documento: 'v30111222', nombre: 'Otra', correo: '', telefono: '' })
		assert.equal(repetido.status, 422)
		assert.match(String(repetido.body.error), /Ya existe un cliente/)
	})

	it('si la importación trae a un titular creado a mano, se agrega a ese cliente sin duplicarlo', async () => {
		await postJson('/clientes', { documento: 'V-09876543', nombre: 'Luis Gomez', correo: '', telefono: '' })
		await e.sync.ejecutar('importacion', { simulacion: false })
		const luis = e.store.db.prepare(`SELECT c.origen, COUNT(DISTINCT k.id) AS contratos, COUNT(DISTINCT f.id) AS facturas
			FROM clientes c JOIN contratos k ON k.cliente_id = c.id JOIN facturas f ON f.cliente_id = c.id WHERE c.id_externo = 'V9876543' GROUP BY c.id`).get() as Record<string, unknown>
		assert.deepEqual({ ...luis }, { origen: 'Creado en Cobrix', contratos: 2, facturas: 5 })
		assert.equal(totales(e.store).clientes, 21, '20 del ISP (uno ya existía) + ANA RUIZ creada a mano')
		assert.equal(totales(e.store).abiertas, 42, 'las facturas no cambian')
	})

	it('editar contacto queda en el historial y valida', async () => {
		const id = (e.store.db.prepare(`SELECT id FROM clientes WHERE id_externo = 'V30111222'`).get() as { id: number }).id
		assert.equal((await postJson(`/clientes/${id}/contacto`, { correo: 'mal', telefono: '' })).body.campo, 'correo')
		assert.equal((await postJson(`/clientes/${id}/contacto`, { correo: 'nuevo@x.com', telefono: '0414 7654321' })).body.ok, true)
		const ev = e.store.db.prepare(`SELECT detalle FROM eventos WHERE cliente_id = ? AND tipo = 'contacto_actualizado'`).get(id) as { detalle: string }
		assert.match(ev.detalle, /ana@x\.com → nuevo@x\.com/)
	})

	it('detalle de factura con su historia', async () => {
		const id = (e.store.db.prepare('SELECT id FROM facturas LIMIT 1').get() as { id: number }).id
		const f = await (await fetch(`${base}/api/facturas/${id}`)).json() as Record<string, unknown>
		assert.match(String(f.numero), /^FAC-\d{6}$/)
		assert.ok(Array.isArray(f.eventos) && (f.eventos as unknown[]).length >= 1)
		assert.equal((await fetch(`${base}/api/facturas/999999`)).status, 404)
	})

	it('probar conexión paso a paso dice dónde falla', async () => {
		const ok = await postJson('/api/probar-conexion', { url: e.apiUrl, usuario: 'cobrix', password: '' })
		const pasos = ok.body.pasos as Array<{ titulo: string; ok: boolean; detalle: string }>
		assert.deepEqual(pasos.map(p => p.ok), [true, true, true])
		assert.match(pasos[2]!.detalle, /27 contratos/)
		const mala = await postJson('/api/probar-conexion', { url: e.apiUrl, usuario: 'cobrix', password: 'mala' })
		const p2 = mala.body.pasos as Array<{ ok: boolean; detalle: string }>
		assert.deepEqual(p2.map(p => p.ok), [true, false])
		assert.match(p2[1]!.detalle, /Contraseña incorrecta/)
	})

	it('sin JavaScript, el modal de nuevo cliente se abre en la página con ?nuevo=1', async () => {
		const html = await (await fetch(`${base}/clientes?nuevo=1`)).text()
		assert.match(html, /<dialog class="modal" id="m-nuevo-cliente"[^>]*open/)
	})
})
