// Architecture Workbench - Sample Project: TRACE
// Decoupled definition of TRACE Product Identity Infrastructure

window.ARCHBENCH_PROJECT = {
    title: "TRACE Product Identity Infrastructure",
    version: "1.0",
    nodes: [
        // ── ENTRY POINTS ────────────────────────────────────────
        {
            id: "brand",
            category: "Entry Point",
            title: "Brand Portal",
            icon: "🏢",
            color: "hsl(260,70%,65%)",
            x: 450, y: 240,
            desc: "Enterprise dashboard — brands register products, generate TRACE Marks, manage catalog and teams.",
            sections: [
                { label: "Capabilities", items: [
                    "Create Product", "Generate Single/Bulk TRACE Marks",
                    "Download Print Assets", "Product Lifecycle", "Analytics Dashboard"
                ]},
                { label: "Management", items: [
                    "Product Catalog", "Batch Management",
                    "Manufacturer Settings", "Team Management"
                ]}
            ]
        },
        {
            id: "consumer",
            category: "Entry Point",
            title: "Consumer Verification",
            icon: "📱",
            color: "hsl(210,85%,62%)",
            x: 1550, y: 240,
            desc: "Consumer-facing scan experience — verify any product's authenticity instantly.",
            sections: [
                { label: "Channels", items: [
                    "PWA (Web App)", "Future Native App",
                    "Paytm Integration", "PhonePe Integration"
                ]},
                { label: "Output", items: [
                    "Scan History", "Verification Result",
                    "Product Details", "Authenticity Certificate"
                ]}
            ]
        },

        // ── CORE SERVICES ───────────────────────────────────────
        {
            id: "engine",
            category: "Service",
            title: "TRACE Engine",
            icon: "⚙️",
            color: "hsl(220,80%,62%)",
            x: 400, y: 740,
            desc: "Proprietary visual language — encodes and decodes TRACE Marks. Does NOT decrypt payloads.",
            sections: [
                { items: [
                    "TRACE Mark Generation", "TRACE Mark Decoding",
                    "Photo → Vision Processing", "Error Correction",
                    "Version Control (v1 → v2 → v3)"
                ]}
            ],
            flow: ["Photo", "→", "Vision Layer*", "→", "Decode", "→", "Encrypted Payload"]
        },
        {
            id: "backend",
            category: "Service",
            title: "Verification Backend",
            icon: "🖥️",
            color: "hsl(200,80%,58%)",
            x: 1350, y: 720,
            desc: "Source of truth — the ONLY system that decrypts payloads and performs verification.",
            sections: [
                { label: "Responsibilities", items: [
                    "Receive Encrypted Payload",
                    "Decrypt via Secure Keys",
                    "Lookup Product in Database",
                    "Return Verification Result",
                    "Log Scan to Analytics"
                ]}
            ]
        },
        {
            id: "activation",
            category: "Service",
            title: "Activation System",
            icon: "🔑",
            color: "hsl(32,85%,58%)",
            x: 2100, y: 740,
            desc: "Activates manufactured products before they ship. Multiple activation methods supported.",
            sections: [
                { label: "Methods", items: [
                    "Factory Scanner", "Webcam Activation",
                    "Mobile Activation App",
                    "Batch Activation", "Individual Activation"
                ]}
            ],
            flow: ["Generate", "→", "Print", "→", "Activate*", "→", "Ship"]
        },

        // ── INFRASTRUCTURE ──────────────────────────────────────
        {
            id: "database",
            category: "Infrastructure",
            title: "Database",
            icon: "🗄️",
            color: "hsl(170,70%,50%)",
            x: 1100, y: 1290,
            desc: "Central data store — persists registry records, telemetry logs, and digital twins.",
            sections: [
                { label: "Identity Registry Schema", items: [
                    "Product Digital Twins", "Manufacturer Registry",
                    "Batch & Activation Logs", "Scan & Verification History"
                ]},
                { label: "Infrastructure Data", items: [
                    "Metadata Event Logs", "User & Team Credentials"
                ]}
            ]
        },
        {
            id: "analytics",
            category: "Infrastructure",
            title: "Analytics Engine",
            icon: "📊",
            color: "hsl(48,82%,55%)",
            x: 1750, y: 1290,
            desc: "Behavioral intelligence — detects counterfeiting patterns, generates risk scores.",
            sections: [
                { label: "Tracking", items: [
                    "Scan Count & Velocity", "Scan Geo-Location",
                    "Device Fingerprint", "Scan Timeline"
                ]},
                { label: "Outputs", items: [
                    "Risk Score Calculation", "Suspicious Activity Alerts",
                    "Counterfeit Probability", "Regional Trends"
                ]}
            ]
        },

        // ── FUTURE ──────────────────────────────────────────────
        {
            id: "future",
            category: "Future",
            title: "Future Security Layers",
            icon: "🔮",
            color: "hsl(180,65%,52%)",
            x: 650, y: 1810,
            desc: "Potential future systems extending TRACE's defense capabilities.",
            sections: [
                { items: [
                    "Scratch Codes", "Ownership Transfer",
                    "RFID / NFC", "Microprinting",
                    "Digital Signatures", "Blockchain",
                    "Enterprise APIs"
                ]}
            ]
        },
        {
            id: "vision",
            category: "Future",
            title: "Long-Term Vision",
            icon: "🚀",
            color: "hsl(145,65%,52%)",
            x: 1450, y: 1810,
            desc: "TRACE evolves beyond marks into industry-scale infrastructure.",
            sections: [
                { label: "TRACE is NOT", items: ["~A QR code", "~A barcode"] },
                { label: "TRACE IS", items: [
                    "*Product Identity Infrastructure",
                    "*Product Verification Infrastructure",
                    "*Product Intelligence Infrastructure",
                    "*Anti-Counterfeit Ecosystem"
                ]}
            ]
        }
    ],
    connections: [
        // Request flows (solid)
        ["brand",      "engine",     "Generate Mark",            "request"],
        ["brand",      "backend",    "Register Product",         "request"],
        ["consumer",   "engine",     "Photo → Decode",           "request"],
        ["consumer",   "backend",    "Verification Request",     "request"],
        ["activation", "backend",    "Activate Product",         "request"],
        ["backend",    "analytics",  "Log Scan Event",           "request"],

        // Data flows (dashed)
        ["brand",      "database",   "CRUD Products",            "data"],
        ["backend",    "database",   "Product Lookup",           "data"],
        ["activation", "database",   "Update Status",            "data"],
        ["analytics",  "database",   "Read/Write Scans",         "data"],
        ["analytics",  "backend",    "Anomalies / Risk Score",   "data"],

        // Future (dotted)
        ["future",     "backend",    "Integrates",               "future"],
        ["vision",     "future",     "Roadmap Alignment",        "future"],
        ["backend",    "analytics",  "Future: Async Event Broker", "future"],
    ],
    flows: [
        {
            id: "consumer-verify",
            title: "Consumer Verification",
            subtitle: "What happens when someone scans a product?",
            color: "hsl(210,85%,62%)",
            steps: [
                {
                    node: "consumer",
                    label: "Consumer scans a product",
                    detail: "Consumer opens the TRACE PWA, points their camera at the product, and captures a photo of the TRACE Mark.",
                    data: "📸 Photo of TRACE Mark"
                },
                {
                    node: "engine",
                    label: "TRACE Engine decodes the mark",
                    detail: "Photo is processed through the Vision Layer. The TRACE Mark is identified, decoded, and an encrypted payload is extracted. The Engine does NOT decrypt — it only reads the visual encoding.",
                    data: "🔒 Encrypted Payload (opaque to Engine)"
                },
                {
                    node: "backend",
                    label: "Backend decrypts payload & validates",
                    detail: "The Verification Backend receives the encrypted payload crossing the trust boundary. It decrypts the payload inside the secure environment and validates the authenticity of the TRACE ID.",
                    data: "🔓 Decrypted: TRACE ID resolved (inside secure boundary)",
                    trustHighlight: true
                },
                {
                    node: "database",
                    label: "Product looked up in registry",
                    detail: "The decrypted TRACE ID is used to query the product registry inside the database. Product details, batch history, and activation status are retrieved.",
                    data: "📦 Product Record & Activation Status"
                },
                {
                    node: "analytics",
                    label: "Scan event logged for intelligence",
                    detail: "Scan metadata (location, device fingerprint, timestamp) is logged. The Analytics Engine runs checks for behavioral anomalies like unusual scan velocity.",
                    data: "📊 Scan Metadata → Behavioral Heuristics"
                },
                {
                    node: "consumer",
                    label: "Verification result returned",
                    detail: "The consumer receives the validation result — authentic, suspicious, or unknown. Product details, batch verification, and certification are displayed.",
                    data: "✅ Verified Authentic — Product Details Shown"
                }
            ]
        },
        {
            id: "product-generation",
            title: "Product Generation",
            subtitle: "How does a brand create TRACE-protected products?",
            color: "hsl(260,70%,65%)",
            steps: [
                {
                    node: "brand",
                    label: "Brand creates a product entry",
                    detail: "Through the Brand Portal, the manufacturer registers a new product. This initializes the metadata for the product entry.",
                    data: "📝 Product Details & Batch Specs"
                },
                {
                    node: "engine",
                    label: "TRACE Engine encrypts & encodes mark",
                    detail: "Unique TRACE IDs are encrypted using secure cryptographic keys and encoded into the proprietary visual TRACE Mark. The raw ID is never stored in the visual pattern.",
                    data: "🔒 Encrypted Payload → Visual TRACE Mark Assets"
                },
                {
                    node: "database",
                    label: "Product registered in database",
                    detail: "The product record is persisted in the database registry as 'Generated', mapping the unique TRACE ID to the manufacturer and batch.",
                    data: "💾 TRACE ID assigned → Database Registry"
                },
                {
                    node: "activation",
                    label: "Marks queued for Activation",
                    detail: "The generated TRACE Marks are sent to factory printing queues and the Activation System, ready to be printed and scanned during manufacturing.",
                    data: "📋 Mark print queue initialized"
                }
            ]
        },
        {
            id: "activation",
            title: "Product Activation",
            subtitle: "How are manufactured products activated into the ecosystem?",
            color: "hsl(32,85%,58%)",
            steps: [
                {
                    node: "brand",
                    label: "Brand initiates activation",
                    detail: "After printing TRACE Marks on product packaging, the brand triggers the activation workflow for the manufactured batch.",
                    data: "📋 Batch of products ready for activation"
                },
                {
                    node: "activation",
                    label: "Products scanned at factory",
                    detail: "Using factory scanners or mobile apps, the physical TRACE Marks are scanned. This proves the code was printed and applied to a physical product.",
                    data: "📷 Factory scan of TRACE Mark"
                },
                {
                    node: "backend",
                    label: "Activation validated by backend",
                    detail: "The Verification Backend validates the request inside the secure boundary, checking cryptographic integrity and ensuring the ID has not been previously activated.",
                    data: "✅ Validation check completed"
                },
                {
                    node: "database",
                    label: "Registry updated with active identity",
                    detail: "The product's status is updated to 'Active' in the Database's Identity Registry. Timestamp, batch details, and activation metadata are logged to complete its digital twin.",
                    data: "💾 Status: Generated → Active (Identity Registry Updated)"
                }
            ]
        },
        {
            id: "counterfeit-detection",
            title: "Counterfeit Detection",
            subtitle: "How does TRACE detect counterfeit activity?",
            color: "hsl(0,72%,62%)",
            steps: [
                {
                    node: "analytics",
                    label: "Behavioral patterns analyzed",
                    detail: "The Analytics Engine continuously monitors scan patterns across all products, building behavioral profiles and scan baselines.",
                    data: "📊 Baseline patterns for all products"
                },
                {
                    node: "database",
                    label: "Historical scan data queried",
                    detail: "The engine queries the database for historical logs, tracking location clusters and scan velocity trends.",
                    data: "🔍 Historical Scan Data Loaded"
                },
                {
                    node: "analytics",
                    label: "Anomaly detected & risk scored",
                    detail: "The Analytics Engine detects high-risk anomaly (e.g. Mumbai & Delhi scans within 30 minutes). It calculates a critical risk score based on geo-velocity heuristics.",
                    data: "🔴 Risk Score: 94/100 (High Counterfeit Probability)"
                },
                {
                    node: "backend",
                    label: "Backend routes threat trigger",
                    detail: "The Verification Backend receives the high-risk alert event from Analytics and triggers immediate threat mitigation rules & notification webhooks.",
                    data: "⚠️ Threat Alert Broadcast"
                },
                {
                    node: "brand",
                    label: "Brand alerted via portal",
                    detail: "The brand is instantly notified via the Brand Portal dashboard, showing suspicious locations, timestamps, and product batch ID.",
                    data: "🚨 Alert: Suspected counterfeit activity detected"
                }
            ]
        },
        {
            id: "analytics-flow",
            title: "Analytics Pipeline",
            subtitle: "How does scan data become intelligence?",
            color: "hsl(48,82%,55%)",
            steps: [
                {
                    node: "consumer",
                    label: "Consumer scans product",
                    detail: "Every consumer scan generates a rich metadata event — not just the scan result, but location, device info, timestamp, and behavioral signals.",
                    data: "📱 Scan event with metadata"
                },
                {
                    node: "backend",
                    label: "Backend processes verification",
                    detail: "While processing the verification request, the backend packages scan metadata into an analytics event for downstream processing.",
                    data: "📦 Scan metadata packaged"
                },
                {
                    node: "analytics",
                    label: "Analytics Engine ingests event",
                    detail: "The scan event is ingested by the Analytics Engine — enriched with geo-data, device classification, and time-series context.",
                    data: "📊 Event enriched with context"
                },
                {
                    node: "database",
                    label: "Event stored and indexed",
                    detail: "The enriched event is stored in the scan event log and indexed for real-time querying. Historical patterns are updated.",
                    data: "💾 Indexed in scan event log"
                },
                {
                    node: "analytics",
                    label: "Intelligence outputs generated",
                    detail: "Aggregated data produces actionable outputs — risk scores per product, regional trends, scan velocity reports, and suspicious activity alerts.",
                    data: "📈 Risk Scores, Trends, Alerts → Brand Dashboard"
                },
                {
                    node: "brand",
                    label: "Insights available on dashboard",
                    detail: "Manufacturers see real-time analytics on the Brand Portal — scan maps, product activity timelines, counterfeit probability heat maps, and regional trends.",
                    data: "📊 Dashboard: Maps, Timelines, Heat Maps"
                }
            ]
        },
        {
            id: "registration-flow",
            title: "Product Registration",
            subtitle: "How does a product get its digital identity?",
            color: "hsl(310,65%,62%)",
            steps: [
                {
                    node: "brand",
                    label: "Brand registers product details",
                    detail: "The manufacturer inputs product metadata, SKU details, and batch size through the Brand Portal.",
                    data: "📝 Product Profile & Batch Metadata"
                },
                {
                    node: "backend",
                    label: "Backend validates registration",
                    detail: "The Verification Backend verifies the request credentials, checks for naming collisions, and authorizes the registration.",
                    data: "🔑 Verification Backend Authorization"
                },
                {
                    node: "database",
                    label: "Identity registry record written",
                    detail: "The Database creates the authoritative registry entries, generating a unique TRACE ID mapping and establishing the initial digital twin status.",
                    data: "💾 TRACE ID Assigned & Status = Registered"
                },
                {
                    node: "brand",
                    label: "Product ready for mark generation",
                    detail: "The Brand Portal displays the successful registration. The product batch is now cleared for generating visual TRACE Marks.",
                    data: "✅ Status: Registered → Ready for Mark Generation"
                }
            ]
        },
        {
            id: "ownership-flow",
            title: "Ownership Flow",
            subtitle: "How does a consumer claim and manage physical product ownership?",
            color: "hsl(310,65%,62%)",
            steps: [
                {
                    node: "consumer",
                    label: "Consumer claims ownership",
                    detail: "Upon successful verification, the consumer opts to claim the product via the PWA, binding the physical unit to their profile.",
                    data: "👤 Consumer ID & TRACE ID Pairing Request"
                },
                {
                    node: "backend",
                    label: "Backend validates claim",
                    detail: "The Verification Backend validates the request—confirming the product's active status and ensuring it is not already claimed.",
                    data: "🔒 Ownership Eligibility Verified"
                },
                {
                    node: "database",
                    label: "Ownership saved to registry",
                    detail: "The Database updates the product registry schema, writing the consumer ownership mapping to complete the lifecycle record.",
                    data: "💾 Database Registry Status: Owned"
                },
                {
                    node: "future",
                    label: "Future: Secure peer-to-peer transfer",
                    detail: "Future Roadmap capability: cryptographic transfer protocols enabling secondary market proof-of-ownership updates.",
                    data: "🔮 Future Secure P2P Ownership Exchange"
                }
            ]
        }
    ]
};
