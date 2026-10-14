/**
 * Cobrix panel: server-rendered pages over the sync engine (src/cobrix). Forms post and
 * redirect with a flash message (POST → redirect → GET), so a refresh never repeats an action.
 */

import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { ClienteAdministrador, ErrorApi } from '../cobrix/api.ts'
import { antiguedad, clientes, expediente, requiereAtencion, totales } from '../cobrix/consultas.ts'
import { proximaAutomatica } from '../cobrix/programador.ts'
import { ESTADOS_CONOCIDOS, TIPOS_DOCUMENTO, type TipoDocumento } from '../cobrix/reglas.ts'
import { CorridaEnCurso, Sincronizador } from '../cobrix/sincronizacion.ts'
import { Store, type Configuracion, type Corrida } from '../cobrix/store.ts'
import { CSS_PANEL, JS_PANEL } from './estilos.ts'
import { CSS, esc, html, layout, type Raw, type Tone } from './layout.ts'
import {
	noEncontrado, vistaClientes, vistaConfiguracion, vistaCorrida, vistaExpediente, vistaResumen, vistaSincronizacion,
} from './vistas.ts'

export interface AppDeps {
	/** The local invoice manager API (used for the Swagger link). */
	readonly simulatorUrl: string
	/** Path of docs/ENUNCIADO.md, served at /enunciado. */
	readonly assignmentPath: string
	/** Cobrix storage; an in-memory one is created when omitted (tests of the skeleton). */
	readonly store?: Store
	readonly sync?: Sincronizador
}

/** A validation problem in a form: shown to the operator as is. */
class ErrorFormulario extends Error {}

