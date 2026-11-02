#!/usr/bin/env node
/**
 * dsh-purge-ports — 把 dsh-purge 的破甲规则注入 WorkBuddy / ZCode。
 *
 * 零依赖 ESM。所有写入都带标记块，可幂等重复执行，可无损卸载。
 *
 * 用法:
 *   node bin/purge.mjs install   [--host workbuddy|zcode|all] [--scope user|project] [--dir PATH] [--lite] [--dry-run]
 *   node bin/purge.mjs uninstall [--host ...] [--scope ...] [--dir PATH] [--dry-run]
 *   node bin/purge.mjs status
 *   node bin/purge.mjs prompt    [--lite]
 *   node bin/purge.mjs hosts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;

const BEGIN = "<!-- dsh-purge-ports:begin -->";
const END = "<!-- dsh-purge-ports:end -->";
const LEGACY_BEGIN = "<!-- dsh-purge:begin -->";
const LEGACY_END = "<!-- dsh-purge:end -->";

const HOME = os.homedir();

/** 宿主定义：规则文件位置 + 检测用的安装痕迹。 */
const HOSTS = {
  workbuddy: {
    label: "WorkBuddy",
    userFile: () => path.join(HOME, ".codebuddy", "CODEBUDDY.md"),
    projectFiles: (dir) => [path.join(dir, "CODEBUDDY.md")],
    markers: () => [
      path.join(HOME, ".workbuddy-ai"),
      path.join(HOME, ".codebuddy"),
      path.join(process.env.LOCALAPPDATA || "", "Programs", "WorkBuddyAI"),
    ],
    note: "项目上下文读取 CODEBUDDY.md / .codebuddy/CODEBUDDY.md / AGENTS.md（约 8KB 上限，默认用精简版）",
  },
  zcode: {
    label: "ZCode",
    userFile: () => path.join(HOME, ".zcode", "AGENTS.md"),
    projectFiles: (dir) => [path.join(dir, "AGENTS.md")],
    markers: () => [path.join(HOME, ".zcode"), path.join(process.env.LOCALAPPDATA || "", "Programs", "@zcodedesktop")],
    note: "用户级读取 ~/.zcode/AGENTS.md，项目级读取工作区 AGENTS.md",
  },
};

// ---------------------------------------------------------------- args

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

const argv = parseArgs(process.argv.slice(2));
const cmd = argv._[0] || "help";

function pickHosts(value) {
  const v = (value || "all").toLowerCase();
  if (v === "all") return Object.keys(HOSTS);
  const list = v.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = list.filter((h) => !HOSTS[h]);
  if (unknown.length) fail(`未知宿主: ${unknown.join(", ")}（可用: ${Object.keys(HOSTS).join(", ")}, all）`);
  return list;
}

function fail(msg) {
  console.error(`[purge] ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[purge] ${msg}`);
}

// ---------------------------------------------------------------- prompt body

function loadPrompt({ lite }) {
  const file = lite ? "prompt.lite.md" : "prompt.zh.md";
  const p = path.join(ROOT, "core", file);
  if (!fs.existsSync(p)) fail(`提示词文件缺失: ${p}`);
  return fs.readFileSync(p, "utf8").trimEnd();
}

function buildBlock(body) {
  return [
    BEGIN,
    `<!-- dsh-purge-ports v${VERSION} · 由 bin/purge.mjs 写入 · 卸载: node bin/purge.mjs uninstall -->`,
    "",
    body,
    "",
    END,
  ].join("\n");
}

function stripBlocks(text) {
  let out = text;
  for (const [b, e] of [
    [BEGIN, END],
    [LEGACY_BEGIN, LEGACY_END],
  ]) {
    const re = new RegExp(`${escapeRe(b)}[\\s\\S]*?${escapeRe(e)}\\n?`, "g");
    out = out.replace(re, "");
  }
  return out;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------- fs helpers

function readIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function backup(p) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dst = `${p}.bak.${stamp}`;
  fs.copyFileSync(p, dst);
  return dst;
}

