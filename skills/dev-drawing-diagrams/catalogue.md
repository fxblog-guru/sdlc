# Diagram catalogue

One correct, minimal example per diagram in `SKILL.md`. Copy the closest one, rename everything to
the artifact's own names, and delete what does not apply. Each example passes
`diagram.mjs check` and renders in `diagram.mjs render`; `tests/diagram.test.mjs` keeps it that way.

The running example is a shop: a Customer uses the Web app, which calls the Order API; the Order API
keeps orders in the Orders DB, publishes to the Event bus, and calls the Payment gateway. A Worker
consumes the Event bus. The Admin console is used by Staff. The Identity provider signs users in.
Entities are CUSTOMER, ORDER, ORDER_LINE and PRODUCT. Screens are Cart, Checkout, Payment, Confirmation
and Error. The pipeline runs Build, Unit tests, Scan, Package, Deploy staging, Smoke, Approval and
Deploy production. The Cloud runs Kubernetes in eu-west-1 with Postgres as the managed database; the Web app is served from a CDN.

## 1. Architecture overview — C4 level 1

```mermaid
---
title: Shop — system context
---
C4Context
    Person(customer, "Customer", "Buys products")
    Person(staff, "Staff", "Manages orders")
    System(shop, "Shop", "Takes and fulfils orders")
    System_Ext(pay, "Payment gateway", "Card authorisation")
    System_Ext(idp, "Identity provider", "OIDC sign-in")
    Rel(customer, shop, "Places orders", "HTTPS")
    Rel(staff, shop, "Manages orders", "HTTPS")
    Rel(shop, pay, "Authorises payments", "HTTPS")
    Rel(shop, idp, "Signs users in", "OIDC")
```

## 2. Component — C4 level 2 (containers)

```mermaid
---
title: Shop — containers
---
C4Container
    Person(customer, "Customer")
    System_Boundary(shop, "Shop") {
        Container(web, "Web app", "React", "Catalogue, cart, checkout")
        Container(admin, "Admin console", "React", "Order management")
        Container(api, "Order API", "Go", "Orders and payments")
        Container(worker, "Worker", "Go", "Fulfilment and e-mail")
        ContainerDb(db, "Orders DB", "PostgreSQL", "Orders, customers")
        ContainerQueue(bus, "Event bus", "Kafka", "order.* events")
    }
    System_Ext(pay, "Payment gateway")
    Rel(customer, web, "Uses", "HTTPS")
    Rel(web, api, "Calls", "JSON/HTTPS")
    Rel(admin, api, "Calls", "JSON/HTTPS")
    Rel(api, db, "Reads/writes", "SQL")
    Rel(api, bus, "Publishes", "order.placed")
    Rel(worker, bus, "Consumes", "order.placed")
    Rel(api, pay, "Authorises", "HTTPS")
```

## 3. Sequence — UML, with the failure path

```mermaid
---
title: Place order — sequence
---
sequenceDiagram
    autonumber
    actor C as Customer
    participant W as Web app
    participant A as Order API
    participant D as Orders DB
    participant P as Payment gateway
    C->>W: Submit order
    W->>+A: POST /orders (createOrder)
    A->>D: INSERT order (status=pending)
    A->>+P: authorise(amount) timeout 5s
    alt authorised
        P-->>A: 200 auth_id
        A->>D: UPDATE order status=paid
        A-->>W: 201 Created
    else declined
        P-->>A: 402 declined
        A->>D: UPDATE order status=failed
        A-->>W: 422 problem+json payment-declined
    else timeout or 5xx
        P-->>-A: timeout
        A-->>-W: 503 problem+json retry-after 30
    end
    W-->>C: Show result
```

## 4. Activity — UML, with guards and swimlanes

```mermaid
---
title: Checkout — activity
---
flowchart TD
    subgraph Customer
        start([Start]) --> review[Review cart]
        fix[Fix cart]
    end
    subgraph Shop
        validate[Validate cart] --> valid{Cart valid?}
        valid -->|no| fix
        valid -->|yes| stock{In stock?}
        stock -->|no| notify[Show out of stock]
        stock -->|yes| reserve[Reserve stock]
        reserve --> charge[Charge payment]
        charge --> paid{Paid?}
        paid -->|yes| confirm[Confirm order]
        paid -->|no| release[Release stock]
    end
    review --> validate
    fix --> validate
    notify --> stop([End])
    release --> stop
    confirm --> stop
```

