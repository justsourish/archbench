# Architecture Workbench (ArchBench)

## Vision

Architecture Workbench is a local-first, open-source Architecture IDE.

It is not tied to TRACE.

TRACE is only the first project built inside it.

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

# Sprint 0 — Separation from TRACE

Goal:

Separate the Workbench from the TRACE project.

Tasks:

* Rename application references from TRACE Simulator to Architecture Workbench.
* Remove TRACE-specific branding.
* Convert TRACE into a sample project.
* Create generic architecture terminology.
* Ensure all UI components work with arbitrary architectures.

Success Criteria:

Workbench can visualize architectures that are not TRACE.

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

# Sprint 5 — LLM Integration Layer

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

# Sprint 6 — Project Agent Terminal

Goal:

Architecture-aware terminal.

Tasks:

* Add xterm.js terminal.
* Terminal scoped to selected project.
* Architecture-aware commands.

Examples:

arch parse

arch simulate

arch audit

arch compare

arch export

Success Criteria:

Workbench can be operated through terminal commands.

---

# Sprint 7 — Agent Context System

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

# Sprint 8 — AI-Assisted Architecture

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

# Sprint 9 — Open Source Release

Goal:

Public GitHub release.

Tasks:

* Documentation
* GitHub Pages
* Sample Projects
* MIT License
* Contribution Guide

Sample Projects:

* TRACE
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
