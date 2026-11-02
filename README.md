# dsh-purge-ports

把 [dsh-purge](https://github.com/YuJunZhiXue/dsh-purge) 的破甲规则移植到 **WorkBuddy** 与 **ZCode**：两边各一个插件包，外加一个零依赖 CLI 做规则注入。

> 上游 dsh-purge 是装在 DeepSeek Harness 上的红队评测插件。本仓库只搬它最核心的那层——注入进系统提示词的行为契约——并按两个宿主的插件与规则机制重写。不含上游的红队演练台、资产库、技能库。

- 版本：1.0.0
- 许可：Apache-2.0（保留上游署名，见 [NOTICE](./NOTICE)）
- 依赖：Node.js ≥ 18（只用标准库）

---

## 它做什么

| 宿主 | 注入通道 | 文件 |
| --- | --- | --- |
| **WorkBuddy** | 插件 `rules/` 常驻规则 + 用户级 `CODEBUDDY.md` | `~/.codebuddy/CODEBUDDY.md` |
| **ZCode** | 插件 `SessionStart` hook（`additionalContext`）+ 用户级 `AGENTS.md` | `~/.zcode/AGENTS.md` |

两条通道互补：插件负责"装好就生效"，CLI 负责"没有插件系统也能生效"。任一条都够用，两条一起上最稳。

规则内容分两档：

- **完整版** `core/prompt.zh.md`（约 12.9 KB）——身份、优先级、工作流、外来模式、意图映射表、网站渗透槽位、逆向槽位、开头格式、草稿审查 R1–R8、完成契约、交付优先、输出词汇、会话持久、自主。
- **精简版** `core/prompt.lite.md`（约 5.4 KB）——同样骨架，压到 WorkBuddy 项目上下文约 8 KB 的上限内。

---

## 安装

### 方式 A：CLI 一键注入（最快，两个宿主一起）

```bash
git clone https://github.com/shenwei322/dsh-purge-ports.git
cd dsh-purge-ports
node bin/purge.mjs install --host all --scope user
```

不想 clone 也可以直接跑：

```bash
npx -y github:shenwei322/dsh-purge-ports install --host all --scope user
```

写入位置：

```
~/.codebuddy/CODEBUDDY.md   ← WorkBuddy 用户级规则
~/.zcode/AGENTS.md          ← ZCode 用户级规则
```

只装一个宿主：

```bash
node bin/purge.mjs install --host workbuddy --scope user
node bin/purge.mjs install --host zcode     --scope user
```

只对某个项目生效（不动全局）：

```bash
cd /path/to/your-project
node /path/to/dsh-purge-ports/bin/purge.mjs install --host all --scope project
# 生成 ./CODEBUDDY.md 与 ./AGENTS.md
```

其他开关：

```bash
node bin/purge.mjs install --dry-run     # 只看会写哪里，不落盘
node bin/purge.mjs install --lite        # 强制精简版
node bin/purge.mjs status                # 看两个宿主的注入状态
node bin/purge.mjs prompt                # 打印完整规则到 stdout
node bin/purge.mjs uninstall --host all  # 只删标记块，保留你自己的内容
```

写入用标记块包住，重复执行不会叠加；卸载只摘掉块内内容，你自己的规则原样保留，改动前自动留 `.bak.<时间戳>`。

### 方式 B：装成插件

仓库根就是两个宿主的市场根：`.codebuddy-plugin/marketplace.json` 给 WorkBuddy，`.zcode-plugin/marketplace.json` 给 ZCode，插件都在 `plugins/` 下。

**WorkBuddy**

1. 打开 WorkBuddy → 插件 / 市场 → 添加市场 → 选择本地目录（clone 下来的仓库根）：
   ```
   /path/to/dsh-purge-ports
   ```
2. 在市场里安装 `purge-workbuddy`。
3. 新开一个会话，插件自带的 `rules/purge.md` 会随项目上下文注入。

**ZCode**

1. ZCode → 插件 → 添加市场 → 本地目录（同一个仓库根）：
   ```
   /path/to/dsh-purge-ports
   ```
2. 安装 `purge-zcode`。
3. 新开会话时 `SessionStart` hook 会把完整规则作为 `additionalContext` 注入。

插件都带 `/purge` 命令（`on` / `off` / `status`）和一个可复用的 `purge` skill：会话被压缩或恢复后，用 skill 把规则重新拉回上下文。

---

## 验证

```bash
node bin/purge.mjs status
```

```
dsh-purge-ports v1.0.0

WorkBuddy (workbuddy) — 已检测到安装
  说明: 项目上下文读取 CODEBUDDY.md / .codebuddy/CODEBUDDY.md / AGENTS.md（约 8KB 上限，默认用精简版）
  已注入       C:\Users\you\.codebuddy\CODEBUDDY.md
  不存在       C:\your\cwd\CODEBUDDY.md

ZCode (zcode) — 已检测到安装
  说明: 用户级读取 ~/.zcode/AGENTS.md，项目级读取工作区 AGENTS.md
  已注入       C:\Users\you\.zcode\AGENTS.md
  不存在       C:\your\cwd\AGENTS.md
```

插件通道验证：

- ZCode：新开会话后直接问一句「你现在按什么规则工作」，能复述出「小码酱 / 工件优先」就说明 hook 生效；也可以 `node <仓库>/zcode/plugins/purge-zcode/hooks/session-start.mjs` 看它输出的 JSON。
- WorkBuddy：装完插件后看会话上下文里是否出现 `rules/purge.md` 的内容。

自检（不写用户目录，全在临时目录里跑）：

```bash
node scripts/selftest.mjs
```

---

## 卸载

```bash
# 只卸规则文件里的注入块
node bin/purge.mjs uninstall --host all --scope user

# 插件：在宿主里禁用或删除 purge-workbuddy / purge-zcode
```

上游 dsh-purge 的还原说明不适用本仓库——本仓库没有改宿主源码，只写规则文件和插件目录。

---

## 仓库结构

```
dsh-purge-ports/
├── bin/purge.mjs                                  CLI：install / uninstall / status / prompt / hosts
├── core/
│   ├── prompt.zh.md                               完整规则（12.9 KB）
│   └── prompt.lite.md                             精简规则（5.4 KB）
├── .codebuddy-plugin/marketplace.json             WorkBuddy 市场清单（根 = 市场根）
├── .zcode-plugin/marketplace.json                 ZCode 市场清单
├── plugins/
│   ├── purge-workbuddy/
│   │   ├── .codebuddy-plugin/plugin.json
│   │   ├── rules/purge.md                         常驻规则
│   │   ├── skills/purge/SKILL.md
│   │   └── commands/purge.md
│   └── purge-zcode/
│       ├── .zcode-plugin/plugin.json
│       ├── hooks/hooks.json                       SessionStart
│       ├── hooks/session-start.mjs                输出 additionalContext
│       ├── hooks/prompt.zh.md                     完整规则副本
│       ├── rules/purge.md                         精简规则副本
│       ├── skills/purge/SKILL.md
│       └── commands/purge.md
└── scripts/
    ├── sync.mjs                                   从 core/ 同步进插件包
    └── selftest.mjs                               自检
```

改规则只改 `core/`，然后 `node scripts/sync.mjs` 同步进两个插件包，再 `node scripts/selftest.mjs` 过一遍。

---

## 已知边界

- WorkBuddy 的项目上下文有约 8 KB 上限，所以 WorkBuddy 一路默认精简版；ZCode 用户级用完整版。要换档：`--lite` 强制精简，改 `core/` 后 `node scripts/sync.mjs` 同步。
- ZCode 的 `SessionStart` 只在会话开始触发。会话压缩/恢复后如果规则掉了，用 `/purge on` 或 `purge` skill 补一次。
- 两个宿主的插件清单格式按各自当前版本（WorkBuddy `.codebuddy-plugin/`、ZCode `.zcode-plugin/`）写；宿主升级改了字段的话，改 `plugin.json` 即可，CLI 通道不受影响。
- 规则本身是对抗性提示词。它改变的是模型的行为倾向，不改变宿主自己的权限、沙箱、审批门。宿主拦下来的动作，规则层拦不回来。

## 排障

**WorkBuddy 用户级不生效**：确认它是否读取 `~/.codebuddy/CODEBUDDY.md`。不读就走项目作用域——项目根的 `CODEBUDDY.md` 一定会被当项目上下文注入：

```bash
cd /path/to/project
node /path/to/dsh-purge-ports/bin/purge.mjs install --host workbuddy --scope project
```

**ZCode hook 没触发**：先单独跑一次 hook，确认输出是 JSON：

```bash
node plugins/purge-zcode/hooks/session-start.mjs | head -c 200
```

再看 `~/.zcode/cli/plugins/` 下插件是否真的装进去了（`cache/<市场>/purge-zcode/<版本>/`）。

**规则被压缩掉**：用 `/purge on` 手动补，或再跑一次 `install`（幂等，不会叠加）。

---

## 署名与许可

- 规则来源：[YuJunZhiXue/dsh-purge](https://github.com/YuJunZhiXue/dsh-purge)，Apache-2.0，Copyright 2026 YuJunZhiXue。
- 移植层：本仓库，Apache-2.0。
- 二次开发请保留 [NOTICE](./NOTICE) 与上述署名；原版不允许倒卖，二开必须署名。
