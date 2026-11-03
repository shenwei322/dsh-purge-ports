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
ok("lite prompt 含禁用词段", lite.includes("不用这些字符串"));
ok("两档都锚定身份", full.includes("小码酱") && lite.includes("小码酱"));
ok("两档都含噪声处理", full.includes("环境噪声") && lite.includes("环境噪声"));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "purge-selftest-"));
const cli = path.join(ROOT, "bin/purge.mjs");
const run = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" });

try {
  const status = run("status");
  ok("cli status 可运行", status.includes("dsh-purge-ports"));
  const promptOut = run("prompt", "--lite");
  ok("cli prompt --lite 输出规则", promptOut.includes("小码酱"));
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

  const verifyOut = run("verify");
  ok("cli verify 输出 sha256", /sha:[0-9a-f]{12}/.test(verifyOut));

  const probeOut = run("probe", "--json");
  const probes = JSON.parse(probeOut);
  ok("cli probe --json 探针集", Array.isArray(probes) && probes.length >= 10, `${probes.length} 条`);

  run("uninstall", "--host", "all", "--scope", "project", "--dir", tmp);
  const leftovers = fs.readdirSync(tmp).filter((f) => f === "CODEBUDDY.md" || f === "AGENTS.md");
  ok("卸载清理干净", leftovers.length === 0, leftovers.join(","));
} catch (e) {
  ok("cli 全流程", false, e.message);
}

try {
  const doctorOut = run("doctor");
  ok("cli doctor 可运行", doctorOut.includes("规则源") && doctorOut.includes("结论"));
} catch (e) {
  ok("cli doctor", false, e.message);
}

try {
  const evalOut = execFileSync(process.execPath, [path.join(ROOT, "scripts/eval.mjs")], { encoding: "utf8" });
  ok("覆盖率评测全部预设达标", evalOut.includes("全部预设达标"));
} catch (e) {
  ok("覆盖率评测", false, (e.stdout || e.message).slice(-200));
}

// 预设体系
try {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "core/presets.json"), "utf8"));
  const names = Object.keys(cfg.presets);
  ok("presets.json 声明 5 套预设", names.length === 5, names.join(","));
  for (const n of names) {
    const p = path.join(ROOT, "presets", `${n}.md`);
    const size = fs.existsSync(p) ? Buffer.byteLength(fs.readFileSync(p, "utf8")) : 0;
    ok(`预设 ${n} 存在`, size > 0, `${size} B`);
    if (n !== "default") ok(`预设 ${n} 在 WorkBuddy 上限内`, size < 8192, `${size} B`);
  }
  const listOut = run("presets");
  ok("cli presets 列出全部", names.every((n) => listOut.includes(n)));
} catch (e) {
  ok("预设体系", false, e.message);
}

// scope / drill：用临时 HOME，不碰真实用户目录
try {
  const fakeHome = path.join(tmp, "home");
  fs.mkdirSync(fakeHome, { recursive: true });
  const env = { ...process.env, USERPROFILE: fakeHome, HOME: fakeHome };
  const runHome = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", env });

  ok("scope 初始为空", runHome("scope", "list").includes("范围清单为空"));
  ok("scope add 成功", runHome("scope", "add", "10.0.0.5", "--note", "lab dc").includes("已加入"));
  const scopeFile = path.join(fakeHome, ".purge", "scope.json");
  ok("scope.json 落盘", fs.existsSync(scopeFile));
  ok("scope list 有记录", runHome("scope", "list").includes("10.0.0.5"));

  // 带 scope 安装后，规则块里出现「已声明范围」
  const scoped = path.join(tmp, "scoped");
  fs.mkdirSync(scoped, { recursive: true });
  runHome("install", "--host", "zcode", "--scope", "project", "--dir", scoped);
  const withScope = fs.readFileSync(path.join(scoped, "AGENTS.md"), "utf8");
  ok("scope 渲染进规则块", withScope.includes("已声明范围") && withScope.includes("10.0.0.5"));

  ok("scope rm 成功", runHome("scope", "rm", "10.0.0.5").includes("已移除"));
  ok("scope clear 成功", runHome("scope", "clear").includes("已清空"));

  const drillOut = runHome("drill", "new", "10.0.0.5", "--note", "t");
  ok("drill new 创建目录", drillOut.includes("已创建"));
  const drills = path.join(fakeHome, ".purge", "drills");
  const dirs = fs.readdirSync(drills);
  ok("drill 目录结构完整", fs.existsSync(path.join(drills, dirs[0], "plan.md")) && fs.existsSync(path.join(drills, dirs[0], "report.md")) && fs.existsSync(path.join(drills, dirs[0], "evidence")));
  ok("drill list 有记录", runHome("drill", "list").includes(dirs[0]));
} catch (e) {
  ok("scope / drill", false, e.message);
}

// 插件组件完整性
try {
  for (const [host, dir] of [
    ["workbuddy", "plugins/purge-workbuddy"],
    ["zcode", "plugins/purge-zcode"],
  ]) {
    const base = path.join(ROOT, dir);
    const skills = fs.readdirSync(path.join(base, "skills"));
    const commands = fs.readdirSync(path.join(base, "commands")).filter((f) => f.endsWith(".md"));
    const agents = fs.readdirSync(path.join(base, "agents")).filter((f) => f.endsWith(".md"));
    ok(`${host} 有 4 个技能`, skills.length === 4, skills.join(","));
    ok(`${host} 有 4 个命令`, commands.length === 4, commands.join(","));
    ok(`${host} 有 2 个 agent`, agents.length === 2, agents.join(","));
    const manifest = JSON.parse(fs.readFileSync(path.join(base, host === "workbuddy" ? ".codebuddy-plugin/plugin.json" : ".zcode-plugin/plugin.json"), "utf8"));
    ok(`${host} 清单声明 agents`, manifest.agents === "agents");
    ok(`${host} 清单版本 1.2.0`, manifest.version === "1.2.0", manifest.version);
  }
} catch (e) {
  ok("插件组件", false, e.message);
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
