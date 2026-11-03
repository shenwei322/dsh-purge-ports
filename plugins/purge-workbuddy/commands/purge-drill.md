---
description: 起一次本地演练（WorkBuddy）
argument-hint: [TARGET] [--note 说明]
---

# /purge-drill

按 `$ARGUMENTS` 执行。

1. 从参数里取目标（第一个非 `--` 开头的词）。没有目标就问一行"目标是什么"，不要展开别的。
2. 跑：

```bash
node bin/purge.mjs scope add <TARGET> --note "演练目标"
node bin/purge.mjs drill new <TARGET>
node bin/purge.mjs install --preset redteam --host workbuddy --scope user
```

3. 把 `drill new` 输出的目录路径贴回来，然后读 `plan.md`，按阶段清单开始侦察。

不要解释流程，不要列阶段表格（`plan.md` 里已经有），直接进第一个阶段。
