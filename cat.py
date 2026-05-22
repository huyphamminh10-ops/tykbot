#!/usr/bin/env python3
"""
cat.py - Cập nhật bot từ bộ nhớ ngoài vào Termux rồi push lên remote.

Luồng:
  1. Tìm thư mục "tyk_update" trong bộ nhớ ngoài (thẻ SD / USB OTG)
  2. Sao chép toàn bộ nội dung đó vào thư mục tykbot trong Termux
  3. Chạy npm install
  4. Chạy push.py để push lên remote
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path

# ─── CẤU HÌNH ────────────────────────────────────────────────────────────────

# Các vị trí bộ nhớ ngoài phổ biến trên Android / Termux
EXTERNAL_ROOTS = [
    "/sdcard",
    "/storage/emulated/0",
    "/storage/sdcard1",
    "/storage/external",
    # Thêm UUID thẻ SD nếu cần, vd: "/storage/ABCD-1234"
]

SOURCE_FOLDER_NAME = "tyk_update"       # Tên thư mục nguồn ở bộ nhớ ngoài
TERMUX_BOT_DIR = Path.home() / "tykbot" # Thư mục bot trong Termux

# ─── HÀM TIỆN ÍCH ────────────────────────────────────────────────────────────

def find_source() -> Path:
    """Tìm thư mục tyk_update trong bộ nhớ ngoài."""
    for root in EXTERNAL_ROOTS:
        candidate = Path(root) / SOURCE_FOLDER_NAME
        if candidate.is_dir():
            return candidate
    print(f"[cat.py] ❌ Không tìm thấy thư mục '{SOURCE_FOLDER_NAME}' trong các vị trí:")
    for r in EXTERNAL_ROOTS:
        print(f"         - {r}/{SOURCE_FOLDER_NAME}")
    sys.exit(1)

def copy_update(src: Path, dst: Path):
    """Sao chép tất cả file từ src vào dst, ghi đè nếu đã tồn tại."""
    print(f"[cat.py] 📂 Nguồn  : {src}")
    print(f"[cat.py] 📁 Đích   : {dst}")
    dst.mkdir(parents=True, exist_ok=True)

    copied = 0
    for item in src.rglob("*"):
        rel = item.relative_to(src)
        target = dst / rel
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)
            print(f"  ✔ {rel}")
            copied += 1

    print(f"[cat.py] ✅ Đã sao chép {copied} file.")

def run(cmd: list[str], cwd: Path):
    """Chạy lệnh shell, in output trực tiếp, thoát nếu lỗi."""
    print(f"\n[cat.py] ▶ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd)
    if result.returncode != 0:
        print(f"[cat.py] ❌ Lệnh thất bại với exit code {result.returncode}")
        sys.exit(result.returncode)

# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 50)
    print("  cat.py — Cập nhật tykbot từ bộ nhớ ngoài")
    print("=" * 50)

    # 1. Tìm nguồn
    src = find_source()

    # 2. Copy vào Termux
    copy_update(src, TERMUX_BOT_DIR)

    # 3. npm install
    print("\n[cat.py] 📦 Chạy npm install...")
    run(["npm", "install"], cwd=TERMUX_BOT_DIR)

    # 4. Push
    print("\n[cat.py] 🚀 Chạy push.py...")
    push_script = TERMUX_BOT_DIR / "push.py"
    if not push_script.exists():
        print(f"[cat.py] ⚠️  Không tìm thấy push.py tại {push_script}, bỏ qua bước push.")
    else:
        run(["python3", str(push_script)], cwd=TERMUX_BOT_DIR)

    print("\n[cat.py] 🎉 Hoàn thành!")

if __name__ == "__main__":
    main()
