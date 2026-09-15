"""Check that a build of this extension is loadable before a browser is asked to load it.

    python tools/check.py [folder ...]      # default: the repo root

Verifies the manifest against what Manifest V3 actually requires, that every
path it names exists, that each icon really is the pixel size it is declared at,
that every script the pages pull in resolves on disk, and that all of it parses.
Exits non-zero and prints each failure.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

MATCH_PATTERN = re.compile(r"^(\*|https?|file|ftp)://(\*|(\*\.)?[^/*]+)?/.*$")
SCRIPT_SRC = re.compile(r"""<script[^>]*\bsrc=["']([^"']+)["']""", re.I)

problems: list[str] = []


def fail(where: str, message: str) -> None:
    problems.append(f"{where}: {message}")


def check_icons(root: Path, icons: dict, where: str) -> None:
    try:
        from PIL import Image
    except ImportError:
        print("  note: Pillow missing, icon dimensions not checked")
        return
    for declared, rel in icons.items():
        path = root / rel
        if not path.exists():
            fail(where, f"icon {rel} is declared but missing")
            continue
        with Image.open(path) as img:
            if img.format != "PNG":
                fail(where, f"{rel} is {img.format}, and Chrome wants PNG")
            if img.size != (int(declared), int(declared)):
                fail(where, f"{rel} is declared at {declared}px but is {img.size[0]}x{img.size[1]}")


def check_page(root: Path, rel: str, where: str) -> None:
    page = root / rel
    if not page.exists():
        fail(where, f"page {rel} is declared but missing")
        return
    for src in SCRIPT_SRC.findall(page.read_text(encoding="utf-8")):
        if src.startswith(("http://", "https://", "//")):
            fail(where, f"{rel} loads {src} remotely, which MV3 forbids")
            continue
        if not (page.parent / src).exists():
            fail(where, f"{rel} pulls in {src}, which does not exist")


def check_syntax(root: Path, where: str) -> None:
    node = subprocess.run(["node", "--version"], capture_output=True, text=True)
    if node.returncode != 0:
        print("  note: node missing, JavaScript not syntax checked")
        return
    for js in sorted(root.rglob("*.js")):
        result = subprocess.run(["node", "--check", str(js)], capture_output=True, text=True)
        if result.returncode != 0:
            fail(where, f"{js.relative_to(root)} does not parse: {result.stderr.strip().splitlines()[0]}")


def check(root: Path) -> None:
    where = root.name
    print(f"checking {root}")

    manifest_path = root / "manifest.json"
    if not manifest_path.exists():
        fail(where, "no manifest.json")
        return
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(where, f"manifest.json is not valid JSON: {exc}")
        return

    for key in ("manifest_version", "name", "version"):
        if key not in manifest:
            fail(where, f"manifest is missing the required key {key}")
    if manifest.get("manifest_version") != 3:
        fail(where, f"manifest_version is {manifest.get('manifest_version')}, not 3")
    if not re.fullmatch(r"\d+(\.\d+){0,3}", str(manifest.get("version", ""))):
        fail(where, f"version {manifest.get('version')!r} is not the dotted-integer form Chrome accepts")
    if len(manifest.get("description", "")) > 132:
        fail(where, "description is over the 132 characters the stores allow")

    check_icons(root, manifest.get("icons", {}), where)
    check_icons(root, manifest.get("action", {}).get("default_icon", {}), where)

    pages = {manifest.get("action", {}).get("default_popup"), manifest.get("options_ui", {}).get("page")}
    for page in sorted(p for p in pages if p):
        check_page(root, page, where)

    for i, block in enumerate(manifest.get("content_scripts", [])):
        if not block.get("matches"):
            fail(where, f"content_scripts[{i}] has no matches")
        for pattern in block.get("matches", []) + block.get("exclude_matches", []):
            if pattern != "<all_urls>" and not MATCH_PATTERN.fullmatch(pattern):
                fail(where, f"content_scripts[{i}] pattern {pattern!r} is not a valid match pattern")
        for rel in block.get("js", []):
            if not (root / rel).exists():
                fail(where, f"content_scripts[{i}] lists {rel}, which does not exist")

    # Anything the content script reaches for has to be covered by a permission.
    granted = set(manifest.get("permissions", []))
    used = set()
    for block in manifest.get("content_scripts", []):
        for rel in block.get("js", []):
            source = (root / rel).read_text(encoding="utf-8") if (root / rel).exists() else ""
            used |= set(re.findall(r"\bchrome\.(\w+)", source))
    for api in used - {"runtime", "i18n"}:
        if api not in granted:
            fail(where, f"the content script uses chrome.{api} without the {api!r} permission")

    check_syntax(root, where)


def main() -> None:
    roots = [Path(a).resolve() for a in sys.argv[1:]] or [Path(__file__).resolve().parent.parent]
    for root in roots:
        check(root)
    if problems:
        print("\nFAIL")
        for line in problems:
            print(f"  {line}")
        sys.exit(1)
    print("\nPASS — every declared path exists, every icon is its declared size, everything parses")


if __name__ == "__main__":
    main()
