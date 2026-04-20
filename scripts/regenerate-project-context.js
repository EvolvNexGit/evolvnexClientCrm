#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const projectRoot = process.cwd();
const contextPath = path.join(projectRoot, "project-context.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractExportedSymbols(source) {
  const symbols = [];
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+const\s+([A-Za-z_$][\w$]*)/g,
    /export\s+class\s+([A-Za-z_$][\w$]*)/g,
    /export\s+type\s+([A-Za-z_$][\w$]*)/g,
    /export\s+interface\s+([A-Za-z_$][\w$]*)/g,
    /export\s+default\s+function\s+([A-Za-z_$][\w$]*)/g,
    /export\s*\{\s*([^}]+)\s*\}/g,
  ];

  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(source)) !== null) {
      if (pattern.source.includes("[^}]+")) {
        const namedChunk = match[1] || "";
        const names = namedChunk
          .split(",")
          .map((part) => part.trim())
          .map((part) => part.replace(/\s+as\s+.*/i, "").trim())
          .filter(Boolean);
        symbols.push(...names);
      } else {
        symbols.push(match[1]);
      }
    }
  }

  return unique(symbols).sort((a, b) => a.localeCompare(b));
}

function extractTableNames(source) {
  const names = [];
  const fromPattern = /\.from\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

  let match = null;
  while ((match = fromPattern.exec(source)) !== null) {
    names.push(match[1]);
  }

  return unique(names).sort((a, b) => a.localeCompare(b));
}

function fileExists(relPath) {
  return fs.existsSync(path.join(projectRoot, relPath));
}

function loadSource(relPath) {
  return fs.readFileSync(path.join(projectRoot, relPath), "utf8");
}

function hashContent(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function createSectionMetadata(previousContext, nextContext, stamp) {
  const sectionNames = [
    "project",
    "entryPoints",
    "nodes",
    "edges",
    "dataFlow",
    "searchHints",
    "openQuestions",
  ];

  const existing = previousContext.sectionMetadata || {};
  const next = {};

  for (const section of sectionNames) {
    const previousHash =
      existing[section]?.contentHash || hashContent(previousContext[section]);
    const nextHash = hashContent(nextContext[section]);
    const changed = previousHash !== nextHash;

    next[section] = {
      lastUpdated: changed ? stamp : existing[section]?.lastUpdated || stamp,
      refreshHint:
        existing[section]?.refreshHint ||
        "Update this section whenever related files or architecture decisions change.",
      contentHash: nextHash,
    };
  }

  return next;
}

function regenerate() {
  if (!fs.existsSync(contextPath)) {
    throw new Error("project-context.json was not found in the project root.");
  }

  const previousContext = readJson(contextPath);
  const context = JSON.parse(JSON.stringify(previousContext));
  const stamp = new Date().toISOString();

  context.schemaVersion = 3;
  context.generatedAt = stamp;

  context.nodes = (context.nodes || []).map((node) => {
    if (!node.path || !fileExists(node.path)) {
      return {
        ...node,
        search: {
          exportedSymbols: node.search?.exportedSymbols || [],
          keyTableNames: node.search?.keyTableNames || [],
        },
      };
    }

    const source = loadSource(node.path);
    return {
      ...node,
      search: {
        exportedSymbols: extractExportedSymbols(source),
        keyTableNames: extractTableNames(source),
      },
    };
  });

  context.sectionMetadata = createSectionMetadata(previousContext, context, stamp);

  fs.writeFileSync(contextPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");

  console.log("Regenerated project-context.json");
  console.log(`schemaVersion: ${context.schemaVersion}`);
  console.log(`nodes analyzed: ${context.nodes.length}`);
}

try {
  regenerate();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to regenerate project context: ${message}`);
  process.exit(1);
}
