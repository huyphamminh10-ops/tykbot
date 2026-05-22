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
  python3 cat.py          # push bình thường
  python3 cat.py -f       # push --force (xử lý conflict git pull)
  python3 cat.py --force  # như trên
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
# Khi cat.py tìm thấy một file trong tyk_update, nó tra bảng này để biết
# nên đặt file đó vào đâu trong TERMUX_BOT_DIR.
#
# Quy tắc ưu tiên (theo thứ tự):
#   1. Khớp tên file chính xác (EXACT_MAP)  → đặt theo đường dẫn chỉ định
#   2. Khớp phần mở rộng + thư mục cha      → đặt theo PATTERN_MAP
#   3. Không khớp gì                         → đặt vào gốc bot (fallback)
#
# Format EXACT_MAP:  "tên_file.ext"  -> "đường/dẫn/trong/bot/tên_file.ext"
# Format PATTERN_MAP: (".ext", "thư_mục_cha") -> "đường/dẫn/đích/"
#                     (".ext", None)           -> khớp mọi .ext không kể thư mục cha

EXACT_MAP: dict[str, str] = {
    # ── Root-level files ──────────────────────────────────────────────────────
    "package.json":         "package.json",
    "package-lock.json":    "package-lock.json",
    ".env":                 ".env",
    ".env.example":         ".env.example",
    ".gitignore":           ".gitignore",
    ".dockerignore":        ".dockerignore",
    "Dockerfile":           "Dockerfile",
    "fly.toml":             "fly.toml",
    "push.py":              "push.py",
    "cat.py":               "cat.py",
    "reply.py":             "reply.py",
    "deploy.py":            "deploy.py",
    "README.md":            "README.md",

    # ── src/ root ─────────────────────────────────────────────────────────────
    "index.js":             "src/index.js",
    "deploy-commands.js":   "src/deploy-commands.js",

    # ── src/config/ ───────────────────────────────────────────────────────────
    "constants.js":         "src/config/constants.js",

    # ── src/services/ ─────────────────────────────────────────────────────────
    "GameEngine.js":        "src/services/GameEngine.js",
    "GeminiService.js":     "src/services/GeminiService.js",
    "CanvasService.js":     "src/services/CanvasService.js",
    "AntiCheatService.js":  "src/services/AntiCheatService.js",

    # ── src/managers/ ─────────────────────────────────────────────────────────
    "GlobalRoomManager.js": "src/managers/GlobalRoomManager.js",

    # ── src/handlers/ ─────────────────────────────────────────────────────────
    "InteractionHandler.js":"src/handlers/InteractionHandler.js",

    # ── src/utils/ ────────────────────────────────────────────────────────────
    "EmbedBuilders.js":     "src/utils/EmbedBuilders.js",

    # ── src/components/ ───────────────────────────────────────────────────────
    "lobbyButtons.js":      "src/components/lobbyButtons.js",
    "modals.js":            "src/components/modals.js",

    # ── src/events/ ───────────────────────────────────────────────────────────
    # "index.js" đã map ở trên → events/index.js cần dùng PATTERN hoặc tên riêng
    "events_index.js":      "src/events/index.js",
}

# Pattern fallback: (extension, parent_folder_hint) -> destination_dir
# parent_folder_hint = None nghĩa là không cần kiểm tra thư mục cha
PATTERN_MAP: list[tuple[str, str | None, str]] = [
    # (extension, parent_hint, dest_dir)
    (".js",  "commands",   "src/commands/"),
    (".js",  "services",   "src/services/"),
    (".js",  "managers",   "src/managers/"),
    (".js",  "handlers",   "src/handlers/"),
    (".js",  "components", "src/components/"),
    (".js",  "utils",      "src/utils/"),
    (".js",  "config",     "src/config/"),
    (".js",  "events",     "src/events/"),
    (".py",  None,         ""),              # .py files → root bot dir
    (".md",  None,         ""),
    (".toml",None,         ""),
    (".json",None,         ""),
]

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


def resolve_destination(file: Path) -> Path:
    """
    Tìm vị trí đích thông minh cho một file nguồn.
    Trả về đường dẫn tuyệt đối trong TERMUX_BOT_DIR.
    """
    name = file.name

    # 1. Khớp tên chính xác
    if name in EXACT_MAP:
        return TERMUX_BOT_DIR / EXACT_MAP[name]

    # 2. Khớp pattern (extension + parent hint)
    ext    = file.suffix.lower()
    parent = file.parent.name.lower()

    for (p_ext, p_hint, dest_dir) in PATTERN_MAP:
        if ext != p_ext:
            continue
        if p_hint is not None and p_hint.lower() not in parent:
            continue
        return TERMUX_BOT_DIR / dest_dir / name

    # 3. Fallback: đặt vào gốc bot
    return TERMUX_BOT_DIR / name


def copy_update(src: Path):
    """Duyệt tất cả file trong src và đặt vào đúng vị trí."""
    print(f"[cat.py] 📂 Nguồn  : {src}")
    print(f"[cat.py] 📁 Bot    : {TERMUX_BOT_DIR}\n")

    placed   = []
    fallback = []

    for item in src.rglob("*"):
        if not item.is_file():
            continue

        dest = resolve_destination(item)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, dest)

        rel_dest = dest.relative_to(TERMUX_BOT_DIR)
        rel_src  = item.relative_to(src)

        if rel_dest.parts[0] == item.name and len(rel_dest.parts) == 1:
            # Đặt bởi fallback
            fallback.append((rel_src, rel_dest))
            print(f"  ⚠ {rel_src}  →  {rel_dest}  [fallback: gốc bot]")
        else:
            placed.append((rel_src, rel_dest))
            if str(rel_src) == str(rel_dest):
                print(f"  ✔ {rel_dest}")
            else:
                print(f"  ✔ {rel_src}  →  {rel_dest}")

    print(f"\n[cat.py] ✅ Đã đặt {len(placed)} file, {len(fallback)} file dùng fallback.")
    if fallback:
        print("[cat.py] ℹ  Các file fallback có thể cần thêm vào EXACT_MAP:")
        for src_f, dst_f in fallback:
            print(f"           \"{src_f.name}\": \"{dst_f}\",")


def run(cmd: list[str], cwd: Path):
    """Chạy lệnh, thoát nếu lỗi."""
    print(f"\n[cat.py] ▶ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd)
    if result.returncode != 0:
        print(f"[cat.py] ❌ Lệnh thất bại (exit {result.returncode})")
        sys.exit(result.returncode)

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    force = "-f" in sys.argv or "--force" in sys.argv

    print("=" * 54)
    print("  cat.py — Cập nhật tykbot từ bộ nhớ ngoài")
    if force:
        print("  ⚡ Chế độ FORCE PUSH đang bật")
    print("=" * 54)

    # 1. Tìm nguồn
    src = find_source()

    # 2. Copy thông minh
    copy_update(src)

    # 3. npm install
    print("\n[cat.py] 📦 Chạy npm install...")
    run(["npm", "install"], cwd=TERMUX_BOT_DIR)

    # 4. Push (truyền -f nếu cần)
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
