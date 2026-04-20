#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const projectRoot = process.cwd();
const contextPath = path.join(projectRoot, "project-context.json");

const REQUIRED_SECTIONS = [
  "project",
  "entryPoints",
  "nodes",
  "edges",
  "dataFlow",
  "searchHints",
  "openQuestions",
];

function hashContent(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

function loadContext() {
  if (!fs.existsSync(contextPath)) {
    throw new Error("project-context.json was not found in the project root.");
  }

  const raw = fs.readFileSync(contextPath, "utf8");
  return JSON.parse(raw);
}

function assertSectionMetadata(context, errors) {
  if (!context.sectionMetadata || typeof context.sectionMetadata !== "object") {
    errors.push("Missing sectionMetadata object.");
    return;
  }

  for (const section of REQUIRED_SECTIONS) {
    const metadata = context.sectionMetadata[section];

    if (!metadata || typeof metadata !== "object") {
      errors.push(`Missing sectionMetadata.${section}.`);
      continue;
    }

    if (!metadata.lastUpdated || typeof metadata.lastUpdated !== "string") {
      errors.push(`Missing or invalid sectionMetadata.${section}.lastUpdated.`);
    }

    if (!metadata.contentHash || typeof metadata.contentHash !== "string") {
      errors.push(`Missing or invalid sectionMetadata.${section}.contentHash.`);
      continue;
    }

    const computedHash = hashContent(context[section]);
    if (metadata.contentHash !== computedHash) {
      errors.push(
        `Stale contentHash for section '${section}'. Expected ${computedHash}, found ${metadata.contentHash}.`,
      );
    }
  }
}

function assertEdges(context, errors) {
  const entryPoints = Array.isArray(context.entryPoints) ? context.entryPoints : [];
  const nodes = Array.isArray(context.nodes) ? context.nodes : [];
  const edges = Array.isArray(context.edges) ? context.edges : [];

  const validIds = new Set([
    ...entryPoints.map((entry) => entry?.id).filter(Boolean),
    ...nodes.map((node) => node?.id).filter(Boolean),
  ]);

  edges.forEach((edge, index) => {
    if (!edge || typeof edge !== "object") {
      errors.push(`Edge at index ${index} is not an object.`);
      return;
    }

    if (!edge.from || !validIds.has(edge.from)) {
      errors.push(`Invalid edge.from at index ${index}: ${String(edge.from)}.`);
    }

    if (!edge.to || !validIds.has(edge.to)) {
      errors.push(`Invalid edge.to at index ${index}: ${String(edge.to)}.`);
    }
  });
}

function main() {
  const errors = [];

  let context;
  try {
    context = loadContext();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Context verification failed: ${message}`);
    process.exit(1);
  }

  assertSectionMetadata(context, errors);
  assertEdges(context, errors);

  if (errors.length > 0) {
    console.error("Context verification failed with the following issues:");
    errors.forEach((error) => console.error(`- ${error}`));
    process.exit(1);
  }

  const edgeCount = Array.isArray(context.edges) ? context.edges.length : 0;
  console.log("Context verification passed.");
  console.log(`Checked sections: ${REQUIRED_SECTIONS.length}`);
  console.log(`Checked edges: ${edgeCount}`);
}

main();
