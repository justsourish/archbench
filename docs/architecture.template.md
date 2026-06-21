# New Project Architecture
Version: 1.0

## Description
Provide a brief high-level overview description of the project and ecosystem architecture.

## Layers
- **entry**: User Interface (y: 150, h: 420)
- **services**: Business Logic (y: 640, h: 480)
- **infra**: Storage & Systems (y: 1190, h: 450)

## Trust Boundary
- **Title**: SECURE BACKEND ZONE
- **Note**: Only secure API backend components reside in this network segment
- **Geometry**: x: 200, y: 600, w: 1000, h: 1100

## Nodes

### client (Entry Point)
* **Title:** Web Frontend
* **Icon:** 💻
* **Color:** hsl(210,85%,62%)
* **x:** 300
* **y:** 250
* **Description:** User-facing single page web application.
* **Tech Stack:** HTML5, CSS3, JavaScript

### api (Service)
* **Title:** Core Backend API
* **Icon:** ⚙️
* **Color:** hsl(200,80%,58%)
* **x:** 700
* **y:** 750
* **Description:** Handles business logic and secure API calls.
* **Endpoints:** POST /orders, GET /products
> **[info]** Evaluates auth tokens on every request.

### database (Infrastructure)
* **Title:** Database Store
* **Icon:** 🗄️
* **Color:** hsl(170,70%,50%)
* **x:** 700
* **y:** 1300
* **Description:** Central relational storage engine.
* **Schema:** Users, Orders, Inventory

## Connections
| From | To | Interaction | Type |
|---|---|---|---|
| client | api | Secure API Call | request |
| api | database | Read/Write SQL | data |

## Flows

### place-order (Place Order Flow)
*Simulates the end-to-end checkout sequence for orders.*
- **Color:** hsl(210,85%,62%)

1. **client** [Checkout Action]: User fills checkout form and clicks "Submit Order".
   * Data: 🛒 Cart details & Payment token
2. **api** [Authorize & Create]: Backend validates payment token and writes database order records.
   * Data: 💳 Payment status & Auth context
3. **database** [Commit Transaction]: Storage engine writes order records and decreases inventory counters.
   * Data: 🗄️ Database commit confirmation
4. **api** [Order Success]: API sends notification callback and order status payload.
   * Data: ✅ Order ID #12495 (Success)
5. **client** [Render Receipt]: Frontend displays receipt and order tracking timeline.
   * Data: 📱 Receipt screen shown
