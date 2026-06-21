# ArcBench Project Architecture Rules

This document specifies the rules and conventions that external AI agents and developers must follow when modifying the system architecture file (`architecture.md` / `samples/demo.md`).

---

## 1. Node Definition Rules

* **Identifier Syntax**: Node IDs (sub-headers) must be alphanumeric, lowercase, and contain no spaces or special characters (e.g., `### webApp (Category)`).
* **Categories**: Every node must belong to one of these valid categories:
  * `Entry Point`: User-facing applications or interfaces (e.g. clients, PWAs, portals).
  * `Service`: Backend services, microservices, or queue workers executing logic.
  * `Infrastructure`: Datastores, analytics hubs, or hardware nodes.
  * `Future`: Reserved for upcoming design phases or roadmap components.
* **Canvas Coordinates**: Nodes must specify physical coordinates (`x` and `y`) as integers to position them correctly on the canvas.
* **Styling**: Colors should use CSS HSL tags for visual consistency (e.g., `hsl(210,85%,62%)`). Emojis must be used for node icons to maintain rich graphics.

---

## 2. Connection Rules

* **Connections Table**: Defined under the `## Connections` header. Columns must be exactly: `| From | To | Interaction | Type |`.
* **Valid Connection Types**:
  * `request` (Solid Line): Used for transactional API requests or HTTP/gRPC calls.
  * `data` (Dashed Line): Used for asynchronous messages, logs, or database lookups.
  * `future` (Dotted Line): Reserved for upcoming dependency paths.
* **Referential Integrity**: The `From` and `To` fields must map to existing, defined node IDs. Direct connections from client `Entry Point` nodes to database `Infrastructure` nodes (bypassing a backend `Service`) are prohibited and will fail audits.

---

## 3. Flow Simulation Rules

* **Formatting**: Defined under the `## Flows` header. The flow description must be italicized directly below the flow sub-header.
* **Steps**: Every step must use the format: `[Number]. **[node-id]** [[Step Label]]: [Description details]`.
* **Metadata Payload**: Optional data payloads must be nested directly below the corresponding step, formatted as `   * Data: [Payload]`.
