# Penpot embedding and Evedraw migration review

Reviewed 2026-08-15 against the Evedraw source and the Penpot fork at commit
[`59ef076`](https://github.com/penpot/penpot/commit/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86).
Only Penpot's official documentation and repository, Mozilla's MPL guidance,
and the local Evedraw source were used.

Implementation update: the migration now uses Penpot as the top-level editor.
The native Penpot workspace owns the canvas and embeds only the Evedraw chat
sidebar at the same-origin `/evedraw` path. A fork-owned, in-process
`eve.design/v1` facade supplies bounded `inspect`, `apply`, and `export`
operations to a restricted MCP profile. The earlier Evedraw-hosted workspace
iframe proposal documented below remains useful design history, but it was not
selected because the Penpot-hosted layout gives the tighter integration.

## Verdict

Penpot does not currently expose a supported, reusable interactive editor
core that Evedraw can import like `@excalidraw/excalidraw`. This is an
inference from the published package surface and build graph: the main
frontend package is private, its workspace is a lazy chunk rather than an
export, and the public `@penpot/library` only builds new files in memory and
exports them. See the
[`frontend` package](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/package.json#L1-L28),
[Shadow CLJS modules](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/shadow-cljs.edn#L19-L61),
and [`@penpot/library` surface](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/library/shadow-cljs.edn#L15-L22).

The practical migration is to keep Penpot as a full, fork-owned application
and add one narrow Evedraw workspace facade inside its frontend. The
implemented `layout=evedraw` mode retains the native canvas, embeds the chat as
a fixed sidebar, and reuses Penpot's Plugin API implementation, workspace
events, undo grouping, persistence queue, and binary-file export path.
Extracting a reusable editor core first would require untangling the global
store, routing, RPC, worker, plugin runtime, fonts/assets, and WASM renderer;
it is much closer to a frontend re-platform than a packaging change.

The bridge can also be the sole seam for agent tools. Evedraw should expose a
small declarative drawing command algebra, not Penpot's internal ClojureScript
events, raw file data, or arbitrary plugin JavaScript.

## Pre-migration Evedraw seam

Before this migration, Evedraw mounted the published Excalidraw React module,
persisted one scene snapshot in `localStorage`, and translated the agent's
custom drawing schema into client-side scene updates. Those Excalidraw
components and the browser-owned board state have now been removed.

The former server-side `draw_on_board` handler returned
`applied_by_client` before the browser has actually applied the command. That
was acceptable for a visual convenience, but it was not a truthful save/export
contract: the model cannot distinguish a completed Penpot edit from a missing,
disconnected, or permission-denied frame.

The replacement seam is the editor-neutral drawing contract in
`@evetools/drawing`. The Evedraw route consumes that seam through its bounded
Penpot MCP adapter, while the fork implements the same wire contract over the
current native workspace.

## Options at a glance

| Option | What it actually offers | Fit for Evedraw |
| --- | --- | --- |
| `@penpot/library` | A supported ESM package that creates new Penpot files in memory and exports `.penpot` bytes. Its five exports are builder/export functions; it has no importer or editor UI. [README](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/library/README.md#L1-L31), [exports](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/library/shadow-cljs.edn#L15-L22) | Useful later for an offline “generate a new file” agent workflow, not for editing an existing file. |
| Plugin API | High-level live document/page/selection/shape operations inside a running Penpot workspace, including file export and undo blocks. [Plugin guide](https://help.penpot.app/plugins/getting-started/), [typed interface](https://doc.plugins.penpot.app/interfaces/Penpot) | Best implementation substrate for a fork-owned bridge, but not itself an outer embed SDK. |
| Official MCP server | Agent tools connected by WebSocket to a dedicated plugin in an open Penpot workspace; generated code executes through the Plugin API. [MCP architecture](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/mcp/README.md#L18-L47) | Works for experimental agent control, but adds plugin/server lifecycle, targets the focused page, and permits arbitrary code. It is not headless editor infrastructure. |
| Internal RPC | Authenticated import/export and low-level persistence commands used by Penpot itself. [integration guide](https://help.penpot.app/technical-guide/integration/), [binary-file commands](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/backend/src/app/rpc/commands/binfile.clj#L38-L79) | Suitable behind the fork bridge. Exposing it directly would couple Evedraw to revisions, feature flags, migrations, and Penpot's change schema. |
| Fork-owned Evedraw workspace mode | The native Penpot canvas plus an embedded same-origin Evedraw sidebar and an in-process, versioned workspace facade. | Implemented and recommended. It gives the tightest integration without extracting the editor. |
| Evedraw-owned iframe bridge | A full Penpot workspace embedded in Evedraw and controlled through `postMessage`. | Viable alternative, but adds another outer host/transport layer and was not selected. |
| Extracted editor core | A new package carved out of the ClojureScript SPA. | Not a sensible first milestone; high extraction and long-term merge cost. |

## What Penpot publishes

### `@penpot/library` is a file builder, not an editor core

The official library says its limited purpose is to build Penpot files in
memory and export ZIP archives that Penpot can import. Its compiled ESM surface
contains only `BuilderError`, `createBuildContext`, `exportAsBytes`,
`exportAsBlob`, and `exportStream`. It has no open/import function, renderer,
selection model, interaction tools, history, or persistence adapter. Penpot's
own change log removed object update and delete functions with the explanation
that the library is intended to build files. See the
[library README](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/library/README.md#L1-L45),
[module exports](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/library/shadow-cljs.edn#L15-L22),
and [removed mutators](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/library/CHANGES.md#L136-L146).

This package is therefore additive to the workspace facade, not an alternative
to it. An agent could generate a brand-new archive without a browser, then ask
Penpot to import it. It cannot load and modify the user's current Penpot
document.

### The workspace chunk is not a reusable package

The frontend's Shadow CLJS build emits a `main-workspace` lazy module, but it
depends on the shared application module and declares no JavaScript exports.
Only the whole `main` application exports `init`; the other explicit exports
are renderer/rasterizer entry points. The frontend package is marked private.
This chunking is a page-load optimization, not a supported editor interface.
See the
[module configuration](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/shadow-cljs.edn#L19-L61)
and [`frontend/package.json`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/package.json#L1-L28).

### The Plugin API is the reusable live-editing vocabulary

Plugins run in an iframe inside Penpot; their script receives the `penpot`
global, while plugin UI code does not. Manifests request explicit permissions
such as `content:read` and `content:write`. This is an inner extension model,
not an SDK for embedding Penpot into another application. See the official
[plugin model](https://help.penpot.app/plugins/getting-started/) and
[plugin creation guide](https://help.penpot.app/plugins/create-a-plugin/).

The typed interface covers the basics Evedraw needs: current file/page,
selection, page creation, board/rectangle/ellipse/path/text/SVG creation,
grouping, alignment, media upload, shape properties, and events. The File
interface exports the live file as `Uint8Array`, including linked-library
handling modes, and History groups operations into undo blocks. See the
[Penpot interface](https://doc.plugins.penpot.app/interfaces/Penpot),
[File interface](https://doc.plugins.penpot.app/interfaces/File), and
[History interface](https://doc.plugins.penpot.app/interfaces/HistoryContext.html).

In the frontend implementation, high-level create calls construct native
change records and emit `commit-changes`; proxy property setters also emit
native workspace events. Reusing this machinery is what preserves geometry
rules, history, collaboration, and persistence. See
[`create-context`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/api.cljs#L65-L96)
and the
[shape creation methods](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/api.cljs#L364-L425).

## Architecture and extraction cost

Penpot is a client/server application, not a canvas widget. The official
architecture describes a ClojureScript frontend, a Clojure/JVM backend,
PostgreSQL, Valkey/Redis for asynchronous communication, a shared CLJC model,
and an exporter. The current frontend also builds the Rust/Skia WASM renderer
before compiling its Shadow CLJS main and worker bundles. See Penpot's
[architecture overview](https://help.penpot.app/technical-guide/developer/architecture/),
[frontend architecture](https://help.penpot.app/technical-guide/developer/architecture/frontend/),
and [frontend build scripts](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/package.json#L15-L36).

The interactive workspace assumes all of these facilities:

- a global Potok store and RxJS event stream;
- authenticated routes and backend RPC;
- the worker for import/export and expensive transforms;
- the shared file/change/geometry code from `common`;
- fonts, media, feature flags, migrations, permissions, and collaboration;
- the plugin runtime; and
- the renderer and DOM/UI tree.

This coupling is visible at startup: `app.main/init` initializes the worker,
renders the full UI, initializes plugins, refreshes the profile, starts routes,
and opens websockets for authenticated users. See
[`app.main`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main.cljs#L53-L135).
The workspace mount initializes persistence, layout, and the file together;
see
[`workspace-page*`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/ui/workspace.cljs#L200-L255).

Extracting a core would therefore mean defining and maintaining new adapters
for most of that list. Even if the visible panels were removed, the drawing
implementation would not become a small standalone dependency. The fork bridge
instead places one external seam above the already-integrated workspace.

## The `.penpot` file lifecycle

Penpot file format v3 is a ZIP archive containing a manifest, readable JSON,
and binary assets. It is a versioned interchange/backup format designed for
export and import. See the official
[format specification](https://help.penpot.app/technical-guide/developer/data-model/penpot-file-format/)
and [user import/export guide](https://help.penpot.app/user-guide/export-import/penpot-file-format/).

It is not the live editor's backing store. A normal workspace loads a file
bundle from the backend by team/file ID, applies migrations and feature checks,
and holds it in the application store. See
[`initialize-file` and `initialize-workspace`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/data/workspace.cljs#L298-L410).
Consequently, “open this `.penpot` file” means import it into a project as a
new database-backed Penpot file, navigate to the returned file ID, edit that
live file, persist it, then export a new archive. It does not mutate the source
archive in place.

The existing v3 importer decodes and checks the archive manifest, uploads the
archive, and invokes `import-binfile`; the backend command checks project
permissions and performs the import. See the
[worker importer](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/worker/import.cljs#L76-L114),
[upload/import flow](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/worker/import.cljs#L155-L230),
and [backend import command](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/backend/src/app/rpc/commands/binfile.clj#L81-L168).

Edits are autosaved through a buffered persistence queue rather than a
traditional synchronous save call. The current queue groups changes for about
three seconds, tracks pending/saving/saved state, and exposes
`force-persist-and-wait`. See the
[persistence entry points](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/data/persistence.cljs#L28-L48)
and [queue implementation](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/data/persistence.cljs#L207-L260).
After a dirty edit, an Evedraw `save` operation must force persistence and
observe a real `saved` state before exporting; `nil` is only a valid terminal
state when the bridge can prove there are no queued or dirty changes. The
current wait helper's timeout completes without an error, so the bridge must
turn “no terminal emission” into an explicit `PERSIST_TIMEOUT` rather than
reporting success.

The Plugin File proxy already exports Penpot bytes through the worker and
backend, with `all`, `merge`, and `detach` library modes. It does not first
force the persistence queue, so the bridge must impose that ordering. See
[`File.export`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/file.cljs#L257-L304).

## Agent and headless capabilities

The official MCP server is valuable evidence that Penpot's supported
high-level automation seam is the live Plugin API. Its server connects to a
dedicated Penpot plugin over WebSocket, and the model executes code in the
plugin environment. Usage requires starting the server and plugin server,
opening the plugin in Penpot, and connecting it. See the
[MCP architecture and setup](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/mcp/README.md#L18-L47).

That is browser-mediated automation, not a general headless editor. A
development-only MCP import tool makes the distinction especially clear: it
imports by executing ClojureScript through the development nREPL rather than
through a production file interface. See
[`ImportPenpotFileTool`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/mcp/packages/server/src/tools/ImportPenpotFileTool.ts#L26-L49).

Penpot documents personal access tokens for its internal RPC endpoints, so a
server process can authenticate and call commands such as import/export. That
does not create a stable headless editing interface: direct editing would have
to manufacture Penpot's low-level change records and correctly manage file
revision/version fields, feature flags, migrations, and referential integrity.
See the official [integration guide](https://help.penpot.app/technical-guide/integration/).

Evedraw now exposes `inspect_drawing`, `apply_drawing_patch`, and
`export_drawing`. The fork's bounded MCP mode registers only those tools and
does not start the arbitrary-code web REPL. Each tool calls the same
`eve.design/v1` facade used inside the live workspace, so the model receives a
real revision, commit receipt, persistence state, or structured fault. Native
archive bytes travel as a transient browser download event rather than entering
model context or chat history.

This retains the MCP plugin/server lifecycle, but removes its unsafe general
code-execution surface and avoids a stateful browser-session relay in the Next
application. Calling low-level backend edit commands would still bypass the
live workspace/history path and is not a substitute.

## Evaluated Evedraw-hosted iframe bridge

The design below was the initial recommendation before choosing the tighter
Penpot-hosted layout. It remains a useful alternative if Evedraw must become the
top-level application later; it is not the transport used by the implementation.

### Transport and security

Embed the forked workspace behind the Evedraw origin, for example
`/penpot/workspace?...`, and communicate with a versioned `postMessage`
protocol. Penpot's default Nginx response sets `X-Frame-Options: SAMEORIGIN`, so
same-origin reverse proxying works with the shipped policy; cross-origin
embedding is blocked unless the fork deliberately changes framing and CSP
headers. See the
[security-header configuration](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/docker/images/files/nginx-security-headers.conf#L1-L6).

Even when same-origin, prefer `postMessage` to a global method on
`iframe.contentWindow`. A message protocol gives the module an explicit
version, testable request/reply correlation, cancellation, and the option to
move origins later. The host and frame must both validate exact origins and
`event.source`, reject wildcard targets, negotiate protocol and capability
versions during a nonce-bearing handshake, cap payload sizes, and transfer
archive `ArrayBuffer`s rather than clone them.

A same-origin `window.evedrawPenpot` surface is acceptable for a short spike,
but it is a weaker production seam: the host becomes coupled to the frame's
load timing and JavaScript global, the two applications cannot later move to
different origins, and accidental DOM/store access is easy. `postMessage`
retains process-like isolation even when the reverse proxy makes both sides
same-origin. It costs serialization and protocol handling, which belongs
inside the adapter rather than in Evedraw callers.

### Native operations to preserve

- **Open an existing database file:** emit `go-to-workspace` with team/file/page
  IDs, then resolve only after `initialize-workspace`, `fetch-bundle`, and the
  desired page have completed. The relevant navigation and load seams are
  [`go-to-workspace`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/data/common.cljs#L495-L513)
  and
  [`initialize-workspace`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/data/workspace.cljs#L298-L410).
- **Open an archive:** move the reusable import orchestration out of the
  dashboard UI if necessary, invoke the existing worker `import-files` flow,
  capture the new IDs, and navigate normally. Do not parse or patch the ZIP in
  Evedraw. The worker and backend paths are
  [`app.worker.import`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/worker/import.cljs#L155-L230)
  and
  [`binfile/import-binfile`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/backend/src/app/rpc/commands/binfile.clj#L81-L168).
- **Edit:** construct a privileged, dedicated Evedraw plugin context and call
  the same high-level proxy operations as regular plugins. Never mutate
  `st/state` or raw page maps from the bridge. The context/change seam is
  [`app.plugins.api`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/api.cljs#L65-L96).
- **Undo:** wrap an agent command batch with the existing history
  `undoBlockBegin`/`undoBlockFinish` operations. This creates one undo entry; it
  is grouping, not transactional rollback. See
  [`app.plugins.history`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/history.cljs#L18-L44).
- **Save/export:** force and await persistence, then call the File proxy's
  export path. Return bytes with a transferable buffer. Observe `contentsave`
  and workspace state for progress, but do not use a UI toast as completion.
  See
  [`force-persist-and-wait`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/data/persistence.cljs#L28-L48),
  [`contentsave`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/events.cljs#L80-L86),
  and
  [`File.export`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/file.cljs#L257-L304).

### Exact frontend seams in the fork

| Concern | Source seam | Fork change |
| --- | --- | --- |
| Bootstrap | [`frontend/src/app/main.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main.cljs#L108-L135) | Initialize a new `app.evedraw.bridge` after the worker/plugin runtime starts; dispose it on reinit/unmount. |
| Dedicated route/mode | [`frontend/src/app/main/ui/routes.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/ui/routes.cljs#L31-L95), [`frontend/src/app/main/ui.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/ui.cljs#L40-L68) | Add an authenticated Evedraw workspace route or a strict query/mode parsed at the route seam. Avoid host-controlled arbitrary plugin URLs. |
| Workspace readiness | [`frontend/src/app/main/ui/workspace.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/ui/workspace.cljs#L200-L255) | Signal `ready` only when the target file/page, permissions, renderer, and persistence have initialized. |
| Navigation/load | [`frontend/src/app/main/data/common.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/data/common.cljs#L495-L513), [`frontend/src/app/main/data/workspace.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/data/workspace.cljs#L298-L410) | Wrap existing navigation and bundle lifecycle; do not reimplement file loading. |
| Archive import | [`frontend/src/app/worker/import.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/worker/import.cljs#L76-L114), [`frontend/src/app/main/ui/dashboard/import.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/ui/dashboard/import.cljs) | Extract only the reusable orchestration from dashboard UI into a data namespace; retain the worker/backend importer. |
| High-level edit vocabulary | [`frontend/src/app/plugins/api.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/api.cljs#L364-L425), [`frontend/src/app/plugins/shape.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/shape.cljs) | Map the curated command algebra to plugin proxies and native events. |
| Privileged bridge identity | [`frontend/src/app/plugins/register.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/register.cljs#L21-L38), [`permission checks`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/register.cljs#L151-L156) | Add a distinct constant bridge identity/capability; do not reuse the MCP plugin ID or the all-zero internal ID. |
| Undo and events | [`frontend/src/app/plugins/history.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/history.cljs#L18-L44), [`frontend/src/app/plugins/events.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/events.cljs#L29-L86) | Group each edit batch and translate native selection/page/save events to protocol events. |
| Persistence | [`frontend/src/app/main/data/persistence.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/data/persistence.cljs#L28-L48) | Add an explicit save result that distinguishes persisted, timed out, rejected, and disconnected states. |
| Export | [`frontend/src/app/plugins/file.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/plugins/file.cljs#L257-L304) | Reuse the File proxy after persistence; return transferable bytes. |
| Reduced chrome | [`frontend/src/app/main/data/workspace/layout.cljs`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/src/app/main/data/workspace/layout.cljs#L17-L86) | Add an `:evedraw` layout preset and targeted wrapper styling. Hide features first; do not delete their subsystems in the first fork. |

The bridge namespace itself should be new MPL-covered files under
`frontend/src/app/evedraw/`. Keeping almost all changes additive and routing
through the seams above reduces conflicts when rebasing the fork.

## Smallest practical Penpot subset

For production-quality native editing, the smallest low-risk subset is still a
Penpot deployment, not a frontend package:

- `frontend`, including its worker bundle and compiled `render-wasm` artifact;
- the shared `common` source used by frontend/backend builds;
- `backend`;
- PostgreSQL;
- Valkey/Redis for Penpot's asynchronous/websocket paths; and
- Penpot's configured asset/object storage.

Those dependencies match the official architecture and the services in the
[self-hosted Compose definition](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/docker/images/docker-compose.yaml#L80-L249).
The separate exporter can be omitted if Evedraw only needs native `.penpot`
archive export through `export-binfile`; retain it when PNG/JPEG/WebP/PDF or
other exporter-backed output is required. The implemented agent path retains
the MCP package in its bounded Evedraw mode. Development mail, onboarding,
telemetry, and unrelated UI entry points can be disabled. Initially hide
dashboard/settings/comments/prototyping chrome behind the Evedraw mode rather
than removing their source graph.

## Alternative deep module interface

The external seam should live in Evedraw, with the Penpot iframe as one
adapter. One request method, one event stream, and lifecycle closure keep the
module deep: callers learn three entry points while the module hides routing,
auth, import, plugin proxies, undo, persistence, export, and transport.

```ts
export interface PenpotEditorModule {
  request<R extends EditorRequest>(
    request: R,
    options?: { signal?: AbortSignal },
  ): Promise<ReplyFor<R>>;

  events(): AsyncIterable<EditorEvent>;

  close(): Promise<void>;
}

export type EditorRequest =
  | {
      type: "open";
      source:
        | {
            kind: "existing";
            teamId: string;
            fileId: string;
            pageId?: string;
          }
        | {
            kind: "archive";
            projectId: string;
            bytes: ArrayBuffer;
            filename?: string;
          };
    }
  | {
      type: "edit";
      documentId: string;
      pageId?: string;
      label?: string;
      commands: readonly BasicDrawCommand[];
    }
  | {
      type: "save";
      documentId: string;
      validate?: boolean;
      export?: {
        kind: "penpot";
        libraries: "all" | "merge" | "detach";
      };
    };

export type BasicDrawCommand =
  | { op: "create"; kind: "board" | "rectangle" | "ellipse" | "text";
      clientId?: string; parent?: ShapeRef; x: number; y: number;
      width?: number; height?: number; text?: string; name?: string;
      style?: BasicStyle }
  | { op: "createPath"; clientId?: string; parent?: ShapeRef;
      content: string; name?: string; style?: BasicStyle }
  | { op: "createSvg"; clientId?: string; parent?: ShapeRef; svg: string;
      x?: number; y?: number; name?: string }
  | { op: "patch"; target: ShapeRef; patch: BasicShapePatch }
  | { op: "delete"; targets: readonly ShapeRef[] }
  | { op: "group"; targets: readonly ShapeRef[];
      clientId?: string; name?: string }
  | { op: "ungroup"; targets: readonly ShapeRef[] }
  | { op: "reparent"; targets: readonly ShapeRef[]; parent: ShapeRef;
      index?: number }
  | { op: "select"; targets: readonly ShapeRef[] };

export type ShapeRef = { id: string } | { clientId: string };

export type BasicStyle = {
  fill?: string | null;
  fillOpacity?: number;
  stroke?: string | null;
  strokeWidth?: number;
  opacity?: number;
};

export type BasicShapePatch = BasicStyle & {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  cornerRadius?: number;
  name?: string;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  textAlign?: "left" | "center" | "right" | "justify";
};

export type OpenReply = {
  document: { fileId: string; pageId: string; name: string; revision: number };
  imported: boolean;
};

export type EditReply = {
  applied: number;
  created: Readonly<Record<string, string>>; // clientId -> Penpot shape ID
  dirty: true;
  undoAvailable: boolean;
};

export type SaveReply = {
  revision: number;
  archive?: ArrayBuffer;
};

export type EditorEvent =
  | { type: "ready"; fileId: string; pageId: string }
  | { type: "dirty" | "saved"; revision?: number }
  | { type: "selection"; ids: readonly string[] }
  | { type: "page"; pageId: string }
  | { type: "error"; error: EditorError }
  | { type: "disconnected"; reason?: string };

export type ReplyFor<R extends EditorRequest> =
  R extends { type: "open" } ? OpenReply :
  R extends { type: "edit" } ? EditReply :
  R extends { type: "save" } ? SaveReply : never;

export type EditorError = {
  requestId?: string;
  code: EditorErrorCode;
  message: string;
  retryable: boolean;
  details?: Readonly<Record<string, unknown>>;
};
```

`BasicStyle` and `BasicShapePatch` should contain only stable Evedraw basics:
position/size/name, fill, stroke, opacity, rotation, corner radius, and text
content/font/alignment. Add capabilities only when a real caller needs them.
Do not leak Plugin API proxy objects, ClojureScript keywords, Potok events,
low-level change records, or full document snapshots through the interface.

### Interface invariants, ordering, and errors

- The frame must be authenticated and authorized for the target team/project
  before `open` resolves. Permission loss invalidates outstanding writes.
- `open` is required before `edit` or `save`; one module instance has one
  active document. Opening another document waits for prior persistence or
  fails explicitly.
- Requests execute in call order. A page switch must finish loading and layout
  before its edit begins. Cancellation is best-effort after native mutations
  start.
- A `clientId` is only an alias within one edit batch; the reply maps it to the
  durable Penpot shape ID. Later batches must use `{ id }` references.
- An edit batch is validated first and grouped into one native undo entry. Undo
  grouping is not atomic rollback: if the native layer fails after command N,
  return `PARTIAL_EDIT` with `applied`, created IDs, and whether undo is
  available.
- `save` optionally runs Penpot validation, forces persistence, confirms a
  terminal state (`saved` is required after dirty edits), and only then
  exports. Archive `open` imports a new database file; it never overwrites the
  caller's input bytes.
- Selection/dirty events may be coalesced, and large archive buffers are
  transferred. The module never streams every store mutation or copies an
  entire document after each edit.

Use a discriminated `EditorError` with at least:

```ts
type EditorErrorCode =
  | "NOT_READY"
  | "AUTH_REQUIRED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "BAD_ARCHIVE"
  | "VERSION_MISMATCH"
  | "INVALID_COMMAND"
  | "PARTIAL_EDIT"
  | "VALIDATION_FAILED"
  | "PERSIST_TIMEOUT"
  | "IMPORT_FAILED"
  | "EXPORT_FAILED"
  | "FRAME_DISCONNECTED";
```

Errors should include `requestId`, `code`, a safe message, retryability, and
structured details appropriate to the code. Never send Penpot stack traces or
auth material to an agent.

### Usage

```ts
const editor = createPenpotEditor({ iframe, targetOrigin, auth });

const { document } = await editor.request({
  type: "open",
  source: { kind: "archive", projectId, bytes, filename: "board.penpot" },
});

await editor.request({
  type: "edit",
  documentId: document.fileId,
  label: "Agent: add status card",
  commands: [
    { op: "create", kind: "rectangle", clientId: "status-card",
      x: 80, y: 80, width: 320, height: 180,
      style: { fill: "#ffffff", cornerRadius: 16 } },
    { op: "create", kind: "text",
      x: 104, y: 108, text: "Ready" },
  ],
});

const saved = await editor.request({
  type: "save",
  documentId: document.fileId,
  validate: true,
  export: { kind: "penpot", libraries: "all" },
});

await editor.close();
```

Agent tool adapters map those variants to JSON-safe inputs and replies, using
asset IDs for byte payloads. The host UI may consume `events()` for selection
and save status; an agent does not need that stream for ordinary tool calls.

### Hidden implementation and adapters

The module implementation hides iframe creation and teardown, handshake and
protocol negotiation, request correlation, origin checks, Penpot authentication
and routing, import upload/progress, plugin-context construction, proxy-to-ID
mapping, event translation, undo grouping, persistence sequencing, validation,
export, buffer transfer, reconnection, and telemetry.

Use two adapters at the external seam so it is real rather than hypothetical:

- `PostMessagePenpotAdapter` for the forked iframe; and
- `InMemoryPenpotAdapter` for Evedraw tests and agent-tool contract tests.

Inside the fork, a private `PenpotWorkspaceAdapter` translates the protocol to
Plugin API proxies, Potok events, worker import/export, and persistence. The
backend is remote-but-owned implementation detail behind that adapter; the
external interface must not expose raw RPC commands.

The main tradeoff is intentional: a curated command union requires versioning
as Evedraw grows, and `postMessage` adds serialization. In return, callers get
substantial leverage from one small interface, Penpot-specific knowledge stays
local to the module, tests cross the same seam as production, and the fork can
change internally without rewriting Evedraw or its agent tools.

## Implemented sequence

1. Keep the untrimmed Penpot fork as the editor and add an `:evedraw` layout
   preset with a native canvas and reduced chrome.
2. Mount the Evedraw chat at the same-origin `/evedraw` sidebar route.
3. Add a revisioned in-process facade with bounded inspection, eight basic edit
   operations, grouped undo, persistence acknowledgement, and `.penpot` export.
4. Restrict the MCP deployment to the three declarative drawing tools and feed
   their real outcomes back into the model loop.
5. Expand the drawing algebra only from concrete Evedraw workflows.
6. Reconsider core extraction only after this facade reveals a stable,
   genuinely backend-independent subgraph. Do not make extraction a migration
   prerequisite.

## Licensing

Penpot's repository and frontend declare the Mozilla Public License 2.0. The
workspace facade lives inside and modifies that MPL-covered frontend, so those
facade/modified frontend files should remain MPL-covered with notices
preserved. See Penpot's
[root license](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/LICENSE),
and [`frontend/package.json`](https://github.com/penpot/penpot/blob/59ef07633aae46450c7e8738ee8b1fd1bbd2ea86/frontend/package.json#L1-L7).

MPL 2.0 is file-level copyleft. Mozilla's official FAQ says a larger work may
combine MPL-covered files with differently licensed files, while distributed
modifications to MPL-covered files must remain available under MPL. Purely
private use does not trigger distribution obligations. Browser JavaScript is
delivered to users, so assume the forked frontend files are distributed; keep
Evedraw-specific host code in new files that do not copy MPL source if Evedraw
needs a different license. See Mozilla's
[MPL 2.0 FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

This is an engineering reading, not legal advice. Confirm source-offer,
attribution, deployment, and branding obligations with counsel before an
external release.
