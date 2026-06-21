# ArchBench

ArchBench is a local-first architecture workbench built with vanilla JavaScript. It lets you model systems as code, visualize service relationships, simulate flows, export architecture context for LLMs, and keep audit history in the browser with no backend or account system.

## What ships in this release

- Static site only: no server, no database, no Netlify Functions.
- Local-first storage: project data lives in `localStorage`; audit history lives in IndexedDB.
- Bring-your-own LLM: API keys stay in your browser and are sent directly from the client.
- Built-in demo project: the shipped sample maps the ArcBench architecture itself so the app explains its own system on first load.

## Use it on Netlify

This repository is ready to deploy as a static site.

1. Push the repository to GitHub.
2. Connect the repository to Netlify.
3. Leave the publish directory as the repository root.
4. Do not add a build command.

The included [netlify.toml](netlify.toml) already configures root publishing and basic response headers.

## Run locally

Because the app uses ES modules and fetches local docs/templates, serve it over HTTP instead of opening `index.html` directly from disk.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

Local mode keeps the local-only tools available, including:

- Live Watch for local spec files
- The in-app terminal panel
- Local sample editing workflows

Hosted mode hides those local-only controls automatically.

## Import your own architecture

You do not need to edit repository files to use ArchBench.

1. Open the project selector in the top bar.
2. Choose `Import Project (.md / .json)`.
3. Import a Markdown architecture spec or a JSON project file.
4. Export your project back to Markdown whenever you want.

The built-in authoring helpers in `docs/` are still available for local workflows.

## Architecture format

ArchBench reads architecture definitions from Markdown or JSON. The key references are:

- [docs/architecture.schema.md](docs/architecture.schema.md)
- [docs/architecture.template.md](docs/architecture.template.md)
- [docs/architecture.examples.md](docs/architecture.examples.md)
- [docs/agent_prompt.md](docs/agent_prompt.md)

The built-in sample lives at [samples/demo.md](samples/demo.md).

## Optional CLI validation

The browser app is the main product. A small Node CLI is included for local validation workflows:

```bash
node arch-cli.js validate samples/demo.md
```

This checks the Markdown architecture format and reports structural issues before you load a spec in the browser.

## Privacy note before making the repo public

This working tree has been cleaned to remove screenshots and local reference assets from the current commit set. If those files or any other private artifacts already exist in git history, rewrite history before making the repository public. Updating `.gitignore` does not remove old commits.

## License

This project is licensed under the [MIT License](LICENSE).
