# Evecode desktop

The native desktop seam for `@evetools/code-desktop`. It will own filesystem, workspace, terminal, and child-process adapters while presenting the Next.js interface from `apps/code/web`.

This package intentionally does not reuse Draw’s native wrapper: coding requires a distinct permission model and native interface.
