# Nota de decisiones

## Stack

Construí sobre el esqueleto: **Node 24 + TypeScript, sin dependencias de ejecución.** Node 24 trae `node:sqlite`, `fetch` y ejecuta TypeScript directamente, así que `npm install && npm start` basta en cualquier máquina. Preferí poner el esfuerzo en interpretar bien la API, que es lo que más pesa, antes que en una cadena de compilación. El panel se renderiza en el servidor con formularios POST → redirect → GET: funciona sin JavaScript, y un script pequeño añade confirmaciones, progreso en vivo y filtro inmediato. El diseño parte de los tokens del esqueleto, con modo oscuro incluido.

## Decisiones

**Reglas como funciones puras.** `clasificarContrato()` y `evaluarPago()`, en `src/cobrix/reglas.ts`, reciben la respuesta cruda de la API y devuelven un resultado con su motivo. No tocan HTTP ni la base, así que cada regla del §4 tiene su prueba unitaria.

**Una corrida se aplica completa o no se aplica.** La importación primero lee y clasifica todo, y después escribe en una sola transacción. Distingo dos tipos de error:
- **Error de conexión** (la API no responde): la corrida falla sin escribir nada.
- **Error HTTP en un contrato concreto:** queda como «Error de la API» en ese contrato y el resto sigue. Lo que no entró se importa en la siguiente corrida, sin duplicar.

**Idempotencia en dos capas.** El código descarta las cuotas ya importadas, y además la base tiene `UNIQUE(deuda_id)` en facturas y `UNIQUE(id_externo)` en clientes.

**Nada se adivina.** El contrato entero queda fuera, con un motivo visible, en estos casos:
- la respuesta no es una lista;
- trae filas de otro contrato o cuotas duplicadas;
- las filas no coinciden en estado, documento, moneda o plan;
- mezcla la fila «sin deuda» con cuotas;
- tiene un estado desconocido o una identificación ilegible.

En pagos, si las filas de una cuota no coinciden entre sí, el libro se trata como inconsistente y la factura no se marca pagada.

**Moneda incoherente.** Comparo la cuota **más alta** del contrato con el precio del plan. Comparar cada cuota por separado haría que un abono parcial previo, o un residual, parecieran «moneda incoherente».

**Topes por corrida.** Entran primero las cuotas más viejas: es la deuda más urgente de cobrar. Lo que excede queda como «Frenada por tope» y entra en una corrida posterior.

**Clientes y contratos.** Se crea un cliente solo cuando recibe al menos una factura. Sus datos salen de su contrato de número más bajo. Los contratos de un cliente se actualizan (estado, plan, precio) en cada importación real.

**Numeración.** `FAC-000001` en adelante. Se numera agrupando por contrato y periodo, para que las facturas de un cliente queden en orden.

**Abono parcial.** No cambia el saldo de la factura en Cobrix. Así lo exigen los criterios: 34 abiertas por USD 955,00, que es la suma de los montos completos. Lo que reporta el ISP se guarda aparte (`saldo_admin_cents`), se muestra en el expediente y en «Requiere atención», y queda una sola vez en el historial: repetir la actualización no lo duplica.

**Libro de cuotas.**
- Lo pido por contrato con `tipo_busqueda=CUOTA`, desde el mes anterior a la factura abierta más vieja hasta el fin del mes en curso.
- Ignoro `success`, porque viene en `false` aunque haya datos.
- Filtro las filas por `id_cuota`, y así descarto las futuras.
- La fecha de pago es la de la última factura del ISP que tocó la cuota.
- Si una cuota no está en el libro, consulto `contrato/individual` antes de concluir «sin evidencia»: es el caso de la cuota del mes en curso.

**Token.** El vencimiento llega en UTC sin zona; lo leo explícitamente como UTC. Se renueva un minuto antes de vencer y, ante un 401 inesperado, se inicia sesión de nuevo una sola vez.

**`lista_ids_contratos` nunca recibe `estado`.** Con cualquier valor, la API devuelve solo los contratos activos. Si `pagination.total` no coincide con los ids recibidos, la corrida se detiene: prefiero eso a dejar contratos fuera sin avisar.

