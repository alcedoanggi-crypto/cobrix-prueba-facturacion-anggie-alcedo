/**
 * The two runs of ENUNCIADO §3.2–3.4: import installments as open invoices, and mark as paid
 * the ones the ISP already collected. Both have a simulation mode that writes nothing but
 * the run record, so the operator can see what would happen first.
 */

import { addCivilDays, addMonths, currentPeriod, lastDayOfPeriod } from '../shared/dates.ts'
import { ClienteAdministrador, ErrorApi } from './api.ts'
import {
	clasificarContrato, evaluarPago, toCents,
	type ContratoClasificado, type CuotaLeida, type EvaluacionPago, type ItemImportacion, type ReglasImportacion,
} from './reglas.ts'
import { numeroFactura, type Configuracion, type Corrida, type ItemCorrida, type Store } from './store.ts'

export interface OpcionesCorrida {
	readonly simulacion: boolean
	readonly origen?: Corrida['origen']
}

type Row = Record<string, unknown>

export class CorridaEnCurso extends Error {
	constructor() {
		super('Ya hay una corrida en curso. Espera a que termine para lanzar otra.')
		this.name = 'CorridaEnCurso'
	}
}

export class Sincronizador {
	readonly #store: Store
	readonly #fetch: typeof fetch
	#enCurso: number | null = null

	constructor(store: Store, fetchImpl: typeof fetch = fetch) {
		this.#store = store
		this.#fetch = fetchImpl
	}

	get corridaEnCurso(): number | null {
		return this.#enCurso
	}

