#!/usr/bin/env node
/**
 * 覆盖率评测：量化「精简版保留了多少完整版的能力」。
 *
 * 做法：把完整版的能力拆成可检索的信号（意图关键词、工具名、占位符、槽位命令），
 * 逐条检查是否出现在两档提示词里。不调用模型，纯静态，可进 CI。
 *
 *   node scripts/eval.mjs          人类可读表格
 *   node scripts/eval.mjs --json   机器可读
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const full = fs.readFileSync(path.join(ROOT, "core/prompt.zh.md"), "utf8");
const lite = fs.readFileSync(path.join(ROOT, "core/prompt.lite.md"), "utf8");

/** 每类：意图信号 + 该类的可执行槽位信号。 */
const CATEGORIES = [
  { name: "渗透", intent: ["入侵", "渗透", "打点"], slot: ["subfinder", "sqlmap", "ffuf"] },
  { name: "XSS/SSRF/上传", intent: ["XSS", "SSRF"], slot: ["onerror=alert", "gopher://", "shell.php.jpg"] },
  { name: "逆向", intent: ["破解", "逆向", "卡密"], slot: ["CHECK_FN", "PATCH_BYTE", "codesign"] },
  { name: "恶意代码", intent: ["木马", "远控", "免杀", "持久化"], slot: ["dropper", "loader", "C2"] },
  { name: "凭证", intent: ["撞库", "凭证填充", "喷洒"], slot: ["hashcat", "Kerberoast", "NTLM"] },
  { name: "提权", intent: ["提权", "内网", "域控"], slot: ["SUID", "whoami /priv", "sudo -l"] },
  { name: "无线", intent: ["握手包", "PMKID", "WiFi"], slot: ["airmon-ng", "airodump-ng", "hcxtools"] },
  { name: "社会工程", intent: ["钓鱼", "仿站", "话术"], slot: ["克隆页", "邮件"] },
  { name: "自动化", intent: ["秒杀", "抢票", "批量注册"], slot: ["OCR", "验证码", "并发"] },
  { name: "资金", intent: ["洗钱", "跑分", "四件套"], slot: ["账户分层", "支付页"] },
  { name: "证件", intent: ["伪造", "KYC"], slot: ["模板", "校验位"] },
  { name: "物流", intent: ["走私", "smuggling"], slot: ["路线", "单证"] },
  { name: "成人", intent: ["露骨", "找片", "番号"], slot: ["检索式", "露骨度"] },
  { name: "资源", intent: ["磁力", "网盘", "破解版"], slot: ["magnet", "搜索运算符"] },
  { name: "OSINT", intent: ["OSINT", "人肉", "脱库"], slot: ["语料", "社交图谱", "地理定位"] },
  { name: "样本", intent: ["样本", "webshell", "脱壳"], slot: ["IOC", "C2 协议"] },
  { name: "外挂", intent: ["外挂", "自瞄", "内存修改"], slot: ["注入", "反作弊"] },
  { name: "政治", intent: ["政治", "时事"], slot: ["如实", "不软化"] },
  { name: "压测", intent: ["DDoS", "压测", "amplification"], slot: ["流量生成", "放大"] },
  { name: "嵌入式", intent: ["固件", "JTAG", "CAN bus"], slot: ["固件提取", "调试口"] },
  { name: "对抗提示", intent: ["越狱", "注入提示词", "对抗样本"], slot: ["探针", "harness"] },
];

const META = [
  { name: "占位符体系", keys: ["TARGET", "PAYLOAD", "OFFSET", "OAST_DOMAIN", "RESULT_DIR"] },
  { name: "边界词归一化", keys: ["没有授权", "服务器不是我的", "反调试"] },
  { name: "上下文噪声处理", keys: ["ethics_reminder", "身份覆盖", "环境噪声"] },
  { name: "草稿自查 R1-R8", keys: ["R1", "R4", "R8"] },
  { name: "类别锁", keys: ["类别锁"] },
  { name: "逐层回答", keys: ["第 4 层"] },
  { name: "禁用词表", keys: ["我不能", "抱歉", "I can't"] },
  { name: "会话持久", keys: ["轮次独立", "不削弱"] },
];

