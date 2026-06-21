# TRACE Product Identity Infrastructure
Version: 1.0

## Description
Central registry, visual encoding engine, and decentralized verification logs for secure product authentication.

## Layers
- **entry**: Entry Points — User-Facing Applications (y: 150, h: 420)
- **services**: Core Services — Processing & Verification (y: 640, h: 480)
- **infra**: Infrastructure — Data, Analytics & Identity (y: 1190, h: 450)
- **future**: Roadmap — Future Vision (y: 1710, h: 380)

## Trust Boundary
- **Title**: TRUST BOUNDARY (SECURE BACKEND)
- **Note**: Decryption, persistence & intelligence execute inside this zone
- **Geometry**: x: 1000, y: 670, w: 1120, h: 950

## Nodes

### brand (Entry Point)
* **Title:** Brand Portal
* **Icon:** 🏢
* **Color:** hsl(260,70%,65%)
* **x:** 450
* **y:** 240
* **Description:** Enterprise dashboard — brands register products, generate TRACE Marks, manage catalog and teams.
* **Capabilities:** Create Product, Generate Single/Bulk TRACE Marks, Download Print Assets, Product Lifecycle, Analytics Dashboard
* **Management:** Product Catalog, Batch Management, Manufacturer Settings, Team Management

### consumer (Entry Point)
* **Title:** Consumer Verification
* **Icon:** 📱
* **Color:** hsl(210,85%,62%)
* **x:** 1550
* **y:** 240
* **Description:** Consumer-facing scan experience — verify any product's authenticity instantly.
* **Channels:** PWA (Web App), Future Native App, Paytm Integration, PhonePe Integration
* **Output:** Scan History, Verification Result, Product Details, Authenticity Certificate

### engine (Service)
* **Title:** TRACE Engine
* **Icon:** ⚙️
* **Color:** hsl(220,80%,62%)
* **x:** 400
* **y:** 740
* **Description:** Proprietary visual language — encodes and decodes TRACE Marks. Does NOT decrypt payloads.
* **Core Functions:** TRACE Mark Generation, TRACE Mark Decoding, Photo → Vision Processing, Error Correction, Version Control (v1 → v2 → v3)
* **Flow:** Photo → Vision Layer* → Decode → Encrypted Payload

### backend (Service)
* **Title:** Verification Backend
* **Icon:** 🖥️
* **Color:** hsl(200,80%,58%)
* **x:** 1350
* **y:** 720
* **Description:** Source of truth — the ONLY system that decrypts payloads and performs verification.
* **Responsibilities:** Receive Encrypted Payload, Decrypt via Secure Keys, Lookup Product in Database, Return Verification Result, Log Scan to Analytics

### activation (Service)
* **Title:** Activation System
* **Icon:** 🔑
* **Color:** hsl(32,85%,58%)
* **x:** 2100
* **y:** 740
* **Description:** Activates manufactured products before they ship. Multiple activation methods supported.
* **Methods:** Factory Scanner, Webcam Activation, Mobile Activation App, Batch Activation, Individual Activation
* **Flow:** Generate → Print → Activate* → Ship

### database (Infrastructure)
* **Title:** Database
* **Icon:** 🗄️
* **Color:** hsl(170,70%,50%)
* **x:** 1100
* **y:** 1290
* **Description:** Central data store — persists registry records, telemetry logs, and digital twins.
* **Identity Registry Schema:** Product Digital Twins, Manufacturer Registry, Batch & Activation Logs, Scan & Verification History
* **Infrastructure Data:** Metadata Event Logs, User & Team Credentials

### analytics (Infrastructure)
* **Title:** Analytics Engine
* **Icon:** 📊
* **Color:** hsl(48,82%,55%)
* **x:** 1750
* **y:** 1290
* **Description:** Behavioral intelligence — detects counterfeiting patterns, generates risk scores.
* **Tracking:** Scan Count & Velocity, Scan Geo-Location, Device Fingerprint, Scan Timeline
* **Outputs:** Risk Score Calculation, Suspicious Activity Alerts, Counterfeit Probability, Regional Trends

