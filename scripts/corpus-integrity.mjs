import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { ACTIVE_CORPUS } from "./corpus-policy.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");

export async function verifyActiveCorpus(input, content) {
  if (resolve(input) !== resolve(ACTIVE_CORPUS)) return undefined;
  const manifest = JSON.parse(
    await readFile(input.replace(/\.jsonl$/, ".manifest.json"), "utf8"),
  );
  const policyFiles = await Promise.all([
    readFile(new URL("./corpus-policy.mjs", import.meta.url)),
    readFile(new URL("./usps-suffix-aliases.json", import.meta.url)),
    readFile(new URL("./research-report/states.mjs", import.meta.url)),
  ]);
  if (digest(content) !== manifest.sha256)
    throw new Error("The active corpus differs from its frozen manifest");
  if (digest(Buffer.concat(policyFiles)) !== manifest.policySha256)
    throw new Error(
      "The admission policy differs from the frozen corpus policy",
    );
  return manifest;
}
