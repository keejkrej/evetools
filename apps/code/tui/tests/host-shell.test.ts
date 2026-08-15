import assert from "node:assert/strict";
import test from "node:test";
import { hostShellInvocation } from "../agent/lib/host-shell.js";

test("host shell uses the configured POSIX shell with login command arguments", () => {
  assert.deepEqual(hostShellInvocation("git status", {
    platform: "linux",
    env: { SHELL: "/bin/bash" },
  }), {
    command: "/bin/bash",
    args: ["-lc", "git status"],
  });
  assert.equal(hostShellInvocation("git status", { platform: "darwin", env: {} }).command, "/bin/sh");
});

test("host shell uses ComSpec and cmd command arguments on Windows", () => {
  assert.deepEqual(hostShellInvocation("git status", {
    platform: "win32",
    env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
  }), {
    command: "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", "git status"],
  });
});
