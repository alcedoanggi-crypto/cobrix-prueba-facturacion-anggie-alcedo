/**
 * HTTP client of the invoice manager API. It only knows the wire: login with a 2 h token,
 * re-login on expiry, timeouts and readable errors. Interpreting the data is reglas.ts's job.
 */

export interface Credenciales {
	readonly url: string
	readonly usuario: string
	readonly password: string
}

/** An error the operator can act on: `message` says what happened and how to continue. */
export class ErrorApi extends Error {
	readonly status: number | null
	constructor(message: string, status: number | null = null) {
		super(message)
		this.name = 'ErrorApi'
		this.status = status
	}
}

type Row = Record<string, unknown>

const TIMEOUT_MS = 15_000
/** Renew the token this long before it expires, so a long run never uses a dying token. */
const MARGEN_TOKEN_MS = 60_000

export class ClienteAdministrador {
	readonly #cred: Credenciales
	readonly #fetch: typeof fetch
	#token: { valor: string; vence: number } | null = null

	constructor(cred: Credenciales, fetchImpl: typeof fetch = fetch) {
		this.#cred = { ...cred, url: cred.url.replace(/\/+$/, '') }
		this.#fetch = fetchImpl
	}

	async login(): Promise<{ usuario: string; venceUtc: string }> {
		const body = await this.#request('POST', '/api/v1/usuario/login', { user_name: this.#cred.usuario, password: this.#cred.password }, false)
		if (typeof body !== 'object' || body === null || typeof (body as Row).access_token !== 'string') {
			throw new ErrorApi('El login respondió sin token. Revisa que la URL apunte a la API del administrador.')
		}
		const row = body as Row
		// The expiry comes as naive UTC («2026-10-13T10:00:00»): read it explicitly as UTC.
		const venceTexto = typeof row.access_token_expires_in === 'string' ? row.access_token_expires_in : ''
		const vence = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(venceTexto) ? venceTexto : `${venceTexto}Z`)
		this.#token = { valor: row.access_token as string, vence: Number.isFinite(vence) ? vence : Date.now() + 60 * 60_000 }
		return { usuario: String(row.usuario ?? this.#cred.usuario), venceUtc: venceTexto }
	}

	/** All contract ids. `estado` is never sent: any value makes the API return only active ones. */
	async listaContratos(): Promise<number[]> {
		const body = await this.#get('/api/v1/isp/lista_ids_contratos', {})
		const data = (body as Row | null)?.data
		if (!Array.isArray(data) || !data.every(id => Number.isInteger(id))) {
			throw new ErrorApi('La lista de contratos llegó con un formato inesperado; no se puede recorrer con seguridad.')
		}
		const pag = (body as Row).pagination as Row | undefined
		if (pag && typeof pag.total === 'number' && pag.total !== data.length) {
			throw new ErrorApi(`La API dice que hay ${pag.total} contratos pero envió ${data.length}; la corrida se detiene para no dejar contratos fuera.`)
		}
		return data as number[]
	}

	/** Raw answer of contrato/individual: validated by reglas.clasificarContrato. */
	contratoIndividual(idContrato: number): Promise<unknown> {
		return this.#get('/api/v1/isp/contrato/individual', { id_contrato: String(idContrato) })
	}

	/** Rows of the installment ledger (`success` is ignored: it comes false even with data). */
	async libroCuotas(idContrato: number, desde: string, hasta: string): Promise<unknown[]> {
		const body = await this.#get('/api/v1/isp/pago_informacion', {
			id_contrato: String(idContrato), tipo_busqueda: 'CUOTA', fecha_inicio: desde, fecha_fin: hasta,
		})
		const data = (body as Row | null)?.data
		if (!Array.isArray(data)) throw new ErrorApi(`El libro de pagos del contrato ${idContrato} llegó sin lista de datos.`)
		return data
	}

	async #get(path: string, query: Record<string, string>): Promise<unknown> {
		const qs = new URLSearchParams(query).toString()
		return this.#request('GET', qs ? `${path}?${qs}` : path, undefined, true)
	}

	async #request(method: string, path: string, body: unknown, auth: boolean, reintento = false): Promise<unknown> {
		if (auth && (!this.#token || this.#token.vence - MARGEN_TOKEN_MS < Date.now())) await this.login()
		const headers: Record<string, string> = { accept: 'application/json' }
		if (body !== undefined) headers['content-type'] = 'application/json'
		if (auth && this.#token) headers.authorization = `Bearer ${this.#token.valor}`

		let res: Response
		try {
			res = await this.#fetch(`${this.#cred.url}${path}`, {
				method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS),
			})
		} catch (error) {
			const causa = error instanceof Error && error.name === 'TimeoutError' ? `no respondió en ${TIMEOUT_MS / 1000} s` : 'no se pudo conectar'
			throw new ErrorApi(`La API del administrador ${causa} (${this.#cred.url}). Revisa la URL y que el servicio esté en línea.`)
		}

		const text = await res.text()
		let parsed: unknown = undefined
		try {
			parsed = text ? JSON.parse(text) : undefined
		} catch {
			throw new ErrorApi(`La API respondió algo que no es JSON (HTTP ${res.status}) en ${path.split('?')[0]}.`, res.status)
		}

		// A token that expired early or was revoked: log in again once.
		if (res.status === 401 && auth && !reintento) {
			this.#token = null
			return this.#request(method, path, body, auth, true)
		}
		if (!res.ok) throw new ErrorApi(mensajeError(res.status, parsed, path), res.status)
		return parsed
	}
}

function mensajeError(status: number, body: unknown, path: string): string {
	const detail = (body as Row | null)?.detail as Row | string | undefined
	const mensaje = typeof detail === 'object' && detail ? String(detail.mensaje ?? '') : typeof detail === 'string' ? detail : ''
	const tipo = typeof detail === 'object' && detail ? String(detail.type ?? '') : ''
	const ruta = path.split('?')[0]
	if (path.includes('/usuario/login')) {
		if (tipo === 'password') return 'Contraseña incorrecta para la API del administrador. Corrígela en Configuración › Proveedor.'
		if (tipo === 'email') return 'El usuario no existe en la API del administrador. Corrígelo en Configuración › Proveedor.'
		return `El login falló (HTTP ${status}${mensaje ? `: ${mensaje}` : ''}). Revisa usuario y contraseña en Configuración.`
	}
	if (status === 401) return 'La API rechazó el token aun después de iniciar sesión de nuevo. Revisa los permisos del usuario.'
	if (status >= 500) return `La API del administrador tuvo un error interno (HTTP ${status}) en ${ruta}. Reintenta más tarde.`
	return `La API respondió HTTP ${status} en ${ruta}${mensaje ? `: ${mensaje}` : ''}.`
}
