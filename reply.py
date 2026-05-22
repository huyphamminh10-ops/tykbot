#!/usr/bin/env python3
"""
reply.py - Lấy code bot từ Termux về bộ nhớ ngoài dưới dạng tykbot.zip.

Luồng:
  1. Zip toàn bộ thư mục tykbot (bỏ qua .git, .github, node_modules)
  2. Tạo thư mục "tyk_reply" trong bộ nhớ ngoài nếu chưa có
  3. Lưu file zip vào tyk_reply/tykbot.zip
"""

import os
import sys
import zipfile
from pathlib import Path

# ─── CẤU HÌNH ────────────────────────────────────────────────────────────────

TERMUX_BOT_DIR = Path.home() / "tykbot"  # Thư mục bot trong Termux

EXTERNAL_ROOTS = [
    "/sdcard",
    "/storage/emulated/0",
    "/storage/sdcard1",
    "/storage/external",
]

OUTPUT_FOLDER_NAME = "tyk_reply"   # Tên thư mục đích ở bộ nhớ ngoài
OUTPUT_ZIP_NAME    = "tykbot.zip"  # Tên file zip đầu ra

# Các thư mục / file bị loại trừ khỏi zip
EXCLUDE_DIRS = {".git", ".github", "node_modules"}

# ─── HÀM TIỆN ÍCH ────────────────────────────────────────────────────────────

def find_external() -> Path:
    """Tìm bộ nhớ ngoài khả dụng đầu tiên."""
    for root in EXTERNAL_ROOTS:
        p = Path(root)
        if p.is_dir():
            return p
    print("[reply.py] ❌ Không tìm thấy bộ nhớ ngoài trong các vị trí:")
    for r in EXTERNAL_ROOTS:
        print(f"           - {r}")
    sys.exit(1)

def should_exclude(rel_parts: tuple) -> bool:
    """Trả về True nếu path chứa thư mục bị loại trừ."""
    return bool(set(rel_parts) & EXCLUDE_DIRS)

def zip_bot(src: Path, zip_path: Path):
    """Nén thư mục src thành zip_path, bỏ qua các thư mục loại trừ."""
    total = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for item in src.rglob("*"):
            rel = item.relative_to(src)
            if should_exclude(rel.parts):
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

    # Kiểm tra thư mục bot tồn tại
    if not TERMUX_BOT_DIR.is_dir():
        print(f"[reply.py] ❌ Không tìm thấy thư mục bot: {TERMUX_BOT_DIR}")
        sys.exit(1)

    # Tìm bộ nhớ ngoài
    ext = find_external()

    # Tạo thư mục tyk_reply
    out_dir = ext / OUTPUT_FOLDER_NAME
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"[reply.py] 📁 Thư mục đích : {out_dir}")

    zip_path = out_dir / OUTPUT_ZIP_NAME
    print(f"[reply.py] 🗜  Đang nén    : {TERMUX_BOT_DIR}  →  {zip_path}\n")

    # Xóa file cũ nếu đã tồn tại
    if zip_path.exists():
        zip_path.unlink()
        print("[reply.py] 🗑  Đã xóa file zip cũ.\n")

    # Zip
    zip_bot(TERMUX_BOT_DIR, zip_path)

    size_kb = zip_path.stat().st_size / 1024
    print(f"[reply.py] 📦 File zip: {zip_path}")
    print(f"[reply.py] 📐 Kích thước: {size_kb:.1f} KB")
    print("\n[reply.py] 🎉 Hoàn thành!")

if __name__ == "__main__":
    main()
