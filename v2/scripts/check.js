import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) check(path);
    else if (entry.name.endsWith(".js"))
      execFileSync(process.execPath, ["--check", path], { stdio: "inherit" });
  }
}
for (const directory of ["src", "public", "test", "e2e", "scripts"])
  check(directory);
JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
const contract = YAML.parse(readFileSync("openapi.yaml", "utf8"));
function checkReferences(value) {
  if (!value || typeof value !== "object") return;
  if (value.$ref?.startsWith("#/")) {
    const target = value.$ref
      .slice(2)
      .split("/")
      .reduce((node, key) => node?.[key], contract);
    if (!target) throw new Error(`Unresolved OpenAPI reference: ${value.$ref}`);
  }
  Object.values(value).forEach(checkReferences);
}
checkReferences(contract);
console.log(
  "All JavaScript modules, manifest and OpenAPI references are valid.",
);
