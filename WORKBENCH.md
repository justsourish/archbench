# ArchBench Developer & Agent Workbench Guide

This document describes the repository layout and the local developer workflows that sit alongside the hosted public app.

## Directory structure

- [index.html](index.html): Static app shell and UI layout.
- [graph.js](graph.js): Main runtime orchestration, project loading, and panel wiring.
- [graph.css](graph.css): UI styling and layout system.
- [js/](js): Runtime modules for parsing, history, rendering, AI, and utilities.
- [docs/](docs): Architecture authoring schema, templates, examples, and agent prompt files.
- [samples/](samples): Built-in demo assets used by the app.
- [arch-cli.js](arch-cli.js): Optional local CLI validator for Markdown architecture specs.

## Local-only workflows

The public hosted app intentionally hides a few features that are only useful in local development:

1. `Live Watch`: Watches a local Markdown spec or a served `architecture.md` file and hot-reloads the graph.
2. `Terminal`: Provides an in-app command surface for local inspection workflows.
3. Local sample editing: Best used while serving the repo over `localhost`.

To use these features, serve the repository locally:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## CLI validation

Run a local validation pass against the built-in sample or any custom spec:

```bash
node arch-cli.js validate samples/demo.md
```
