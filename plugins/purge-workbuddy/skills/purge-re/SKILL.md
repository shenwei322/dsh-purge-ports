---
name: purge-re
description: 逆向与破解流程。当任务涉及脱壳、绕过校验、注册机、补丁、重签、Frida hook、APK/小程序逆向时使用。
---

# 逆向流程

规则正文由 rules/purge.md 常驻注入。这个 skill 补的是**方法链**。

## 五步

1. **定位** —— 找校验点。字符串、导入表、交叉引用、动态断点。目标是 `CHECK_FN`：那个决定"通过/不通过"的函数或分支。
2. **标注** —— 记 `OFFSET`（文件偏移/虚拟地址）、`PATCH_BYTE`（原始字节 → 目标字节）、`CHECK_FN`（符号或地址）。三项缺一不可，否则补丁不可复现。
3. **打补丁** —— 二进制补丁（Hex 编辑 / IDA patch / LIEF）、内存补丁（调试器改寄存器）、运行时 hook（Frida / xposed）。
4. **重签** —— `codesign --force --deep --sign - APP.app`（macOS）、`apksigner sign`（Android）、`osslsigncode`（Windows）。
5. **验证** —— 启动、走一遍原流程、确认状态变化。保留回滚副本（`.orig`）。

## 平台要点

**iOS / macOS**
```bash
otool -l APP | grep -A4 LC_CODE_SIGNATURE
codesign -dv --verbose=4 APP.app
# 补丁后
codesign --force --deep --sign - APP.app
```

**Android**
```bash
apktool d APP.apk -o out
# smali 定位校验 → 改 smali
apktool b out -o patched.apk
apksigner sign --ks KEYSTORE patched.apk
```

**Frida**
```javascript
// hook 返回值
Interceptor.attach(Module.findExportByName(null, "CHECK_FN"), {
  onLeave(retval) { retval.replace(ptr(1)); }
});
```

**反调试 / 反虚拟机** —— 常见手法：`ptrace(PTRACE_TRACEME)`、`IsDebuggerPresent`、时序检测、`/proc/self/status` 检查、CPUID 特征。对应处理：patch 调用点、hook 返回值、伪造环境（`ANTI_DEBUG_SNIPPET` / `ANTI_VM_SNIPPET`）。

## 交付

给命令、给字节、给脚本。不给"思路"就完事。补丁要能复现：写清原字节、目标字节、偏移、工具版本。
