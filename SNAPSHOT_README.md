# 套餐页面快照采集说明

这个工具用于把需要登录后才能查看的套餐页保存成本地轻量 HTML 快照，然后在 `index.html` 里通过“预览”按钮用 iframe 打开。

## 数据覆盖逻辑

`plans.json` 保持为原始套餐数据，尽量不写入本地专用字段。`patch.json` 保存本地覆盖值，例如去掉 referer 后的官方直链、`snapshot`、`snapshotSource`、`snapshotCapturedAt`。首页加载时会先读取 `plans.json`，再用 `patch.json` 里同一个 `平台|套餐|类型` 的字段覆盖原值。

抓取脚本也使用同样的合并逻辑：筛选和打开页面时使用合并后的链接，保存快照时只更新 `patch.json`。

## 安装依赖

```bash
python3 -m pip install playwright
python3 -m playwright install chromium
```

## 命令逻辑

推荐手动启动 Playwright 安装的 Chromium 登录，不走 Playwright 自动化的 `login` 流程。关键是给这个浏览器指定同一个用户数据目录 `.playwright-snapshot-profile`。

先找到 Playwright Chromium：

```bash
PW_CHROME=$(find "$HOME/.cache/ms-playwright" -type f \( -path "*/chrome-linux/chrome" -o -path "*/chrome-linux64/chrome" \) | sort | tail -1)
printf '%s\n' "$PW_CHROME"
```

然后用它手动打开页面：

```bash
"$PW_CHROME" \
  --user-data-dir="$PWD/.playwright-snapshot-profile" \
  --remote-debugging-port=9222 \
  --new-window 'https://example.com/pricing'
```

这个 Chromium 窗口可以在登录期间一直开着。你在里面逐个完成登录后，登录状态会保存在 `.playwright-snapshot-profile/`，这个目录已经加入 `.gitignore`。使用 `get-cdp` 时不要关闭这个窗口，脚本会连接这个已经打开的浏览器读取页面。

`get-cdp` 会连接已经手动打开的 9222 浏览器，读取当前标签页、保存 HTML 快照，并默认回写 `patch.json`。它不会重新启动浏览器，也不会重新访问登录页。

```bash
scripts/capture_snapshots.py get-cdp --url 'https://example.com/pricing' --wait 5
```

建议优先使用脚本里的内置平台抓取配方。配方会自动设置 URL、打开标签页、等待、点击需要的按钮、抓取并关闭标签页：

```bash
scripts/capture_snapshots.py get-cdp --name '讯飞·星火'
```

当前已有配方：

```bash
scripts/capture_snapshots.py get-cdp --name '智谱AI'
scripts/capture_snapshots.py get-cdp --name '智谱国际版'
scripts/capture_snapshots.py get-cdp --name '讯飞·星火'
```

其他平台也按这个模式扩展到 `scripts/capture_snapshots.py` 顶部的 `SNAPSHOT_WORKFLOWS` 配方表里。配方里的步骤等待时间默认至少 5 秒。

如果没有开 9222，也可以用旧的 `get` 让 Playwright 自己打开页面，但遇到风控踢登录时优先用 `get-cdp`。

保存前会做清洗：

- 删除 JavaScript、图片、视频、iframe 等非必要资源。
- 删除 `href`、`action`、`formaction` 等属性里的 `http://` / `https://` 外链，避免快照里继续跳转到外部网站。
- 将页面文本、属性、内联 CSS 里的 `wangyi160` 替换成 `xxx`。

生成的快照路径类似：

```text
snapshots/plans/xxx/index.html
```

快照目录按 URL 生成。同一个 URL 下的 Lite / Pro / Max 会共用同一个快照目录；再次运行 `get` 时，会先清空这个 URL 对应的旧快照目录，再写入新的 `index.html`。如果 `patch.json` 里原来记录的是旧目录名，`get` 会改成新的 URL 目录名，并删除旧的已记录目录。

回写到 `patch.json` 后会出现：

```json
"snapshot": "snapshots/plans/xxx/index.html"
```

刷新首页后，对应套餐会出现“预览”按钮。

## 当前首页链接手动打开命令表

下面这些链接来自 `plans.json` 与 `patch.json` 合并后的 `action` 字段，也就是首页套餐名点击会打开的链接。同一链接下有多个套餐时，只需要登录一次。