	/**
	 * Starts a run and returns its id right away; `terminada` resolves when it ends.
	 * The panel uses the id to show live progress.
	 */
	iniciar(tipo: Corrida['tipo'], opciones: OpcionesCorrida): { id: number; terminada: Promise<Corrida> } {
		if (this.#enCurso !== null) throw new CorridaEnCurso()
		const id = this.#store.crearCorrida(tipo, opciones.simulacion, opciones.origen ?? 'manual')
		this.#enCurso = id
		const ejecutar = tipo === 'importacion' ? this.#importar.bind(this) : this.#actualizarPagadas.bind(this)
		const terminada = ejecutar(id, opciones.simulacion)
			.then(resumen => this.#store.cerrarCorrida(id, 'completada', resumen))
			.catch((error: unknown) => {
				const mensaje = error instanceof Error ? error.message : String(error)
				if (!(error instanceof ErrorApi)) console.error(`[cobrix] corrida ${id} falló`, error)
				this.#store.cerrarCorrida(id, 'fallida', {}, mensaje)
			})
			.then(() => this.#store.corrida(id)!)
			.finally(() => { this.#enCurso = null })
		return { id, terminada }
	}

	/** Convenience for tests and the scheduler: run and wait. */
	ejecutar(tipo: Corrida['tipo'], opciones: OpcionesCorrida): Promise<Corrida> {
		return this.iniciar(tipo, opciones).terminada
	}

	#cliente(config: Configuracion): ClienteAdministrador {
		const { url, usuario, password } = config.proveedor
		if (!url || !usuario || !password) {
			throw new ErrorApi('Falta configurar el proveedor (URL, usuario y contraseña). Complétalo en Configuración › Proveedor.')
		}
		return new ClienteAdministrador(config.proveedor, this.#fetch)
	}

	// ------------------------------------------------------------ import

	async #importar(corridaId: number, simulacion: boolean): Promise<Record<string, number>> {
		const config = this.#store.config()
		const api = this.#cliente(config)
		const reglas: ReglasImportacion = {
			estadosImportables: config.importacion.estados,
			ventanaMeses: config.importacion.ventanaMeses,
			maxCuotasRecientes: config.importacion.maxRecientes,
			diasGracia: config.importacion.diasGracia,
			tiposExcluidos: config.importacion.tiposExcluidos,
			umbralMonedaIncoherente: 0.01,
		}
		const periodo = currentPeriod()

		const ids = await api.listaContratos()
		const clasificados: ContratoClasificado[] = []
		for (const [i, id] of ids.entries()) {
			try {
				clasificados.push(clasificarContrato(id, await api.contratoIndividual(id), reglas, periodo))
			} catch (error) {
				// A connection problem stops the run (nothing is written); an HTTP error on one
				// contract is recorded and the rest continue.
				if (!(error instanceof ErrorApi) || error.status === null) throw error
				clasificados.push({ contrato: null, identificacion: null, candidatas: [], excluidas: [
					{ contratoId: id, deudaId: null, periodo: null, montoCents: null, resultado: 'error_api', motivo: error.message }] })
			}
			this.#store.progreso(corridaId, i + 1, ids.length)
		}

		// Decide over every candidate together: dedup against Cobrix, then the run caps, oldest debt first.
		const existentes = new Set((this.#store.db.prepare('SELECT deuda_id FROM facturas').all() as Array<{ deuda_id: string }>).map(r => r.deuda_id))
		const candidatas = clasificados.flatMap(c => c.candidatas.map(cuota => ({ cuota, contrato: c })))
			.sort((a, b) => a.cuota.periodo.localeCompare(b.cuota.periodo) || a.cuota.contratoId - b.cuota.contratoId || a.cuota.deudaId.localeCompare(b.cuota.deudaId))
		const { topeFacturas, topeMontoCents } = config.importacion
		const nuevas: Array<{ cuota: CuotaLeida; contrato: ContratoClasificado }> = []
		const decisiones = new Map<string, ItemImportacion>()
		let montoNuevo = 0
		for (const { cuota, contrato } of candidatas) {
			const base = { contratoId: cuota.contratoId, deudaId: cuota.deudaId, periodo: cuota.periodo, montoCents: cuota.montoCents }
			if (existentes.has(cuota.deudaId)) {
				decisiones.set(cuota.deudaId, { ...base, resultado: 'ya_importada', motivo: 'Ya existe una factura de Cobrix para esta cuota' })
			} else if (topeFacturas !== null && nuevas.length >= topeFacturas) {
				decisiones.set(cuota.deudaId, { ...base, resultado: 'frenada_tope', motivo: `Se alcanzó el tope de ${topeFacturas} facturas nuevas por corrida` })
			} else if (topeMontoCents !== null && montoNuevo + cuota.montoCents > topeMontoCents) {
				decisiones.set(cuota.deudaId, { ...base, resultado: 'frenada_tope', motivo: `Superaría el tope de USD ${(topeMontoCents / 100).toFixed(2)} nuevos por corrida` })
			} else {
				nuevas.push({ cuota, contrato })
				montoNuevo += cuota.montoCents
				decisiones.set(cuota.deudaId, { ...base, resultado: 'importada', motivo: 'Factura abierta creada' })
			}
		}

		const clientesExistentes = new Set((this.#store.db.prepare('SELECT id_externo FROM clientes').all() as Array<{ id_externo: string }>).map(r => r.id_externo))
		const clientesNuevos = new Set(nuevas.map(n => n.contrato.identificacion!.id).filter(id => !clientesExistentes.has(id)))
		const numeros = simulacion ? new Map<string, string>() : this.#store.transaccion(() => this.#aplicarImportacion(corridaId, clasificados, nuevas, config.importacion.diasGracia))

		// One item per installment (or per contract when the whole contract is excluded).
		const items: ItemCorrida[] = []
		for (const c of clasificados) {
			const titular = c.contrato?.titular.nombre ?? ''
			const documento = c.contrato?.titular.identificacionOriginal ?? ''
			const propios = [...c.excluidas, ...c.candidatas.map(cuota => decisiones.get(cuota.deudaId)!)]
				.sort((a, b) => (a.periodo ?? '').localeCompare(b.periodo ?? ''))
			for (const it of propios) items.push({ ...it, titular, documento, factura: it.deudaId ? numeros.get(it.deudaId) ?? null : null })
		}
		this.#store.agregarItems(corridaId, items)

		const contar = (resultado: string) => items.filter(i => i.resultado === resultado).length
		return {
			contratos: ids.length,
			cuotas_revisadas: items.filter(i => i.deudaId !== null).length,
			importadas: nuevas.length,
			monto_importado_cents: montoNuevo,
			clientes_nuevos: clientesNuevos.size,
			ya_importadas: contar('ya_importada'),
			excluidas_estado: contar('excluida_estado'),
			excluidas_tipo_documento: contar('excluida_tipo_documento'),
			fuera_de_ventana: contar('fuera_de_ventana'),
			excede_recientes: contar('excede_recientes'),
			frenadas_tope: contar('frenada_tope'),
			saldo_residual: contar('saldo_residual'),
			contratos_moneda_incoherente: contar('moneda_incoherente') + contar('moneda_no_usd'),
			contratos_sin_deuda: contar('sin_deuda'),
			contratos_descartados: contar('respuesta_inconsistente') + contar('estado_desconocido') + contar('identificacion_invalida'),
			otras_excluidas: contar('detalle_ilegible') + contar('cuota_futura'),
			errores_api: contar('error_api'),
		}
	}

	/** Writes customers, contracts, invoices and history. Runs inside one transaction. */
	#aplicarImportacion(
		corridaId: number, clasificados: readonly ContratoClasificado[],
		nuevas: ReadonlyArray<{ cuota: CuotaLeida; contrato: ContratoClasificado }>, diasGracia: number,
	): Map<string, string> {
		const db = this.#store.db
		const ahora = new Date().toISOString()
		const clienteId = new Map<string, number>()
		const buscarCliente = db.prepare('SELECT id FROM clientes WHERE id_externo = ?')
		const crearCliente = db.prepare(`INSERT INTO clientes (id_externo, documento, tipo_documento, persona, nombre, correo, telefono, origen, creado_en)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
		const evento = db.prepare('INSERT INTO eventos (cliente_id, factura_id, tipo, fecha, titulo, detalle) VALUES (?, ?, ?, ?, ?, ?)')

		// Customers: one per normalized identification, created only when they get an invoice.
		for (const { contrato: c } of nuevas) {
			const ident = c.identificacion!
			if (clienteId.has(ident.id)) continue
			const existente = buscarCliente.get(ident.id) as { id: number } | undefined
			if (existente) { clienteId.set(ident.id, existente.id); continue }
			const t = c.contrato!.titular
			const r = crearCliente.run(ident.id, t.identificacionOriginal, ident.tipo, ident.persona, t.nombre, t.correo, t.telefono,
				`Administrador de facturas · contrato ${c.contrato!.id}`, ahora)
			const id = Number(r.lastInsertRowid)
			clienteId.set(ident.id, id)
			evento.run(id, null, 'cliente_creado', ahora, 'Cliente creado', `Creado desde el contrato ${c.contrato!.id} del administrador`)
		}

		// Contracts: refresh every contract read in this run whose holder is a Cobrix customer.
		const upsertContrato = db.prepare(`INSERT INTO contratos (id, cliente_id, codigo, estado, plan, precio_cents, moneda, sucursal, direccion, actualizado_en)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET estado = excluded.estado, plan = excluded.plan, precio_cents = excluded.precio_cents,
				moneda = excluded.moneda, sucursal = excluded.sucursal, direccion = excluded.direccion, actualizado_en = excluded.actualizado_en`)
		for (const c of clasificados) {
			if (!c.contrato || !c.identificacion) continue
			const id = clienteId.get(c.identificacion.id) ?? (buscarCliente.get(c.identificacion.id) as { id: number } | undefined)?.id
			if (id === undefined) continue
			const k = c.contrato
			upsertContrato.run(k.id, id, k.codigo, k.estado, k.plan, k.precioCents, k.moneda, k.sucursal, k.direccion, ahora)
		}

		// Invoices. The UNIQUE(deuda_id) constraint is the last line of defence against duplicates.
		const crearFactura = db.prepare(`INSERT INTO facturas (deuda_id, cliente_id, contrato_id, periodo, descripcion, vencimiento, corte, total_cents, saldo_cents, estado, importada_en, corrida_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'abierta', ?, ?)`)
		const numeros = new Map<string, string>()
		for (const { cuota, contrato } of nuevas) {
			const cliente = clienteId.get(contrato.identificacion!.id)!
			const vencimiento = `${cuota.periodo}-01`
			const r = crearFactura.run(cuota.deudaId, cliente, cuota.contratoId, cuota.periodo, cuota.descripcion, vencimiento,
				addCivilDays(vencimiento, diasGracia), cuota.montoCents, cuota.montoCents, ahora, corridaId)
			const id = Number(r.lastInsertRowid)
			numeros.set(cuota.deudaId, numeroFactura(id))
			evento.run(cliente, id, 'factura_importada', ahora, 'Factura importada', `Cuota ${cuota.deudaId} · ${cuota.descripcion}`)
		}
		return numeros
	}

	// ------------------------------------------------------------ paid invoices

	async #actualizarPagadas(corridaId: number, simulacion: boolean): Promise<Record<string, number>> {
		const config = this.#store.config()
		const api = this.#cliente(config)
		const abiertas = this.#store.db.prepare(`
			SELECT f.id, f.deuda_id, f.contrato_id, f.cliente_id, f.periodo, f.saldo_cents, f.saldo_admin_cents, c.nombre, c.documento
			FROM facturas f JOIN clientes c ON c.id = f.cliente_id
			WHERE f.estado = 'abierta' ORDER BY f.contrato_id, f.periodo`).all() as Row[]
		const porContrato = agrupar(abiertas, f => f.contrato_id as number)
		const hasta = lastDayOfPeriod(currentPeriod())

		// Make sure the credentials work before reading anything: a bad password fails the run cleanly.
		await api.login()
		const evaluaciones: Array<{ factura: Row; ev: EvaluacionPago }> = []
		let hecho = 0
		for (const [contratoId, facturas] of porContrato) {
			const masVieja = facturas.map(f => String(f.periodo)).sort()[0]!
			const desde = `${addMonths(masVieja, -1)}-01`
			try {
				const libro = await api.libroCuotas(contratoId, desde, hasta)
				let contratoActual: unknown[] | null = null
				for (const factura of facturas) {
					let ev = evaluarPago(String(factura.deuda_id), contratoId, factura.saldo_cents as number, libro)
					// The current month may not be in the ledger yet: ask the contract before saying «no evidence».
					if (ev.resultado === 'sin_evidencia') {
						contratoActual ??= await this.#cuotasPendientes(api, contratoId)
						ev = evaluarDesdeContrato(String(factura.deuda_id), factura.saldo_cents as number, contratoActual) ?? ev
					}
					evaluaciones.push({ factura, ev })
				}
			} catch (error) {
				if (!(error instanceof ErrorApi) || error.status === null) throw error
				for (const factura of facturas) evaluaciones.push({ factura, ev: { resultado: 'error_api', motivo: error.message, saldoAdminCents: null, facturaAdmin: null } })
			}
			this.#store.progreso(corridaId, ++hecho, porContrato.size)
		}

		if (!simulacion) this.#store.transaccion(() => this.#aplicarPagos(evaluaciones))

		const items: ItemCorrida[] = evaluaciones.map(({ factura, ev }) => ({
			contratoId: factura.contrato_id as number, deudaId: String(factura.deuda_id), titular: String(factura.nombre), documento: String(factura.documento),
			periodo: String(factura.periodo), montoCents: factura.saldo_cents as number, resultado: ev.resultado, motivo: ev.motivo,
			factura: numeroFactura(factura.id as number),
		}))
		this.#store.agregarItems(corridaId, items)
		const contar = (r: string) => evaluaciones.filter(e => e.ev.resultado === r).length
		return {
			facturas_revisadas: evaluaciones.length,
			contratos: porContrato.size,
			pagadas: contar('pagada'),
			monto_pagado_cents: evaluaciones.filter(e => e.ev.resultado === 'pagada').reduce((s, e) => s + (e.factura.saldo_cents as number), 0),
			abonos_parciales: contar('abono_parcial'),
			siguen_abiertas: contar('sigue_abierta'),
			exoneradas: contar('exonerada'),
			sin_evidencia: contar('sin_evidencia'),
			inconsistentes: contar('inconsistente'),
			errores_api: contar('error_api'),
		}
	}

	async #cuotasPendientes(api: ClienteAdministrador, contratoId: number): Promise<unknown[]> {
		const respuesta = await api.contratoIndividual(contratoId)
		return Array.isArray(respuesta) ? respuesta : []
	}

	#aplicarPagos(evaluaciones: ReadonlyArray<{ factura: Row; ev: EvaluacionPago }>): void {
		const db = this.#store.db
		const ahora = new Date().toISOString()
		const pagar = db.prepare(`UPDATE facturas SET estado = 'pagada', saldo_cents = 0, saldo_admin_cents = 0, pagada_en = ?, factura_admin = ?, factura_admin_fecha = ?
			WHERE id = ? AND estado = 'abierta'`)
		const saldoAdmin = db.prepare('UPDATE facturas SET saldo_admin_cents = ? WHERE id = ?')
		const evento = db.prepare('INSERT INTO eventos (cliente_id, factura_id, tipo, fecha, titulo, detalle) VALUES (?, ?, ?, ?, ?, ?)')
		for (const { factura, ev } of evaluaciones) {
			const id = factura.id as number
			if (ev.resultado === 'pagada' && ev.facturaAdmin) {
				const r = pagar.run(ev.facturaAdmin.fecha, ev.facturaAdmin.numero, ev.facturaAdmin.fecha, id)
				if (r.changes) evento.run(factura.cliente_id as number, id, 'factura_pagada', ahora, 'Pagada en el ISP',
					`Pagada en el administrador (factura ${ev.facturaAdmin.numero} del ${ev.facturaAdmin.fecha})`)
			} else if (ev.saldoAdminCents !== null && ev.saldoAdminCents !== factura.saldo_admin_cents) {
				saldoAdmin.run(ev.saldoAdminCents, id)
				// Only a new partial payment is history; the same balance seen again is not.
				if (ev.resultado === 'abono_parcial') {
					evento.run(factura.cliente_id as number, id, 'abono_parcial', ahora, 'Abono parcial en el ISP', ev.motivo)
				}
			}
		}
	}
}

function agrupar<T, K>(items: readonly T[], clave: (item: T) => K): Map<K, T[]> {
	const grupos = new Map<K, T[]>()
	for (const item of items) {
		const k = clave(item)
		const lista = grupos.get(k)
		if (lista) lista.push(item)
		else grupos.set(k, [item])
	}
	return grupos
}

/** Fallback when the installment is missing from the ledger: the contract's pending list. */
function evaluarDesdeContrato(deudaId: string, saldoCobrixCents: number, filas: readonly unknown[]): EvaluacionPago | null {
	const fila = filas.find(f => typeof f === 'object' && f !== null && (f as Row).deuda_id === deudaId) as Row | undefined
	if (!fila || typeof fila.deuda !== 'number') return null
	const saldo = toCents(fila.deuda)
	if (saldo === saldoCobrixCents) return { resultado: 'sigue_abierta', motivo: 'Aún no está en el libro; el contrato la sigue listando pendiente', saldoAdminCents: saldo, facturaAdmin: null }
	if (saldo > 0 && saldo < saldoCobrixCents) {
		return { resultado: 'abono_parcial', motivo: `Abono parcial según el contrato: quedan USD ${(saldo / 100).toFixed(2)}`, saldoAdminCents: saldo, facturaAdmin: null }
	}
	return null
}
