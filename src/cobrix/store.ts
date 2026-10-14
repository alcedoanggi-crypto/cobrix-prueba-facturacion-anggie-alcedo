/**
 * Cobrix's own storage (node:sqlite). Separate from the invoice manager's database: Cobrix
 * only learns about the ISP through HTTP. UNIQUE constraints back the idempotency rules.
 */

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { TipoDocumento } from './reglas.ts'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS clientes (
	id INTEGER PRIMARY KEY,
	id_externo TEXT NOT NULL UNIQUE,          -- normalized identification
	documento TEXT NOT NULL,                  -- as the invoice manager sends it
	tipo_documento TEXT,
	persona TEXT NOT NULL CHECK (persona IN ('natural','juridica')),
	nombre TEXT NOT NULL,
	correo TEXT NOT NULL DEFAULT '',
	telefono TEXT NOT NULL DEFAULT '',
	origen TEXT NOT NULL,
	creado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contratos (
	id INTEGER PRIMARY KEY,                   -- contract id in the invoice manager
	cliente_id INTEGER NOT NULL REFERENCES clientes(id),
	codigo TEXT NOT NULL,
	estado TEXT NOT NULL,
	plan TEXT NOT NULL,
	precio_cents INTEGER NOT NULL,
	moneda TEXT NOT NULL,
	sucursal TEXT NOT NULL,
	direccion TEXT NOT NULL,
	actualizado_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facturas (
	id INTEGER PRIMARY KEY,
	deuda_id TEXT NOT NULL UNIQUE,            -- installment id in the invoice manager: no duplicates, ever
	cliente_id INTEGER NOT NULL REFERENCES clientes(id),
	contrato_id INTEGER NOT NULL REFERENCES contratos(id),
	periodo TEXT NOT NULL,
	descripcion TEXT NOT NULL,
	vencimiento TEXT NOT NULL,
	corte TEXT NOT NULL,
	total_cents INTEGER NOT NULL CHECK (total_cents > 0),
	saldo_cents INTEGER NOT NULL,
	estado TEXT NOT NULL CHECK (estado IN ('abierta','pagada')),
	saldo_admin_cents INTEGER,                -- last balance seen in the invoice manager
	pagada_en TEXT,
	factura_admin TEXT,
	factura_admin_fecha TEXT,
	importada_en TEXT NOT NULL,
	corrida_id INTEGER
);
CREATE INDEX IF NOT EXISTS facturas_cliente ON facturas (cliente_id, estado);

CREATE TABLE IF NOT EXISTS eventos (
	id INTEGER PRIMARY KEY,
	cliente_id INTEGER NOT NULL REFERENCES clientes(id),
	factura_id INTEGER REFERENCES facturas(id),
	tipo TEXT NOT NULL,
	fecha TEXT NOT NULL,
	titulo TEXT NOT NULL,
	detalle TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS eventos_cliente ON eventos (cliente_id, fecha);

CREATE TABLE IF NOT EXISTS corridas (
	id INTEGER PRIMARY KEY,
	tipo TEXT NOT NULL CHECK (tipo IN ('importacion','pagadas')),
	simulacion INTEGER NOT NULL,
	origen TEXT NOT NULL CHECK (origen IN ('manual','automatica')),
	inicio TEXT NOT NULL,
	fin TEXT,
	estado TEXT NOT NULL CHECK (estado IN ('en_curso','completada','fallida')),
	error TEXT,
	resumen TEXT NOT NULL DEFAULT '{}',
	progreso_total INTEGER NOT NULL DEFAULT 0,
	progreso_hecho INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS corrida_items (
	id INTEGER PRIMARY KEY,
	corrida_id INTEGER NOT NULL REFERENCES corridas(id),
	contrato_id INTEGER,
	deuda_id TEXT,
	titular TEXT NOT NULL DEFAULT '',
	documento TEXT NOT NULL DEFAULT '',
	periodo TEXT,
	monto_cents INTEGER,
	resultado TEXT NOT NULL,
	motivo TEXT NOT NULL,
	factura TEXT
);
CREATE INDEX IF NOT EXISTS corrida_items_corrida ON corrida_items (corrida_id);
`

// ---------------------------------------------------------------- configuration

export interface Empresa { nombre: string; rif: string; correo: string }
export interface Proveedor { url: string; usuario: string; password: string }
export interface ConfigImportacion {
	estados: string[]
	ventanaMeses: number | null
	maxRecientes: number | null
	diasGracia: number
	topeFacturas: number | null
	topeMontoCents: number | null
	tiposExcluidos: TipoDocumento[]
}
export interface ConfigAutomatica { activa: boolean; hora: string }
export interface Configuracion { empresa: Empresa; proveedor: Proveedor; importacion: ConfigImportacion; automatica: ConfigAutomatica }

export const CONFIG_INICIAL: Configuracion = {
	empresa: { nombre: '', rif: '', correo: '' },
	proveedor: { url: '', usuario: '', password: '' },
	importacion: { estados: ['ACTIVO', 'CORTADO'], ventanaMeses: null, maxRecientes: null, diasGracia: 0, topeFacturas: null, topeMontoCents: null, tiposExcluidos: [] },
	automatica: { activa: false, hora: '06:00' },
}

// ---------------------------------------------------------------- rows

export interface Corrida {
	id: number; tipo: 'importacion' | 'pagadas'; simulacion: boolean; origen: 'manual' | 'automatica'
	inicio: string; fin: string | null; estado: 'en_curso' | 'completada' | 'fallida'; error: string | null
	resumen: Record<string, number>; progresoTotal: number; progresoHecho: number
}

export interface ItemCorrida {
	contratoId: number | null; deudaId: string | null; titular: string; documento: string
	periodo: string | null; montoCents: number | null; resultado: string; motivo: string; factura: string | null
}

type Row = Record<string, unknown>

export class Store {
	readonly db: DatabaseSync

	constructor(path: string) {
		if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
		this.db = new DatabaseSync(path)
		this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
		this.db.exec(SCHEMA)
		// A process that died mid-run must not leave a run «en curso» forever.
		this.db.prepare(`UPDATE corridas SET estado = 'fallida', fin = ?, error = 'El proceso se detuvo antes de terminar la corrida.' WHERE estado = 'en_curso'`).run(new Date().toISOString())
	}

	close(): void {
		this.db.close()
	}

	/** Runs `fn` in a transaction: all or nothing. */
	transaccion<T>(fn: () => T): T {
		this.db.exec('BEGIN IMMEDIATE')
		try {
			const result = fn()
			this.db.exec('COMMIT')
			return result
		} catch (error) {
			this.db.exec('ROLLBACK')
			throw error
		}
	}

	// ------------------------------------------------------------ config

	config(): Configuracion {
		const rows = this.db.prepare('SELECT clave, valor FROM config').all() as Array<{ clave: string; valor: string }>
		const saved = Object.fromEntries(rows.map(r => [r.clave, JSON.parse(r.valor) as unknown]))
		return {
			empresa: { ...CONFIG_INICIAL.empresa, ...(saved.empresa as Partial<Empresa>) },
			proveedor: { ...CONFIG_INICIAL.proveedor, ...(saved.proveedor as Partial<Proveedor>) },
			importacion: { ...CONFIG_INICIAL.importacion, ...(saved.importacion as Partial<ConfigImportacion>) },
			automatica: { ...CONFIG_INICIAL.automatica, ...(saved.automatica as Partial<ConfigAutomatica>) },
		}
	}

	guardarConfig<K extends keyof Configuracion>(clave: K, valor: Configuracion[K]): void {
		this.db.prepare('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor').run(clave, JSON.stringify(valor))
	}

	tieneConfig(clave: keyof Configuracion): boolean {
		return this.db.prepare('SELECT 1 FROM config WHERE clave = ?').get(clave) !== undefined
	}

	// ------------------------------------------------------------ runs

	crearCorrida(tipo: Corrida['tipo'], simulacion: boolean, origen: Corrida['origen']): number {
		const r = this.db.prepare(`INSERT INTO corridas (tipo, simulacion, origen, inicio, estado) VALUES (?, ?, ?, ?, 'en_curso')`)
			.run(tipo, simulacion ? 1 : 0, origen, new Date().toISOString())
		return Number(r.lastInsertRowid)
	}

	progreso(id: number, hecho: number, total: number): void {
		this.db.prepare('UPDATE corridas SET progreso_hecho = ?, progreso_total = ? WHERE id = ?').run(hecho, total, id)
	}

	cerrarCorrida(id: number, estado: 'completada' | 'fallida', resumen: Record<string, number>, error: string | null = null): void {
		this.db.prepare('UPDATE corridas SET estado = ?, fin = ?, resumen = ?, error = ? WHERE id = ?')
			.run(estado, new Date().toISOString(), JSON.stringify(resumen), error, id)
	}

	agregarItems(corridaId: number, items: readonly ItemCorrida[]): void {
		const stmt = this.db.prepare(`INSERT INTO corrida_items (corrida_id, contrato_id, deuda_id, titular, documento, periodo, monto_cents, resultado, motivo, factura)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
		for (const i of items) stmt.run(corridaId, i.contratoId, i.deudaId, i.titular, i.documento, i.periodo, i.montoCents, i.resultado, i.motivo, i.factura)
	}

	corrida(id: number): Corrida | undefined {
		const row = this.db.prepare('SELECT * FROM corridas WHERE id = ?').get(id) as Row | undefined
		return row ? aCorrida(row) : undefined
	}

	corridas(limite = 50): Corrida[] {
		return (this.db.prepare('SELECT * FROM corridas ORDER BY id DESC LIMIT ?').all(limite) as Row[]).map(aCorrida)
	}

	itemsCorrida(id: number): ItemCorrida[] {
		return (this.db.prepare('SELECT * FROM corrida_items WHERE corrida_id = ? ORDER BY id').all(id) as Row[]).map(r => ({
			contratoId: r.contrato_id as number | null, deudaId: r.deuda_id as string | null, titular: String(r.titular), documento: String(r.documento),
			periodo: r.periodo as string | null, montoCents: r.monto_cents as number | null, resultado: String(r.resultado), motivo: String(r.motivo),
			factura: r.factura as string | null,
		}))
	}
}

function aCorrida(row: Row): Corrida {
	return {
		id: row.id as number, tipo: row.tipo as Corrida['tipo'], simulacion: row.simulacion === 1, origen: row.origen as Corrida['origen'],
		inicio: String(row.inicio), fin: row.fin as string | null, estado: row.estado as Corrida['estado'], error: row.error as string | null,
		resumen: JSON.parse(String(row.resumen)) as Record<string, number>,
		progresoTotal: row.progreso_total as number, progresoHecho: row.progreso_hecho as number,
	}
}

export const numeroFactura = (id: number): string => `FAC-${String(id).padStart(6, '0')}`
