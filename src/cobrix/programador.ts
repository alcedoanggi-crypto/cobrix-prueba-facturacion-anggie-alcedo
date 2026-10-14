/**
 * Daily automatic run (ENUNCIADO §3.1): at the chosen time in America/Caracas, import and then
 * update paid invoices. Checks every 30 s; a day is never run twice, even after a restart.
 */

import { today } from '../shared/dates.ts'
import { CorridaEnCurso, type Sincronizador } from './sincronizacion.ts'
import type { Store } from './store.ts'

const CLAVE_ULTIMA = 'meta:ultima_automatica'

export function horaCaracas(ahora = new Date()): string {
	return new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ahora)
}

export function ultimaAutomatica(store: Store): string | null {
	const row = store.db.prepare('SELECT valor FROM config WHERE clave = ?').get(CLAVE_ULTIMA) as { valor: string } | undefined
	return row ? (JSON.parse(row.valor) as string) : null
}

/** Human description of the next automatic run, for the panel. */
export function proximaAutomatica(store: Store, ahora = new Date()): string | null {
	const { activa, hora } = store.config().automatica
	if (!activa) return null
	if (ultimaAutomatica(store) === today()) return `Mañana a las ${hora} (hora de Caracas)`
	if (horaCaracas(ahora) >= hora) return 'En menos de un minuto (la hora de hoy ya pasó y aún no se ejecutó)'
	return `Hoy a las ${hora} (hora de Caracas)`
}

/** Runs import + paid update if it is due. Returns true when it ran. */
export async function ejecutarSiCorresponde(store: Store, sync: Sincronizador, ahora = new Date()): Promise<boolean> {
	const { activa, hora } = store.config().automatica
	const dia = today()
	if (!activa || horaCaracas(ahora) < hora || ultimaAutomatica(store) === dia || sync.corridaEnCurso !== null) return false
	// Mark the day first: if the import fails, the operator sees the failed run instead of a retry loop.
	store.db.prepare('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor').run(CLAVE_ULTIMA, JSON.stringify(dia))
	try {
		const importacion = await sync.ejecutar('importacion', { simulacion: false, origen: 'automatica' })
		if (importacion.estado === 'completada') await sync.ejecutar('pagadas', { simulacion: false, origen: 'automatica' })
	} catch (error) {
		if (!(error instanceof CorridaEnCurso)) throw error
	}
	return true
}

export function iniciarProgramador(store: Store, sync: Sincronizador, intervaloMs = 30_000): () => void {
	const timer = setInterval(() => {
		ejecutarSiCorresponde(store, sync).catch((error: unknown) => console.error('[cobrix] corrida automática', error))
	}, intervaloMs)
	timer.unref()
	return () => clearInterval(timer)
}
