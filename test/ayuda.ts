/**
 * Test harness: a fresh invoice manager (its own SQLite copy) and an empty Cobrix, both in a
 * temp folder. Everything talks over real HTTP, like in production.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { SANDBOX_API_USER, seedBillingApi } from '../src/billing-api/seed.ts'
import { createBillingApiServer, type BillingApiServer } from '../src/billing-api/server.ts'
import { Sincronizador } from '../src/cobrix/sincronizacion.ts'
import { Store } from '../src/cobrix/store.ts'

process.env.SANDBOX_TODAY = '2026-10-13'

export interface Entorno {
	readonly api: BillingApiServer
	readonly apiUrl: string
	readonly store: Store
	readonly sync: Sincronizador
	/** Calls the cashier simulator (`/__sim/*`). */
	sim(path: string, body: unknown): Promise<Record<string, unknown>>
	cerrar(): Promise<void>
}

export async function crearEntorno(): Promise<Entorno> {
	const dir = mkdtempSync(join(tmpdir(), 'cobrix-test-'))
	seedBillingApi(join(dir, 'billing-api.sqlite'))
	const api = createBillingApiServer(join(dir, 'billing-api.sqlite'))
	const apiUrl = `http://127.0.0.1:${await api.listen(0)}`
	const store = new Store(join(dir, 'cobrix.sqlite'))
	store.guardarConfig('proveedor', { url: apiUrl, usuario: SANDBOX_API_USER.user_name, password: SANDBOX_API_USER.password })
	const sync = new Sincronizador(store)
	return {
		api, apiUrl, store, sync,
		async sim(path, body) {
			const res = await fetch(`${apiUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
			const json = await res.json() as Record<string, unknown>
			if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${JSON.stringify(json)}`)
			return json
		},
		async cerrar() {
			store.close()
			await api.close()
			rmSync(dir, { recursive: true, force: true })
		},
	}
}

/** Quick SQL reads over Cobrix's store. */
export function totales(store: Store): { clientes: number; abiertas: number; pagadas: number; montoAbiertoCents: number } {
	const one = (sql: string) => Number(Object.values(store.db.prepare(sql).get() as Record<string, unknown>)[0] ?? 0)
	return {
		clientes: one('SELECT COUNT(*) FROM clientes'),
		abiertas: one(`SELECT COUNT(*) FROM facturas WHERE estado = 'abierta'`),
		pagadas: one(`SELECT COUNT(*) FROM facturas WHERE estado = 'pagada'`),
		montoAbiertoCents: one(`SELECT COALESCE(SUM(saldo_cents), 0) FROM facturas WHERE estado = 'abierta'`),
	}
}
