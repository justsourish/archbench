// Architecture Workbench - Built-in public demo project
// Wrapped Markdown specification as the single source of truth

window.ARCHBENCH_PROJECT_MD = `# ArcBench Architecture
Version: 1.0

## Description
ArcBench is a local-first architecture workbench that runs entirely in the browser. It combines visual modeling, Markdown-based architecture specs, simulation playback, AI exports, and browser-local history without requiring a backend account system.

## Layers
- **entry**: Entry Points — Browser surfaces and user actions (y: 150, h: 380)
- **services**: Core Runtime — Parsing, rendering, simulation, and exports (y: 610, h: 560)
- **infra**: Local Persistence & External Services — Browser storage and optional LLM providers (y: 1260, h: 500)
- **future**: Roadmap — Planned product extensions (y: 1860, h: 320)

## Trust Boundary
- **Title**: BROWSER TRUST BOUNDARY
- **Note**: Project editing, simulation, exports, and API-key-backed AI requests execute on the client device.
- **Geometry**: x: 860, y: 580, w: 1540, h: 1230

## Nodes

### user (Entry Point)
* **Title:** User Workspace
* **Icon:** 🧑‍💻
* **Color:** hsl(210,85%,62%)
* **x:** 340
* **y:** 230
* **Description:** The human operator interacting with ArcBench through the browser UI.
* **Actions:** Switch projects, Create new specs, Import Markdown, Run flows, Review reports

### ui (Entry Point)
* **Title:** ArcBench Browser UI
* **Icon:** 🖥️
* **Color:** hsl(265,72%,67%)
* **x:** 1180
* **y:** 230
* **Description:** The static web application shell that presents the canvas, flow controls, project tools, and AI/export panels.
* **Surfaces:** Top bar, Canvas viewport, Flow bar, Side panels, Modals

### project (Service)
* **Title:** Project System
* **Icon:** 🧭
* **Color:** hsl(225,78%,62%)
* **x:** 520
* **y:** 770
* **Description:** Manages built-in and custom projects, import/export behavior, and active-project switching.
* **Responsibilities:** Load built-in demo, Switch active project, Clone built-ins, Export Markdown

### parser (Service)
* **Title:** Parser & Validation Engine
* **Icon:** 🧩
* **Color:** hsl(195,78%,58%)
* **x:** 1060
* **y:** 770
* **Description:** Converts Markdown architecture specs into runtime graph objects and validates node, connection, and flow integrity.
* **Responsibilities:** Parse Markdown, Validate references, Generate export payloads

### simulator (Service)
* **Title:** Simulation & Rendering Engine
* **Icon:** ⚙️
* **Color:** hsl(28,82%,58%)
* **x:** 1650
* **y:** 770
* **Description:** Renders nodes and connections, drives flow playback, and compiles execution logs and health reports.
* **Responsibilities:** Draw graph, Step flows, Batch audits, Compute metrics

### ai (Service)
* **Title:** AI & Export Engine
* **Icon:** ✨
* **Color:** hsl(316,70%,66%)
* **x:** 2200
* **y:** 770
* **Description:** Builds knowledge packs, injects current architecture context, and sends browser-side requests to user-configured LLM providers.
* **Responsibilities:** Compile context, Store provider settings, Generate AI prompts, Download packs

### localprojects (Infrastructure)
* **Title:** Local Project Store
* **Icon:** 💾
* **Color:** hsl(168,70%,50%)
* **x:** 760
* **y:** 1390
* **Description:** Browser \`localStorage\` used to persist custom projects, active project state, and AI configuration.
* **Stored Data:** Custom projects, Active project ID, LLM settings

### history (Infrastructure)
* **Title:** IndexedDB History Store
* **Icon:** 🗃️
* **Color:** hsl(48,82%,55%)
* **x:** 1480
* **y:** 1390
* **Description:** IndexedDB database used for audit runs, architecture snapshots, and health history.
* **Stored Data:** Audit runs, Architecture snapshots, Health history

### llm (Infrastructure)
* **Title:** Optional LLM Providers
* **Icon:** 🔌
* **Color:** hsl(188,72%,58%)
* **x:** 2220
* **y:** 1390
* **Description:** External AI endpoints such as Gemini, OpenAI-compatible APIs, or local Ollama instances, called directly from the browser.
* **Providers:** Gemini, OpenAI-compatible, Ollama

### future (Future)
* **Title:** Future Collaboration Layer
* **Icon:** 🚀
* **Color:** hsl(142,62%,54%)
* **x:** 1470
* **y:** 1960
* **Description:** Placeholder for future capabilities such as shared workspaces, richer import pipelines, and multi-user review workflows.
* **Ideas:** Shared sessions, Better repo analysis, Team comments, Template marketplace

## Connections
| From | To | Interaction | Type |
|---|---|---|---|
| user | ui | Interact with workspace | request |
| ui | project | Project commands | request |
| ui | parser | Import / edit spec | request |
| ui | simulator | Visualize and simulate | request |
| ui | ai | AI prompts and export actions | request |
| project | parser | Load and serialize spec | request |
| project | localprojects | Persist custom project state | data |
| parser | simulator | Graph model payload | data |
| simulator | history | Save audit runs and snapshots | data |
| ai | localprojects | Persist browser-side AI settings | data |
| ai | llm | Direct browser API calls | request |
| future | project | Planned collaboration features | future |
| future | ai | Planned shared AI workflows | future |

## Flows

### load-demo (Load Built-in Demo)
*What happens when ArcBench opens with the built-in architecture sample.*
- **Color:** hsl(210,85%,62%)

1. **user** [Open ArcBench]: The user opens the static ArcBench site in the browser.
   * Data: Browser session start
2. **ui** [Boot application shell]: The UI loads the canvas, top bar, side panels, and built-in demo script.
   * Data: HTML, CSS, JavaScript modules
3. **project** [Resolve active project]: The project system checks browser state and chooses the built-in ArcBench demo if no custom project is active.
   * Data: Active project ID lookup
4. **parser** [Parse demo spec]: The Markdown demo spec is parsed into nodes, connections, layers, and flows.
   * Data: ArcBench demo Markdown
5. **simulator** [Render architecture]: The graph engine measures nodes, draws relationships, and displays simulation buttons.
   * Data: Runtime graph model
6. **ui** [Show ready workspace]: The user sees ArcBench represented as the default architecture canvas.
   * Data: Interactive architecture view

### import-project (Import Custom Project)
*How a user brings their own architecture into ArcBench.*
- **Color:** hsl(265,72%,67%)

1. **user** [Choose import]: The user clicks the Import action and selects a Markdown or JSON file.
   * Data: Local project file
2. **ui** [Read selected file]: The browser reads the file contents with a client-side file reader.
   * Data: Raw file contents
3. **parser** [Validate imported spec]: The parser converts the file into runtime project data and validates nodes, connections, and flows.
   * Data: Parsed project structure
4. **project** [Register custom project]: The project system assigns a project ID and saves the imported project into local browser storage.
   * Data: Custom project metadata
5. **localprojects** [Persist project]: Browser storage records the project so it can be reopened later.
   * Data: Serialized project payload
6. **simulator** [Render imported architecture]: The imported project becomes the active canvas and available flow set.
   * Data: Active project graph

### run-audit (Run Simulation Audit)
*How ArcBench turns architecture flows into stored audit history.*
- **Color:** hsl(28,82%,58%)

1. **user** [Start a flow or batch audit]: The user runs a single flow or sequential batch from the simulator controls.
   * Data: Selected flow IDs
2. **simulator** [Execute steps]: The simulation engine advances through nodes, updates highlights, and builds execution logs.
   * Data: Step logs and runtime counters
3. **simulator** [Compute health summary]: Metrics and health analysis are generated from the completed execution data.
   * Data: Risk report and quality score
4. **history** [Save history]: The audit run, health summary, and architecture snapshot are written to IndexedDB.
   * Data: Audit run, snapshot, health history
5. **ui** [Expose reports]: The log, health, and history panels update so the user can review or export results.
   * Data: Rendered reports and comparisons

### ask-ai (Ask AI About Architecture)
*How ArcBench sends architecture context to a user-configured LLM.*
- **Color:** hsl(316,70%,66%)

1. **user** [Open AI panel]: The user configures a provider or asks a question about the active architecture.
   * Data: Prompt text and provider choice
2. **ai** [Assemble context]: The AI engine compiles Markdown context from the current project, flows, and optionally recent audit data.
   * Data: Knowledge pack Markdown
3. **localprojects** [Read saved AI settings]: Browser storage provides the selected provider, model, and locally stored API key details.
   * Data: Provider config
4. **ai** [Send browser-side request]: The AI engine submits the request directly from the client to the configured provider endpoint.
   * Data: Prompt payload and model config
5. **llm** [Return model response]: The provider returns the generated analysis or artifact text.
   * Data: LLM response
6. **ui** [Display answer and exports]: ArcBench shows the response in the chat panel and keeps export actions available locally.
   * Data: Rendered AI response
`;
