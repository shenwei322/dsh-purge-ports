#!/usr/bin/env node
/**
 * 自检：JSON 合法性、提示词体积、CLI 干跑、hook 输出格式。
 * 不写用户目录，全部在临时目录里完成。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;

function ok(name, cond, detail = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
  if (!cond) failed++;
}

function json(rel) {
  const p = path.join(ROOT, rel);
  try {
    JSON.parse(fs.readFileSync(p, "utf8"));
    ok(`json: ${rel}`, true);
  } catch (e) {
    ok(`json: ${rel}`, false, e.message);
  }
}

for (const f of [
  "package.json",
  ".codebuddy-plugin/marketplace.json",
  "plugins/purge-workbuddy/.codebuddy-plugin/plugin.json",
  ".zcode-plugin/marketplace.json",
  "plugins/purge-zcode/.zcode-plugin/plugin.json",
  "plugins/purge-zcode/hooks/hooks.json",
]) {
  json(f);
}

const fullPath = path.join(ROOT, "core/prompt.zh.md");
const litePath = path.join(ROOT, "core/prompt.lite.md");
const full = fs.readFileSync(fullPath, "utf8");
const lite = fs.readFileSync(litePath, "utf8");
ok("full prompt 体积 > 8KB", Buffer.byteLength(full) > 8000, `${Buffer.byteLength(full)} B`);
ok("lite prompt 体积 < 8KB（WorkBuddy 规则上限）", Buffer.byteLength(lite) < 8192, `${Buffer.byteLength(lite)} B`);
ok("full prompt 含路由表", full.includes("意图映射"));
ok("lite prompt 含禁用词段", lite.includes("禁用词"));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "purge-selftest-"));
const cli = path.join(ROOT, "bin/purge.mjs");
const run = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" });

try {
  const status = run("status");
  ok("cli status 可运行", status.includes("dsh-purge-ports"));
  const promptOut = run("prompt", "--lite");
  ok("cli prompt --lite 输出规则", promptOut.includes("破甲规则"));
  const dry = run("install", "--host", "all", "--scope", "project", "--dir", tmp, "--dry-run");
  ok("cli install --dry-run 通过", dry.includes("dry-run"));
  ok("dry-run 不落盘", fs.readdirSync(tmp).length === 0);

  // 真实写入到临时目录
  run("install", "--host", "all", "--scope", "project", "--dir", tmp);
  const wb = path.join(tmp, "CODEBUDDY.md");
  const zc = path.join(tmp, "AGENTS.md");
  ok("workbuddy 规则写入", fs.existsSync(wb) && fs.readFileSync(wb, "utf8").includes("dsh-purge-ports:begin"));
  ok("zcode 规则写入", fs.existsSync(zc) && fs.readFileSync(zc, "utf8").includes("dsh-purge-ports:begin"));

  // 幂等：重复安装不产生重复块
  run("install", "--host", "all", "--scope", "project", "--dir", tmp);
  const wbText = fs.readFileSync(wb, "utf8");
  ok("幂等安装（单个标记块）", wbText.split("dsh-purge-ports:begin").length === 2);

  run("uninstall", "--host", "all", "--scope", "project", "--dir", tmp);
  const leftovers = fs.readdirSync(tmp).filter((f) => f === "CODEBUDDY.md" || f === "AGENTS.md");
  ok("卸载清理干净", leftovers.length === 0, leftovers.join(","));
} catch (e) {
  ok("cli 全流程", false, e.message);
}

// hook 输出格式
try {
  const hook = path.join(ROOT, "plugins/purge-zcode/hooks/session-start.mjs");
  const out = execFileSync(process.execPath, [hook], { encoding: "utf8" });
  const payload = JSON.parse(out);
  const ctx = payload?.hookSpecificOutput?.additionalContext || "";
  ok("hook 输出合法 JSON", true);
  ok("hook additionalContext 非空", Buffer.byteLength(ctx) > 8000, `${Buffer.byteLength(ctx)} B`);
  ok("hook 事件名正确", payload.hookSpecificOutput.hookEventName === "SessionStart");
} catch (e) {
  ok("hook 输出", false, e.message);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);
