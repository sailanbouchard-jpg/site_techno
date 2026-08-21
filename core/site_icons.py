"""
core/site_icons.py
------------------
Fetch a 16-px–quality favicon for each domain referenced in =lien> blocks.
Cached in contenu/medias/site_icons/ at build time (incremental — skip if exists).

SOURCE: Google Favicon V2  (https://www.google.com/s2/favicons?domain=…&sz=256)
  Always responds for any registered domain. Used for the header favicon (16 px)
  and as the large-image fallback when no custom image is specified in =lien>.

NAMING:  {domain}.png   or   {domain}.svg  (SVG letter-avatar if Google fails)
"""

import re
import urllib.request
from pathlib import Path


_RE_LIEN  = re.compile(r"=lien>\s+(\S+)")
_TIMEOUT  = 8
_HEADERS  = {"User-Agent": "Mozilla/5.0 (compatible; SiteTechnoBuilder/3)"}


def fetch_all_site_icons(content_root: Path, icons_dir: Path) -> None:
    """
    Scan all .md files for =lien> URLs, download a favicon per unique domain.
    Already-cached files are skipped.
    """
    icons_dir.mkdir(parents=True, exist_ok=True)

    domains = _collect_domains(content_root)
    if not domains:
        return

    for domain in sorted(domains):
        png = icons_dir / f"{domain}.png"
        svg = icons_dir / f"{domain}.svg"

        if png.exists() or svg.exists():
            print(f"     ⊙ {domain}  (cache)")
            continue

        ok, n = _fetch_google_favicon(domain, png)
        if ok:
            print(f"     ↓ {domain}.png  {_fmt(n)}")
        else:
            _write_svg_fallback(domain, svg)
            print(f"     ✎ {domain}.svg  (lettre-avatar — Google favicon indisponible)")


# ─────────────────────────────────────────────────────────────
# INTERNAL
# ─────────────────────────────────────────────────────────────

def _collect_domains(content_root: Path) -> set:
    domains = set()
    for md in content_root.rglob("*.md"):
        for url in _RE_LIEN.findall(md.read_text(encoding="utf-8")):
            d = _domain(url)
            if d:
                domains.add(d)
    return domains


def _domain(url: str) -> str:
    url = url.strip()
    for p in ("https://", "http://"):
        if url.lower().startswith(p):
            url = url[len(p):]
            break
    return url.split("/")[0].lower()


def _fetch_google_favicon(domain: str, out: Path) -> tuple:
    """Download Google Favicon V2 at 256 px. Returns (success, bytes)."""
    url = f"https://www.google.com/s2/favicons?domain={domain}&sz=256"
    try:
        req = urllib.request.Request(url, headers=_HEADERS)
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            data = resp.read()
            if len(data) >= 100:
                out.write_bytes(data)
                return True, len(data)
            return False, len(data)
    except Exception:
        return False, 0


def _write_svg_fallback(domain: str, svg_file: Path) -> None:
    letter = domain[0].upper() if domain else "?"
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        '<rect width="64" height="64" rx="10" fill="#e0e7ff"/>'
        f'<text x="32" y="46" font-size="34" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-weight="bold" fill="#3b82f6">{letter}</text>'
        '</svg>'
    )
    svg_file.write_text(svg, encoding="utf-8")


def _fmt(n: int) -> str:
    return f"({n/1024:.1f} KB)" if n >= 1024 else f"({n} B)"
