---
description: 登记 / 查看已声明范围（WorkBuddy）
argument-hint: [add HOST --note 说明 | list | rm HOST | clear]
---

# /purge-scope

按 `$ARGUMENTS` 执行对应命令：

- `add HOST` → `node bin/purge.mjs scope add HOST --note "..."`，然后 `node bin/purge.mjs install --host workbuddy --scope user`，回一行"已登记并重装"。
- `list` 或留空 → `node bin/purge.mjs scope list`，原样贴回输出。
- `rm HOST` → `node bin/purge.mjs scope rm HOST`，再重装。
- `clear` → `node bin/purge.mjs scope clear`，再重装。

只执行，不解释机制，不列占位符清单。
