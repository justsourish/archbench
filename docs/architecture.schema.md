# Architecture Workbench (ArcBench) — Markdown Schema Specification

This document defines the strict Markdown schema utilized by the ArcBench parser to generate visual graphs, flow simulations, execution logs, and architecture health audits.

---

## 1. Document Structure & Order

An `architecture.md` file consists of the following sections in order:
1. **Title & Version** (H1 + Metadata)
2. **Project Description** (H2)
3. **Layers** (H2, Optional)
4. **Trust Boundary** (H2, Optional)
5. **Nodes / Systems** (H2)
6. **Connections** (H2)
7. **Flows** (H2)

---

## 2. Section Details

### 2.1 Project Metadata
The document MUST start with a Level-1 heading (`#`) representing the project title, followed by a `Version:` declaration.

```markdown
# Project Title
Version: 1.0
```

### 2.2 Project Description
An optional high-level overview of the ecosystem under `## Description`.

```markdown
## Description
Provide a 1-2 sentence description of the system architecture.
```

### 2.3 Layers (Visual Swimlanes)
Under `## Layers`, specify layers as bullet points with vertical coordinate heights.
* **Format**: `- **[id]**: [Label] (y: [y-offset], h: [height-span])`

```markdown
## Layers
- **entry**: Entry Points (y: 150, h: 420)
- **services**: Core Services (y: 640, h: 480)
- **infra**: Infrastructure (y: 1190, h: 450)
```

### 2.4 Trust Boundary
An optional secure network zone boundary.
* **Geometry**: `x: [left], y: [top], w: [width], h: [height]`

```markdown
## Trust Boundary
- **Title**: SECURE BACKEND ZONE
- **Note**: Decryption & database persistence execute here
- **Geometry**: x: 1000, y: 670, w: 1120, h: 950
```

### 2.5 Nodes
Nodes represent components or microservices.
* **Header**: `### [node-id] ([Category])`
* **Attributes**: Bullet points starting with `* **[Key]:**`
  - `Title`: Visual name displayed in node box.
  - `Icon`: Emoji character.
  - `Color`: CSS-valid color (HSL recommended, e.g., `hsl(210,85%,62%)`).
  - `x`: Canvas X coordinate.
  - `y`: Canvas Y coordinate.
  - `Description`: High-level explanation text.
  - `Flow`: A sequence pipeline indicator formatted as `Step1 → Step2 → Step3`.
  - **Custom Sections**: Any other bullet point `* **[Section Label]:** Item1, Item2` will generate a lists segment in the node body.
* **Callout Box**: Formatted as a blockquote `> **[type]** text` (e.g., type `warning`, `info`, `danger`).

```markdown
## Nodes

### client (Entry Point)
* **Title:** Web Client
* **Icon:** 💻
* **Color:** hsl(210,85%,62%)
* **x:** 450
* **y:** 240
* **Description:** SPA dashboard.
* **Tech Stack:** HTML5, CSS3, ES6
> **[info]** Handles token storage locally.
```

### 2.6 Connections
Connections are defined using a standard Markdown table under the `## Connections` header.
* **Required Columns**: `From`, `To`, `Interaction`, `Type`
* **Type Options**:
  - `request` (Solid arrow line)
  - `data` (Dashed arrow line)
  - `future` (Dotted arrow line)

```markdown
## Connections
| From | To | Interaction | Type |
|---|---|---|---|
| client | gateway | API Request | request |
| gateway | database | SQL Query | data |
```

### 2.7 Flows (Simulation Playback Scenarios)
Flows define simulator steps for playback.
* **Header**: `### [flow-id] ([Flow Title])`
* **Subtitle**: An italicized description block under the header.
* **Color**: `- **Color:** [hsl color]` to style the playback path.
* **Steps**: A numbered list matching:
  `[step_number]. **[node-id]** [[step-label]]: [detailed description]`
* **Step Data Payload**: A bullet point starting with `* Data:` nested directly below the step.

```markdown
## Flows

### submit-order (Submit Order Flow)
*Simulates consumer checkout sequence*
- **Color:** hsl(210,85%,62%)

1. **client** [Initiate Checkout]: User clicks "Buy Now" button.
   * Data: 🛒 Cart Items payload
2. **gateway** [Authorize]: Router validates authentication header.
   * Data: 🔑 Access Token
```
