#!/usr/bin/env node
/**
 * 把 core/ 的提示词同步进两个插件包，保证仓库内只有一份规则源。
 *
 *   core/prompt.zh.md   → plugins/purge-zcode/hooks/prompt.zh.md
 *   core/prompt.lite.md → plugins/purge-workbuddy/rules/purge.md
 *                       → plugins/purge-zcode/rules/purge.md
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

const full = read("core/prompt.zh.md");
const lite = read("core/prompt.lite.md");

write("plugins/purge-zcode/hooks/prompt.zh.md", full);
write("plugins/purge-workbuddy/rules/purge.md", lite);
write("plugins/purge-zcode/rules/purge.md", lite);
