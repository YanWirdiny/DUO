// `npm run test:coverage`: runs every test suite under V8 coverage and enforces
// the thresholds in .c8rc.json (100% for the notification feature's files).
//
// Why a sandbox: this package is CommonJS, so tsx compiles each .ts file to
// CommonJS. When an ESM test imports such a file, tsx loads it twice (one copy
// runs, one doesn't) and the CJS helpers it injects shift the source maps, so
// c8 reports covered code as uncovered. Measured as ESM the numbers are exact.
// The project itself can't switch to "type": "module" (next.config.ts is
// resolved as CommonJS), so the sources are copied into a gitignored sandbox
// marked ESM, with node_modules linked, and measured there.
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const root = process.cwd();
const sandbox = path.join(root, "coverage", "esm-sandbox");
const COPY = ["app", "components", "lib", "worker", "scripts", "tests", "prisma", "proxy.ts", "tsconfig.json", ".c8rc.json"];

const linkedModules = path.join(sandbox, "node_modules");

/** Removes the node_modules link itself — never what it points to. */
function unlinkModules() {
  try {
    if (!lstatSync(linkedModules).isSymbolicLink()) throw new Error(`${linkedModules} is not a link; refusing to delete`);
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  try {
    unlinkSync(linkedModules);
  } catch {
    rmdirSync(linkedModules); // Windows junctions are removed as directories
  }
}

unlinkModules();
rmSync(sandbox, { recursive: true, force: true });
mkdirSync(sandbox, { recursive: true });
for (const entry of COPY) {
  if (existsSync(entry)) cpSync(entry, path.join(sandbox, entry), { recursive: true });
}
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
writeFileSync(path.join(sandbox, "package.json"), JSON.stringify({ ...pkg, type: "module" }, null, 2));
// A junction needs no admin rights on Windows; it's a plain symlink elsewhere.
symlinkSync(path.join(root, "node_modules"), linkedModules, "junction");

const run = (args) =>
  spawnSync(process.execPath, args, {
    cwd: sandbox,
    stdio: "inherit",
    env: { ...process.env, NODE_V8_COVERAGE: path.join(sandbox, ".v8-coverage") },
  });

const tests = run(["--import", "tsx", "--experimental-test-module-mocks", "--test", "tests/**/*.test.mts"]);
const report = run([
  path.join(root, "node_modules", "c8", "bin", "c8.js"),
  "report",
  "--temp-directory",
  ".v8-coverage",
  "--reports-dir",
  path.join(root, "coverage"),
]);

unlinkModules();
process.exitCode = tests.status || report.status || 0;