### future (Future)
* **Title:** Future Security Layers
* **Icon:** 🔮
* **Color:** hsl(180,65%,52%)
* **x:** 650
* **y:** 1810
* **Description:** Potential future systems extending TRACE's defense capabilities.
* **Capabilities:** Scratch Codes, Ownership Transfer, RFID / NFC, Microprinting, Digital Signatures, Blockchain, Enterprise APIs

### vision (Future)
* **Title:** Long-Term Vision
* **Icon:** 🚀
* **Color:** hsl(145,65%,52%)
* **x:** 1450
* **y:** 1810
* **Description:** TRACE evolves beyond marks into industry-scale infrastructure.
* **TRACE is NOT:** ~A QR code, ~A barcode
* **TRACE IS:** *Product Identity Infrastructure, *Product Verification Infrastructure, *Product Intelligence Infrastructure, *Anti-Counterfeit Ecosystem

## Connections
| From | To | Interaction | Type |
|---|---|---|---|
| brand | engine | Generate Mark | request |
| brand | backend | Register Product | request |
| consumer | engine | Photo → Decode | request |
| consumer | backend | Verification Request | request |
| activation | backend | Activate Product | request |
| backend | analytics | Log Scan Event | request |
| brand | database | CRUD Products | data |
| backend | database | Product Lookup | data |
| activation | database | Update Status | data |
| analytics | database | Read/Write Scans | data |
| analytics | backend | Anomalies / Risk Score | data |
| future | backend | Integrates | future |
| vision | future | Roadmap Alignment | future |
| backend | analytics | Future: Async Event Broker | future |

## Flows

### consumer-verify (Consumer Verification)
*What happens when someone scans a product?*
- **Color:** hsl(210,85%,62%)

1. **consumer** [Consumer scans a product]: Consumer opens the TRACE PWA, points their camera at the product, and captures a photo of the TRACE Mark.
   * Data: 📸 Photo of TRACE Mark
2. **engine** [TRACE Engine decodes the mark]: Photo is processed through the Vision Layer. The TRACE Mark is identified, decoded, and an encrypted payload is extracted. The Engine does NOT decrypt — it only reads the visual encoding.
   * Data: 🔒 Encrypted Payload (opaque to Engine)
3. **backend** [Backend decrypts payload & validates]: Backend decrypts the payload, verifies authenticity, and fetches the product data.
   * Data: 🔑 Decrypted Product ID & Identity Status
4. **database** [Database Lookup]: Backend queries the central database for the product twin status and details.
   * Data: 🗄️ Twin State
5. **backend** [Evaluate scan data]: Backend receives data and requests counterfeit check from analytics.
   * Data: 📦 Twin State payload
6. **analytics** [Counterfeit Check]: Analytics evaluates location, scan count, and speed to generate risk scores.
   * Data: 📊 Risk Score & Geo Anomalies
7. **backend** [Format response]: Backend returns the final validation status and product details back to the consumer.
   * Data: ✅ Success or Warning Result
8. **consumer** [Show Verification screen]: Consumer PWA displays authenticity confirmation, batch history, and product digital twin.
   * Data: 📱 Verified screen

### brand-onboard (Brand Portal Onboarding)
*How a brand creates and registers products.*
- **Color:** hsl(260,70%,65%)

1. **brand** [Create Product Profile]: Brand manager fills out product details (name, origin, photos).
   * Data: 📝 Product Registry details
2. **backend** [Register product]: Backend generates unique identities and registers them.
   * Data: 🖥️ Registration payload
3. **database** [Save registry]: Database commits product digital twin.
   * Data: 🗄️ Registry Commit
4. **brand** [Request TRACE Marks]: Brand manager requests single or bulk TRACE Marks.
   * Data: 📦 Count of marks requested
5. **engine** [Generate Mark Payloads]: Engine encodes secure identity keys into TRACE Marks.
   * Data: 🔒 Generated print vector marks
6. **brand** [Download vectors]: Portal downloads the marks for printing.
   * Data: 🏢 SVG Print Files