**Corrida automática.** Se revisa cada 30 s. Si ya pasó la hora elegida (America/Caracas) y hoy no corrió, importa y después actualiza pagadas. El día se marca antes de empezar: si la importación falla, el operador ve la corrida fallida en lugar de un bucle de reintentos.

**Clientes creados a mano.** El enunciado hace nacer a los clientes de la API del ISP. Agregué la creación manual (útil para registrar a un cliente antes de que el ISP lo sincronice) sin romper esa regla:
- El documento pasa por **la misma normalización** que la importación, así que `V-12.345.678` y `V12345678` son el mismo cliente y no se puede repetir.
- El cliente queda marcado con origen «Creado en Cobrix».
- Si después la importación trae a ese titular, sus contratos y facturas **se agregan a ese cliente**, sin duplicarlo. Hay una prueba para ese caso.
- Solo se pueden editar el correo y el teléfono, y cada cambio queda en el historial. El nombre y el documento vienen del ISP.

**Modales nativos.** Uso `<dialog>`, que da gratis el foco atrapado, Escape y la accesibilidad. Los formularios de los modales se envían con `fetch` y muestran el error junto al campo. Sin JavaScript siguen funcionando: el de «Nuevo cliente» se abre en la página con `?nuevo=1` y su formulario se envía normalmente.

**Configuración precargada.** En el primer `npm start` dejo el proveedor apuntando a la API local, para que el evaluador pueda sincronizar de inmediato. La contraseña nunca se envía al HTML; si el campo queda vacío al guardar, se conserva la actual.

**Ambigüedades que resolví:**
- El vencimiento es el primer día del periodo, como sugiere el enunciado. El corte es el vencimiento más los días de gracia.
- Sin letra de tipo, la identificación se trata como persona natural y no la afecta la exclusión por tipo de documento.
- «Excluidas por estado» se cuenta por cuota (las 9 del criterio). «Moneda incoherente» y «sin deuda» se cuentan por contrato.

## Cambios a lo entregado

- **`test/entorno.test.ts`:** fallaba en Windows porque usaba `new URL(...).pathname` como ruta de archivo; lo cambié por `fileURLToPath`. Además, comprobaba que cada pantalla dijera «Por implementar»; ahora comprueba las pantallas reales y mantiene sus otras verificaciones (sin pantalla de simulador, enunciado disponible).
- **`src/main.ts`:** crea el almacenamiento de Cobrix y la corrida automática.
- No toqué `src/billing-api/` ni `data/billing-api.sqlite`.

## Qué dejé fuera

- **Autenticación del panel y cifrado de la contraseña del proveedor.** Hoy se guarda en `data/cobrix.sqlite` en claro. En producción iría a un gestor de secretos.
- **Paralelismo al leer contratos.** Son 27 y la corrida dura menos de un segundo. Con miles de contratos, leería con una concurrencia acotada.
- **Reapertura de una factura pagada.** Si el ISP anula un cobro *después* de que Cobrix marcó la factura como pagada, no se reabre sola: «pagada» es un estado final. Lo dejaría como alerta para el operador antes que revertirlo en silencio.
- **Paginación de tablas.** Con esta base no hace falta.

## Con más tiempo

- Una alerta cuando una factura pagada vuelve a tener saldo en el ISP (cobro anulado).
- Una vista de diferencias entre una simulación y la corrida real siguiente.
- Notificaciones por correo de cobranza al terminar la corrida automática, con el resumen y lo que requiere atención.
- Exportar a Excel la cartera por antigüedad de deuda.

## Punto diferencial

- **Un Resumen que ayuda a decidir.** Lo encabezan el monto por cobrar y un medidor de **recuperación** (cobrado frente a importado). Le siguen tres gráficos:
  - **cartera por periodo:** columnas apiladas de lo que falta cobrar y lo ya cobrado;
  - **antigüedad de la deuda:** una rampa de un solo tono, donde más oscuro es más antigua;
  - **mayores deudores:** con enlace a su expediente.

  Los gráficos son HTML y CSS, sin librerías, con tooltip por mouse y teclado y una vista «Ver como tabla». Validé la paleta con un verificador de daltonismo y contraste, en modo claro y oscuro.
