import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { upsertEnvValue } from "./env-file.mjs";

dotenv.config({ quiet: true });

const project = process.argv[2];
if (!project) {
  console.error("Usage: npm run project:set -- <ProjectFolderName>");
  process.exit(1);
}

if (project.includes("/") || project.includes("\\") || project === "." || project === "..") {
  console.error("Project must be a single folder name under WORKSPACE_ROOT.");
  process.exit(1);
}

const workspaceRoot = process.env.WORKSPACE_ROOT;
if (!workspaceRoot) {
  console.error("WORKSPACE_ROOT is missing. Run npm run setup:local first.");
  process.exit(1);
}

const projectPath = path.join(workspaceRoot, project);
if (!fs.existsSync(projectPath) || !fs.statSync(projectPath).isDirectory()) {
  console.error(`Project not found: ${projectPath}`);
  process.exit(1);
}

upsertEnvValue("DEFAULT_PROJECT", project);
console.log(`DEFAULT_PROJECT=${project}`);
console.log("Restart Gateway and Desktop Agent for ChatGPT to see the new default.");
