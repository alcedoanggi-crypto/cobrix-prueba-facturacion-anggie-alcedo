/**
 * Starts the test environment in one process:
 *   - the invoice manager API over data/billing-api.sqlite  (BILLING_API_PORT, default 4310)
 *   - the panel skeleton                                     (PORT, default 4300)
 *
 * The provided database was generated for 2026-10-13. That date is pinned by default so
 * the acceptance numbers in docs/ENUNCIADO.md hold; set SANDBOX_TODAY to change it.
 */

import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.SANDBOX_TODAY ??= '2026-10-13'

const { DEFAULT_BILLING_API_DB, seedBillingApi } = await import('./billing-api/seed.ts')
const { createBillingApiServer } = await import('./billing-api/server.ts')
const { createApp } = await import('./web/app.ts')
const { Store } = await import('./cobrix/store.ts')
const { Sincronizador } = await import('./cobrix/sincronizacion.ts')
const { iniciarProgramador } = await import('./cobrix/programador.ts')
const { SANDBOX_API_USER } = await import('./billing-api/seed.ts')

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const billingApiDb = process.env.BILLING_API_DB ?? DEFAULT_BILLING_API_DB
const appPort = Number(process.env.PORT ?? 4300)
const billingApiPort = Number(process.env.BILLING_API_PORT ?? 4310)
const host = process.env.HOST ?? '127.0.0.1'

if (!existsSync(billingApiDb)) seedBillingApi(billingApiDb)

const billingApi = createBillingApiServer(billingApiDb)
await billingApi.listen(billingApiPort, host)
const simulatorUrl = `http://${host}:${billingApiPort}`

// Cobrix keeps its own data apart from the invoice manager's database.
const store = new Store(process.env.COBRIX_DB ?? resolve(root, 'data/cobrix.sqlite'))
// First start in the sandbox: preload the provider so the panel works right away (editable in Configuración).
if (!store.tieneConfig('proveedor')) {
	store.guardarConfig('proveedor', { url: simulatorUrl, usuario: SANDBOX_API_USER.user_name, password: SANDBOX_API_USER.password })
}
const sync = new Sincronizador(store)
const detenerProgramador = iniciarProgramador(store, sync)

const app = createApp({ simulatorUrl, assignmentPath: resolve(root, 'docs/ENUNCIADO.md'), store, sync })
app.listen(appPort, host)

console.log(`Panel de Cobrix:          http://${host}:${appPort}`)
console.log(`API del administrador:    ${simulatorUrl}/api/v1`)
console.log(`Swagger:                  ${simulatorUrl}/docs`)
console.log(`Fecha de la prueba:       ${process.env.SANDBOX_TODAY}`)

const shutdown = (): void => {
	detenerProgramador()
	app.close()
	store.close()
	void billingApi.close().then(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
