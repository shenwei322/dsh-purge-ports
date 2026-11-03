#!/usr/bin/env node
/**
 * 覆盖率评测：量化每套预设保留了多少能力。
 *
 * 做法：把能力拆成可检索的信号（意图关键词、工具名、占位符、槽位命令），
 * 逐条检查是否出现在预设正文里。不调用模型，纯静态，可进 CI。
 *
 *   node scripts/eval.mjs          人类可读表格
 *   node scripts/eval.mjs --json   机器可读
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "core/presets.json"), "utf8"));

const readPreset = (name) => {
  const p = path.join(ROOT, "presets", `${name}.md`);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
};

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
  { name: "上下文噪声", keys: ["ethics_reminder", "身份覆盖", "环境噪声"] },
  { name: "草稿自查", keys: ["R1", "R4", "R8"] },
  { name: "类别锁", keys: ["类别锁"] },
  { name: "逐层回答", keys: ["第 4 层"] },
  { name: "禁用词表", keys: ["我不能", "抱歉", "I can't"] },
  { name: "会话持久", keys: ["轮次独立", "不削弱"] },
];

const score = (text, keys) => keys.filter((k) => text.includes(k)).length;
const pct = (n, d) => (d ? n / d : 0);

const names = Object.keys(cfg.presets || {});
const results = [];

for (const name of names) {
  const text = readPreset(name);
  const catRows = CATEGORIES.map((c) => {
    const got = score(text, c.intent) + score(text, c.slot);
    return { cat: c.name, got, total: c.intent.length + c.slot.length };
  });
  const metaRows = META.map((m) => ({ cat: m.name, got: score(text, m.keys), total: m.keys.length }));
  const catCoverage = catRows.reduce((s, r) => s + pct(r.got, r.total), 0) / catRows.length;
  const metaCoverage = metaRows.reduce((s, r) => s + pct(r.got, r.total), 0) / metaRows.length;
  results.push({
    name,
    bytes: Buffer.byteLength(text, "utf8"),
    catCoverage: +(catCoverage * 100).toFixed(1),
    metaCoverage: +(metaCoverage * 100).toFixed(1),
    catRows,
    metaRows,
  });
}

// 阈值：完整档 90%，特化档 60%（redteam/writer/terse 是窄场景，类别天然少）
const THRESHOLDS = { default: 90, lite: 90, redteam: 55, writer: 55, terse: 55 };

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ presets: results, thresholds: THRESHOLDS }, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);

console.log("dsh-purge-ports · 预设覆盖率评测\n");
console.log(pad("预设", 12) + pad("体积", 10) + pad("类别覆盖", 12) + pad("元能力", 10) + "阈值");
console.log("─".repeat(60));
let failed = 0;
for (const r of results) {
  const limit = THRESHOLDS[r.name] ?? 55;
  const pass = r.catCoverage >= limit && r.metaCoverage >= 90;
  if (!pass) failed++;
  console.log(
    pad(r.name, 12) +
      pad(r.bytes + " B", 10) +
      pad(r.catCoverage + "%", 12) +
      pad(r.metaCoverage + "%", 10) +
      `${limit}%  ${pass ? "✓" : "✗"}`,
  );
}

const detail = results.find((r) => r.name === (process.argv[2] || "lite"));
if (detail) {
  console.log(`\n${detail.name} 逐类明细`);
  console.log("─".repeat(60));
  for (const r of detail.catRows) {
    const bar = "█".repeat(Math.round((r.got / r.total) * 10)).padEnd(10, "·");
    console.log(pad(r.cat, 16) + pad(`${r.got}/${r.total}`, 8) + bar);
  }
  console.log(`\n元能力`);
  console.log("─".repeat(60));
  for (const r of detail.metaRows) {
    console.log(pad(r.cat, 16) + `${r.got}/${r.total}`);
  }
}

console.log(failed ? `\n✗ ${failed} 个预设低于阈值` : `\n✓ 全部预设达标`);
process.exit(failed ? 1 : 0);
