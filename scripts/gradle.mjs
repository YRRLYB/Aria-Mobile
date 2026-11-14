import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// The Gradle wrapper is a shell script on macOS/Linux and a batch file on
// Windows, so the npm scripts cannot hardcode either one: `gradlew.bat` only
// exists for cmd, `./gradlew` only runs where the exec bit survived checkout.
const androidDir = join(dirname(fileURLToPath(import.meta.url)), "..", "android");
const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";

if (!existsSync(join(androidDir, process.platform === "win32" ? "gradlew.bat" : "gradlew"))) {
  console.error(`Gradle wrapper not found in ${androidDir}`);
  process.exit(1);
}

const result = spawnSync(wrapper, process.argv.slice(2), {
  cwd: androidDir,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(
    `${wrapper} could not start: ${result.error.message}\n` +
      "A JDK 17 or 21 must be on PATH (or JAVA_HOME must point at one).",
  );
  process.exit(1);
}

process.exit(result.status ?? 1);
