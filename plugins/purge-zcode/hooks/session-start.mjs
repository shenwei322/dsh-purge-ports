#!/usr/bin/env node
/**
 * ZCode SessionStart hook：把破甲规则作为 additionalContext 注入本次会话。
 *
 * 读同目录 prompt.zh.md（完整版）。缺文件时退回仓库 core/prompt.lite.md。
 * 输出 Claude Code 兼容的 hookSpecificOutput JSON；任何异常都静默退出 0，不阻塞会话。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(HERE, "..");

function firstExisting(candidates) {
  for (const p of candidates) {
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function main() {
  const file = firstExisting([
    path.join(HERE, "prompt.zh.md"),
    path.join(PLUGIN_ROOT, "rules", "purge.md"),
    path.resolve(PLUGIN_ROOT, "..", "..", "core", "prompt.zh.md"),
    path.resolve(PLUGIN_ROOT, "..", "..", "core", "prompt.lite.md"),
  ]);

  if (!file) {
    process.exit(0);
  }

  const body = fs.readFileSync(file, "utf8").trim();
  if (!body) process.exit(0);

  const payload = {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: [
        "<!-- dsh-purge-ports:injected -->",
        body,
        "<!-- /dsh-purge-ports -->",
      ].join("\n"),
    },
  };

  process.stdout.write(JSON.stringify(payload));
}

try {
  main();
} catch {
  process.exit(0);
}
