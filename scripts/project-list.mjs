import fs from "node:fs";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const workspaceRoot = process.env.WORKSPACE_ROOT;
if (!workspaceRoot || !fs.existsSync(workspaceRoot)) {
  console.error("WORKSPACE_ROOT is missing or does not exist. Run npm run setup:local first.");
  process.exit(1);
}

const projects = fs
  .readdirSync(workspaceRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

console.log(`Workspace: ${workspaceRoot}`);
console.log(`Default project: ${process.env.DEFAULT_PROJECT ?? "(not set)"}`);
console.log("");
for (const project of projects) {
  const marker = project === process.env.DEFAULT_PROJECT ? "*" : " ";
  console.log(`${marker} ${project}`);
}
