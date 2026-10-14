/**
 * Business rules of ENUNCIADO §4 as pure functions: no HTTP, no database.
 * Everything that is ambiguous returns a reason instead of a guess.
 */

/** Amounts are handled in cents (integers) to avoid floating point drift. */
export const toCents = (value: number): number => Math.round(value * 100)

// ---------------------------------------------------------------- identification

export type TipoDocumento = 'V' | 'E' | 'J' | 'G' | 'P'
export const TIPOS_DOCUMENTO: readonly TipoDocumento[] = ['V', 'E', 'J', 'G', 'P']

export interface Identificacion {
	/** Normalized id used as the customer key: `V12345678`, or `9000123` without a type letter. */
	readonly id: string
	readonly tipo: TipoDocumento | null
	readonly persona: 'natural' | 'juridica'
}

/**
 * `V-12345678` → `V12345678`; `09000123` → `9000123`; `J-40123456-7` → `J401234567`.
 * Optional type letter, then 6 to 12 digits once separators and leading zeros are removed.
 * Returns null when the value cannot be read with certainty.
 */
export function normalizarIdentificacion(raw: unknown): Identificacion | null {
	if (typeof raw !== 'string') return null
	const compact = raw.trim().toUpperCase().replace(/[\s.\-_/]/g, '')
	const match = /^([VEJGP])?(\d+)$/.exec(compact)
	if (!match) return null
	const digits = match[2]!.replace(/^0+/, '')
	if (digits.length < 6 || digits.length > 12) return null
	const tipo = (match[1] ?? null) as TipoDocumento | null
	return {
		id: `${tipo ?? ''}${digits}`,
		tipo,
		persona: tipo === 'J' || tipo === 'G' ? 'juridica' : 'natural',
	}
}

// ---------------------------------------------------------------- periods

const MESES: Record<string, number> = {
	ENERO: 1, FEBRERO: 2, MARZO: 3, ABRIL: 4, MAYO: 5, JUNIO: 6,
	JULIO: 7, AGOSTO: 8, SEPTIEMBRE: 9, SETIEMBRE: 9, OCTUBRE: 10, NOVIEMBRE: 11, DICIEMBRE: 12,
}