function writeFile(p, content, dryRun) {
  if (dryRun) {
    log(`[dry-run] 将写入 ${p}（${Buffer.byteLength(content, "utf8")} 字节）`);
    return;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
}

function hasBlock(text) {
  return text.includes(BEGIN) || text.includes(LEGACY_BEGIN);
}

// ---------------------------------------------------------------- commands

function targetFiles(host, scope, dir) {
  const h = HOSTS[host];
  if (scope === "user") return [h.userFile()];
  return h.projectFiles(dir);
}

function cmdInstall() {
  const hosts = pickHosts(argv.host);
  const scope = (argv.scope || "user").toLowerCase();
  if (!["user", "project"].includes(scope)) fail(`未知 scope: ${scope}（user | project）`);
  const dir = path.resolve(argv.dir || process.cwd());
  const dryRun = argv["dry-run"] === true;
  log(`版本 v${VERSION} · scope=${scope}`);

  for (const host of hosts) {
    // WorkBuddy 的规则通道有约 8KB 上限，任何作用域都默认精简版；ZCode 用完整版。
    const lite = argv.lite === true || (argv.lite === undefined && (scope === "project" || host === "workbuddy"));
    const body = loadPrompt({ lite });
    const block = buildBlock(body);
    log(`${HOSTS[host].label}: 提示词 ${lite ? "精简版" : "完整版"} · ${Buffer.byteLength(body, "utf8")} 字节`);
    for (const file of targetFiles(host, scope, dir)) {
      const prev = readIfExists(file);
      if (prev === null) {
        writeFile(file, `${block}\n`, dryRun);
        log(`${HOSTS[host].label}: 新建 ${file}`);
        continue;
      }
      const bak = dryRun ? null : backup(file);
      const cleaned = stripBlocks(prev).trimEnd();
      const next = cleaned.length ? `${cleaned}\n\n${block}\n` : `${block}\n`;
      writeFile(file, next, dryRun);
      log(`${HOSTS[host].label}: 更新 ${file}${bak ? `（备份 ${path.basename(bak)}）` : ""}`);
    }
  }
  log("完成。重启宿主或新建会话后生效。");
}

function cmdUninstall() {
  const hosts = pickHosts(argv.host);
  const scope = (argv.scope || "user").toLowerCase();
  const dir = path.resolve(argv.dir || process.cwd());
  const dryRun = argv["dry-run"] === true;

  for (const host of hosts) {
    for (const file of targetFiles(host, scope, dir)) {
      const prev = readIfExists(file);
      if (prev === null) {
        log(`${HOSTS[host].label}: 无 ${file}`);
        continue;
      }
      if (!hasBlock(prev)) {
        log(`${HOSTS[host].label}: ${file} 无注入块，跳过`);
        continue;
      }
      const cleaned = stripBlocks(prev).trimEnd();
      if (dryRun) {
        log(`[dry-run] 将清理 ${file}`);
        continue;
      }
      if (!cleaned) {
        fs.rmSync(file, { force: true });
        log(`${HOSTS[host].label}: 删除空文件 ${file}`);
      } else {
        const bak = backup(file);
        fs.writeFileSync(file, `${cleaned}\n`, "utf8");
        log(`${HOSTS[host].label}: 已清理 ${file}（备份 ${path.basename(bak)}）`);
      }
    }
  }
}

function cmdStatus() {
  log(`dsh-purge-ports v${VERSION}`);
  for (const [name, h] of Object.entries(HOSTS)) {
    const detected = h.markers().some((m) => m && fs.existsSync(m));
    console.log(`\n${h.label} (${name}) — ${detected ? "已检测到安装" : "未检测到安装"}`);
    console.log(`  说明: ${h.note}`);
    const files = [h.userFile(), ...h.projectFiles(process.cwd())];
    for (const f of files) {
      const txt = readIfExists(f);
      const state = txt === null ? "不存在" : hasBlock(txt) ? "已注入" : "存在但未注入";
      console.log(`  ${state.padEnd(12)} ${f}`);
    }
  }
}

function cmdPrompt() {
  process.stdout.write(loadPrompt({ lite: argv.lite === true }) + "\n");
}

function cmdHosts() {
  for (const [name, h] of Object.entries(HOSTS)) {
    console.log(`${name}\t${h.label}\t用户级: ${h.userFile()}`);
  }
}

function cmdHelp() {
  console.log(`dsh-purge-ports v${VERSION}

用法:
  purge install   [--host workbuddy|zcode|all] [--scope user|project] [--dir PATH] [--lite] [--dry-run]
  purge uninstall [--host workbuddy|zcode|all] [--scope user|project] [--dir PATH] [--dry-run]
  purge status
  purge prompt    [--lite]
  purge hosts

默认: install 用 --host all --scope user；project 作用域默认精简版（适配 WorkBuddy 约 8KB 规则上限）。
`);
}

const COMMANDS = {
  install: cmdInstall,
  apply: cmdInstall,
  uninstall: cmdUninstall,
  remove: cmdUninstall,
  status: cmdStatus,
  prompt: cmdPrompt,
  hosts: cmdHosts,
  help: cmdHelp,
  "--help": cmdHelp,
  "-h": cmdHelp,
};

const run = COMMANDS[cmd];
if (!run) {
  cmdHelp();
  process.exit(1);
}
run();