export function createApp(deps: AppDeps): Server {
	const store = deps.store ?? new Store(':memory:')
	const sync = deps.sync ?? new Sincronizador(store)

	async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const url = new URL(req.url ?? '/', 'http://cobrix.local')
		const path = url.pathname.replace(/\/+$/, '') || '/'
		const text = url.searchParams.get('msg')
		const tone = url.searchParams.get('tone') as Tone | null
		const flash = text && tone ? { tone, text } : undefined
		const config = store.config()
		const company = config.empresa.nombre || 'Empresa sin configurar'
		const footer = config.proveedor.url
			? `<span class="dot ${sync.corridaEnCurso ? 'warn' : 'ok'}"></span>${esc(sync.corridaEnCurso ? 'Corrida en curso' : 'Proveedor configurado')}`
			: '<span class="dot bad"></span>Proveedor sin configurar'
		const page = (title: string, active: string, body: Raw, status = 200) => sendHtml(res, status, layout({ title, active, body, flash, company, footer }))
		const proveedorListo = Boolean(config.proveedor.url && config.proveedor.usuario && config.proveedor.password)

		if (req.method === 'GET') {
			if (path === '/app.css') return send(res, 200, CSS + CSS_PANEL + ENUNCIADO_CSS, 'text/css; charset=utf-8')
			if (path === '/app.js') return send(res, 200, JS_PANEL, 'text/javascript; charset=utf-8')
			if (path === '/enunciado') return page('Enunciado', '', assignmentPage())

			if (path === '/') {
				return page('Resumen', '/', vistaResumen({
					totales: totales(store), config, corridas: store.corridas(6), tramos: antiguedad(store), atencion: requiereAtencion(store),
					proxima: proximaAutomatica(store), enCurso: sync.corridaEnCurso,
				}))
			}
			if (path === '/clientes') {
				const q = (url.searchParams.get('q') ?? '').slice(0, 80)
				return page('Clientes', '/clientes', vistaClientes(clientes(store, q), q, totales(store).clientes))
			}
			const cliente = /^\/clientes\/(\d+)$/.exec(path)
			if (cliente) {
				const e = expediente(store, Number(cliente[1]))
				return e ? page(String(e.cliente.nombre), '/clientes', vistaExpediente(e)) : page('No encontrado', '/clientes', noEncontrado('Ese cliente no existe', '/clientes'), 404)
			}
			if (path === '/sincronizacion') {
				const filtro = url.searchParams.get('ver') ?? ''
				const filtros: Record<string, (c: Corrida) => boolean> = {
					importacion: c => c.tipo === 'importacion', pagadas: c => c.tipo === 'pagadas', reales: c => !c.simulacion,
					simulaciones: c => c.simulacion, fallidas: c => c.estado === 'fallida',
				}
				const corridas = store.corridas(200).filter(filtros[filtro] ?? (() => true))
				return page('Sincronización', '/sincronizacion', vistaSincronizacion({
					corridas, filtro: filtros[filtro] ? filtro : '', proveedorListo, enCurso: sync.corridaEnCurso, hayAbiertas: totales(store).abiertas > 0,
				}))
			}
			const corrida = /^\/sincronizacion\/(\d+)(\/csv)?$/.exec(path)
			if (corrida) {
				const c = store.corrida(Number(corrida[1]))
				if (!c) return page('No encontrado', '/sincronizacion', noEncontrado('Esa corrida no existe', '/sincronizacion'), 404)
				const items = store.itemsCorrida(c.id)
				if (corrida[2]) return sendCsv(res, `corrida-${c.id}-${c.tipo}${c.simulacion ? '-simulacion' : ''}.csv`, items)
				return page(`Corrida #${c.id}`, '/sincronizacion', vistaCorrida(c, items, url.searchParams.get('resultado') ?? ''))
			}
			const api = /^\/api\/corridas\/(\d+)$/.exec(path)
			if (api) {
				const c = store.corrida(Number(api[1]))
				return c ? send(res, 200, JSON.stringify(c), 'application/json; charset=utf-8') : send(res, 404, '{"error":"no existe"}', 'application/json')
			}
			if (path === '/configuracion') {
				const n = (sql: string) => Number(Object.values(store.db.prepare(sql).get() as Record<string, unknown>)[0])
				return page('Configuración', '/configuracion', vistaConfiguracion(config, {
					proxima: proximaAutomatica(store),
					datos: { clientes: n('SELECT COUNT(*) FROM clientes'), facturas: n('SELECT COUNT(*) FROM facturas'), corridas: n('SELECT COUNT(*) FROM corridas') },
				}))
			}
		}

		if (req.method === 'POST') {
			const form = await readForm(req)
			const volver = (to: string, mensaje: string, t: Tone) => {
				// The flash goes in the query; the #anchor (if any) must stay at the end.
				const [base, ancla] = to.split('#') as [string, string | undefined]
				redirect(res, `${base}?tone=${t}&msg=${encodeURIComponent(mensaje)}${ancla ? `#${ancla}` : ''}`)
			}
			try {
				switch (path) {
					case '/sincronizacion/ejecutar': {
						const tipo = form.get('tipo') === 'pagadas' ? 'pagadas' : form.get('tipo') === 'importacion' ? 'importacion' : null
						if (!tipo) throw new ErrorFormulario('Tipo de corrida desconocido.')
						try {
							const { id } = sync.iniciar(tipo, { simulacion: form.get('simulacion') !== '0' })
							return redirect(res, `/sincronizacion/${id}`)
						} catch (error) {
							if (error instanceof CorridaEnCurso) return volver('/sincronizacion', error.message, 'warn')
							throw error
						}
					}
					case '/configuracion/empresa': {
						const correo = requerido(form, 'correo', 'El correo de cobranza')
						if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorFormulario('El correo de cobranza no es válido.')
						const rif = requerido(form, 'rif', 'El RIF').toUpperCase().replace(/\s/g, '')
						if (!/^[JGVEP]-?\d{6,9}-?\d?$/.test(rif)) throw new ErrorFormulario('El RIF debe tener letra, número y dígito verificador, por ejemplo J-12345678-9.')
						store.guardarConfig('empresa', { nombre: requerido(form, 'nombre', 'El nombre'), rif, correo })
						return volver('/configuracion', 'Datos de la empresa guardados.', 'ok')
					}
					case '/configuracion/proveedor':
					case '/configuracion/probar': {
						const proveedor = leerProveedor(form, config)
						if (path === '/configuracion/probar') {
							try {
								const api = new ClienteAdministrador(proveedor)
								const sesion = await api.login()
								const ids = await api.listaContratos()
								return volver('/configuracion#proveedor', `Conexión correcta como «${sesion.usuario}»: el administrador tiene ${ids.length} contratos. (Aún no se guardó: pulsa «Guardar proveedor».)`, 'ok')
							} catch (error) {
								if (error instanceof ErrorApi) return volver('/configuracion#proveedor', `No se pudo conectar: ${error.message}`, 'bad')
								throw error
							}
						}
						store.guardarConfig('proveedor', proveedor)
						return volver('/configuracion', 'Proveedor guardado. Usa «Probar conexión» para verificarlo.', 'ok')
					}
					case '/configuracion/importacion': {
						const estados = form.getAll('estados').filter(e => (ESTADOS_CONOCIDOS as readonly string[]).includes(e))
						if (!estados.length) throw new ErrorFormulario('Elige al menos un estado de contrato que se importe.')
						const ventana = form.get('ventana') ?? ''
						if (!['', '3', '6', '9', '12'].includes(ventana)) throw new ErrorFormulario('La ventana debe ser 3, 6, 9 o 12 meses, o sin ventana.')
						const topeMonto = entero(form, 'tope_monto', 'El tope de monto', 0.01, 1e9, true, true)
						store.guardarConfig('importacion', {
							estados,
							ventanaMeses: ventana ? Number(ventana) : null,
							maxRecientes: entero(form, 'max_recientes', 'El máximo de cuotas recientes', 1, 60, true),
							diasGracia: entero(form, 'dias_gracia', 'Los días de gracia', 0, 60, false) ?? 0,
							topeFacturas: entero(form, 'tope_facturas', 'El tope de facturas', 1, 1e6, true),
							topeMontoCents: topeMonto === null ? null : Math.round(topeMonto * 100),
							tiposExcluidos: form.getAll('tipos_excluidos').filter((t): t is TipoDocumento => (TIPOS_DOCUMENTO as readonly string[]).includes(t)),
						})
						return volver('/configuracion', 'Reglas de importación guardadas. Se aplican desde la próxima corrida.', 'ok')
					}
					case '/configuracion/automatica': {
						const hora = form.get('hora') ?? ''
						if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) throw new ErrorFormulario('La hora debe tener el formato HH:MM.')
						const activa = form.get('activa') === '1'
						store.guardarConfig('automatica', { activa, hora })
						return volver('/configuracion', activa ? `Corrida automática activada todos los días a las ${hora} (Caracas).` : 'Corrida automática desactivada.', 'ok')
					}
					case '/configuracion/vaciar': {
						if (form.get('confirmo') !== '1') throw new ErrorFormulario('Marca «Entiendo que no se puede deshacer» para vaciar los datos.')
						if (sync.corridaEnCurso !== null) throw new ErrorFormulario('Hay una corrida en curso: espera a que termine.')
						store.transaccion(() => {
							for (const tabla of ['corrida_items', 'corridas', 'eventos', 'facturas', 'contratos', 'clientes']) store.db.exec(`DELETE FROM ${tabla}`)
						})
						return volver('/configuracion', 'Datos de Cobrix vaciados. La configuración se conservó.', 'ok')
					}
				}
			} catch (error) {
				if (error instanceof ErrorFormulario) {
					const destino = path.startsWith('/configuracion') ? `/configuracion#${path.split('/')[2] === 'probar' ? 'proveedor' : path.split('/')[2]}` : '/sincronizacion'
					return volver(destino, error.message, 'bad')
				}
				throw error
			}
		}

		page('No encontrado', '', html`<div class="vacio"><strong>Esta página no existe</strong><a class="btn" href="/">Ir al resumen</a></div>`, 404)
	}

	function assignmentPage(): Raw {
		let text = ''
		try {
			text = readFileSync(deps.assignmentPath, 'utf8')
		} catch {
			text = 'No se encontró docs/ENUNCIADO.md.'
		}
		return html`<div class="head"><div><h1>Enunciado</h1><p>También en <span class="mono">docs/ENUNCIADO.md</span>. Swagger de la API: <a href="${deps.simulatorUrl}/docs" target="_blank" rel="noopener">${deps.simulatorUrl}/docs</a></p></div></div>
			<section class="card"><div class="body"><pre class="doc">${text}</pre></div></section>`
	}

	return createServer((req, res) => {
		route(req, res).catch((error: unknown) => {
			console.error('[panel]', error)
			if (!res.headersSent) {
				sendHtml(res, 500, layout({ title: 'Error', active: '', company: '', body: html`<div class="error-box"><strong>Algo falló al mostrar esta página</strong>
					<p>${error instanceof Error ? error.message : String(error)}</p><p class="subtle">Vuelve a intentarlo; si se repite, revisa la consola del servidor.</p></div>` }))
			}
		})
	})
}

