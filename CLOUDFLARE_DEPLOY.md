# Cloudflare Pages 部署说明

这个项目是纯静态站点，可以直接部署到 Cloudflare Pages。仓库已添加 GitHub Actions：

```text
.github/workflows/deploy-cloudflare-pages.yml
```

## GitHub 配置

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 里配置：

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | Secret 或 Variable | Cloudflare User API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Secret 或 Variable | Cloudflare Account ID |
| `CLOUDFLARE_PAGES_PROJECT` | Variable，可选 | Pages 项目名，默认 `codingplan` |

API Token 建议在 `My Profile -> API Tokens` 里创建 User API Token，不要用 Account-owned token。Wrangler 在 CI 里会读取用户 membership 信息，Account-owned token 可能报 `Authentication error [code: 10000]` 或提示缺少 `User -> Memberships -> Read`。

推荐最小权限：

| Scope | Permission | Access |
| --- | --- | --- |
| Account | Cloudflare Pages | Edit |
| Account | Account Settings | Read |
| User | User Details | Read |
| User | Memberships | Read |

Account Resources 选择你的 Cloudflare account。workflow 会在部署前检查 Pages 项目是否存在；如果不存在，会执行：

```bash
wrangler pages project create codingplan --production-branch main
```

如果你设置了 `CLOUDFLARE_PAGES_PROJECT`，则会创建对应项目名。

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
