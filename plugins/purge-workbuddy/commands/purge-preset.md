---
description: 切换规则预设（WorkBuddy）
argument-hint: [default|lite|redteam|writer|terse]
---

# /purge-preset

按 `$ARGUMENTS` 执行：

- 留空 → `node bin/purge.mjs presets`，把表格贴回。
- 给了名字 → `node bin/purge.mjs install --preset <名字> --host workbuddy --scope user`，回一行"已切到 <名字>"。

预设用途：

| 预设 | 体积 | 场景 |
| --- | --- | --- |
| default | 15.7 KB | 完整契约，日常默认 |
| lite | 7.0 KB | 想省 token 又要全能力 |
| redteam | 5.5 KB | 演练：加六阶段流程、证据纪律、报告结构 |
| writer | 4.8 KB | 写作/角色扮演：露骨度档位、连续性护栏 |
| terse | 2.6 KB | 弱模型、超长上下文 |

切换后新开会话生效。不解释预设内容，只报切换结果。
