# AGENTS.md

给自动化代理 / AI 助手看的约定。人类读 [README.md](README.md) 就够了。

这里记的都是**踩过坑才写下来的规则**，不是风格偏好。违反它们会真的把事情弄坏。

## 仓库结构

```
vocab/     词表数据。唯一需要手动编辑的是 <exam>/_src.psv
其余       背单词网页（React + TypeScript，构建用 Vite+）
```

## 工具链：Node 与包管理器由 Vite+ 托管

本机 Node 通过 Vite+ 安装并托管，`node` / `npm` 等命令都是 `~\AppData\Local\vite-plus\bin` 下的 VP shim。**不要另行安装 Node、nvm、pnpm、yarn 或 bun。**

```bash
vp env doctor     # 体检：shim、PATH、版本解析
vp env current    # 当前生效的 Node
vp env list       # 本机已安装的运行时与包管理器
vp env which npm  # 某个命令实际解析到哪个二进制
```

### 装依赖必须走 `vp`，不要直接敲 `npm`

```bash
vp install              # 相当于 npm install
vp add <pkg>            # 加依赖
vp add -D <pkg>         # 加开发依赖
vp remove <pkg>         # 删依赖
```

直接敲 `npm install` 会失败：

```
npm error code EBADDEVENGINES
Invalid semver version "12.0.2" does not match "11.19.0" for "packageManager"
```

裸 `npm` 解析到的是 Node 自带的 npm 11.19.0，而 `package.json` 的 `devEngines.packageManager` 要求 12.0.2。`vp` 会先解析出正确的 npm 再转发。

需要给 npm 传原生参数时，取托管的那个二进制直接调用：

```bash
NPM=$(vp env which npm | head -1)
"$NPM" install --package-lock-only
```

### 不要动 `devEngines.packageManager`

`package.json` 里的 `devEngines.packageManager`（`npm@12.0.2`，`onFail: "download"`）是 `vp create` 脚手架写入的默认配置。**保持原样，不要删、不要改、不要手动 pin。** 曾经有人（我）把它删掉试图绕开 EBADDEVENGINES，那是错的方向。

### 不要在本机留下同一工具的多个版本

VP 的 shim 有个行为要特别注意：**敲一个当前没有选定版本的包管理器命令（例如 `pnpm -v`），VP 会直接从 registry 拉一个最新版装到 `~\AppData\Local\vite-plus\data\package_manager\` 下。** 探测环境时极易误触发。

```bash
vp env list                      # 先看装了什么
vp env uninstall pnpm@12.5.1     # 卸载指定版本
vp env clean                     # 清理所有未使用的运行时与缓存
```

判断标准：**脚手架默认行为装的东西保留，自己误触发装的清掉。** 对照 `data/package_manager/` 下各目录的时间戳可以区分谁装的。

### 关于「npm 到底有没有」

`vp env doctor` 在未选定包管理器时显示 `Package manager: not selected`，`vp env list` 显示 `npm — No versions installed`。这**不表示没有 npm**。VP 把 npm 分两种身份：

|                 | 位置                              | 说明                                                      |
| --------------- | --------------------------------- | --------------------------------------------------------- |
| Node 自带的 npm | `data\js_runtime\node\<ver>\`     | 跟 Node 运行时一起来，VP 不单独管理，`vp env list` 不显示 |
| VP 托管的 npm   | `data\package_manager\npm\<ver>\` | 可被 pin / 独立安装，与 pnpm、yarn 平级                   |

没有任何 pin 时 `npm` shim 回落到 Node 自带的那个。本项目因为有 `devEngines.packageManager`，`vp` 会解析到托管的 `npm@12.0.2`。

## `package-lock.json` 必须指向官方 registry

本机 npm 可能配了国内镜像（`~/.npmrc` 里的 `registry`）。镜像下生成的 lockfile 会把 `resolved` 写成镜像域名，**CI 用默认 registry 会直接拒绝**：

```
npm error code EALLOWREMOTE
Refusing to fetch "https://repo.huaweicloud.com/...
```

所以 lockfile 里的 `resolved` 必须是 `https://registry.npmjs.org`。改动依赖后检查：

```bash
grep -oE '"resolved": "https?://[^/]+' package-lock.json | sort | uniq -c
```

发现镜像域名就整体替换回官方域名。`integrity` 是内容哈希，镜像和官方的包字节相同，不需要改；替换完跑一次 `npm ci` 验证。

本地安装不会因此变慢：npm 的 `replace-registry-host` 默认会把官方域名换成你配置的镜像。

## 生成产物：绝对不要手改

| 路径                                        | 由什么生成                                       |
| ------------------------------------------- | ------------------------------------------------ |
| `public/data/*.json`                        | `vp run build:data`（源头是 `vocab/*/_src.psv`） |
| `public/icon-*.png`、`public/favicon.svg`   | `vp run build:icons`                             |
| `vocab/*/*-vocab.tsv`、`vocab/*/*-vocab.md` | `bash vocab/tools/build.sh`                      |
| `dist/`                                     | `vp build`                                       |

**改词表的正确流程**：编辑 `vocab/<exam>/_src.psv`，然后

```bash
bash vocab/tools/build.sh   # 重新生成 .tsv 与 .md
vp run build:data           # 重新生成网页用的 .json
```

漏掉第二步会导致网页数据与词表不一致，CI 会用 `git diff --exit-code public/data` 拦下来。

