#!/usr/bin/env python3
"""
reply.py — Lấy code bot từ Termux về bộ nhớ ngoài dưới dạng tykbot.zip.

Luồng:
  1. Zip toàn bộ thư mục tykbot (bỏ qua .git, .github, node_modules)
  2. Tạo thư mục "tyk_reply" trong bộ nhớ ngoài nếu chưa có
  3. Lưu file zip vào tyk_reply/tykbot.zip
"""

import sys
import zipfile
from datetime import datetime
from pathlib import Path

# ─── CẤU HÌNH ────────────────────────────────────────────────────────────────

TERMUX_BOT_DIR     = Path.home() / "tykbot"
OUTPUT_FOLDER_NAME = "tyk_reply"
OUTPUT_ZIP_NAME    = "tykbot.zip"

EXTERNAL_ROOTS = [
    "/sdcard",
    "/storage/emulated/0",
    "/storage/sdcard1",
    "/storage/external",
]

# Các thư mục / pattern bị loại trừ khỏi zip
EXCLUDE_DIRS = {".git", ".github", "node_modules"}
EXCLUDE_EXTS = {".bak"}   # bỏ file backup .bak, v.v.

# ─── HÀM TIỆN ÍCH ────────────────────────────────────────────────────────────

def find_external() -> Path:
    for root in EXTERNAL_ROOTS:
        p = Path(root)
        if p.is_dir():
            return p
    print("[reply.py] ❌ Không tìm thấy bộ nhớ ngoài trong:")
    for r in EXTERNAL_ROOTS:
        print(f"           - {r}")
    sys.exit(1)


def should_exclude(rel_parts: tuple, suffix: str) -> bool:
    if set(rel_parts) & EXCLUDE_DIRS:
        return True
    if suffix.lower() in EXCLUDE_EXTS:
        return True
    return False


def zip_bot(src: Path, zip_path: Path):
    total = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in sorted(src.rglob("*")):   # sorted → zip có thứ tự nhất quán
            rel = item.relative_to(src)
            if should_exclude(rel.parts, item.suffix):
                continue
            if item.is_file():
                zf.write(item, rel)
                print(f"  + {rel}")
                total += 1
    print(f"\n[reply.py] ✅ Đã nén {total} file.")

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 50)
    print("  reply.py — Export tykbot ra bộ nhớ ngoài")
    print("=" * 50)

    if not TERMUX_BOT_DIR.is_dir():
        print(f"[reply.py] ❌ Không tìm thấy thư mục bot: {TERMUX_BOT_DIR}")
        sys.exit(1)

    ext     = find_external()
    out_dir = ext / OUTPUT_FOLDER_NAME
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"[reply.py] 📁 Thư mục đích : {out_dir}")

    zip_path = out_dir / OUTPUT_ZIP_NAME
    print(f"[reply.py] 🗜  Đang nén    : {TERMUX_BOT_DIR}  →  {zip_path}\n")

    if zip_path.exists():
        zip_path.unlink()
        print("[reply.py] 🗑  Đã xóa file zip cũ.\n")

    zip_bot(TERMUX_BOT_DIR, zip_path)

    size_kb = zip_path.stat().st_size / 1024
    ts      = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[reply.py] 📦 File zip   : {zip_path}")
    print(f"[reply.py] 📐 Kích thước : {size_kb:.1f} KB")
    print(f"[reply.py] 🕐 Thời gian  : {ts}")
    print("\n[reply.py] 🎉 Hoàn thành!")

if __name__ == "__main__":
    main()
