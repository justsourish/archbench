# Architecture Workbench (ArchBench)

Architecture Workbench is a local-first, open-source Architecture IDE and visualization engine. It allows developers, architects, and product teams to define their architecture as code, visualize system connections, simulate request flows, and generate unified audit logs and health reports—all entirely on their own machines.

## Core Features

- **Dynamic Visualization:** Interactive diagrams featuring node detail inspection, layers, and trust boundaries.
- **Interactive Flow Simulation:** Click through sequential step-by-step request/response flows with visual playback controls.
- **Unified Auditing & Health Reports:** Record simulation logs, analyze architectural patterns, and evaluate metrics (like node activation counts and boundary crossings) deterministically.
- **Local History (IndexedDB):** Store and compare historical simulation runs and snapshots locally.
- **AI-Ready Context:** Easily compile graph state and execution logs into Markdown knowledge packages to feed into LLMs.

---

## Getting Started

Since Architecture Workbench is a local-first, static application, you can run it directly in your browser without any backend servers or compilation steps.

1. Clone or download this repository.
2. Open [index.html](index.html) in any modern web browser.

---

## Defining and Loading Architectures

Architecture Workbench loads configuration dynamically from a global object: `window.ARCHBENCH_PROJECT`.

### 1. Architecture Configuration Format
To define your own architecture, create a JavaScript file that populates `window.ARCHBENCH_PROJECT` with the following structure:

```javascript
window.ARCHBENCH_PROJECT = {
    title: "My Architecture Project",
    version: "1.0",
    nodes: [
        {
            id: "frontend",
            category: "Entry Point",
            title: "Web Client",
            icon: "💻",
            color: "hsl(210,85%,62%)",
            x: 200, y: 150,
            desc: "User-facing dashboard application.",
            sections: [
                { label: "Tech Stack", items: ["React", "Vite"] }
            ]
        },
        {
            id: "api",
            category: "Service",
            title: "API Gateway",
            icon: "🔒",
            color: "hsl(280,85%,75%)",
            x: 600, y: 150,
            desc: "Routes incoming API calls and authorizes tokens."
        }
    ],
    connections: [
        // [From Node ID, To Node ID, Interaction Label, Connection Type ("request" | "data")]
        ["frontend", "api", "HTTPS Request", "request"]
    ],
    flows: [
        {
            id: "auth_flow",
            title: "User Sign In",
            subtitle: "Authentication and token generation",
            steps: [
                {
                    node: "frontend",
                    label: "Submit Credentials",
                    detail: "User enters username/password and submits.",
                    data: '{"username": "user1"}'
                },
                {
                    node: "api",
                    label: "Verify Token",
                    detail: "API Gateway checks validity.",
                    data: '{"status": "approved"}'
                }
            ]
        }
    ]
};
```

### 2. Loading the Project
To load your custom configuration:

1. Save your project file (e.g. `samples/my_project.js`).
2. Open [index.html](index.html) and update the script tags at the bottom to load your file before `graph.js`:

```html
<script src="samples/my_project.js"></script>
<script src="graph.js"></script>
```

3. Refresh your browser to view your visualized architecture and run simulations!

---

## License

This project is licensed under the [MIT License](LICENSE).