- **Modales que ayudan a no equivocarse:**
  - **Nuevo cliente:** una ficha muestra en vivo cómo quedará guardado el documento, si es persona natural o jurídica, y si ya existe.
  - **Corrida:** un anillo de progreso que termina en el resumen.
  - **Probar conexión:** un diagnóstico paso a paso (datos → sesión → contratos) que dice exactamente dónde falla.
  - **Detalle de factura:** su historia completa.
- **«Requiere atención» en el Resumen.** Reúne los abonos parciales, las cuotas sin evidencia, los contratos descartados por respuestas inconsistentes y lo frenado por topes, con enlace a cada caso. Es lo primero que debería mirar un operador.
- **Antigüedad de la deuda.** Barras por tramos (sin vencer, 1–30, 31–60, 61–90 y más de 90 días desde el corte), con monto y número de facturas. Ayuda a decidir por dónde empezar a cobrar.
- **Progreso en vivo de la corrida.** Al lanzarla, el panel muestra «12 de 27 contratos» con una barra y abre el resultado al terminar.
- **Detalle auditable.** Una fila por cuota con su motivo, filtros por resultado con contadores, y exportación a CSV que se abre bien en Excel.
- **Empezar de cero** desde el panel, con confirmación, para repetir el ciclo de aceptación.
- **Probar conexión** dice cuántos contratos hay o qué corregir («Contraseña incorrecta…», «no se pudo conectar…»).

## Uso de IA

Usé **un asistente de IA para programación** como par de programación durante todo el desarrollo:
- para leer el enunciado, la API y el código del simulador y armar la lista de casos;
- para proponer la arquitectura;
- para escribir el código, las pruebas y esta documentación.

Mi trabajo fue decidir, revisar y verificar. La regla que seguí fue no dar nada por bueno sin una prueba que lo confirme contra la API real del entorno.

**Dónde hubo que corregir el rumbo:**
- **La prueba entregada fallaba en Windows** por la ruta del enunciado. Lo detectamos al correr la suite antes de escribir código.
- **Una duda de diseño sobre los saldos:** ¿un abono parcial reduce el saldo de la factura en Cobrix? Con reducción, el total habría sido USD 950,00. El criterio del enunciado (USD 955,00) lo resolvió: se mantiene el monto completo y el abono se informa aparte.
- **El orden de las facturas.** El primer orden asignaba números y origen del cliente según el periodo más viejo de *todas* las cuotas. Las facturas de un cliente salían salteadas y LUIS GOMEZ aparecía «creado desde el contrato 900103». Lo cambié para numerar por contrato y tomar el contrato de número más bajo.
- **Formato de los montos.** Los motivos mostraban «USD 5.00» en lugar del formato local «USD 5,00».
- **Colores de los gráficos.** No los elegí a ojo: los validé con un verificador de separación para daltonismo y de contraste. Las barras de antigüedad usan un solo tono de claro a oscuro en lugar de verde, amarillo y rojo, porque esos colores se reservan para estados.
- **Desborde en móvil.** La captura móvil parecía desbordarse. Medí con emulación de dispositivo: la página mide exactamente 390 px y solo las tablas anchas se desplazan dentro de su recuadro, que es lo deseado. El falso positivo venía del ancho mínimo de ventana de Chrome en Windows.
- **Un error que las pruebas no veían.** Al unir los dos scripts del panel sin `;`, el segundo `(() => {…})()` se interpretaba como una llamada al resultado del primero, y el modal de la corrida no se abría. Lo detecté al recorrer el panel con un navegador automatizado (Selenium) y leer su consola. Lo corregí y agregué una prueba que ejecuta el script en un DOM simulado y que falla si se quita el `;`.
- **Un error mío al guardar.** Incluí en un commit la base del administrador modificada por pagos del simulador; lo revertí para entregarla intacta.

Todo lo anterior está cubierto por las 66 pruebas: el ciclo de aceptación completo pasa contra la API por HTTP.
