# Architecture Specs Examples

This document provides sample layouts, ranging from minimalist architectures to complex distributed systems, for reference during project modeling.

---

## 1. Minimalist Schema (Only Nodes & Connections)

This minimalist specification requires no custom layers or trust boundaries, making it perfect for quick drafting or basic visual diagrams.

```markdown
# Simple Micro-Service
Version: 1.0

## Description
A basic frontend to backend connection pipeline.

## Nodes

### web (Entry Point)
* **Title:** Web Server
* **Icon:** 🌐
* **Color:** hsl(210,85%,62%)
* **x:** 100
* **y:** 100
* **Description:** Exposes web assets.

### api (Service)
* **Title:** App Controller
* **Icon:** ⚙️
* **Color:** hsl(200,80%,58%)
* **x:** 400
* **y:** 100
* **Description:** Exposes backend resources.

## Connections
| From | To | Interaction | Type |
|---|---|---|---|
| web | api | HTTP Fetch | request |

## Flows
### fetch-status (Fetch Server Status)
*Polls API to verify controller health*
- **Color:** hsl(210,85%,62%)

1. **web** [Fetch Request]: Trigger network fetch query.
   * Data: GET /health
2. **api** [Check status]: Query memory counters.
   * Data: {"status":"UP"}
```

---

## 2. Advanced Enterprise Schema (Layers, Boundaries, Callouts, Flow Datatypes)

An enterprise ecosystem involving user-facing endpoints, asynchronous processing pipelines, and a secure internal database.

```markdown
# Enterprise E-Commerce System
Version: 1.2

## Description
Highly-scalable transactional order processing system with analytics warehousing.

## Layers
- **clients**: Frontend Clients (y: 100, h: 300)
- **gateways**: Edge Routing & Security (y: 450, h: 350)
- **workers**: Background Message Queues & Tasks (y: 850, h: 400)
- **storage**: Relational Datastores & Telemetry (y: 1300, h: 450)

## Trust Boundary
- **Title**: ENTERPRISE PRIVACY DEPLOYMENT
- **Note**: Decryption, ledger commits, and financial logic execute strictly inside this subnet.
- **Geometry**: x: 500, y: 400, w: 1200, h: 1400

## Nodes

### webApp (Entry Point)
* **Title:** Web Front
* **Icon:** 💻
* **Color:** hsl(210,85%,62%)
* **x:** 300
* **y:** 200
* **Description:** Single-page frontend dashboard.
* **Capabilities:** Catalog Browsing, Checkout Form, Account History

### gateway (Service)
* **Title:** API Gateway
* **Icon:** 🛡️
* **Color:** hsl(270,70%,65%)
* **x:** 700
* **y:** 550
* **Description:** Authenticates request headers, implements rate limiting, and routes downstream payloads.
* **Middlewares:** JWT Authentication, Rate Limiting (100req/min), Request Sanitizer

### queue (Service)
* **Title:** RabbitMQ Event Broker
* **Icon:** 📨
* **Color:** hsl(28,85%,58%)
* **x:** 700
* **y:** 1000
* **Description:** Decouples incoming transactions from database writes.
* **Channels:** order.created, user.registered
> **[warning]** Needs persistent storage volumes to avoid queue item drops.

### db (Infrastructure)
* **Title:** PostgreSQL Cluster
* **Icon:** 🗄️
* **Color:** hsl(170,70%,50%)
* **x:** 1100
* **y:** 1450
* **Description:** Source of truth relational store.
* **Tables:** orders, transactions, catalog_items
> **[info]** Daily automated backups are configured.

## Connections
| From | To | Interaction | Type |
|---|---|---|---|
| webApp | gateway | JSON POST Request | request |
| gateway | queue | Push Created Event | data |
| queue | db | Consume and Write | data |

## Flows

### order-checkout (Order Checkout Sequence)
*Traces request routing from web click to database persistence.*
- **Color:** hsl(210,85%,62%)

1. **webApp** [Click Checkout]: User reviews cart items and clicks Checkout.
   * Data: {cartId: 49204, user: 120}
2. **gateway** [Auth & Route]: Edge gateway validates authorization and forwards payment/order specs to message broker.
   * Data: {orderPayload: verified}
3. **queue** [Broker Message Enqueued]: RabbitMQ logs the message in memory and notifies consumers.
   * Data: order.created Event Published
4. **db** [Database Persistent Save]: Background task worker saves records and registers order database rows.
   * Data: SQL: INSERT INTO orders VALUES (...)
```
