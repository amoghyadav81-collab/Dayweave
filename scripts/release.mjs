// Build a production-only bundle on the same OS/architecture as the deployment image.
import {
  cpSync,
  mkdtempSync,
  existsSync,
  writeFileSync,
  rmSync,
  renameSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
const root = process.cwd(),
  target = join(root, "release");
if (existsSync(target) && !existsSync(join(target, ".dayweave-release")))
  throw Error("Refusing to overwrite an unknown release directory");
if (!existsSync(join(root, ".next/BUILD_ID")))
  throw Error("Run npm run build before packaging");
const stage = mkdtempSync(join(root, ".release-build-"));
try {
  for (const file of ["package.json", "package-lock.json", ".npmrc"])
    cpSync(join(root, file), join(stage, file));
  const installed = spawnSync(
    "npm",
    [
      "ci",
      "--omit=dev",
      "--cache",
      process.env.DAYWEAVE_NPM_CACHE || "/tmp/dayweave-npm",
    ],
    { cwd: stage, stdio: "inherit" },
  );
  if (installed.status !== 0)
    throw Error("Production dependency install failed");
  for (const file of [
    ".next",
    "public",
    "migrations",
    "lib",
    "scripts",
    "next.config.mjs",
  ])
    cpSync(join(root, file), join(stage, file), {
      recursive: true,
      filter: (source) => !source.includes("/.next/cache"),
    });
  cpSync(join(root, "Dockerfile.release"), join(stage, "Dockerfile"));
  writeFileSync(
    join(stage, ".dayweave-release"),
    "Generated production bundle; contains no database or .env files.\n",
  );
  if (existsSync(target)) rmSync(target, { recursive: true });
  renameSync(stage, target);
  console.log(
    "Production bundle prepared in release/. Build image: docker build -t dayweave:release release",
  );
} catch (e) {
  rmSync(stage, { recursive: true, force: true });
  throw e;
}
