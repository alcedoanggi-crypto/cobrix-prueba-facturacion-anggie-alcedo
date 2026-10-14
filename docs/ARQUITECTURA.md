# Arquitectura

Cómo está construida la integración, con diagramas. Las decisiones y su porqué están en [`NOTA.md`](../NOTA.md); cómo levantarla y probarla, en el [`README`](../README.md).

## 1. Vista general

```mermaid
flowchart LR
    subgraph ISP["Administrador de facturas (ISP) · :4310"]
        API["API REST<br/>login · contratos · cuotas · libro de pagos"]
        SIM["Simulador de caja<br/>/__sim/pagar · /__sim/anular"]
        DBI[("billing-api.sqlite")]
        API --- DBI
        SIM --- DBI
    end

    subgraph COBRIX["Cobrix · :4300"]
        WEB["Panel web<br/>src/web"]
        SYNC["Sincronizador<br/>importar · actualizar pagadas"]
        REGLAS["Reglas puras<br/>clasificarContrato · evaluarPago"]
        CLI["Cliente HTTP<br/>token 2 h · reintento 401 · timeouts"]
        PROG["Programador<br/>corrida diaria (Caracas)"]
        DBC[("cobrix.sqlite")]
        WEB --> SYNC
        PROG --> SYNC
        SYNC --> REGLAS
        SYNC --> CLI
        SYNC --> DBC
        WEB --> DBC
    end

    CLI -- "HTTP + Bearer" --> API
    OPERADOR(["Operador de cobranza"]) --> WEB
```

Cobrix **solo habla con el administrador por HTTP**, como lo haría con un ISP real, y guarda sus propios datos en una base aparte.

| Módulo | Responsabilidad | Depende de |
| --- | --- | --- |
| `src/cobrix/reglas.ts` | Interpretar la API: qué se importa, qué se excluye y por qué, qué está pagado | nada (funciones puras) |
| `src/cobrix/api.ts` | Hablar con la API: sesión, errores legibles | `fetch` |
| `src/cobrix/sincronizacion.ts` | Orquestar las corridas, decidir en conjunto, escribir en transacción | reglas, api, store |
| `src/cobrix/store.ts` | Esquema y acceso a `cobrix.sqlite` | `node:sqlite` |
| `src/cobrix/consultas.ts` | Lecturas para el panel (totales, cartera, antigüedad, alertas) | store |
| `src/cobrix/programador.ts` | Corrida automática diaria | sincronización |
| `src/web/*` | Panel: rutas, vistas, gráficos y estilos | todo lo anterior |

## 2. Importación

```mermaid
sequenceDiagram
    autonumber
    participant O as Operador
    participant P as Panel
    participant S as Sincronizador
    participant A as API del ISP
    participant D as cobrix.sqlite

    O->>P: Importar (o Simular)
    P->>S: iniciar('importacion')
    S->>D: crear corrida «en curso»
    P-->>O: detalle de la corrida con progreso en vivo
    S->>A: login + lista_ids_contratos (sin «estado»)
    loop por cada contrato
        S->>A: contrato/individual?id_contrato=…
        S->>S: clasificarContrato() → candidatas + excluidas con motivo
        S->>D: progreso (n de N)
    end
    S->>S: decidir en conjunto: ya importada → tope → importada
    alt importación real
        S->>D: UNA transacción: clientes, contratos, facturas, historial
    end
    S->>D: una fila por cuota con resultado y motivo + contadores
    S->>D: cerrar corrida (completada | fallida con el error)
```

Si la API falla durante la lectura (pasos 5 a 8), **no se escribe nada**: la corrida queda fallida y con el motivo. Un error HTTP en un solo contrato se registra en ese contrato y la corrida sigue.

### Cómo se clasifica un contrato

```mermaid
flowchart TD
    R["Respuesta de contrato/individual"] --> L{"¿Lista no vacía,<br/>todas del contrato,<br/>sin cuotas repetidas,<br/>datos coherentes?"}
    L -- no --> X1["Respuesta inconsistente<br/>(todo el contrato fuera)"]
    L -- sí --> E{"¿Estado conocido?"}
    E -- no --> X2["Estado desconocido"]
    E -- sí --> Z{"¿Fila deuda_id «0»?"}
    Z -- sí --> X3["Sin deuda"]
    Z -- no --> I{"¿Identificación válida?"}
    I -- no --> X4["Identificación inválida"]
    I -- sí --> ST{"¿Estado importable?"}
    ST -- no --> X5["Excluida por estado<br/>(una por cuota)"]
    ST -- sí --> M{"¿USD coherente?<br/>cuota máx. ≥ 1 % del plan"}
    M -- no --> X6["Moneda incoherente"]
    M -- sí --> T{"¿Tipo de documento<br/>excluido?"}
    T -- sí --> X7["Excluida por tipo"]
    T -- no --> C["Por cuota: residual · futura ·<br/>fuera de ventana · excede recientes"]
    C --> OK["Candidata"]
    OK --> D{"Decisión de la corrida"}
    D --> YA["Ya importada"]
    D --> TOPE["Frenada por tope"]
    D --> IMP["Importada"]
```

