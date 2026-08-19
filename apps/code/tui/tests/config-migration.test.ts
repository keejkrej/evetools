import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  readConfig,
  setSelectedModel,
} from "../src/models/config-store.js";

test("legacy default config is read and the next write migrates it to ~/.evecode", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "evecode-legacy-home-"));
  const previous = {
    home: process.env.HOME,
    userProfile: process.env.USERPROFILE,
    dataRoot: process.env.EVECODE_DATA_ROOT,
    legacyHome: process.env.EVE_AGENT_HOME,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.EVECODE_DATA_ROOT;
  delete process.env.EVE_AGENT_HOME;
  const legacyDirectory = path.join(home, ".config", "eve-agent");
  const legacyConfigFile = path.join(legacyDirectory, "config.json");
  const currentConfigFile = path.join(home, ".evecode", "config.json");
  await mkdir(legacyDirectory, { recursive: true });
  await writeFile(legacyConfigFile, `${JSON.stringify({
    version: 1,
    model: "xai/legacy-model",
    reasoning: "medium",
    priority: false,
  })}\n`);
  try {
    assert.deepEqual(await readConfig(), {
      version: 1,
      model: "xai/legacy-model",
      reasoning: "medium",
      priority: false,
    });
    await setSelectedModel("xiaomi/mimo-v2.5");
    assert.deepEqual(JSON.parse(await readFile(currentConfigFile, "utf8")), {
      version: 1,
      model: "xiaomi/mimo-v2.5",
      reasoning: "medium",
    });
    assert.equal(JSON.parse(await readFile(legacyConfigFile, "utf8")).model, "xai/legacy-model");
  } finally {
    if (previous.home === undefined) delete process.env.HOME;
    else process.env.HOME = previous.home;
    if (previous.userProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previous.userProfile;
    if (previous.dataRoot === undefined) delete process.env.EVECODE_DATA_ROOT;
    else process.env.EVECODE_DATA_ROOT = previous.dataRoot;
    if (previous.legacyHome === undefined) delete process.env.EVE_AGENT_HOME;
    else process.env.EVE_AGENT_HOME = previous.legacyHome;
    await rm(home, { recursive: true, force: true });
  }
});

test("an explicit Evecode or legacy data root never reads the default legacy config", async () => {
  for (const selectedVariable of ["EVECODE_DATA_ROOT", "EVE_AGENT_HOME"] as const) {
    const home = await mkdtemp(path.join(os.tmpdir(), "evecode-isolated-home-"));
    const explicitRoot = path.join(home, "explicit-data");
    const previous = {
      home: process.env.HOME,
      userProfile: process.env.USERPROFILE,
      dataRoot: process.env.EVECODE_DATA_ROOT,
      legacyHome: process.env.EVE_AGENT_HOME,
    };
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    delete process.env.EVECODE_DATA_ROOT;
    delete process.env.EVE_AGENT_HOME;
    process.env[selectedVariable] = explicitRoot;
    const legacyDirectory = path.join(home, ".config", "eve-agent");
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(path.join(legacyDirectory, "config.json"), JSON.stringify({
      version: 1,
      model: "xai/must-not-leak",
    }));
    try {
      assert.deepEqual(await readConfig(), { version: 1 }, selectedVariable);
      await setSelectedModel("xiaomi/mimo-v2.5");
      assert.equal(
        JSON.parse(await readFile(path.join(explicitRoot, "config.json"), "utf8")).model,
        "xiaomi/mimo-v2.5",
      );
    } finally {
      if (previous.home === undefined) delete process.env.HOME;
      else process.env.HOME = previous.home;
      if (previous.userProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = previous.userProfile;
      if (previous.dataRoot === undefined) delete process.env.EVECODE_DATA_ROOT;
      else process.env.EVECODE_DATA_ROOT = previous.dataRoot;
      if (previous.legacyHome === undefined) delete process.env.EVE_AGENT_HOME;
      else process.env.EVE_AGENT_HOME = previous.legacyHome;
      await rm(home, { recursive: true, force: true });
    }
  }
});