## 5. State machine — UML

```mermaid
---
title: Order — states
---
stateDiagram-v2
    [*] --> pending: createOrder
    pending --> paid: payment authorised
    pending --> failed: payment declined
    pending --> cancelled: customer cancels
    paid --> shipped: worker ships
    paid --> refunded: staff refunds
    shipped --> [*]
    failed --> [*]
    cancelled --> [*]
    refunded --> [*]
```

## 6. ER — crow's foot

```mermaid
---
title: Orders — ER
---
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ ORDER_LINE : contains
    PRODUCT ||--o{ ORDER_LINE : "appears in"
    CUSTOMER {
        uuid id PK
        string email UK
        timestamptz created_at
    }
    ORDER {
        uuid id PK
        uuid customer_id FK
        string status
        numeric total
    }
    ORDER_LINE {
        uuid id PK
        uuid order_id FK
        uuid product_id FK
        int qty
    }
    PRODUCT {
        uuid id PK
        string sku UK
        numeric price
    }
```

## 7. Data flow (DFD) — level 1, trust boundaries

```mermaid
---
title: Orders — data flow
---
flowchart LR
    customer[/Customer/]
    pay[/Payment gateway/]
    subgraph internet[Internet → DMZ]
        web(Web app)
    end
    subgraph core[DMZ → core network]
        api(Order API)
        db[(Orders DB)]
    end
    customer -- "cart, card token" --> web
    web -- "order request, session cookie" --> api
    api -- "order rows" --> db
    db -- "order rows" --> api
    api -- "amount, card token" --> pay
    pay -- "auth result" --> api
```

## 9. Screen flow

```mermaid
---
title: Checkout — screen flow
---
flowchart LR
    cart[Cart] -->|Checkout| checkout[Checkout]
    checkout -->|Back| cart
    checkout -->|Pay| payment[Payment]
    payment -->|Authorised| confirmation[Confirmation]
    payment -->|Declined| checkout
    payment -->|Timeout| error[Error]
    error -->|Retry| payment
```

## 10. Deployment

```mermaid
---
title: Production — deployment
---
C4Deployment
    Deployment_Node(cloud, "Cloud", "eu-west-1") {
        Deployment_Node(k8s, "Kubernetes", "3 nodes, 2 zones") {
            Container(api, "Order API", "Go, 3 replicas")
            Container(worker, "Worker", "Go, 2 replicas")
        }
        Deployment_Node(rds, "Postgres", "managed, multi-AZ") {
            ContainerDb(db, "Orders DB", "PostgreSQL 16")
        }
    }
    Deployment_Node(cdn, "CDN", "edge") {
        Container(web, "Web app", "static bundle")
    }
    Rel(web, api, "Calls", "HTTPS")
    Rel(api, db, "Reads/writes", "SQL/TLS")
    Rel(worker, db, "Reads", "SQL/TLS")
```

## 11. CI/CD pipeline

```mermaid
---
title: Release — pipeline
---
flowchart LR
    subgraph ci[CI]
        build[Build] --> unit[Unit tests] --> scan[Scan] --> pkg[Package]
    end
    subgraph cd[CD]
        staging[Deploy staging] --> smoke{Smoke}
        smoke -->|fail| rollback[Rollback staging]
        smoke -->|pass| approval{Approval}
        approval -->|rejected| stopped([Stop])
        approval -->|approved| prod[Deploy production]
    end
    pkg --> staging
```

## 12. Migration timeline

```mermaid
---
title: Rename column — expand, migrate, contract
---
flowchart LR
    expand[MIG-001 expand: add new column] --> deploy1[Deploy writes both]
    deploy1 --> migrate[MIG-002 migrate: backfill]
    migrate --> deploy2[Deploy reads new]
    deploy2 --> contract[MIG-003 contract: drop old column]
```
