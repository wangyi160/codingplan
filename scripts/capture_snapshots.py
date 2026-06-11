#!/usr/bin/env python3
"""
Login and capture lightweight local snapshots for plan pages.

Requires:
    python3 -m pip install playwright
    python3 -m playwright install chromium

Examples:
    scripts/capture_snapshots.py login --vendor MiniMax
    scripts/capture_snapshots.py get --vendor MiniMax --wait 5
    scripts/capture_snapshots.py get-cdp --url https://example.com/pricing --wait 5
    scripts/capture_snapshots.py import --url https://example.com/pricing --file saved.html
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import signal
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
PLANS_PATH = ROOT / "plans.json"
PATCH_PATH = ROOT / "patch.json"
SNAPSHOT_ROOT = ROOT / "snapshots" / "plans"
DEFAULT_PROFILE = ROOT / ".playwright-snapshot-profile"
USERNAME_REDACTIONS = ("wangyi160",)
SNAPSHOT_WORKFLOWS = {
    "智谱AI": {
        "url": "https://www.bigmodel.cn/glm-coding",
        "open_tab": True,
        "close_tab": True,
        "before_click_wait": 5,
        "after_click_wait": 5,
        "wait": 5,
    },
    "智谱国际版": {
        "url": "https://z.ai/subscribe",
        "open_tab": True,
        "close_tab": True,
        "before_click_wait": 5,
        "after_click_wait": 5,
        "wait": 5,
    },
    "讯飞·星火": {
        "url": "https://maas.xfyun.cn/packageSubscription",
        "open_tab": True,
        "close_tab": True,
        "before_click_wait": 5,
        "click_text": ["订阅新套餐"],
        "after_click_wait": 5,
        "wait": 5,
    },
}


def import_playwright():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(
            "缺少 Playwright。请先运行：\n"
            "  python3 -m pip install playwright\n"
            "  python3 -m playwright install chromium",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return sync_playwright


def slugify(*parts: str) -> str:
    raw = "-".join(part for part in parts if part)
    ascii_part = re.sub(r"[^a-zA-Z0-9]+", "-", raw).strip("-").lower()
    ascii_part = re.sub(r"-{2,}", "-", ascii_part)[:56].strip("-")
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:10]
    if not ascii_part:
        ascii_part = "snapshot"
    return f"{ascii_part}-{digest}"


def snapshot_slug(url: str) -> str:
    parsed = urlparse(url)
    path_part = parsed.path.strip("/") or "home"
    raw_label = "-".join(part for part in (parsed.netloc, path_part) if part)
    label = re.sub(r"[^a-zA-Z0-9]+", "-", raw_label).strip("-").lower()
    label = re.sub(r"-{2,}", "-", label)[:56].strip("-") or "snapshot"
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:10]
    return f"{label}-{digest}"


def safe_remove_snapshot_dir(path: Path) -> None:
    resolved_root = SNAPSHOT_ROOT.resolve()
    resolved_path = path.resolve()
    if resolved_path == resolved_root or resolved_root not in resolved_path.parents:
        raise ValueError(f"Refusing to remove path outside snapshot root: {path}")
    if resolved_path.exists():
        shutil.rmtree(resolved_path)


def clean_css(css: str) -> str:
    # Drop font/image-like url() references so the snapshot stays lightweight.
    cleaned = re.sub(r"url\((?!['\"]?data:text/)[^)]+\)", "none", css, flags=re.IGNORECASE)
    cleaned = re.sub(r"@import\s+(?:url\()?['\"]?https?://[^;]+;", "", cleaned, flags=re.IGNORECASE)
    return redact_private_text(cleaned)


def redact_private_text(text: str) -> str:
    for value in USERNAME_REDACTIONS:
        text = re.sub(re.escape(value), "xxx", text, flags=re.IGNORECASE)
    return text


def load_plans() -> list[dict]:
    return json.loads(PLANS_PATH.read_text(encoding="utf-8"))


def plan_patch_key(plan: dict) -> str:
    return "|".join(
        [
            str(plan.get("vendor", "")),
            str(plan.get("plan", "")),
            str(plan.get("type", "Coding Plan")),
        ]
    )


def load_patches() -> dict:
    if not PATCH_PATH.exists():
        return {}
    patches = json.loads(PATCH_PATH.read_text(encoding="utf-8"))
    if not isinstance(patches, dict):
        raise ValueError(f"{PATCH_PATH.relative_to(ROOT)} must be a JSON object")
    return patches


def save_patches(patches: dict) -> None:
    PATCH_PATH.write_text(
        json.dumps(patches, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def apply_patches(plans: list[dict], patches: dict) -> list[dict]:
    return [
        {
            **plan,
            **patches.get(plan_patch_key(plan), {}),
        }
        for plan in plans
    ]


def update_plan_patch(patches: dict, plan: dict, values: dict) -> None:
    patch = patches.setdefault(plan_patch_key(plan), {})
    patch.update(values)


def matches_filters(plan: dict, args: argparse.Namespace) -> bool:
    if not plan.get("action"):
        return False
    if args.vendor and args.vendor not in str(plan.get("vendor", "")):
        return False
    if args.plan and args.plan not in str(plan.get("plan", "")):
        return False
    if args.url and args.url != plan.get("action"):
        return False
    return True


def apply_named_workflow(args: argparse.Namespace) -> None:
    if not getattr(args, "name", None):
        return

    workflow = SNAPSHOT_WORKFLOWS.get(args.name)
    if not workflow:
        available = "、".join(SNAPSHOT_WORKFLOWS)
        raise SystemExit(f"未找到快照抓取配方：{args.name}。可用 name：{available}")

    args.url = workflow["url"]
    args.vendor = None
    args.plan = None
    args.open_tab = workflow.get("open_tab", args.open_tab)
    args.reload = workflow.get("reload", args.reload)
    args.close_tab = workflow.get("close_tab", args.close_tab)
    args.before_click_wait = workflow.get("before_click_wait", args.before_click_wait)
    args.click_text = list(workflow.get("click_text", []))
    args.click_selector = list(workflow.get("click_selector", []))
    args.after_click_wait = max(5, workflow.get("after_click_wait", args.after_click_wait))
    args.wait = workflow.get("wait", args.wait)
    args.timeout = workflow.get("timeout", args.timeout)
    print(f"使用内置抓取配方：{args.name}")


def stylesheet_text(context, href: str) -> str:
    try:
        response = context.request.get(href, timeout=15000)
        if response.ok:
            return response.text()
    except Exception as exc:
        print(f"  跳过 stylesheet: {href} ({exc})")
    return ""


def sanitize_page_html(page, css_text: str, captured_at: str) -> str:
    html = page.evaluate(
        """({ cssText, capturedAt, redactions }) => {
            const root = document.documentElement.cloneNode(true);
            const externalUrlPattern = /^(https?:)?\\/\\//i;
            const externalUrlAnywherePattern = /https?:\\/\\/|\\/\\/[a-z0-9.-]+\\.[a-z]{2,}/i;
            const blockedSchemePattern = /^(mailto|tel|javascript):/i;

            function redact(value) {
                let output = String(value ?? '');
                redactions.forEach(item => {
                    output = output.replace(new RegExp(item.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'gi'), 'xxx');
                });
                return output;
            }

            root.querySelectorAll('script,noscript,img,picture,source,video,audio,canvas,iframe,object,embed,param')
                .forEach(el => el.remove());
            root.querySelectorAll('style,link')
                .forEach(el => el.remove());

            root.querySelectorAll('*').forEach(el => {
                Array.from(el.attributes).forEach(attr => {
                    const name = attr.name.toLowerCase();
                    const value = attr.value || '';
                    if (name.startsWith('on')) {
                        el.removeAttribute(attr.name);
                        return;
                    }
                    if (name === 'srcset') {
                        el.removeAttribute(attr.name);
                        return;
                    }
                    if (['href', 'action', 'formaction', 'src', 'poster', 'data', 'cite'].includes(name) && (externalUrlPattern.test(value) || blockedSchemePattern.test(value))) {
                        el.removeAttribute(attr.name);
                        if (name === 'href') {
                            el.removeAttribute('target');
                            el.removeAttribute('rel');
                            el.setAttribute('data-snapshot-link-removed', 'true');
                        }
                        return;
                    }
                    if (name.startsWith('data-') && externalUrlAnywherePattern.test(value)) {
                        el.removeAttribute(attr.name);
                        return;
                    }
                    if (name === 'style' && externalUrlAnywherePattern.test(value)) {
                        const cleanedStyle = value
                            .replace(/url\\((?!['"]?data:text\\/)[^)]+\\)/gi, 'none')
                            .replace(/@import\\s+(?:url\\()?['"]?https?:\\/\\/[^;]+;/gi, '');
                        el.setAttribute(attr.name, redact(cleanedStyle));
                        return;
                    }
                    const redacted = redact(value);
                    if (redacted !== value) el.setAttribute(attr.name, redacted);
                });
            });

            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            const textNodes = [];
            while (walker.nextNode()) textNodes.push(walker.currentNode);
            textNodes.forEach(node => {
                const redacted = redact(node.nodeValue);
                if (redacted !== node.nodeValue) node.nodeValue = redacted;
            });

            let head = root.querySelector('head');
            if (!head) {
                head = document.createElement('head');
                root.insertBefore(head, root.firstChild);
            }

            const metaCharset = document.createElement('meta');
            metaCharset.setAttribute('charset', 'UTF-8');
            head.prepend(metaCharset);

            const metaRobots = document.createElement('meta');
            metaRobots.name = 'robots';
            metaRobots.content = 'noindex';
            head.appendChild(metaRobots);

            const metaSnapshot = document.createElement('meta');
            metaSnapshot.name = 'codingplan-snapshot';
            metaSnapshot.content = `captured_at=${capturedAt}`;
            head.appendChild(metaSnapshot);

            const style = document.createElement('style');
            style.setAttribute('data-snapshot-inline', '');
            style.textContent = cssText;
            head.appendChild(style);

            return '<!doctype html>\\n' + root.outerHTML;
        }""",
        {"cssText": css_text, "capturedAt": captured_at, "redactions": USERNAME_REDACTIONS},
    )
    return redact_private_text(html)


def collect_inline_css(page) -> str:
    inline_css = page.evaluate(
        """() => Array.from(document.querySelectorAll('style'))
            .map(style => style.textContent || '')
            .join('\\n\\n')"""
    )
    return clean_css(inline_css) if inline_css else ""


def write_snapshot(output_dir: Path, html: str) -> Path:
    safe_remove_snapshot_dir(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / "index.html"
    output_file.write_text(redact_private_text(html), encoding="utf-8")
    return output_file


def snapshot_html_from_page(context, page, args: argparse.Namespace) -> str:
    if args.wait:
        page.wait_for_timeout(args.wait * 1000)
    else:
        try:
            page.wait_for_load_state("networkidle", timeout=12000)
        except Exception:
            pass

    stylesheet_hrefs = page.evaluate(
        """() => Array.from(document.querySelectorAll('link[rel~="stylesheet"]'))
            .map(link => link.href)
            .filter(Boolean)"""
    )
    css_parts = []
    for href in stylesheet_hrefs:
        css = stylesheet_text(context, href)
        if css:
            css_parts.append(clean_css(css))

    inline_css = collect_inline_css(page)
    if inline_css:
        css_parts.append(inline_css)

    css_text = "\n\n".join(css_parts)
    captured_at = datetime.now(timezone.utc).isoformat()
    return sanitize_page_html(page, css_text, captured_at)


def wait_for_page_ready(page, timeout_ms: int) -> None:
    try:
        page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
    except Exception:
        pass
    try:
        page.wait_for_load_state("networkidle", timeout=min(timeout_ms, 12000))
    except Exception:
        pass


def apply_page_interactions(page, args: argparse.Namespace) -> None:
    click_timeout = args.click_timeout * 1000
    if args.before_click_wait and (args.click_selector or args.click_text):
        page.wait_for_timeout(args.before_click_wait * 1000)

    for selector in args.click_selector or []:
        print(f"  点击选择器：{selector}")
        page.locator(selector).first.click(timeout=click_timeout)
        if args.after_click_wait:
            page.wait_for_timeout(args.after_click_wait * 1000)

    for text in args.click_text or []:
        print(f"  点击文本：{text}")
        page.get_by_text(text, exact=True).first.click(timeout=click_timeout)
        if args.after_click_wait:
            page.wait_for_timeout(args.after_click_wait * 1000)


def capture_one(context, plan: dict, output_dir: Path, args: argparse.Namespace) -> Path:
    url = plan["action"]
    title = f"{plan.get('vendor', '')} {plan.get('plan', '')}".strip() or url
    page = context.new_page()
    page.set_default_timeout(args.timeout * 1000)

    print(f"抓取：{title} -> {url}")
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=args.timeout * 1000)
        html = snapshot_html_from_page(context, page, args)
    finally:
        page.close()

    return write_snapshot(output_dir, html)


def capture_existing_page(context, page, plan: dict, output_dir: Path, args: argparse.Namespace) -> Path:
    title = f"{plan.get('vendor', '')} {plan.get('plan', '')}".strip() or plan["action"]
    page.set_default_timeout(args.timeout * 1000)
    print(f"CDP 抓取：{title} -> {page.url}")
    apply_page_interactions(page, args)
    html = snapshot_html_from_page(context, page, args)
    return write_snapshot(output_dir, html)


def add_common_browser_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--browser-profile", default=str(DEFAULT_PROFILE), help="Playwright 持久浏览器资料目录，用于保留登录状态")
    parser.add_argument("--channel", help="浏览器 channel，例如 chrome 或 msedge；默认使用 Playwright Chromium")


def add_filter_args(parser: argparse.ArgumentParser, verb: str) -> None:
    parser.add_argument("--vendor", help=f"只{verb}平台名包含该文本的套餐")
    parser.add_argument("--plan", help=f"只{verb}套餐名包含该文本的套餐")
    parser.add_argument("--url", help="只使用这个精确 action URL")


def launch_context(playwright, args: argparse.Namespace):
    launch_options = {
        "headless": False,
        "viewport": {"width": 1440, "height": 1000},
    }
    if args.channel:
        launch_options["channel"] = args.channel

    return playwright.chromium.launch_persistent_context(
        user_data_dir=args.browser_profile,
        **launch_options,
    )


def run_login(args: argparse.Namespace) -> int:
    plans = apply_patches(load_plans(), load_patches())
    selected = [(index, plan) for index, plan in enumerate(plans) if matches_filters(plan, args)]
    start_url = args.url
    if not start_url and selected:
        start_url = selected[0][1]["action"]

    sync_playwright = import_playwright()
    with sync_playwright() as playwright:
        context = launch_context(playwright, args)
        page = context.new_page()
        if start_url:
            print(f"打开登录页面：{start_url}")
            page.goto(start_url, wait_until="domcontentloaded", timeout=args.timeout * 1000)
        else:
            print("未指定 --url，也没有匹配到 plans.json 链接，已打开空白浏览器。")

        print("请在打开的浏览器里完成登录。此命令不会保存快照或修改 patch.json。")
        print("浏览器会一直保持打开；需要结束时，在终端按 Ctrl+C。")
        try:
            signal.pause()
        except KeyboardInterrupt:
            print("\n收到 Ctrl+C，正在关闭登录浏览器。")
        finally:
            context.close()

    print(f"登录状态已保存在：{args.browser_profile}")
    return 0


def run_get(args: argparse.Namespace) -> int:
    raw_plans = load_plans()
    patches = load_patches()
    plans = apply_patches(raw_plans, patches)
    selected = [(index, plan) for index, plan in enumerate(plans) if matches_filters(plan, args)]
    if not selected:
        print("没有找到符合条件且带 action 链接的套餐。")
        return 0


    sync_playwright = import_playwright()
    captured_by_key: dict[str, str] = {}
    captured_count = 0

    with sync_playwright() as playwright:
        context = launch_context(playwright, args)
        try:
            for index, plan in selected:
                dedupe_key = plan["action"] if not args.no_dedupe else f"{index}:{plan['action']}"
                if dedupe_key in captured_by_key:
                    previous_snapshot = plan.get("snapshot")
                    update_plan_patch(patches, raw_plans[index], {
                        "snapshot": captured_by_key[dedupe_key],
                        "snapshotSource": plan["action"],
                        "snapshotCapturedAt": datetime.now(timezone.utc).isoformat(),
                    })
                    if previous_snapshot and previous_snapshot != captured_by_key[dedupe_key]:
                        previous_path = (ROOT / previous_snapshot).parent
                        safe_remove_snapshot_dir(previous_path)
                    continue
                if args.limit is not None and captured_count >= args.limit:
                    break

                previous_snapshot = plan.get("snapshot")
                slug = snapshot_slug(plan["action"])
                output_file = capture_one(context, plan, SNAPSHOT_ROOT / slug, args)
                relative_path = output_file.relative_to(ROOT).as_posix()
                if previous_snapshot and previous_snapshot != relative_path:
                    previous_path = (ROOT / previous_snapshot).parent
                    safe_remove_snapshot_dir(previous_path)

                update_plan_patch(patches, raw_plans[index], {
                    "snapshot": relative_path,
                    "snapshotSource": plan["action"],
                    "snapshotCapturedAt": datetime.now(timezone.utc).isoformat(),
                })
                captured_by_key[dedupe_key] = relative_path
                captured_count += 1
                print(f"  保存：{relative_path}")
        finally:
            context.close()

    if not args.no_write_plans:
        save_patches(patches)
        print(f"已回写 {PATCH_PATH.relative_to(ROOT)}")

    print(f"完成，新增/更新 {captured_count} 个快照。")
    return 0


def normalize_page_url(url: str) -> str:
    return url.rstrip("/")


def find_cdp_page(browser, target_url: str):
    normalized_target = normalize_page_url(target_url)
    fallback = None
    for context in browser.contexts:
        for page in context.pages:
            current = normalize_page_url(page.url)
            if current == normalized_target:
                return context, page
            if current.startswith(normalized_target):
                fallback = fallback or (context, page)
    return fallback


def run_get_cdp(args: argparse.Namespace) -> int:
    apply_named_workflow(args)
    raw_plans = load_plans()
    patches = load_patches()
    plans = apply_patches(raw_plans, patches)
    selected = [(index, plan) for index, plan in enumerate(plans) if matches_filters(plan, args)]
    if not selected:
        print("没有找到符合条件且带 action 链接的套餐。")
        return 0

    sync_playwright = import_playwright()
    captured_by_key: dict[str, str] = {}
    captured_count = 0

    with sync_playwright() as playwright:
        browser = playwright.chromium.connect_over_cdp(args.cdp_endpoint)
        try:
            for index, plan in selected:
                dedupe_key = plan["action"] if not args.no_dedupe else f"{index}:{plan['action']}"
                if dedupe_key in captured_by_key:
                    previous_snapshot = plan.get("snapshot")
                    update_plan_patch(patches, raw_plans[index], {
                        "snapshot": captured_by_key[dedupe_key],
                        "snapshotSource": plan["action"],
                        "snapshotCapturedAt": datetime.now(timezone.utc).isoformat(),
                    })
                    if previous_snapshot and previous_snapshot != captured_by_key[dedupe_key]:
                        previous_path = (ROOT / previous_snapshot).parent
                        safe_remove_snapshot_dir(previous_path)
                    continue
                if args.limit is not None and captured_count >= args.limit:
                    break

                opened_by_script = False
                found = None if args.open_tab else find_cdp_page(browser, plan["action"])
                if not found:
                    if not args.open_tab:
                        print(f"未找到已打开标签页：{plan['action']}")
                        print("请先在 9222 浏览器里手动打开这个 URL，或加 --open-tab 让脚本在该浏览器中新开标签。")
                        continue
                    context = browser.contexts[0] if browser.contexts else browser.new_context()
                    page = context.new_page()
                    page.set_default_timeout(args.timeout * 1000)
                    print(f"CDP 新开标签：{plan['action']}")
                    page.goto(plan["action"], wait_until="domcontentloaded", timeout=args.timeout * 1000)
                    wait_for_page_ready(page, args.timeout * 1000)
                    opened_by_script = True
                else:
                    context, page = found
                    page.set_default_timeout(args.timeout * 1000)
                    if args.reload:
                        print(f"CDP 刷新标签：{page.url}")
                        page.goto(plan["action"], wait_until="domcontentloaded", timeout=args.timeout * 1000)
                        wait_for_page_ready(page, args.timeout * 1000)

                previous_snapshot = plan.get("snapshot")
                slug = snapshot_slug(plan["action"])
                output_file = capture_existing_page(context, page, plan, SNAPSHOT_ROOT / slug, args)
                relative_path = output_file.relative_to(ROOT).as_posix()
                if previous_snapshot and previous_snapshot != relative_path:
                    previous_path = (ROOT / previous_snapshot).parent
                    safe_remove_snapshot_dir(previous_path)

                update_plan_patch(patches, raw_plans[index], {
                    "snapshot": relative_path,
                    "snapshotSource": plan["action"],
                    "snapshotCapturedAt": datetime.now(timezone.utc).isoformat(),
                })
                captured_by_key[dedupe_key] = relative_path
                captured_count += 1
                print(f"  保存：{relative_path}")
                if args.close_tab or opened_by_script:
                    print("  关闭标签页")
                    page.close()
        finally:
            # Do not close the CDP browser; it is the user's manually opened session.
            pass

    if not args.no_write_plans:
        save_patches(patches)
        print(f"已回写 {PATCH_PATH.relative_to(ROOT)}")

    print(f"完成，新增/更新 {captured_count} 个快照。")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Login to plan sites or capture local lightweight HTML snapshots.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    login_parser = subparsers.add_parser("login", help="只打开浏览器用于登录，不保存快照，不修改 patch.json")
    add_filter_args(login_parser, "打开")
    add_common_browser_args(login_parser)
    login_parser.add_argument("--timeout", type=int, default=45, help="打开登录页超时时间，单位秒")

    get_parser = subparsers.add_parser("get", help="抓取页面快照，保存 HTML，并默认回写 patch.json")
    add_filter_args(get_parser, "抓取")
    add_common_browser_args(get_parser)
    get_parser.add_argument("--limit", type=int, help="最多抓取多少个唯一页面")
    get_parser.add_argument("--wait", type=int, default=0, help="打开页面后额外等待秒数，适合登录后异步加载内容")
    get_parser.add_argument("--timeout", type=int, default=45, help="单页超时时间，单位秒")
    get_parser.add_argument("--no-dedupe", action="store_true", help="相同 action URL 也分别生成快照")
    get_parser.add_argument("--no-write-plans", action="store_true", help="只保存快照，不回写 patch.json")

    get_cdp_parser = subparsers.add_parser("get-cdp", help="连接已手动打开的 CDP 浏览器抓取页面，不启动新浏览器")
    add_filter_args(get_cdp_parser, "抓取")
    get_cdp_parser.add_argument("--name", help="使用内置平台抓取配方，例如：讯飞·星火")
    get_cdp_parser.add_argument("--cdp-endpoint", default="http://127.0.0.1:9222", help="CDP 地址，默认 http://127.0.0.1:9222")
    get_cdp_parser.add_argument("--limit", type=int, help="最多抓取多少个唯一页面")
    get_cdp_parser.add_argument("--wait", type=int, default=0, help="抓取前额外等待秒数")
    get_cdp_parser.add_argument("--timeout", type=int, default=45, help="单页超时时间，单位秒")
    get_cdp_parser.add_argument("--open-tab", action="store_true", help="在已连接的 CDP 浏览器中新开标签页打开 URL")
    get_cdp_parser.add_argument("--reload", action="store_true", help="抓取前重新加载已匹配标签页")
    get_cdp_parser.add_argument("--close-tab", action="store_true", help="抓取完成后关闭标签页")
    get_cdp_parser.add_argument("--before-click-wait", type=int, default=5, help="首次点击前等待秒数")
    get_cdp_parser.add_argument("--click-text", action="append", default=[], help="抓取前点击精确匹配的可见文本，可重复传入")
    get_cdp_parser.add_argument("--click-selector", action="append", default=[], help="抓取前点击 CSS 选择器，可重复传入")
    get_cdp_parser.add_argument("--click-timeout", type=int, default=15, help="点击等待超时时间，单位秒")
    get_cdp_parser.add_argument("--after-click-wait", type=int, default=5, help="每次点击后等待秒数")
    get_cdp_parser.add_argument("--no-dedupe", action="store_true", help="相同 action URL 也分别生成快照")
    get_cdp_parser.add_argument("--no-write-plans", action="store_true", help="只保存快照，不回写 patch.json")

    args = parser.parse_args()
    if args.command == "login":
        return run_login(args)
    if args.command == "get":
        return run_get(args)
    if args.command == "get-cdp":
        return run_get_cdp(args)

    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
