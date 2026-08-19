# Evedraw

Evedraw uses the native workspace in the Penpot fork at
`~/workspace/penpot`. Penpot owns rendering, selection, undo, persistence, and
`.penpot` import/export; this Next app supplies Eve's chat sidebar and invokes a
small revisioned drawing contract through Penpot's bounded MCP profile.

## Local setup

1. Configure Evetools in its repository-level `.env`, then start the sidebar
   application on the host:

   ```dotenv
   OPENAI_BASE_URL=https://subproxy.example/v1
   OPENAI_API_KEY=sk-sub-...
   PENPOT_MCP_URL=http://127.0.0.1:4401/mcp
   ```

   ```bash
   cd ~/workspace/evetools
   pnpm dev:draw
   ```

2. Ensure the fork's gitignored
   `frontend/resources/public/js/config.js` enables MCP:

   ```js
   var penpotFlags = "enable-mcp";
   ```

3. Start the Penpot agentic devenv with the bounded tool profile:

   ```bash
   cd ~/workspace/penpot
   PENPOT_MCP_EVEDRAW_MODE=true ./manage.sh run-devenv --agentic
   ```

4. Open the reported Penpot URL, enter a workspace, and set its `layout` query
   parameter to `evedraw`. The fork proxies `/evedraw` to the host app, so the
   sidebar and its authenticated cookies remain same-origin. The runtime
   `penpotEvedrawURI` setting defaults to `/evedraw` and rejects cross-origin
   values.

For a single local user, no routing token is needed. In Penpot multi-user mode,
set the same per-user token on the plugin connection and
`PENPOT_MCP_USER_TOKEN`; a production multi-user deployment should derive that
token per authenticated user instead of using one global value.

## Agent contract

The model sees only:

- `inspect_drawing` — returns a bounded snapshot and opaque revision.
- `apply_drawing_patch` — commits at most 100 validated operations in one
  revision-checked, idempotent, undoable transaction.
- `export_drawing` — exports the native `.penpot` document; archive bytes are
  delivered to the browser as a transient download event and are not added to
  model context or persisted chat history. The v1 JSON transport caps archives
  at 10 MB; larger documents return a structured `export_too_large` fault.

Set `PENPOT_MCP_EVEDRAW_MODE=true` on the MCP server in production. That mode
does not register arbitrary code execution, filesystem import, or REPL tools.
If `PENPOT_MCP_URL` is absent, general chat still works but Eve receives no
drawing tools and is instructed not to claim canvas changes.

## Deferred work and verification

- Run a full browser end-to-end pass with Penpot, its plugin, bounded MCP, and
  Evedraw together. Docker was stopped in the implementation environment, so
  the generated Compose configuration was validated but Nginx and the complete
  stack were not started there.
- Use a modern Bash for `manage.sh`, or make its existing `mapfile` usage
  portable; the stock macOS Bash 3.2 on the implementation host cannot run the
  complete launcher.
- Run Penpot's standard frontend suite in an environment with
  `/opt/emsdk/emsdk_env.sh` and the `wasm32-unknown-emscripten` target. The
  focused Evedraw protocol suite, Clojure lint, SCSS checks, MCP builds, and MCP
  tests pass.
- Add streamed or short-lived artifact delivery for native archives larger
  than 10 MB. The bounded v1 JSON transport intentionally rejects them.
- Add SVG/PNG export only when a workflow needs it; v1 exports the native
  `.penpot` document only.
- Replace the single configured MCP user token with authenticated per-user
  routing before a multi-user production deployment.