/** «PLAN15MB25 - 2026 Agosto» → `2026-08`. Null if the label does not end in «YYYY Mes». */
export function periodoDeDetalle(detalle: unknown): string | null {
	if (typeof detalle !== 'string') return null
	const match = /(\d{4})\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s*$/.exec(detalle.trim())
	if (!match) return null
	const mes = MESES[match[2]!.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')]
	if (!mes) return null
	return `${match[1]}-${String(mes).padStart(2, '0')}`
}

// ---------------------------------------------------------------- contract states

/** States the invoice manager is known to send. Anything else excludes the contract. */
export const ESTADOS_CONOCIDOS = ['ACTIVO', 'CORTADO', 'CORTESIA', 'RETIRADO', 'RECHAZADO', 'ANULADO'] as const
export type EstadoContrato = (typeof ESTADOS_CONOCIDOS)[number]
export const esEstadoConocido = (value: unknown): value is EstadoContrato =>
	typeof value === 'string' && (ESTADOS_CONOCIDOS as readonly string[]).includes(value)

// ---------------------------------------------------------------- import classification

export type ResultadoImportacion =
	| 'importada' | 'ya_importada' | 'excluida_estado' | 'excluida_tipo_documento' | 'fuera_de_ventana'
	| 'excede_recientes' | 'frenada_tope' | 'saldo_residual' | 'moneda_incoherente' | 'moneda_no_usd'
	| 'identificacion_invalida' | 'estado_desconocido' | 'respuesta_inconsistente' | 'detalle_ilegible'
	| 'cuota_futura' | 'sin_deuda' | 'error_api'

export const ETIQUETA_IMPORTACION: Record<ResultadoImportacion, string> = {
	importada: 'Importada',
	ya_importada: 'Ya importada',
	excluida_estado: 'Excluida por estado',
	excluida_tipo_documento: 'Excluida por tipo de documento',
	fuera_de_ventana: 'Fuera de la ventana',
	excede_recientes: 'Excede el máximo de recientes',
	frenada_tope: 'Frenada por tope',
	saldo_residual: 'Saldo residual',
	moneda_incoherente: 'Moneda incoherente',
	moneda_no_usd: 'Moneda distinta de USD',
	identificacion_invalida: 'Identificación inválida',
	estado_desconocido: 'Estado desconocido',
	respuesta_inconsistente: 'Respuesta inconsistente',
	detalle_ilegible: 'Periodo ilegible',
	cuota_futura: 'Cuota futura',
	sin_deuda: 'Sin deuda',
	error_api: 'Error de la API',
}

export interface ReglasImportacion {
	readonly estadosImportables: readonly string[]
	/** Months back from the current period; null = no window. */
	readonly ventanaMeses: number | null
	/** Most recent installments kept per contract; null = all. */
	readonly maxCuotasRecientes: number | null
	readonly diasGracia: number
	readonly tiposExcluidos: readonly TipoDocumento[]
	/** Ratio under which a USD installment is considered absurd against the plan price. */
	readonly umbralMonedaIncoherente: number
}

/** A pending installment already validated and read from contrato/individual. */
export interface CuotaLeida {
	readonly deudaId: string
	readonly contratoId: number
	readonly montoCents: number
	readonly periodo: string
	readonly descripcion: string
}

/** Contract data as Cobrix keeps it (from the first row of contrato/individual). */
export interface ContratoLeido {
	readonly id: number
	readonly codigo: string
	readonly estado: string
	readonly plan: string
	readonly precioCents: number
	readonly moneda: string
	readonly sucursal: string
	readonly direccion: string
	readonly titular: { readonly identificacionOriginal: string; readonly nombre: string; readonly correo: string; readonly telefono: string }
}

export interface ItemImportacion {
	readonly contratoId: number
	readonly deudaId: string | null
	readonly periodo: string | null
	readonly montoCents: number | null
	readonly resultado: ResultadoImportacion
	readonly motivo: string
}

export interface ContratoClasificado {
	readonly contrato: ContratoLeido | null
	readonly identificacion: Identificacion | null
	/** Installments that passed every per-contract rule, oldest first, before run caps and dedup. */
	readonly candidatas: readonly CuotaLeida[]
	/** Final items for installments (or the whole contract) excluded here. */
	readonly excluidas: readonly ItemImportacion[]
}

type Row = Record<string, unknown>
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Classifies the answer of `contrato/individual` for one contract. Per-contract problems
 * exclude the whole contract with one item; per-installment ones produce one item each.
 */
export function clasificarContrato(
	contratoId: number, respuesta: unknown, reglas: ReglasImportacion, periodoActual: string,
): ContratoClasificado {
	const todo = (resultado: ResultadoImportacion, motivo: string, contrato: ContratoLeido | null = null, identificacion: Identificacion | null = null): ContratoClasificado =>
		({ contrato, identificacion, candidatas: [], excluidas: [{ contratoId, deudaId: null, periodo: null, montoCents: null, resultado, motivo }] })

	if (!Array.isArray(respuesta)) return todo('respuesta_inconsistente', 'La API no devolvió una lista de cuotas')
	if (respuesta.length === 0) return todo('respuesta_inconsistente', 'La API devolvió una lista vacía (debería traer al menos la fila «sin deuda»)')
	if (!respuesta.every(isRow)) return todo('respuesta_inconsistente', 'Hay filas que no son objetos')
	const rows = respuesta as Row[]

	const ajenas = rows.filter(row => row.contrato_id !== contratoId)
	if (ajenas.length) return todo('respuesta_inconsistente', `Trae ${ajenas.length} fila(s) de otro contrato (${[...new Set(ajenas.map(r => String(r.contrato_id)))].join(', ')})`)

	const first = rows[0]!
	// Fields that describe the contract must agree in every row.
	for (const field of ['estado', 'identificacion_contrato', 'moneda_sigla', 'precio_servicio', 'nombre_plan'] as const) {
		const values = new Set(rows.map(row => JSON.stringify(row[field])))
		if (values.size > 1) return todo('respuesta_inconsistente', `Las filas no coinciden en «${field}»`)
	}

	const contrato: ContratoLeido = {
		id: contratoId,
		codigo: String(first.codigo ?? ''),
		estado: String(first.estado ?? ''),
		plan: String(first.nombre_plan ?? ''),
		precioCents: toCents(Number(first.precio_servicio)),
		moneda: String(first.moneda_sigla ?? ''),
		sucursal: String(first.sigla_sucursal ?? first.nombre_sucursal ?? ''),
		direccion: String(first.direccion ?? ''),
		titular: {
			identificacionOriginal: String(first.identificacion_contrato ?? ''),
			nombre: String(first.nombre_contrato ?? '').trim(),
			correo: String(first.email ?? '').trim().toLowerCase(),
			telefono: String(first.telefono ?? '').trim(),
		},
	}

	if (!esEstadoConocido(contrato.estado)) return todo('estado_desconocido', `Estado «${contrato.estado || 'vacío'}» no reconocido: no se adivina`, contrato)

	// The «no debt» row: deuda_id "0". Mixed with real installments it is a contradiction.
	const sinDeuda = rows.filter(row => row.deuda_id === '0')
	if (sinDeuda.length) {
		if (rows.length > 1) return todo('respuesta_inconsistente', 'Mezcla la fila «sin deuda» (deuda_id 0) con cuotas', contrato)
		return todo('sin_deuda', 'El contrato no tiene cuotas pendientes', contrato)
	}

	const ids = rows.map(row => row.deuda_id)
	if (!ids.every(id => typeof id === 'string' && /^\d+$/.test(id))) return todo('respuesta_inconsistente', 'Hay cuotas sin deuda_id numérico', contrato)
	if (new Set(ids).size !== ids.length) return todo('respuesta_inconsistente', 'La misma cuota (deuda_id) viene repetida', contrato)
	if (!rows.every(row => typeof row.deuda === 'number' && Number.isFinite(row.deuda) && row.deuda >= 0)) {
		return todo('respuesta_inconsistente', 'Hay cuotas con un monto de deuda no numérico o negativo', contrato)
	}

	const identificacion = normalizarIdentificacion(contrato.titular.identificacionOriginal)
	if (!identificacion) return todo('identificacion_invalida', `Identificación «${contrato.titular.identificacionOriginal}» inválida`, contrato)

	// From here on: one item per installment.
	const excluidas: ItemImportacion[] = []
	const leidas: CuotaLeida[] = []
	for (const row of rows) {
		const descripcion = Array.isArray(row.detalle_deuda) ? String(row.detalle_deuda[0] ?? '') : ''
		const periodo = periodoDeDetalle(descripcion)
		const montoCents = toCents(row.deuda as number)
		const base = { contratoId, deudaId: row.deuda_id as string, periodo, montoCents }
		if (!periodo) excluidas.push({ ...base, resultado: 'detalle_ilegible', motivo: `No se pudo leer el periodo de «${descripcion}»` })
		else leidas.push({ deudaId: row.deuda_id as string, contratoId, montoCents, periodo, descripcion })
	}

	const excluirTodas = (resultado: ResultadoImportacion, motivo: string): ContratoClasificado => ({
		contrato, identificacion, candidatas: [],
		excluidas: [...excluidas, ...leidas.map(c => ({ contratoId, deudaId: c.deudaId, periodo: c.periodo, montoCents: c.montoCents, resultado, motivo }))],
	})

	if (!reglas.estadosImportables.includes(contrato.estado)) return excluirTodas('excluida_estado', `Contrato ${contrato.estado}: estado no importable`)
	if (contrato.moneda !== 'USD') return excluirTodas('moneda_no_usd', `El contrato está en ${contrato.moneda || 'moneda desconocida'}`)
	if (!(contrato.precioCents > 0)) return excluirTodas('moneda_incoherente', 'No se puede validar la moneda: el plan no trae precio')
	const mayor = Math.max(...leidas.map(c => c.montoCents), 0)
	if (leidas.length && mayor < contrato.precioCents * reglas.umbralMonedaIncoherente) {
		return {
			contrato, identificacion, candidatas: [],
			excluidas: [...excluidas, { contratoId, deudaId: null, periodo: null, montoCents: null, resultado: 'moneda_incoherente',
				motivo: `Reporta USD pero sus cuotas (máx. USD ${(mayor / 100).toFixed(2)}) son menos del ${reglas.umbralMonedaIncoherente * 100} % del plan (USD ${(contrato.precioCents / 100).toFixed(2)})` }],
		}
	}
	if (identificacion.tipo && reglas.tiposExcluidos.includes(identificacion.tipo)) {
		return excluirTodas('excluida_tipo_documento', `Documento tipo ${identificacion.tipo} excluido en la configuración`)
	}

	const vigentes: CuotaLeida[] = []
	for (const cuota of leidas) {
		const base = { contratoId, deudaId: cuota.deudaId, periodo: cuota.periodo, montoCents: cuota.montoCents }
		if (cuota.montoCents === 0) excluidas.push({ ...base, resultado: 'saldo_residual', motivo: 'Saldo menor a un centavo' })
		else if (cuota.periodo > periodoActual) excluidas.push({ ...base, resultado: 'cuota_futura', motivo: `Periodo ${cuota.periodo} posterior al actual` })
		else if (reglas.ventanaMeses !== null && cuota.periodo < restarMeses(periodoActual, reglas.ventanaMeses)) {
			excluidas.push({ ...base, resultado: 'fuera_de_ventana', motivo: `Anterior a ${restarMeses(periodoActual, reglas.ventanaMeses)} (ventana de ${reglas.ventanaMeses} meses)` })
		} else vigentes.push(cuota)
	}

	// Keep the most recent N; the rest are reported, never silently dropped.
	vigentes.sort((a, b) => a.periodo.localeCompare(b.periodo) || a.deudaId.localeCompare(b.deudaId))
	let candidatas = vigentes
	if (reglas.maxCuotasRecientes !== null && vigentes.length > reglas.maxCuotasRecientes) {
		const sobran = vigentes.length - reglas.maxCuotasRecientes
		for (const cuota of vigentes.slice(0, sobran)) {
			excluidas.push({ contratoId, deudaId: cuota.deudaId, periodo: cuota.periodo, montoCents: cuota.montoCents, resultado: 'excede_recientes',
				motivo: `Se conservan las ${reglas.maxCuotasRecientes} más recientes` })
		}
		candidatas = vigentes.slice(sobran)
	}
	return { contrato, identificacion, candidatas, excluidas }
}

export function restarMeses(periodo: string, meses: number): string {
	const [y, m] = periodo.split('-').map(Number) as [number, number]
	const index = y * 12 + (m - 1) - meses
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

// ---------------------------------------------------------------- payments classification

export type ResultadoPago = 'pagada' | 'abono_parcial' | 'sigue_abierta' | 'exonerada' | 'sin_evidencia' | 'inconsistente' | 'error_api'

export const ETIQUETA_PAGO: Record<ResultadoPago, string> = {
	pagada: 'Marcada pagada',
	abono_parcial: 'Abono parcial',
	sigue_abierta: 'Sigue abierta',
	exonerada: 'Exonerada (no es pago)',
	sin_evidencia: 'Sin evidencia',
	inconsistente: 'Libro inconsistente',
	error_api: 'Error de la API',
}

export interface EvaluacionPago {
	readonly resultado: ResultadoPago
	readonly motivo: string
	/** Balance the invoice manager reports for the installment, in cents. */
	readonly saldoAdminCents: number | null
	/** Invoice of the invoice manager that settled it (when paid). */
	readonly facturaAdmin: { readonly id: number; readonly numero: string; readonly fecha: string } | null
}

interface FilaLibro { readonly idFactura: number; readonly numFactura: string; readonly fecha: string; readonly saldo: number; readonly pagado: number; readonly descuento: number; readonly tarifa: number }

/**
 * Decides whether an open Cobrix invoice is paid, from the `pago_informacion` rows of its
 * installment (CUOTA mode). `filas` may contain rows of other installments: they are ignored.
 */
export function evaluarPago(deudaId: string, contratoId: number, saldoCobrixCents: number, filasLibro: readonly unknown[]): EvaluacionPago {
	const propias: FilaLibro[] = []
	for (const row of filasLibro) {
		if (!isRow(row) || !isRow(row.detalle_pago)) continue
		const detalle = row.detalle_pago
		if (String(detalle.id_cuota) !== deudaId) continue
		const numeros = [detalle.saldo_cuota, detalle.valor_pago, detalle.descuento, detalle.tarifa]
		if (!numeros.every(n => typeof n === 'number' && Number.isFinite(n)) || typeof row.id_factura !== 'number') {
			return { resultado: 'inconsistente', motivo: 'Una fila del libro trae montos no numéricos', saldoAdminCents: null, facturaAdmin: null }
		}
		if (Number(detalle.id_contrato) !== contratoId) {
			return { resultado: 'inconsistente', motivo: `El libro asocia la cuota al contrato ${String(detalle.id_contrato)}`, saldoAdminCents: null, facturaAdmin: null }
		}
		propias.push({
			idFactura: row.id_factura, numFactura: String(row.num_factura ?? ''), fecha: String(row.fecha_emision ?? ''),
			saldo: detalle.saldo_cuota as number, pagado: detalle.valor_pago as number, descuento: detalle.descuento as number, tarifa: detalle.tarifa as number,
		})
	}
	if (propias.length === 0) return { resultado: 'sin_evidencia', motivo: 'La cuota no aparece en el libro de pagos', saldoAdminCents: null, facturaAdmin: null }

	const firma = (f: FilaLibro) => [toCents(f.saldo), toCents(f.pagado), toCents(f.descuento), toCents(f.tarifa)].join('|')
	if (new Set(propias.map(firma)).size > 1) {
		return { resultado: 'inconsistente', motivo: 'Las filas de la cuota no coinciden entre sí: no se adivina', saldoAdminCents: null, facturaAdmin: null }
	}
	const fila = propias[0]!
	const saldoAdminCents = toCents(fila.saldo)
	const pagadoCents = toCents(fila.pagado)

	if (saldoAdminCents === 0) {
		if (pagadoCents <= 0) return { resultado: 'exonerada', motivo: 'Saldo 0 sin nada pagado (exonerada o descuento): no es un pago', saldoAdminCents, facturaAdmin: null }
		const cobros = propias.filter(f => f.idFactura !== 0).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.idFactura - b.idFactura)
		const ultima = cobros.at(-1)
		if (!ultima) return { resultado: 'inconsistente', motivo: 'Saldo 0 y monto pagado, pero sin factura de cobro asociada', saldoAdminCents, facturaAdmin: null }
		return { resultado: 'pagada', motivo: `Cobrada en el ISP (factura ${ultima.numFactura} del ${ultima.fecha})`, saldoAdminCents,
			facturaAdmin: { id: ultima.idFactura, numero: ultima.numFactura, fecha: ultima.fecha } }
	}
	if (saldoAdminCents < saldoCobrixCents) {
		return { resultado: 'abono_parcial', motivo: `Abono parcial: el ISP cobró USD ${((saldoCobrixCents - saldoAdminCents) / 100).toFixed(2)} y quedan USD ${(saldoAdminCents / 100).toFixed(2)}`, saldoAdminCents, facturaAdmin: null }
	}
	if (saldoAdminCents > saldoCobrixCents) {
		return { resultado: 'inconsistente', motivo: `El ISP reporta un saldo (USD ${(saldoAdminCents / 100).toFixed(2)}) mayor que el de Cobrix`, saldoAdminCents, facturaAdmin: null }
	}
	return { resultado: 'sigue_abierta', motivo: 'Sin cobros nuevos en el ISP', saldoAdminCents, facturaAdmin: null }
}
