// Generates icons/icon16|48|128.png from scripts/icons.json (base64).
// Keeps the repository text-only; run before packaging or "Load unpacked".
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(readFileSync(join(root, "scripts/icons.json"), "utf8"));
mkdirSync(join(root, "icons"), { recursive: true });
for (const [name, b64] of Object.entries(data)) {
  writeFileSync(join(root, "icons", name), Buffer.from(b64, "base64"));
}
console.log("icons generated:", Object.keys(data).join(", "));