### `.prettierignore` 的两条排除有实际原因

- `public/data/` —— 刻意保持紧凑格式，被 `vp fmt` 美化后体积涨三成（273 KB → 368 KB）
- `vocab/` —— `*-vocab.md` 是生成物；词表 README 里的分数对照表含转义竖线，重排有风险

## 短语音标要手写，不要逐词拼接

`scripts/build-ipa.ts` 只查单个词，刻意跳过多词条目。不要让它"顺手"把短语也拼出来——
逐词拼接的音标每个词都带主重音、功能词不弱读，是错的，而且会把 `SOUND`
模块要练的弱读教反。

短语和词典查不到的词写在 `vocab/tools/ipa-en-manual.tsv`，按连读实际读法转写
（功能词弱读），`build:data` 合并时优先于词典表。**新增词条后要在这里补音标**，
词条文本须与 `_src.psv` 第 3 列逐字一致，否则静默匹配不上。

`vocab/tools/ipa-en.tsv` 是生成物但**允许手工修正**，改词表时不要整表重跑覆盖掉人工改动，
先确认没有手工条目。

## 朗读：发音由声音决定，不由 `lang` 决定

`utterance.lang = "en-US"` 只是挑声音的提示。系统里没有英语声音时，浏览器会不报错地
退回默认声音（中文 Windows 上是 Huihui 这类中文声音），按中文的规则念英语单词。所以 `src/lib/speech.ts` 在「系统报告了声音、但没有目标语言的」
时直接报错不读，**不要为了“总能出声”把这个拦截去掉**。声音列表为空时（Chrome 首次、
部分 WebView）无法判断，照常交给引擎。

界面上用 `VoicePicker` 摆出当前声音（名字 · 口音 · 在线/离线），用户选的存在
`settings.voices`。`localService === false` 是浏览器联网合成的声音（Edge 的 Online、
Chrome 的 Google），朗读的文字会发到对方服务器。

Edge 名字带 **Multilingual** 的声音（Vivienne、Remy 等）**不认 `lang`**，自己猜文本语言，
table、grand 这类英法同形的单词会被随机读成英语。它们排在同口音最后、界面上标出提醒，
不要为了“音色更好”把它们调成默认。

**不要按具体声音名写死名单**（比如“Thierry、Sylvie 会读错”）：那只反映某台设备某次实测，
换平台、声音更新后就过时，维护不了。只用名字里的通用标识（Multilingual）和浏览器给的属性判断，
也不要加让用户手动标记声音的开关。`utterance.lang` 始终取所选声音的 `lang`，不要写死。

## 分享图片时只放 `files`

`navigator.share()` 的 payload 里**不要同时带 `text` 或 `title`**。微信、QQ 这类接收方
一旦看到有文字，就只把那段文字发出去，图片整个被丢掉——表现是「点了分享却只发出去一句话」，
而且浏览器不报任何错。想配文案让用户自己在聊天框里打。

另外图片必须在对话框打开时就画好，点按钮时**同步**调 `share()`。先 `await` 生成图片再分享，
Safari 会认为不在用户手势里而拒绝。

## 提交前必须跑

```bash
vp check        # 格式 + lint + 类型检查
vp test --run   # 全部单测与界面测试
```

改了 `src/lib/scheduler.ts` 的系数，测试会告诉你有没有破坏「新词 > 错词 > 熟词」的权重关系。

## 打卡日志的两条约束

`src/lib/activity.ts` 与 `store.ts` 的 `daily` 是首页统计和分享图的唯一数据源。

1. **日期一律按本地时区切分**，用 `dayKey()`，不要图省事写 `toISOString().slice(0, 10)`——
   那是 UTC，东八区凌晨零点到八点背的词会被算进前一天，连续打卡天数跟着一起错。
2. **学习时长靠「两次操作之间的间隔」累加**，不是进入词表到退出的墙上时间，
   否则中途接个电话就白送半小时。间隔超过 `IDLE_GAP_MS`（60 秒）整段丢弃，
   所以 `useStudyClock` 的心跳间隔必须明显小于它；把心跳调长到 60 秒以上，
   正常翻卡的时长会被整段当成走神丢掉，统计里只剩 0 分钟。

## CI 注意事项

`.github/workflows/deploy.yml` 里有两处是踩坑换来的，改动前先看注释：

1. **`setup-node` 不能用 `cache: npm`** —— 它会在仓库目录里执行 `npm config get cache`，用的是 runner 自带的旧版 npm，那一下就先撞 `EBADDEVENGINES`。缓存改用 `actions/cache` 单独做。`setup-node` v5 起检测到 `packageManager` 字段会自动开缓存，效果一样，所以还要显式写 `package-manager-cache: false`。
2. **升级 npm 的那步要在仓库目录外执行**（`working-directory: ${{ runner.temp }}`），否则命令本身也会去读 `package.json` 的 `devEngines`。

## 部署

推到 `main` 自动部署到 GitHub Pages。`vite.config.ts` 里 `base: "./"` 是刻意的——相对路径让同一份产物在 Pages 子路径、自定义域名和本地 `vp preview` 下都能跑，不要改成写死仓库名。

Pages 站点已经启用（`build_type: workflow`）。workflow 里的 `configure-pages` 不带 `enablement`，因为 workflow 的 GITHUB_TOKEN 没有创建 Pages 站点的权限，需要用仓库管理员权限单独开一次。
