#!/usr/bin/env python3
"""
cat.py — Cập nhật tykbot từ bộ nhớ ngoài vào Termux rồi push lên remote.

Luồng:
  1. Tìm thư mục "tyk_update" trong bộ nhớ ngoài (thẻ SD / USB OTG)
  2. Đặt thông minh từng file vào đúng vị trí trong cấu trúc dự án
     (không cần giữ nguyên cây thư mục trong tyk_update)
  3. Chạy npm install
  4. Chạy push.py để push lên remote (hỗ trợ -f / --force)

Cách dùng:
  python3 cat.py              # push bình thường
  python3 cat.py -f           # push --force (xử lý conflict git pull)
  python3 cat.py --dry-run    # xem sẽ copy gì, không thực sự copy
  python3 cat.py --no-push    # copy + npm install, không push
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

# ─── CẤU HÌNH ────────────────────────────────────────────────────────────────

EXTERNAL_ROOTS = [
    "/sdcard",
    "/storage/emulated/0",
    "/storage/sdcard1",
    "/storage/external",
    # Thêm UUID thẻ SD nếu cần, vd: "/storage/ABCD-1234"
]

SOURCE_FOLDER_NAME = "tyk_update"
TERMUX_BOT_DIR     = Path.home() / "tykbot"

# ─── BẢN ĐỒ VỊ TRÍ THÔNG MINH ───────────────────────────────────────────────
#
# Quy tắc ưu tiên (theo thứ tự):
#   1. Khớp đường dẫn đầy đủ relative (PATH_MAP)  → đặt theo đường dẫn chỉ định
#   2. Khớp tên file chính xác (EXACT_MAP)         → đặt theo đường dẫn chỉ định
#   3. Khớp phần mở rộng + thư mục cha (PATTERN_MAP)
#   4. Không khớp gì                               → đặt vào gốc bot (fallback)
#
# ⚠ QUAN TRỌNG: "index.js" xuất hiện ở 2 chỗ (src/ và src/events/),
#   dùng PATH_MAP hoặc đặt file trong thư mục con tương ứng trong tyk_update.

# Khớp relative path từ gốc tyk_update (ưu tiên cao nhất)
# Ví dụ: tyk_update/src/events/index.js → src/events/index.js
PATH_MAP: dict[str, str] = {
    # Có thể để trống — cat.py tự dùng path trong tyk_update nếu cấu trúc đúng
}

EXACT_MAP: dict[str, str] = {
    # ── Root-level files ──────────────────────────────────────────────────────
    "package.json":          "package.json",
    "package-lock.json":     "package-lock.json",
    ".env":                  ".env",
    ".env.example":          ".env.example",
    ".gitignore":            ".gitignore",
    ".dockerignore":         ".dockerignore",
    "Dockerfile":            "Dockerfile",
    "fly.toml":              "fly.toml",
    "push.py":               "push.py",
    "cat.py":                "cat.py",
    "reply.py":              "reply.py",
    "deploy.py":             "deploy.py",
    "README.md":             "README.md",

    # ── src/ root ─────────────────────────────────────────────────────────────
    # ⚠ "index.js" KHÔNG đặt ở đây vì trùng với src/events/index.js
    #   Thay vào đó dùng tên riêng "bot_index.js" hoặc đặt trong thư mục src/
    "bot_index.js":          "src/index.js",          # đặt tên khác khi update
    "deploy-commands.js":    "src/deploy-commands.js",

    # ── src/config/ ───────────────────────────────────────────────────────────
    "constants.js":          "src/config/constants.js",

    # ── src/services/ ─────────────────────────────────────────────────────────
    "GameEngine.js":         "src/services/GameEngine.js",
    "LlamaService.js":       "src/services/LlamaService.js",
    "CanvasService.js":      "src/services/CanvasService.js",
    "AntiCheatService.js":   "src/services/AntiCheatService.js",

    # ── src/managers/ ─────────────────────────────────────────────────────────
    "GlobalRoomManager.js":  "src/managers/GlobalRoomManager.js",

    # ── src/handlers/ ─────────────────────────────────────────────────────────
    "InteractionHandler.js": "src/handlers/InteractionHandler.js",

    # ── src/utils/ ────────────────────────────────────────────────────────────
    "EmbedBuilders.js":      "src/utils/EmbedBuilders.js",

    # ── src/components/ ───────────────────────────────────────────────────────
    "lobbyButtons.js":       "src/components/lobbyButtons.js",
    "modals.js":             "src/components/modals.js",

    # ── src/events/ ───────────────────────────────────────────────────────────
    # "index.js" ở events phải dùng PATTERN_MAP (parent hint "events")
    # hoặc đặt file trong thư mục src/events/ trong tyk_update
    "events_index.js":       "src/events/index.js",   # đặt tên riêng này

    # ── src/commands/ ─────────────────────────────────────────────────────────
    "tykcreate.js":          "src/commands/tykcreate.js",
    "tyktest.js":            "src/commands/tyktest.js",
}

# Pattern fallback: (extension, parent_folder_hint, dest_dir)
# parent_folder_hint = None → khớp mọi file có extension đó
PATTERN_MAP: list[tuple[str, str | None, str]] = [
    (".js",  "commands",   "src/commands/"),
    (".js",  "services",   "src/services/"),
    (".js",  "managers",   "src/managers/"),
    (".js",  "handlers",   "src/handlers/"),
    (".js",  "components", "src/components/"),
    (".js",  "utils",      "src/utils/"),
    (".js",  "config",     "src/config/"),
    (".js",  "events",     "src/events/"),
    (".js",  "src",        "src/"),             # file .js nằm trực tiếp trong src/
    (".py",  None,         ""),                 # .py → gốc bot
    (".md",  None,         ""),
    (".toml",None,         ""),
    (".json",None,         ""),
]

# ─── PHÁT HIỆN XUNG ĐỘT ──────────────────────────────────────────────────────

# Các tên file có thể gây nhầm lẫn (xuất hiện ở nhiều nơi)
AMBIGUOUS_NAMES = {"index.js"}

# ─── HÀM TIỆN ÍCH ────────────────────────────────────────────────────────────

def find_source() -> Path:
    for root in EXTERNAL_ROOTS:
        candidate = Path(root) / SOURCE_FOLDER_NAME
        if candidate.is_dir():
            return candidate
    print(f"[cat.py] ❌ Không tìm thấy '{SOURCE_FOLDER_NAME}' trong:")
    for r in EXTERNAL_ROOTS:
        print(f"         - {r}/{SOURCE_FOLDER_NAME}")
    sys.exit(1)


def resolve_destination(file: Path, src_root: Path) -> tuple[Path, str]:
    """
    Tìm vị trí đích thông minh cho một file nguồn.
    Trả về (đường_dẫn_tuyệt_đối, phương_thức_resolve).
    """
    name   = file.name
    rel    = file.relative_to(src_root)  # đường dẫn tương đối trong tyk_update
    ext    = file.suffix.lower()
    parent = file.parent.name.lower()

    # 0. Cảnh báo sớm nếu tên file ambiguous và không có cấu trúc thư mục
    if name in AMBIGUOUS_NAMES and str(rel) == name:
        print(f"\n[cat.py] ⚠️  CẢNH BÁO: '{name}' là tên dễ nhầm lẫn!")
        print(f"           Hãy đặt file trong thư mục con tương ứng trong tyk_update")
        print(f"           Ví dụ: tyk_update/src/index.js  hoặc  tyk_update/src/events/index.js")
        print(f"           Hoặc đổi tên: 'bot_index.js' (→ src/index.js) / 'events_index.js' (→ src/events/index.js)")

    # 1. Khớp relative path đầy đủ (ưu tiên cao nhất)
    rel_str = str(rel).replace("\\", "/")
    if rel_str in PATH_MAP:
        return TERMUX_BOT_DIR / PATH_MAP[rel_str], "path-map"

    # 2. Nếu tyk_update giữ nguyên cấu trúc thư mục (bắt đầu bằng src/)
    #    thì dùng luôn cấu trúc đó
    parts = rel.parts
    if len(parts) > 1 and parts[0] in ("src", "src/"):
        return TERMUX_BOT_DIR / rel, "struct"
    if len(parts) > 1 and parts[0] == "src":
        return TERMUX_BOT_DIR / rel, "struct"

    # Kiểm tra cấu trúc src/...
    for known_prefix in ("src",):
        if parts[0] == known_prefix:
            return TERMUX_BOT_DIR / rel, "struct"

    # 3. Khớp tên file chính xác
    if name in EXACT_MAP:
        return TERMUX_BOT_DIR / EXACT_MAP[name], "exact"

    # 4. Khớp pattern (extension + parent hint)
    for (p_ext, p_hint, dest_dir) in PATTERN_MAP:
        if ext != p_ext:
            continue
        if p_hint is not None and p_hint.lower() not in parent:
            continue
        return TERMUX_BOT_DIR / dest_dir / name, "pattern"

    # 5. Fallback
    return TERMUX_BOT_DIR / name, "fallback"


def copy_update(src: Path, dry_run: bool = False):
    """Duyệt tất cả file trong src và đặt vào đúng vị trí."""
    print(f"[cat.py] 📂 Nguồn  : {src}")
    print(f"[cat.py] 📁 Bot    : {TERMUX_BOT_DIR}")
    if dry_run:
        print(f"[cat.py] 🔍 Chế độ DRY-RUN — không thực sự copy\n")
    else:
        print()

    placed   = []
    fallback = []
    warnings = []

    for item in sorted(src.rglob("*")):
        if not item.is_file():
            continue
        # Bỏ qua các file hệ thống
        if item.name.startswith(".DS_Store") or item.name == "Thumbs.db":
            continue

        dest, method = resolve_destination(item, src)
        rel_dest = dest.relative_to(TERMUX_BOT_DIR)
        rel_src  = item.relative_to(src)

        if method == "fallback":
            fallback.append((rel_src, rel_dest))
            icon = "⚠"
        else:
            placed.append((rel_src, rel_dest))
            icon = "✔"

        # Log
        method_tag = f" [{method}]" if method not in ("exact", "struct") else ""
        if str(rel_src) == str(rel_dest):
            print(f"  {icon} {rel_dest}{method_tag}")
        else:
            print(f"  {icon} {rel_src}  →  {rel_dest}{method_tag}")

        if not dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, dest)

    # Tóm tắt
    print(f"\n[cat.py] {'🔍' if dry_run else '✅'} Đã {'kiểm tra' if dry_run else 'đặt'} "
          f"{len(placed)} file, {len(fallback)} file dùng fallback.")

    if fallback:
        print("[cat.py] ℹ  Các file fallback cần thêm vào EXACT_MAP:")
        for src_f, dst_f in fallback:
            print(f'           "{src_f.name}": "{dst_f}",')

    return len(fallback) == 0  # True nếu không có fallback


def run(cmd: list[str], cwd: Path):
    """Chạy lệnh, thoát nếu lỗi."""
    print(f"\n[cat.py] ▶ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd)
    if result.returncode != 0:
        print(f"[cat.py] ❌ Lệnh thất bại (exit {result.returncode})")
        sys.exit(result.returncode)


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    force   = "-f" in sys.argv or "--force" in sys.argv
    dry_run = "--dry-run" in sys.argv
    no_push = "--no-push" in sys.argv

    print("=" * 56)
    print("  cat.py — Cập nhật tykbot từ bộ nhớ ngoài")
    if force:   print("  ⚡ Chế độ FORCE PUSH đang bật")
    if dry_run: print("  🔍 Chế độ DRY-RUN — chỉ kiểm tra, không thay đổi")
    if no_push: print("  🚫 Chế độ NO-PUSH — không push lên remote")
    print("=" * 56)

    # 1. Tìm nguồn
    src = find_source()

    # 2. Copy thông minh (hoặc dry-run)
    ok = copy_update(src, dry_run=dry_run)

    if dry_run:
        print("\n[cat.py] 🔍 Dry-run hoàn tất. Không có gì bị thay đổi.")
        if not ok:
            print("[cat.py] ⚠  Có file fallback — hãy kiểm tra EXACT_MAP trước khi chạy thật.")
        return

    # 3. npm install
    print("\n[cat.py] 📦 Chạy npm install...")
    run(["npm", "install"], cwd=TERMUX_BOT_DIR)

    # 4. Push (bỏ qua nếu --no-push)
    if no_push:
        print("\n[cat.py] 🚫 Bỏ qua push (--no-push).")
    else:
        push_script = TERMUX_BOT_DIR / "push.py"
        if not push_script.exists():
            print(f"\n[cat.py] ⚠️  Không tìm thấy push.py tại {push_script}, bỏ qua.")
        else:
            cmd = ["python3", str(push_script)]
            if force:
                cmd.append("-f")
            print(f"\n[cat.py] 🚀 Chạy {' '.join(cmd)}...")
            run(cmd, cwd=TERMUX_BOT_DIR)

    print("\n[cat.py] 🎉 Hoàn thành!")


if __name__ == "__main__":
    main()