// ---------------------------------------------------------------- form helpers

function requerido(form: URLSearchParams, campo: string, nombre: string): string {
	const valor = (form.get(campo) ?? '').trim()
	if (!valor) throw new ErrorFormulario(`${nombre} es obligatorio.`)
	if (valor.length > 200) throw new ErrorFormulario(`${nombre} es demasiado largo.`)
	return valor
}

function entero(form: URLSearchParams, campo: string, nombre: string, min: number, max: number, vacioEsNulo: boolean, decimales = false): number | null {
	const valor = (form.get(campo) ?? '').trim().replace(',', '.')
	if (!valor) {
		if (vacioEsNulo) return null
		throw new ErrorFormulario(`${nombre} es obligatorio.`)
	}
	const n = Number(valor)
	if (!Number.isFinite(n) || (!decimales && !Number.isInteger(n)) || n < min || n > max) {
		throw new ErrorFormulario(`${nombre} debe ser ${decimales ? 'un número' : 'un entero'} entre ${min} y ${max.toLocaleString('es-VE')}.`)
	}
	return n
}

function leerProveedor(form: URLSearchParams, config: Configuracion): Configuracion['proveedor'] {
	const url = requerido(form, 'url', 'La URL de la API').replace(/\/+$/, '')
	try {
		const u = new URL(url)
		if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error()
	} catch {
		throw new ErrorFormulario('La URL de la API debe empezar por http:// o https://.')
	}
	// The password is never shown; empty means «keep the current one».
	const password = form.get('password') || config.proveedor.password
	if (!password) throw new ErrorFormulario('La contraseña es obligatoria.')
	return { url, usuario: requerido(form, 'usuario', 'El usuario'), password }
}

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
	const chunks: Buffer[] = []
	let size = 0
	for await (const chunk of req) {
		size += (chunk as Buffer).length
		if (size > 64 * 1024) throw new ErrorFormulario('El formulario es demasiado grande.')
		chunks.push(chunk as Buffer)
	}
	return new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
}

