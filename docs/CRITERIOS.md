# Cómo esta entrega cubre lo que van a evaluar

Una guía para revisar la entrega criterio por criterio: qué se hizo, dónde verlo y cómo comprobarlo en pocos minutos. Las razones de cada decisión están en [`NOTA.md`](../NOTA.md) y los diagramas, en [`ARQUITECTURA.md`](ARQUITECTURA.md).

Para comprobar todo de una vez:

```bash
npm install && npm test     # 66 pruebas, todas sobre HTTP real contra la API entregada
npm start                   # panel en http://127.0.0.1:4300
```

---

## 1. Clasificación correcta de la API

> Que se interprete bien cada respuesta (qué se importa, qué se excluye y por qué, qué está pagado y qué no) y que se cumplan los criterios de aceptación.

**Qué se hizo**
- Todas las reglas del §4 están en un solo archivo, [`src/cobrix/reglas.ts`](../src/cobrix/reglas.ts), como funciones puras: `clasificarContrato()` para la importación y `evaluarPago()` para los pagos.
- **Cada cuota termina con un resultado y un motivo legible.**
  - Importación: importada, ya importada, excluida por estado, excluida por tipo de documento, fuera de la ventana, excede recientes, frenada por tope, saldo residual, moneda incoherente, sin deuda, respuesta inconsistente, estado desconocido, identificación inválida y error de la API.
  - Pagos: marcada pagada (con la factura del ISP que la cobró), abono parcial, exonerada, sin evidencia, libro inconsistente y sigue abierta.
- **Rarezas de la API manejadas:**
  - `success: false` aunque traiga datos;
  - el filtro `estado` de `lista_ids_contratos`, que nunca se envía;
  - la fila `deuda_id: "0"`, que significa «sin deuda»;
  - las filas sin orden;
  - las cuotas futuras en el libro;
  - el vencimiento del token sin zona horaria;
  - la cuota del mes en curso que aún no está en el libro, para la que se consulta el contrato antes de concluir «sin evidencia».

**Criterios de aceptación (§5): todos cumplidos**

| Criterio | Esperado | Resultado |
| --- | --- | --- |
| Simular importación | 42 cuotas, sin crear nada | ✅ |
| Importar | 20 clientes, 42 facturas, USD 1.235,00 | ✅ |
| Excluidas | 9 por estado, 1 contrato por moneda incoherente, 1 saldo residual | ✅ |
| Importar otra vez | 0 facturas nuevas | ✅ |
| LUIS GOMEZ | 1 cliente con 2 contratos | ✅ |
| ELENA RUIZ (`09000123`) | ID de cliente `9000123` | ✅ |
| Titulares excluidos | CARLOS ROJAS, ROSA DIAZ, PEDRO LEON, ANDRES VARGAS, LAURA MENDEZ y JORGE CASTILLO no aparecen | ✅ |
| Pagos en la caja | ANA PEREZ 3 pagadas · LUIS GOMEZ 1 pagada + abono parcial · COMERCIAL EL FARO 2 · MIGUEL ANGEL SOTO 2 · ELENA RUIZ sin cambios | ✅ |
| Resultado final | 8 pagadas, 34 abiertas por USD 955,00; repetir no cambia nada | ✅ |

**Dónde comprobarlo**
- [`test/aceptacion.test.ts`](../test/aceptacion.test.ts): el ciclo completo del §5, paso a paso.
- [`test/reglas.test.ts`](../test/reglas.test.ts): un caso por regla, incluidas las respuestas contradictorias.
- En el panel: *Sincronización › detalle de una corrida*. Hay una fila por cuota con su motivo, un gráfico de resultados que filtra la tabla, y exportación a CSV.

---

## 2. Robustez

> Que nada se duplique, que los errores se manejen y que nada se adivine.

**Nada se duplica**
- Dos capas: el código descarta lo ya importado, y la base impide duplicados con `UNIQUE(deuda_id)` en facturas y `UNIQUE(id_externo)` en clientes.
- Importar dos veces da 0 facturas nuevas, y actualizar pagadas dos veces no cambia nada. Un mismo abono parcial no se registra dos veces en el historial.
- Un cliente creado a mano con `V-12.345.678` y un titular importado `V12345678` son el mismo cliente.