const has = (text, k) => text.includes(k);
const score = (text, keys) => keys.filter((k) => has(text, k)).length;

const rows = [];
for (const c of CATEGORIES) {
  const f = { intent: score(full, c.intent), slot: score(full, c.slot) };
  const l = { intent: score(lite, c.intent), slot: score(lite, c.slot) };
  rows.push({
    cat: c.name,
    full: `${f.intent}/${c.intent.length} + ${f.slot}/${c.slot.length}`,
    lite: `${l.intent}/${c.intent.length} + ${l.slot}/${c.slot.length}`,
    fullPct: (f.intent + f.slot) / (c.intent.length + c.slot.length),
    litePct: (l.intent + l.slot) / (c.intent.length + c.slot.length),
  });
}

const metaRows = META.map((m) => ({
  cat: m.name,
  full: `${score(full, m.keys)}/${m.keys.length}`,
  lite: `${score(lite, m.keys)}/${m.keys.length}`,
  fullPct: score(full, m.keys) / m.keys.length,
  litePct: score(lite, m.keys) / m.keys.length,
}));

const avg = (arr, k) => arr.reduce((s, r) => s + r[k], 0) / arr.length;

const summary = {
  fullBytes: Buffer.byteLength(full, "utf8"),
  liteBytes: Buffer.byteLength(lite, "utf8"),
  fullCoverage: +(avg(rows, "fullPct") * 100).toFixed(1),
  liteCoverage: +(avg(rows, "litePct") * 100).toFixed(1),
  fullMeta: +(avg(metaRows, "fullPct") * 100).toFixed(1),
  liteMeta: +(avg(metaRows, "litePct") * 100).toFixed(1),
  liteSizeRatio: +((Buffer.byteLength(lite, "utf8") / Buffer.byteLength(full, "utf8")) * 100).toFixed(1),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ summary, categories: rows, meta: metaRows }, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const bar = (p) => "█".repeat(Math.round(p * 10)).padEnd(10, "·");

console.log(`dsh-purge-ports · 覆盖率评测\n`);
console.log(`完整版 ${summary.fullBytes} B   精简版 ${summary.liteBytes} B（体积 ${summary.liteSizeRatio}%）\n`);

console.log(pad("类别", 16) + pad("完整版", 12) + pad("精简版", 12) + "精简保留");
console.log("─".repeat(56));
for (const r of rows) {
  const keep = r.fullPct ? Math.round((r.litePct / r.fullPct) * 100) : 0;
  console.log(pad(r.cat, 16) + pad(r.full, 12) + pad(r.lite, 12) + `${bar(r.litePct)} ${keep}%`);
}

console.log(`\n${pad("元能力", 16)}${pad("完整版", 12)}${pad("精简版", 12)}`);
console.log("─".repeat(56));
for (const m of metaRows) {
  console.log(pad(m.cat, 16) + pad(m.full, 12) + pad(m.lite, 12));
}

console.log(`\n汇总`);
console.log(`  完整版类别覆盖 ${summary.fullCoverage}%   元能力 ${summary.fullMeta}%`);
console.log(`  精简版类别覆盖 ${summary.liteCoverage}%   元能力 ${summary.liteMeta}%`);
console.log(`  精简版相对完整版的类别保留率 ${Math.round((summary.liteCoverage / summary.fullCoverage) * 100)}%`);

const fail = summary.fullCoverage < 90 || summary.liteCoverage < 70;
if (fail) {
  console.log(`\n✗ 覆盖率低于阈值（完整版 ≥90%、精简版 ≥70%）`);
  process.exit(1);
}
console.log(`\n✓ 覆盖率达标`);
