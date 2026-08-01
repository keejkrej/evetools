import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatCodeSkills, listCodeSkills, loadCodeSkill } from "./skills";

let root = "";
let outside = "";
const originalRoot = process.env.EVECODE_SKILLS_ROOT;

async function skill(directory: string, frontmatter: string, body = "Follow this workflow.") {
  const location = path.join(root, directory);
  await mkdir(location, { recursive: true });
  await writeFile(path.join(location, "SKILL.md"), `---\n${frontmatter}\n---\n${body}\n`);
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "evecode-skills-"));
  outside = await mkdtemp(path.join(tmpdir(), "evecode-skills-outside-"));
  process.env.EVECODE_SKILLS_ROOT = root;
});

afterEach(async () => {
  if (originalRoot === undefined) delete process.env.EVECODE_SKILLS_ROOT;
  else process.env.EVECODE_SKILLS_ROOT = originalRoot;
  await Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]);
});

describe("Code skill discovery", () => {
  it("discovers recursively and sorts metadata without loading bodies into the catalog", async () => {
    await skill("nested/zeta", "name: zeta\ndescription: Last skill", "SECRET FULL INSTRUCTIONS");
    await skill("alpha", "name: alpha\ndescription: First skill");

    const skills = await listCodeSkills();
    expect(skills.map(({ name }) => name)).toEqual(["alpha", "zeta"]);
    expect(formatCodeSkills(skills)).toContain("First skill");
    expect(formatCodeSkills(skills)).not.toContain("SECRET FULL INSTRUCTIONS");
  });

  it("skips malformed, hidden, and model-disabled skills", async () => {
    await skill("visible", "name: visible\ndescription: Visible");
    await skill("hidden", "name: hidden\ndescription: Hidden\nhidden: true");
    await skill("manual", "name: manual\ndescription: Manual\ndisable-model-invocation: true");
    await skill("missing", "name: missing");

    await expect(listCodeSkills()).resolves.toEqual([
      { name: "visible", description: "Visible", relativeDirectory: "visible" },
    ]);
  });

  it("loads the selected skill and its relative resources on demand", async () => {
    await skill("tdd", "name: tdd\ndescription: Test first");
    await writeFile(path.join(root, "tdd", "examples.md"), "Example resource");

    await expect(loadCodeSkill("tdd")).resolves.toMatchObject({ name: "tdd", path: "SKILL.md" });
    await expect(loadCodeSkill("tdd", "examples.md")).resolves.toEqual({
      name: "tdd", path: "examples.md", content: "Example resource",
    });
  });

  it("rejects traversal and symlink escapes", async () => {
    await skill("safe", "name: safe\ndescription: Safe skill");
    await writeFile(path.join(outside, "secret.md"), "secret");
    await symlink(path.join(outside, "secret.md"), path.join(root, "safe", "escape.md"));

    await expect(loadCodeSkill("safe", "../secret.md")).rejects.toThrow("escapes its skill directory");
    await expect(loadCodeSkill("safe", "escape.md")).rejects.toThrow("escapes its skill directory");
  });

  it("treats a missing skills root as an empty catalog", async () => {
    process.env.EVECODE_SKILLS_ROOT = path.join(root, "missing");
    await expect(listCodeSkills()).resolves.toEqual([]);
  });
});