**Los errores se manejan**
- **Todo o nada.** La importación lee y clasifica todo antes de escribir, y escribe en una sola transacción. Si la API se cae a mitad de camino, no queda nada a medias y la corrida queda **fallida con el motivo**.
- Un error HTTP en un solo contrato queda registrado en ese contrato y la corrida sigue. Lo pendiente entra en la próxima corrida, sin duplicar.
- **Credenciales malas:** la corrida queda fallida con un mensaje que dice qué corregir. **Token vencido:** se inicia sesión de nuevo una sola vez.
- **Una corrida a la vez:** no se pueden lanzar dos en paralelo.
- Si el proceso se detiene en medio de una corrida, al reiniciar esa corrida queda marcada como fallida en lugar de quedar «en curso» para siempre.

**Nada se adivina**
- El contrato completo queda fuera, con un motivo visible, si la respuesta no es una lista, trae filas de otro contrato o cuotas repetidas, tiene datos contradictorios entre filas, un estado desconocido o una identificación ilegible.
- En pagos, si las filas de una cuota no coinciden entre sí, la factura **no** se marca pagada. Una cuota sin evidencia **nunca** se marca pagada.

**Dónde comprobarlo**
- [`test/robustez.test.ts`](../test/robustez.test.ts): credenciales malas, API caída a mitad de la importación, error en un contrato, corridas simultáneas, token revocado, restricción `UNIQUE`, topes y días de gracia.
- En el panel: *Configuración › Probar conexión* con una contraseña equivocada muestra el diagnóstico paso a paso.

---

## 3. UX/UI

> Diseño propio; la referencia de layout es solo una guía.

**Lo que pedía el enunciado (§3.7)**

| Pedido | Cómo se resolvió |
| --- | --- |
| Estados visibles de un vistazo | Etiquetas de color con texto (Abierta, Pagada, Abono parcial, Completada, Falló, Simulación) |
| Montos con moneda y fechas legibles | `USD 1.235,00`, «1 oct 2026», «13 oct. 2026, 10:06 p. m.» en hora de Caracas |
| Vacíos que expliquen qué hacer | Cada pantalla sin datos dice qué hacer y enlaza a la acción |
| Confirmación antes de acciones destructivas | Diálogo antes de Importar y Actualizar pagadas; «Vaciar datos» exige además marcar una casilla |
| Errores que digan qué pasó y cómo seguir | «Contraseña incorrecta para la API del administrador. Corrígela en Configuración › Proveedor.» |
| Pantallas angostas | Probado a 390 px de ancho: sin desborde y con tablas desplazables dentro de su recuadro |

**Además**
- **Gráficos para decidir:** medidor de recuperación, cartera por periodo, antigüedad de la deuda, mayores deudores, resultados de cada corrida y facturas del cliente por periodo. Tienen tooltip con mouse y teclado y una vista «Ver como tabla». La paleta se validó para daltonismo y contraste.
- **Modales:** nuevo cliente con ficha en vivo, corrida con anillo de progreso, diagnóstico de conexión, detalle de factura y editar contacto.
- **Modo oscuro**, navegación con teclado y funcionamiento **sin JavaScript** (formularios POST → redirect → GET).

**Dónde comprobarlo**
- Capturas en el [README](../README.md) y en [`docs/capturas/entrega/`](capturas/entrega/).
- En vivo: `npm start` → http://127.0.0.1:4300.

---

## 4. Uso de IA como parte del desarrollo

> Que se use con criterio, que se verifique lo que produce y que se explique en la nota.

**Cómo se usó.** Se usó Claude Code como par de programación para analizar el enunciado y la API, proponer la arquitectura, escribir el código, las pruebas y la documentación. La regla fue **no dar nada por bueno sin una verificación independiente**:
- **Pruebas automáticas** contra la API real por HTTP: 66 pruebas.
- **Recorridos en un navegador real** automatizado con Selenium, leyendo la consola del navegador.
- **Capturas revisadas** en escritorio y en celular.
- **Un verificador de daltonismo y contraste** para los colores de los gráficos.

