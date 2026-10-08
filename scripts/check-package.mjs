import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "address-interpreter-package-"));
try {
  const [packed] = JSON.parse(
    execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temporary],
      { cwd: root, encoding: "utf8" },
    ),
  );
  assert(
    packed.files.every(
      ({ path }) =>
        path.startsWith("dist/") ||
        ["README.md", "LICENSE", "package.json"].includes(path),
    ),
    "Unexpected npm package contents",
  );
  const packagePath = join(
    temporary,
    "node_modules/@marvin-amador-7/address-interpreter",
  );
  mkdirSync(packagePath, { recursive: true });
  execFileSync("tar", [
    "-xzf",
    join(temporary, packed.filename),
    "-C",
    packagePath,
    "--strip-components=1",
  ]);
  writeFileSync(join(temporary, "package.json"), '{"type":"module"}\n');
  const assertion = `const result = library.interpretAddress({ deliveryLine: "123 Main St Apt 4" });
if (!result.candidates.some(candidate => candidate.components.streetName === "MAIN" && candidate.components.secondary?.number === "4")) throw new Error("Street consumer failed");
const postal = library.interpretFullAddress("PO Box 123, Boston, MA 02108");
if (!postal.candidates.some(candidate => candidate.components.kind === "po-box" && candidate.components.boxNumber === "123")) throw new Error("Postal consumer failed");
const structural = library.interpretAddress({ deliveryLine: "123 Lakeview Dr" }, { spellingAlternatives: false });
if (!structural.candidates.length || structural.candidates.some(candidate => candidate.components.streetName === "LAKE VIEW")) throw new Error("Spelling option consumer failed");
const fullStructural = library.interpretFullAddress("123 Lakeview Dr, Austin TX 78701", { spellingAlternatives: false });
if (!fullStructural.candidates.length || fullStructural.candidates.some(candidate => candidate.components.streetName === "LAKE VIEW")) throw new Error("Full spelling option consumer failed");\n`;
  const packageName = "@marvin-amador-7/address-interpreter";
  writeFileSync(
    join(temporary, "consumer.mjs"),
    `import * as library from "${packageName}";\n${assertion}`,
  );
  writeFileSync(
    join(temporary, "consumer.cjs"),
    `const library = require("${packageName}");\n${assertion}`,
  );
  writeFileSync(
    join(temporary, "consumer.mts"),
    `import * as library from "${packageName}";\nconst options: library.AddressInterpretationOptions = { spellingAlternatives: false };\nlibrary.interpretAddress({ deliveryLine: "123 Main St" }, options);\n${assertion}`,
  );
  writeFileSync(
    join(temporary, "consumer.cts"),
    `import library = require("${packageName}");\nconst options: library.AddressInterpretationOptions = { spellingAlternatives: false };\nlibrary.interpretFullAddress("123 Main St, Austin TX 78701", options);\n${assertion}`,
  );
  for (const name of ["consumer.mjs", "consumer.cjs"])
    execFileSync(process.execPath, [join(temporary, name)], {
      cwd: temporary,
      stdio: "pipe",
    });
  execFileSync(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--strict",
      "--module",
      "Node16",
      "--target",
      "ES2021",
      "consumer.mts",
      "consumer.cts",
    ],
    { cwd: temporary, stdio: "pipe" },
  );
  console.log(
    `Packed ESM, CommonJS and both TypeScript declaration entry points passed on ${process.version}`,
  );
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