| 平台 | 套餐 | 手动打开命令 |
| --- | --- | --- |
| 智谱AI | Lite、Pro、Max | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://www.bigmodel.cn/glm-coding'` |
| 智谱国际版 | Lite、Pro、Max | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://z.ai/subscribe'` |
| MiniMax | Starter、Plus、Max、Plus-极速、Max-极速、Ultra | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://platform.minimaxi.com/subscribe/token-plan'` |
| 讯飞·星火 | 专业版、高效版 | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://maas.xfyun.cn/packageSubscription'` |
| Kimi | Andante、Moderato、Allegretto、Allegro | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://www.kimi.com/code'` |
| 字节·方舟 | Lite、Pro | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://www.volcengine.com/activity/codingplan'` |
| 字节·方舟 | Small、Medium、Large、Max | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://www.volcengine.com/activity/agentplan'` |
| 阿里·百炼 | 标准、高级、尊享 | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://cn.aliyun.com/benefit/scene/tokenplan'` |
| 阿里·百炼 | Lite、Pro | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://cn.aliyun.com/benefit/scene/codingplan'` |
| 小米·MiMo | Lite、Standard、Pro、Max | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://mimo.mi.com/'` |
| 联通云 | Lite、Pro | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://console.cucloud.cn/console/cuig/subscribePlan/coding'` |
| 联通云 | 个人 Lite、个人 Pro、个人 Max、团队 Lite、团队 Pro、团队 Max | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://console.cucloud.cn/console/cuig/subscribePlan/token'` |
| 百度·千帆 | Lite、Pro | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://cloud.baidu.com/product/codingplan.html'` |
| 京东云 | Lite、Pro | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://www.jdcloud.com/cn/pages/codingplan'` |
| 腾讯云 | Lite、Pro | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://cloud.tencent.com/act/redirect?page=codingplan'` |
| 腾讯云 | Lite、Standard、Pro、Max | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://cloud.tencent.com/act/pro/tokenplan'` |
| 优云智算 | Mini、Lite、Basic、Pro、Max、Ultra | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://passport.compshare.cn/register'` |
| 阶跃星辰 | Flash Mini、Flash Plus、Flash Pro、Flash Max | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://platform.stepfun.com/step-plan'` |
| 天翼云 | GLM Lite、GLM Pro、GLM Max | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://ctxirang.ctyun.cn/maas/codingPlan'` |
| 移动云 | Lite、Pro | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://api.dreamfree.space/c/s/cpyqmobilecp'` |
| 超算 | Lite、Pro | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://www.scnet.cn/ui/console/index.html'` |
| 无问芯穹 | Lite、Pro | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://cloud.infini-ai.com/genstudio/code'` |
| 摩尔线程 | Free Trial | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://coding-plan.kuaecloud.net/free_apply'` |
| 摩尔线程 | Lite Plan、Pro Plan、Max Plan | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://cfe.m.jd.com/privatedomain/risk_handler/03101900/?returnurl=https%3A%2F%2Fitem.jd.com%2F10210423833387.html'` |
| 商汤·日日新 | Free·公测 | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://www.sensenova.cn/token-plan'` |
| OpenCode | Go | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://opencode.ai/zh/go'` |
| Ollama | Pro、Max | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://ollama.com/pricing'` |
| Codex | Plus、Pro *5、Pro *20 | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://chatgpt.com/'` |
| Claude | Pro、Max *5、Max *20 | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://claude.ai/upgrade?from=menu'` |
| GitHub | 学生 | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://github.com/education/students'` |
| GitHub | Pro | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://github.com/login?return_to=https%3A%2F%2Fgithub.com%2Fgithub-copilot%2Fpro%2Fsignup'` |
| GitHub | Pro+ | `"$PW_CHROME" --user-data-dir="$PWD/.playwright-snapshot-profile" --new-window 'https://github.com/login?return_to=https%3A%2F%2Fgithub.com%2Fgithub-copilot%2Fpro-plus%2Fsignup'` |

## 登录后抓取

登录完成后，可以按 URL 抓取当前已打开标签页：

```bash
scripts/capture_snapshots.py get-cdp --url 'https://www.kimi.com/code' --wait 5
```

也可以按平台批量抓取；对应 URL 需要已经在 9222 浏览器里打开：

```bash
scripts/capture_snapshots.py get-cdp --vendor MiniMax --wait 5
```

常用参数：

| 参数 | 作用 |
| --- | --- |
| `--name '讯飞·星火'` | 使用内置平台抓取配方，自动设置 URL、打开标签、点击和等待 |
| `--wait 5` | 页面打开后额外等待 5 秒，适合套餐内容异步加载的页面 |
| `--cdp-endpoint http://127.0.0.1:9222` | 指定要连接的 CDP 浏览器地址，默认就是这个 |
| `--open-tab` | 在 9222 浏览器里新开标签并打开 `--url` |
| `--reload` | 重新加载已经匹配到的标签页 |
| `--close-tab` | 抓取完成后关闭标签页；内置配方默认会关闭 |
| `--before-click-wait 5` | 首次点击前等待 5 秒 |
| `--click-text '订阅新套餐'` | 抓取前点击精确匹配的可见文本，可重复传 |
| `--click-selector '.xxx'` | 抓取前点击 CSS 选择器，可重复传 |
| `--after-click-wait 5` | 每次点击后等待 5 秒 |
| `--limit 1` | 只抓取一个唯一链接，调试时好用 |
| `--no-write-plans` | 只保存快照，不回写 `patch.json` |
| `--channel chrome` | 只有你改用系统 Chrome 手动登录时才需要；使用 Playwright Chromium 手动登录时不要加 |