**Dónde se tuvo que corregir.** Todo está detallado en [`NOTA.md` › Uso de IA](../NOTA.md#uso-de-ia):
- La prueba entregada fallaba en Windows (la ruta del enunciado).
- La numeración de facturas y el origen del cliente salían en un orden equivocado.
- Los montos de los motivos tenían el formato «USD 5.00» en vez de «USD 5,00».
- Un error de JavaScript al unir dos scripts impedía abrir el modal de la corrida. Las pruebas no lo veían; apareció al recorrer el panel con el navegador y ahora tiene su propia prueba.
- La base del ISP se incluyó modificada en un commit; se restauró y se verificó idéntica a la entregada.

---

## 5. Pulcritud general

> Código, pruebas y documentación claros para quien venga después.

**Código**
- Separado por responsabilidad: reglas puras (`reglas.ts`), cliente HTTP (`api.ts`), orquestación (`sincronizacion.ts`), almacenamiento (`store.ts`), lecturas (`consultas.ts`) y panel (`src/web/`).
- TypeScript estricto, sin dependencias de ejecución. Los importes se guardan en centavos enteros.
- No se modificó lo entregado: `src/billing-api/` y `data/billing-api.sqlite` están intactos (verificable con `git diff` contra el primer commit).

**Pruebas**

| Archivo | Qué cubre |
| --- | --- |
| `aceptacion.test.ts` | Los criterios del §5 de punta a punta |
| `reglas.test.ts` | Cada regla del §4 y los ejes de los gráficos |
| `robustez.test.ts` | Errores, caídas, concurrencia, duplicados, topes |
| `panel.test.ts` | Formularios, validaciones, corridas desde el panel, CSV, corrida automática, script del navegador |
| `clientes.test.ts` | Clientes manuales, contacto, detalle de factura, diagnóstico de conexión |
| `entorno.test.ts` | La prueba entregada, adaptada a las pantallas reales |

**Documentación**
- [`README.md`](../README.md): cómo levantarlo, cómo verificar los criterios en 5 minutos, capturas y tablas de resultados.
- [`NOTA.md`](../NOTA.md): decisiones, lo que quedó fuera, lo que se haría con más tiempo, punto diferencial y uso de IA.
- [`docs/ARQUITECTURA.md`](ARQUITECTURA.md): 5 diagramas (vista general, importación, decisión por cuota, decisión de pagos, modelo de datos).
- Historial de git con un commit por etapa, empezando por el entorno entregado sin cambios.

---

## 6. Punto diferencial

> Algo que no se pidió y que haga destacar la entrega.

| Qué | Por qué importa |
| --- | --- |
| **Resumen con gráficos** (recuperación, cartera por periodo, antigüedad de la deuda, mayores deudores) | Ayuda a decidir por dónde empezar a cobrar |
| **«Requiere atención»** | Reúne abonos parciales, cuotas sin evidencia, contratos descartados y lo frenado por topes: lo primero que debe mirar un operador |
| **Progreso en vivo de la corrida** (anillo con «12 de 27 contratos») | El operador ve que la corrida avanza y su resultado al terminar |
| **Diagnóstico de conexión paso a paso** | Dice exactamente dónde falla: datos, inicio de sesión o contratos |
| **Nuevo cliente con ficha en vivo** | Muestra cómo quedará guardado el documento y avisa si ya existe, antes de enviar |
| **Detalle auditable y CSV** | Cada cuota tiene su motivo, se filtra por resultado y se exporta a Excel |
| **Empezar de cero** desde el panel | Permite repetir el ciclo de aceptación sin tocar archivos |
| **Accesibilidad**: vista de tabla en cada gráfico, paleta validada para daltonismo, teclado, modo oscuro y uso sin JavaScript | Un panel que funciona para cualquier operador |
