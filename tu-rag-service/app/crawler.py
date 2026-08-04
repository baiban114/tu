"""Headless-browser web page crawler that converts pages to Markdown.

Uses Playwright (async API, singleton chromium) for JS-rendered pages and
trafilatura to extract the main content as Markdown. Falls back to raw
``body.innerText`` paragraph splitting when extraction fails.

TODO (security): reject private/loopback address ranges to prevent SSRF.
"""

from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_BLOCKED_RESOURCE_TYPES = {"image", "media", "font"}
_NETWORK_IDLE_WAIT_MS = 8000
# 单例 browser 驱动连接断开时的典型错误特征（进程崩溃/被杀后 new_context 等调用失败）
_BROWSER_LOST_PATTERNS = (
    "connection closed",
    "browser has been closed",
    "target closed",
    "browser closed",
)
_FALLBACK_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


@dataclass
class CrawlResult:
    status: int
    final_url: str
    title: str
    markdown: str
    char_count: int
    truncated: bool
    crawled_at: str


class CrawlError(Exception):
    """Crawl failure carrying the HTTP status code the endpoint should return."""

    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def extract_markdown(html: str, url: str) -> str | None:
    """Extract main content as Markdown via trafilatura (runs in a thread)."""
    try:
        import trafilatura
    except ImportError:  # pragma: no cover - dependency always installed in prod
        logger.error("trafilatura is not installed")
        return None
    try:
        result = trafilatura.extract(
            html,
            url=url,
            output_format="markdown",
            include_links=True,
            include_tables=True,
            favor_recall=True,
        )
    except Exception:
        logger.exception("trafilatura extraction failed for %s", url)
        return None
    return result.strip() if result and result.strip() else None


def inner_text_to_markdown(text: str) -> str:
    """Fallback conversion: split raw innerText into paragraphs."""
    paragraphs: list[str] = []
    for block in re.split(r"\n{2,}", text or ""):
        block = block.strip()
        if block:
            paragraphs.append(block)
    return "\n\n".join(paragraphs)


class PageCrawler:
    """Singleton chromium crawler; lazily started, one context per request."""

    def __init__(self) -> None:
        self._playwright = None
        self._browser = None
        self._lock = asyncio.Lock()

    async def ensure_started(self) -> None:
        async with self._lock:
            await self._start_locked()

    async def _start_locked(self) -> None:
        """Launch the singleton browser; caller must hold ``self._lock``."""
        if self._browser is not None:
            return
        from playwright.async_api import async_playwright

        self._playwright = await async_playwright().start()
        try:
            self._browser = await self._playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
        except Exception:
            await self._playwright.stop()
            self._playwright = None
            raise

    async def _restart(self) -> None:
        """Tear down and relaunch the browser (used after a lost driver connection)."""
        async with self._lock:
            if self._browser is not None:
                try:
                    await self._browser.close()
                except Exception:  # 连接已断，close 失败属预期
                    pass
                self._browser = None
            if self._playwright is not None:
                try:
                    await self._playwright.stop()
                except Exception:
                    pass
                self._playwright = None
            await self._start_locked()

    async def close(self) -> None:
        async with self._lock:
            if self._browser is not None:
                try:
                    await self._browser.close()
                except Exception:
                    logger.exception("Failed to close chromium browser")
                self._browser = None
            if self._playwright is not None:
                try:
                    await self._playwright.stop()
                except Exception:
                    logger.exception("Failed to stop playwright")
                self._playwright = None

    async def fetch_markdown(self, url: str, timeout_seconds: int, max_chars: int) -> CrawlResult:
        from playwright.async_api import Error as PlaywrightError

        await self.ensure_started()
        try:
            return await self._fetch_with_browser(url, timeout_seconds, max_chars)
        except PlaywrightError as exc:
            if not self._is_browser_lost(exc):
                raise
            # 单例 browser 驱动连接已断（进程崩溃/被杀）：重启后重试一次
            logger.warning("Browser connection lost (%s); restarting and retrying once", exc)
            await self._restart()
            return await self._fetch_with_browser(url, timeout_seconds, max_chars)

    @staticmethod
    def _is_browser_lost(exc: Exception) -> bool:
        message = str(exc).lower()
        return any(pattern in message for pattern in _BROWSER_LOST_PATTERNS)

    async def _fetch_with_browser(self, url: str, timeout_seconds: int, max_chars: int) -> CrawlResult:
        from playwright.async_api import Error as PlaywrightError
        from playwright.async_api import TimeoutError as PlaywrightTimeout

        assert self._browser is not None

        context = await self._browser.new_context(
            user_agent=_FALLBACK_USER_AGENT,
            locale="zh-CN",
        )
        try:
            page = await context.new_page()

            async def block_heavy_assets(route) -> None:
                if route.request.resource_type in _BLOCKED_RESOURCE_TYPES:
                    await route.abort()
                else:
                    await route.continue_()

            await page.route("**/*", block_heavy_assets)

            timeout_ms = max(5, timeout_seconds) * 1000
            try:
                response = await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            except PlaywrightTimeout as exc:
                raise CrawlError(f"页面导航超时: {url}", 504) from exc
            except PlaywrightError as exc:
                raise CrawlError(f"无法打开页面: {exc}", 502) from exc

            try:
                await page.wait_for_load_state("networkidle", timeout=_NETWORK_IDLE_WAIT_MS)
            except PlaywrightError:
                pass  # SPA/长轮询页面可能永远不 idle，容忍

            http_status = response.status if response is not None else 200
            title = (await page.title() or "").strip()
            final_url = page.url or url
            html = await page.content()
            try:
                inner_text = await page.inner_text("body")
            except PlaywrightError:
                inner_text = ""
        finally:
            await context.close()

        markdown = await asyncio.to_thread(extract_markdown, html, url)
        if not markdown:
            logger.info("trafilatura returned nothing for %s, falling back to innerText", url)
            markdown = inner_text_to_markdown(inner_text)
        if not markdown:
            raise CrawlError("页面未提取到任何正文内容（可能是 SPA 空壳或登录墙）", 502)

        truncated = False
        if len(markdown) > max_chars:
            markdown = markdown[:max_chars]
            truncated = True

        return CrawlResult(
            status=http_status,
            final_url=final_url,
            title=title,
            markdown=markdown,
            char_count=len(markdown),
            truncated=truncated,
            crawled_at=datetime.now(timezone.utc).isoformat(),
        )


page_crawler = PageCrawler()
