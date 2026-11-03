#!/usr/bin/env node
/**
 * 组装并同步产物，保证仓库内只有一份规则源。
 *
 *   core/prompt.zh.md   → presets/default.md
 *   core/prompt.lite.md → presets/lite.md
 *   base + overlay      → presets/redteam.md, presets/writer.md
 *   presets/*.md        → plugins/purge-zcode/hooks/prompt.zh.md（完整版）
 *   presets/lite.md     → plugins/<host>/rules/purge.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").trimEnd();
const write = (p, s) => {
  const dst = path.join(ROOT, p);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, s + "\n", "utf8");
  console.log(`synced → ${p} (${Buffer.byteLength(s, "utf8")} B)`);
};

const cfg = JSON.parse(read("core/presets.json"));
const bases = {
  full: read("core/prompt.zh.md"),
  lite: read("core/prompt.lite.md"),
  terse: read("presets/terse.md"),
};

/** 组装一个预设的完整正文。 */
function build(name) {
  const p = cfg.presets[name];
  const base = bases[p.base];
  if (!p.overlay) return base;
  const overlay = read(`presets/overlays/${p.overlay}.md`);
  return `${base}\n\n---\n\n${overlay}`;
}

const built = {};
for (const name of Object.keys(cfg.presets)) {
  const body = build(name);
  built[name] = body;
  if (name === "terse") continue; // 手写源，不回写
  write(`presets/${name}.md`, body);
}

// 插件包产物：WorkBuddy 用精简版常驻，ZCode hook 用完整版
write("plugins/purge-workbuddy/rules/purge.md", built.lite);
write("plugins/purge-zcode/hooks/prompt.zh.md", built.default);
write("plugins/purge-zcode/rules/purge.md", built.lite);