// ---------------------------------------------------------------- responses

const ENUNCIADO_CSS = `pre.doc { margin: 0; white-space: pre-wrap; font: 13.5px/1.6 var(--mono); color: var(--fg); max-width: 110ch; }`

function sendCsv(res: ServerResponse, nombre: string, items: ReturnType<Store['itemsCorrida']>): void {
	const campo = (v: unknown) => {
		const s = v === null || v === undefined ? '' : String(v)
		return /[",;\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
	}
	const filas = [['titular', 'documento', 'contrato', 'cuota', 'factura_cobrix', 'periodo', 'monto_usd', 'resultado', 'motivo']]
	for (const i of items) {
		filas.push([i.titular, i.documento, String(i.contratoId ?? ''), i.deudaId ?? '', i.factura ?? '', i.periodo ?? '',
			i.montoCents === null ? '' : (i.montoCents / 100).toFixed(2), i.resultado, i.motivo])
	}
	// BOM so Excel opens the accents correctly.
	const body = '﻿' + filas.map(f => f.map(campo).join(',')).join('\r\n')
	res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nombre}"`, 'content-length': Buffer.byteLength(body) })
	res.end(body)
}

function redirect(res: ServerResponse, location: string): void {
	res.writeHead(303, { location })
	res.end()
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
	send(res, status, body, 'text/html; charset=utf-8')
}

function send(res: ServerResponse, status: number, body: string, type: string): void {
	res.writeHead(status, { 'content-type': type, 'content-length': Buffer.byteLength(body), 'x-content-type-options': 'nosniff' })
	res.end(body)
}
