/**
 * Modal dialogs. Native <dialog> elements: keyboard, focus trap and Escape come from the
 * browser. Without JavaScript the «Nuevo cliente» modal renders open in the page
 * (?nuevo=1) and its form posts normally, so nothing depends on the script.
 */

import { html, raw, type Raw } from './layout.ts'

const ICONO: Record<string, string> = {
	cliente: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.3-6 8-6s6.8 2 8 6"/><path d="M19 3v4M17 5h4"/>',
	contacto: '<path d="M4 6h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
	factura: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
	conexion: '<path d="M5 12a7 7 0 0 1 14 0"/><path d="M8.5 12a3.5 3.5 0 0 1 7 0"/><circle cx="12" cy="12" r="1"/><path d="M12 13v8"/>',
	corrida: '<path d="M20 11a8 8 0 0 0-14.6-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L21 15"/><path d="M21 20v-5h-5"/>',
}

function cabecera(icono: string, titulo: string, subtitulo: string, idTitulo: string): Raw {
	return html`<header class="modal-cab">
		<span class="modal-icono"><svg viewBox="0 0 24 24" aria-hidden="true">${raw(ICONO[icono] ?? '')}</svg></span>
		<div><h2 id="${idTitulo}">${titulo}</h2><p data-subtitulo>${subtitulo}</p></div>
		<button type="button" class="modal-x" data-cerrar aria-label="Cerrar">×</button>
	</header>`
}

/** «Nuevo cliente»: live ID preview (same normalization as the import) and an initials avatar. */
export function modalNuevoCliente(abierto: boolean): Raw {
	return html`<dialog class="modal" id="m-nuevo-cliente" aria-labelledby="t-nuevo-cliente" ${abierto ? raw('open') : ''}>
		<form method="post" action="/clientes" data-ajax novalidate>
			${cabecera('cliente', 'Nuevo cliente', 'Se identifica igual que al importar: un cliente por cédula o RIF.', 't-nuevo-cliente')}
			<div class="modal-cuerpo dos">
				<div class="campos">
					<label class="field">Cédula o RIF<input type="text" name="documento" required autocomplete="off" placeholder="V-12345678" data-vista-documento maxlength="20"></label>
					<label class="field">Nombre o razón social<input type="text" name="nombre" required minlength="3" maxlength="120" placeholder="María Pérez" data-vista-nombre autocomplete="off"></label>
					<label class="field">Correo <small>opcional</small><input type="email" name="correo" placeholder="cliente@correo.com" autocomplete="off"></label>
					<label class="field">Teléfono <small>opcional</small><input type="text" name="telefono" placeholder="0412 1234567" inputmode="tel" autocomplete="off"></label>
				</div>
				<aside class="ficha" data-ficha aria-live="polite">
					<span class="ficha-avatar" data-avatar>?</span>
					<strong class="ficha-nombre" data-ficha-nombre>Nombre del cliente</strong>
					<dl>
						<dt>ID en Cobrix</dt><dd class="mono" data-ficha-id>—</dd>
						<dt>Persona</dt><dd data-ficha-persona>—</dd>
					</dl>
					<p class="ficha-nota" data-ficha-nota>Escribe el documento para ver cómo lo guarda Cobrix.</p>
				</aside>
			</div>
			<p class="modal-error" data-error role="alert" hidden></p>
			<footer class="modal-pie"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primary" data-ocupado="Creando…">Crear cliente</button></footer>
		</form>
	</dialog>`
}

export function modalContacto(id: number, correo: string, telefono: string): Raw {
	return html`<dialog class="modal angosto" id="m-contacto" aria-labelledby="t-contacto">
		<form method="post" action="/clientes/${id}/contacto" data-ajax novalidate>
			${cabecera('contacto', 'Editar contacto', 'Solo cambia los datos en Cobrix; el administrador del ISP no se toca.', 't-contacto')}
			<div class="modal-cuerpo">
				<label class="field">Correo<input type="email" name="correo" value="${correo}" placeholder="cliente@correo.com"></label>
				<label class="field">Teléfono<input type="text" name="telefono" value="${telefono}" inputmode="tel" placeholder="0412 1234567"></label>
				<p class="subtle">El cambio queda en el historial del cliente.</p>
			</div>
			<p class="modal-error" data-error role="alert" hidden></p>
			<footer class="modal-pie"><button type="button" class="btn" data-cerrar>Cancelar</button><button class="btn primary" data-ocupado="Guardando…">Guardar</button></footer>
		</form>
	</dialog>`
}

/** Filled by the script from /api/facturas/:id. */
export function modalFactura(): Raw {
	return html`<dialog class="modal" id="m-factura" aria-labelledby="t-factura">
		${cabecera('factura', 'Factura', '', 't-factura')}
		<div class="modal-cuerpo" data-factura-cuerpo><p class="subtle">Cargando…</p></div>
		<footer class="modal-pie"><button type="button" class="btn" data-cerrar>Cerrar</button></footer>
	</dialog>`
}

/** Live run: a progress ring that turns into the summary. Lives in every page (layout). */
export function modalCorrida(): string {
	return html`<dialog class="modal angosto" id="m-corrida" aria-labelledby="t-corrida">
		${cabecera('corrida', 'Corrida', 'Preparando…', 't-corrida')}
		<div class="modal-cuerpo centro">
			<div class="anillo" data-anillo style="--p:0">
				<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="pista-anillo" cx="60" cy="60" r="52"/><circle class="valor-anillo" cx="60" cy="60" r="52"/></svg>
				<div class="anillo-texto"><strong data-anillo-pct>0 %</strong><span data-anillo-sub>conectando…</span></div>
			</div>
			<div class="resumen-corrida" data-resumen hidden></div>
			<p class="modal-error" data-error role="alert" hidden></p>
		</div>
		<footer class="modal-pie"><button type="button" class="btn" data-cerrar data-recargar>Cerrar</button><a class="btn primary" data-ver-detalle hidden href="#">Ver detalle</a></footer>
	</dialog>`.html
}

export function modalConexion(): Raw {
	return html`<dialog class="modal angosto" id="m-conexion" aria-labelledby="t-conexion">
		${cabecera('conexion', 'Probar conexión', 'Se prueba con los datos del formulario, sin guardarlos.', 't-conexion')}
		<div class="modal-cuerpo"><ol class="pasos" data-pasos></ol></div>
		<footer class="modal-pie"><button type="button" class="btn" data-cerrar>Cerrar</button></footer>
	</dialog>`
}
