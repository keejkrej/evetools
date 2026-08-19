import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderCommands } from "./commands";
import { plan as buildPlan } from "./plan";
import { notes, protocolMarkdown, PROVENANCE_SCHEMA, stageSpecs, SUBMISSION_TEMPLATE } from "./protocol";
import type { CampaignPlan, PlanInput, PreparedCampaign } from "./types";

function isPlan(value: PlanInput | CampaignPlan): value is CampaignPlan {
  return (
    typeof value === "object" &&
    value !== null &&
    "locks" in value &&
    "structureMethods" in value &&
    "profileId" in value &&
    "deliverable" in value
  );
}

export async function prepare(
  dir: string,
  input: PlanInput | CampaignPlan = {},
): Promise<PreparedCampaign> {
  const campaign = isPlan(input) ? input : buildPlan(input);
  const files: string[] = [];

  const write = async (relative: string, contents: string) => {
    const destination = path.join(dir, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, contents.endsWith("\n") ? contents : `${contents}\n`);
    files.push(relative);
  };

  await write("protocol.md", protocolMarkdown(campaign));
  await write("campaign.plan.json", JSON.stringify(campaign, null, 2));
  await write("commands.json", JSON.stringify(renderCommands(campaign), null, 2));

  for (const [name, body] of Object.entries(stageSpecs(campaign))) {
    await write(path.posix.join("specs", name), body);
  }

  await write(path.posix.join("submission", "template.csv"), SUBMISSION_TEMPLATE);
  await write("provenance.schema.json", JSON.stringify(PROVENANCE_SCHEMA, null, 2));

  for (const [name, body] of Object.entries(notes(campaign))) {
    await write(path.posix.join("notes", name), body);
  }

  files.sort();
  return { dir, plan: campaign, files };
}
