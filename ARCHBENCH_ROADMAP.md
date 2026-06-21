# Architecture Workbench (ArchBench)

## Vision

Architecture Workbench is a local-first, open-source Architecture IDE.

It is not tied to any one sample project.

The original private sample was only the first project built inside it.

Architecture Workbench allows developers, founders, architects, and engineers to:

* Define architecture as code
* Visualize architecture
* Simulate flows
* Generate execution logs
* Generate architecture audits
* Track architecture history
* Connect their own LLM
* Keep all project data local

Core Philosophy:

* Local First
* Bring Your Own LLM
* Bring Your Own Project
* Own Your Data
* Own Your History
* Open Source (MIT)

---

# Sprint 0 — Separation from the Legacy Sample

Goal:

Separate the Workbench from the original private sample project.

Tasks:

* Rename application references from the legacy simulator branding to Architecture Workbench.
* Remove sample-specific branding.
* Convert the original sample into a neutral public demo.
* Create generic architecture terminology.
* Ensure all UI components work with arbitrary architectures.

Success Criteria:

Workbench can visualize architectures that are not tied to the original sample domain.

---

# Sprint 1 — Project System

Goal:

Architecture Workbench manages multiple projects.

Tasks:

* Add Project Selector.
* Add Create Project.
* Add Open Existing Project.
* Store project metadata locally.
* Remove architecture-specific sidebar assumptions.

Project Structure:

project-folder/
├── architecture.md
├── docs/
├── src/
└── ...

Success Criteria:

User can switch between multiple architecture projects.

---

# Sprint 2 — Architecture as Code

Goal:

Architecture becomes markdown-driven.

Tasks:

* Create architecture.md specification.
* Create parser.
* Create validator.
* Create importer.
* Create exporter.

Pipeline:

architecture.md
↓
Parser
↓
Graph
↓
Flows
↓
Simulation

Success Criteria:

Workbench can fully regenerate architecture from markdown.

---

# Sprint 3 — Architecture Runtime

Goal:

Workbench becomes a rendering engine.

Tasks:

* Parse Nodes.
* Parse Connections.
* Parse Flows.
* Parse Trust Boundaries.
* Parse Metadata.

Generate:

* Graph
* Flow Simulator
* Audit Engine

Success Criteria:

Architecture UI is generated entirely from markdown.

---

# Sprint 4 — Local History Engine

Goal:

Track architecture evolution.

Tasks:

* IndexedDB persistence.
* Audit storage.
* Snapshot storage.
* Health report storage.
* Timeline UI.
* Comparison UI.

Success Criteria:

User can compare architecture versions over time.

---

# Sprint 5 — Project Onboarding Experience

Goal:

Design a clean, folder-first, and concept-first onboarding flow instead of starting directly inside a raw Markdown specification editor.

Tasks:

* Design a multi-path onboarding wizard layout.
* Implement **Analyze Existing Project** path:
  * Select/drop a local directory using browser directory selectors.
  * Scan directory recursively for a specification file (`architecture.md`).
  * If found, automatically parse and initialize the workspace.
  * If not found, run a folder heuristic scanner to auto-detect frontend/client, api, auth, worker, or database layouts to scaffold a starter architecture.
* Implement **Design New Project** path:
  * Prompt the user for a textual description of their project concept.
  * Use local token analyzers to dynamically generate appropriate modules, connections, and flows.
* Pivot the existing Markdown spec editor into an "Advanced Architecture Editor" accessible after project onboarding.

Success Criteria:

User can successfully onboard new local projects and scaffold initial architecture files in under 2 minutes without writing raw Markdown manually.

---

# Sprint 6 — BYOA Agent Runtime

Goal:

Establish the project workspace as the single source of truth for external terminal-based or IDE-integrated AI agents.

Tasks:

* Standardize workspace boundary configurations (`PROJECT_RULES.md`, `WORKBENCH.md`).
* Implement architecture change detection and automatic project refresh.
* Create a headless CLI validation/parsing utility for terminal-based audits.

Success Criteria:

An external agent can programmatically read, write, and validate project architecture, with ArcBench acting as a live visualization dashboard.

---

# Sprint 7 — Project Agent Terminal

Goal:

Architecture-aware in-app terminal shell console.

Tasks:

* Load xterm.js styling and script files dynamically from browser CDN.
* Add collapsible terminal view panel inside tab list container.
* Build interactive mock command processor shell (`archbench:current-project$`).
* Wire architecture-aware console commands:
  * `help`: Lists commands.
  * `arch parse`: Parsed project nodes/connections validation.
  * `arch simulate <flow>`: Steps simulation sequence.
  * `arch audit`: Runs coupling and health checks.
  * `arch compare`: Queries IndexedDB snapshot history logs.
  * `arch export`: Triggers spec Markdown download.
  * `clear`: Clears xterm console view.

Success Criteria:

Intra-app xterm terminal behaves as an active workspace shell to audit, simulate, and inspect the project directly.

---

# Sprint 8 — LLM Integration Layer

Goal:

Bring Your Own LLM.

Tasks:

* Add Model Settings page.
* Support:

  * Gemini
  * Claude
  * OpenAI
  * OpenRouter
  * Ollama
  * Custom Endpoint

Store:

* API Keys locally only.
* Never send keys to ArchBench servers.

Success Criteria:

User can connect any model.


---

# Sprint 9 — Agent Context System

Goal:

Allow AI agents to safely operate on projects.

Tasks:

Define:

ARCHITECTURE.md

PROJECT_RULES.md

WORKBENCH.md

Agent reads:

* What project is
* What files matter
* What files must not be touched
* Architecture conventions
* Flow conventions

Success Criteria:

Connected LLM can safely modify project architecture.

---

# Sprint 10 — AI-Assisted Architecture

Goal:

Use connected LLMs.

Examples:

Review Architecture

Generate Architecture

Improve Architecture

Generate Flows

Generate APIs

Generate Schemas

Generate Test Plans

Generate Documentation

Success Criteria:

Architecture Workbench becomes AI-assisted.

---

# Sprint 11 — Open Source Release

Goal:

Public GitHub release.

Tasks:

* Documentation
* GitHub Pages
* Sample Projects
* MIT License
* Contribution Guide

Sample Projects:

* Legacy sample project
* Example SaaS
* Example E-commerce
* Example Startup

Success Criteria:

Anyone can clone ArchBench and use it locally.

---

# Rule for Gemini

IMPORTANT:

Do not skip sprints.

Do not implement future sprint functionality early.

Complete one sprint fully.

Validate it.

Commit it.

Only then move to the next sprint.

Architecture Workbench must evolve incrementally and remain stable throughout development.

