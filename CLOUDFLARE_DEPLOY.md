# Cloudflare Pages 部署说明

这个项目是纯静态站点，可以直接部署到 Cloudflare Pages。仓库已添加 GitHub Actions：

```text
.github/workflows/deploy-cloudflare-pages.yml
```

## GitHub 配置

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 里配置：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret 或 Variable | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Secret 或 Variable | Cloudflare Account ID |
| `CLOUDFLARE_PAGES_PROJECT` | Variable，可选 | Pages 项目名，默认 `codingplan` |

API Token 需要能部署 Cloudflare Pages。Pages 项目名如果不存在，建议先在 Cloudflare Dashboard 创建一个 `codingplan` Pages 项目，再让 GitHub Actions 部署。

## 部署流程

推送到 `main` 后会自动部署：

```bash
git push origin main
```

也可以在 GitHub Actions 页面手动运行 `Deploy codingplan to Cloudflare Pages`。

## 快照同步

快照仍然在本地抓取，然后随 Git 同步到 Cloudflare：

```bash
scripts/capture_snapshots.py get-cdp --name '讯飞·星火'
git add plans.json snapshots/plans
git commit -m "update snapshot: 讯飞·星火"
git push origin main
```

Cloudflare Pages 只托管最终静态文件，不会在云端登录或抓取快照。

## 公网注意

部署到 Cloudflare Pages 后，`snapshots/` 里的快照就是公网可访问内容。推送前请确认没有手机号、API Key、余额、订单等敏感信息。
