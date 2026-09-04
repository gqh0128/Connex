import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const PROJECT_NAME = "connex";

const [nextVersion, ...unexpectedArguments] = process.argv.slice(2);
if (
  !nextVersion ||
  unexpectedArguments.length > 0 ||
  !VERSION_PATTERN.test(nextVersion)
) {
  console.error("Usage: pnpm version:set <semantic-version>");
  console.error("Example: pnpm version:set 0.2.0");
  process.exitCode = 1;
} else {
  await setProjectVersion(nextVersion);
}

async function setProjectVersion(version) {
  const filePaths = {
    packageJson: resolve("package.json"),
    tauriConfig: resolve("src-tauri/tauri.conf.json"),
    cargoManifest: resolve("src-tauri/Cargo.toml"),
    cargoLock: resolve("src-tauri/Cargo.lock"),
  };
  const entries = Object.entries(filePaths);
  const originalContents = new Map(
    await Promise.all(
      entries.map(async ([key, filePath]) => [key, await readFile(filePath, "utf8")]),
    ),
  );

  const packageJson = JSON.parse(originalContents.get("packageJson"));
  packageJson.version = version;

  const tauriConfig = JSON.parse(originalContents.get("tauriConfig"));
  tauriConfig.version = version;

  const nextContents = new Map([
    ["packageJson", `${JSON.stringify(packageJson, null, 2)}\n`],
    ["tauriConfig", `${JSON.stringify(tauriConfig, null, 2)}\n`],
    [
      "cargoManifest",
      replaceCargoManifestVersion(originalContents.get("cargoManifest"), version),
    ],
    ["cargoLock", replaceCargoLockVersion(originalContents.get("cargoLock"), version)],
  ]);

  const writtenKeys = [];
  try {
    for (const [key, filePath] of entries) {
      const nextContent = nextContents.get(key);
      if (nextContent !== originalContents.get(key)) {
        await writeFile(filePath, nextContent, "utf8");
        writtenKeys.push(key);
      }
    }
  } catch (error) {
    await Promise.all(
      writtenKeys.map((key) =>
        writeFile(filePaths[key], originalContents.get(key), "utf8"),
      ),
    );
    throw error;
  }

  if (writtenKeys.length === 0) {
    console.log(`Connex is already at version ${version}.`);
    return;
  }

  console.log(`Updated Connex to version ${version}:`);
  for (const key of writtenKeys) {
    console.log(`- ${filePaths[key]}`);
  }
  console.log("No commit, tag, or push was created.");
}

function replaceCargoManifestVersion(contents, version) {
  const packageHeaderIndex = contents.search(/^\[package\]$/m);
  if (packageHeaderIndex < 0) {
    throw new Error("Unable to find [package] in src-tauri/Cargo.toml.");
  }

  const packageBodyIndex = packageHeaderIndex + "[package]".length;
  const remainingContents = contents.slice(packageBodyIndex);
  const nextSectionOffset = remainingContents.search(/^\[/m);
  const packageEndIndex =
    nextSectionOffset < 0 ? contents.length : packageBodyIndex + nextSectionOffset;
  const packageSection = contents.slice(packageHeaderIndex, packageEndIndex);
  const versionMatches = packageSection.match(/^version = "[^"]+"$/gm) ?? [];

  if (versionMatches.length !== 1) {
    throw new Error("Expected exactly one package version in src-tauri/Cargo.toml.");
  }

  const nextPackageSection = packageSection.replace(
    /^version = "[^"]+"$/m,
    `version = "${version}"`,
  );
  return (
    contents.slice(0, packageHeaderIndex) +
    nextPackageSection +
    contents.slice(packageEndIndex)
  );
}

function replaceCargoLockVersion(contents, version) {
  let matchingPackages = 0;
  const nextContents = contents
    .split(/(?=^\[\[package\]\]$)/m)
    .map((packageBlock) => {
      if (!packageBlock.match(new RegExp(`^name = "${PROJECT_NAME}"$`, "m"))) {
        return packageBlock;
      }

      matchingPackages += 1;
      return packageBlock.replace(/^version = "[^"]+"$/m, `version = "${version}"`);
    })
    .join("");

  if (matchingPackages !== 1) {
    throw new Error(
      `Expected exactly one ${PROJECT_NAME} package in src-tauri/Cargo.lock.`,
    );
  }

  return nextContents;
}