## 3. Actualizar pagadas

```mermaid
flowchart TD
    F["Factura abierta en Cobrix"] --> LB["Filas de su cuota en pago_informacion<br/>(CUOTA, desde el mes anterior a la más vieja)"]
    LB --> H{"¿Aparece en el libro?"}
    H -- no --> CT{"¿Aparece pendiente<br/>en contrato/individual?"}
    CT -- no --> SE["Sin evidencia<br/>(nunca se marca pagada)"]
    CT -- sí --> CMP
    H -- sí --> CO{"¿Todas sus filas coinciden<br/>y son de este contrato?"}
    CO -- no --> IN["Libro inconsistente"]
    CO -- sí --> CMP{"Saldo en el ISP"}
    CMP -- "0 y algo pagado" --> PG["Marcada pagada<br/>+ factura del ISP que la cobró"]
    CMP -- "0 sin nada pagado" --> EX["Exonerada (no es un pago)"]
    CMP -- "menor que en Cobrix" --> AP["Abono parcial<br/>(sigue abierta, se informa)"]
    CMP -- "igual" --> SA["Sigue abierta"]
    CMP -- "mayor" --> IN
```

Un pago **anulado** devuelve el saldo de la cuota en el libro, así que la factura cae en «Sigue abierta». Así se cumple el caso de ELENA RUIZ.

## 4. Modelo de datos de Cobrix

```mermaid
erDiagram
    CLIENTES ||--o{ CONTRATOS : "tiene"
    CLIENTES ||--o{ FACTURAS : "debe"
    CONTRATOS ||--o{ FACTURAS : "origina"
    CLIENTES ||--o{ EVENTOS : "historial"
    FACTURAS |o--o{ EVENTOS : "importada · pagada · abono"
    CORRIDAS ||--o{ CORRIDA_ITEMS : "una fila por cuota"

    CLIENTES {
        int id PK
        text id_externo UK "V12345678 (normalizado)"
        text documento "como lo envía el ISP"
        text persona "natural | juridica"
    }
    CONTRATOS {
        int id PK "id del contrato en el ISP"
        text estado
        text plan
        int precio_cents
    }
    FACTURAS {
        int id PK "FAC-000001"
        text deuda_id UK "id de la cuota en el ISP"
        text periodo
        text vencimiento
        text corte "vencimiento + días de gracia"
        int saldo_cents
        text estado "abierta | pagada"
        int saldo_admin_cents "último saldo visto en el ISP"
        text factura_admin "factura del ISP que la cobró"
    }
    CORRIDAS {
        int id PK
        text tipo "importacion | pagadas"
        int simulacion
        text estado "en_curso | completada | fallida"
        text resumen "contadores (JSON)"
    }
    CORRIDA_ITEMS {
        text deuda_id
        text resultado
        text motivo
    }
```

Los importes se guardan en **centavos (enteros)** para no arrastrar errores de coma flotante. Las restricciones `UNIQUE` en `facturas.deuda_id` y `clientes.id_externo` respaldan la idempotencia desde la base de datos.

## 5. Panel

- **Renderizado en el servidor.** Las rutas de `src/web/app.ts` arman el HTML con la plantilla `html\`` de `layout.ts`, que escapa todo lo que se interpola.
- **POST → redirect → GET.** Los formularios redirigen con un mensaje: recargar la página nunca repite una acción.
- **Funciona sin JavaScript.** `estilos.ts` agrega un script pequeño para:
  - confirmar las acciones que escriben;
  - mostrar el progreso en vivo (lo consulta en `GET /api/corridas/:id`);
  - filtrar al instante;
  - mostrar el tooltip de los gráficos.
- **Gráficos** (`src/web/graficos.ts`):
  - Son HTML y CSS, sin librería, para que el texto se lea en cualquier ancho.
  - Cada gráfico trae una vista «Ver como tabla», y un tooltip con mouse o teclado.
  - La paleta (azul y naranja categóricos, y una rampa ordinal de azules para la antigüedad) se **validó con un verificador de daltonismo y contraste** en modo claro y oscuro.
