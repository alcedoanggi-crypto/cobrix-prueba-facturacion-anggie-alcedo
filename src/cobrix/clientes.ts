/**
 * Customers created by hand in Cobrix. They follow the same identity rule as imported ones
 * (normalized identification, one customer per holder), so a later import attaches the
 * holder's contracts and invoices to this same customer instead of duplicating it.
 */

import { normalizarIdentificacion, type Identificacion } from './reglas.ts'
import type { Store } from './store.ts'

/** A problem the operator can fix in the form. */
export class ErrorValidacion extends Error {
	readonly campo: string
	constructor(campo: string, mensaje: string) {
		super(mensaje)
		this.name = 'ErrorValidacion'
		this.campo = campo
	}
}

export interface DatosCliente { documento: string; nombre: string; correo: string; telefono: string }

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TELEFONO = /^\+?[\d\s()-]{7,20}$/

/** Reads the identification as the import would; the error says how to write it. */
export function leerDocumento(documento: string): Identificacion {
	const ident = normalizarIdentificacion(documento)
	if (!ident) throw new ErrorValidacion('documento', 'Documento inválido: usa una letra opcional (V, E, J, G o P) y de 6 a 12 dígitos, por ejemplo V-12345678 o J-40123456-7.')
	return ident
}

function validarContacto(correo: string, telefono: string): void {
	if (correo && !CORREO.test(correo)) throw new ErrorValidacion('correo', 'El correo no es válido, por ejemplo cliente@correo.com.')
	if (telefono && !TELEFONO.test(telefono)) throw new ErrorValidacion('telefono', 'El teléfono solo puede tener dígitos, espacios, guiones y paréntesis (7 a 20 caracteres).')
}

export function crearCliente(store: Store, datos: DatosCliente): number {
	const nombre = datos.nombre.trim().replace(/\s+/g, ' ')
	if (nombre.length < 3) throw new ErrorValidacion('nombre', 'Escribe el nombre o la razón social (al menos 3 caracteres).')
	if (nombre.length > 120) throw new ErrorValidacion('nombre', 'El nombre es demasiado largo (máximo 120 caracteres).')
	const ident = leerDocumento(datos.documento)
	const correo = datos.correo.trim().toLowerCase()
	const telefono = datos.telefono.trim()
	validarContacto(correo, telefono)

	return store.transaccion(() => {
		const existente = store.db.prepare('SELECT id, nombre FROM clientes WHERE id_externo = ?').get(ident.id) as { id: number; nombre: string } | undefined
		if (existente) throw new ErrorValidacion('documento', `Ya existe un cliente con ese documento: ${existente.nombre} (ID ${ident.id}).`)
		const ahora = new Date().toISOString()
		const r = store.db.prepare(`INSERT INTO clientes (id_externo, documento, tipo_documento, persona, nombre, correo, telefono, origen, creado_en)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(ident.id, datos.documento.trim().toUpperCase(), ident.tipo, ident.persona, nombre.toUpperCase(), correo, telefono, 'Creado en Cobrix', ahora)
		const id = Number(r.lastInsertRowid)
		store.db.prepare('INSERT INTO eventos (cliente_id, factura_id, tipo, fecha, titulo, detalle) VALUES (?, NULL, ?, ?, ?, ?)')
			.run(id, 'cliente_creado', ahora, 'Cliente creado', 'Creado a mano desde el panel. Si el administrador trae a este titular, sus contratos y facturas se agregarán aquí.')
		return id
	})
}

export function actualizarContacto(store: Store, id: number, correo: string, telefono: string): void {
	const c = correo.trim().toLowerCase()
	const t = telefono.trim()
	validarContacto(c, t)
	const antes = store.db.prepare('SELECT correo, telefono FROM clientes WHERE id = ?').get(id) as { correo: string; telefono: string } | undefined
	if (!antes) throw new ErrorValidacion('cliente', 'Ese cliente no existe.')
	if (antes.correo === c && antes.telefono === t) return
	store.transaccion(() => {
		store.db.prepare('UPDATE clientes SET correo = ?, telefono = ? WHERE id = ?').run(c, t, id)
		const cambios = [antes.correo !== c ? `correo: ${antes.correo || '—'} → ${c || '—'}` : '', antes.telefono !== t ? `teléfono: ${antes.telefono || '—'} → ${t || '—'}` : ''].filter(Boolean).join(' · ')
		store.db.prepare('INSERT INTO eventos (cliente_id, factura_id, tipo, fecha, titulo, detalle) VALUES (?, NULL, ?, ?, ?, ?)')
			.run(id, 'contacto_actualizado', new Date().toISOString(), 'Contacto actualizado', cambios)
	})
}

/** Invoice detail for the modal: the invoice plus its own history. */
export function detalleFactura(store: Store, id: number): Record<string, unknown> | undefined {
	const f = store.db.prepare(`SELECT f.*, c.nombre AS cliente, k.plan, k.estado AS estado_contrato FROM facturas f
		JOIN clientes c ON c.id = f.cliente_id LEFT JOIN contratos k ON k.id = f.contrato_id WHERE f.id = ?`).get(id) as Record<string, unknown> | undefined
	if (!f) return undefined
	const eventos = store.db.prepare('SELECT tipo, fecha, titulo, detalle FROM eventos WHERE factura_id = ? ORDER BY fecha, id').all(id)
	return { ...f, eventos }
}
