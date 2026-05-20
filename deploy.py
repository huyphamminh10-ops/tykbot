#!/usr/bin/env python3
"""
deploy.py — Triển khai TykBot lên Fly.io
Chạy: python deploy.py

Script này sẽ tự động:
  1. Kiểm tra flyctl đã cài chưa
  2. Kiểm tra đăng nhập Fly.io
  3. Tạo app (nếu chưa có)
  4. Set secrets (biến môi trường) từ file .env
  5. Deploy bot
  6. Xem logs
"""

import subprocess
import sys
import os
import shutil


# ─── CONFIG ──────────────────────────────────────────────────────────────────
APP_NAME   = "tykbot"          # ← Đổi thành tên app bạn muốn (unique toàn Fly.io)
REGION     = "sin"             # Singapore
ENV_FILE   = ".env"
# ─────────────────────────────────────────────────────────────────────────────


def run(cmd: list[str], check=True, capture=False) -> subprocess.CompletedProcess:
    """Chạy lệnh shell, in output ra màn hình."""
    print(f"\n▶  {' '.join(cmd)}")
    return subprocess.run(
        cmd,
        check=check,
        capture_output=capture,
        text=True,
    )


def run_capture(cmd: list[str]) -> str:
    """Chạy lệnh và trả về stdout (dùng để kiểm tra)."""
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout.strip()


def check_flyctl():
    """Kiểm tra flyctl đã cài chưa."""
    if shutil.which("flyctl") or shutil.which("fly"):
        print("✅ flyctl đã cài")
        return "flyctl" if shutil.which("flyctl") else "fly"

    print("❌ flyctl chưa cài.")
    print("   Cài bằng lệnh:")
    print("   curl -L https://fly.io/install.sh | sh")
    sys.exit(1)


def check_login(fly: str):
    """Kiểm tra đã đăng nhập Fly.io chưa."""
    result = subprocess.run([fly, "auth", "whoami"], capture_output=True, text=True)
    if result.returncode != 0:
        print("❌ Chưa đăng nhập Fly.io. Đang mở trình duyệt...")
        run([fly, "auth", "login"])
    else:
        print(f"✅ Đã đăng nhập: {result.stdout.strip()}")


def app_exists(fly: str) -> bool:
    """Kiểm tra app đã tồn tại trên Fly.io chưa."""
    result = subprocess.run(
        [fly, "apps", "list"],
        capture_output=True, text=True
    )
    return APP_NAME in result.stdout


def create_app(fly: str):
    """Tạo app mới trên Fly.io."""
    if app_exists(fly):
        print(f"✅ App '{APP_NAME}' đã tồn tại")
        return

    print(f"🆕 Tạo app '{APP_NAME}'...")
    run([fly, "apps", "create", APP_NAME, "--machines"])


def set_secrets(fly: str):
    """Đọc file .env và set secrets lên Fly.io."""
    if not os.path.exists(ENV_FILE):
        print(f"⚠️  Không tìm thấy file '{ENV_FILE}'")
        print("   Tạo file .env từ .env.example và điền đầy đủ thông tin.")
        create_env = input("   Bạn muốn tạo .env ngay bây giờ không? (y/n): ")
        if create_env.lower() == "y":
            guide_create_env()
        sys.exit(1)

    secrets = {}
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, val = line.partition("=")
                val = val.strip().strip('"').strip("'")
                if val and "your_" not in val:   # bỏ qua placeholder
                    secrets[key.strip()] = val

    if not secrets:
        print("❌ File .env trống hoặc chỉ chứa placeholder.")
        print("   Hãy điền đầy đủ DISCORD_TOKEN, CLIENT_ID, GEMINI_API_KEY.")
        sys.exit(1)

    # Ghép thành chuỗi KEY=VALUE cho fly secrets set
    pairs = [f"{k}={v}" for k, v in secrets.items()]
    print(f"🔐 Setting {len(pairs)} secrets: {', '.join(secrets.keys())}")
    run([fly, "secrets", "set", "--app", APP_NAME] + pairs)


def guide_create_env():
    """Hướng dẫn tạo .env tương tác."""
    print("\n📝 Tạo file .env")
    discord_token  = input("   DISCORD_TOKEN   : ").strip()
    client_id      = input("   CLIENT_ID       : ").strip()
    gemini_key     = input("   GEMINI_API_KEY  : ").strip()
    max_rooms      = input("   MAX_GLOBAL_ROOMS (mặc định 150): ").strip() or "150"
    max_guild      = input("   MAX_GUILD_ROOMS  (mặc định 1)  : ").strip() or "1"

    with open(ENV_FILE, "w") as f:
        f.write(f"DISCORD_TOKEN={discord_token}\n")
        f.write(f"CLIENT_ID={client_id}\n")
        f.write(f"GEMINI_API_KEY={gemini_key}\n")
        f.write(f"MAX_GLOBAL_ROOMS={max_rooms}\n")
        f.write(f"MAX_GUILD_ROOMS={max_guild}\n")

    print(f"✅ Đã tạo file {ENV_FILE}")


def deploy_commands_once(fly: str):
    """Hỏi xem có cần deploy slash commands không (chỉ cần làm 1 lần)."""
    ans = input("\n❓ Bạn có muốn deploy Slash Commands Discord không? (y/n, chỉ cần 1 lần): ")
    if ans.lower() != "y":
        return

    # Chạy deploy-commands trong container tạm
    print("📡 Đang deploy Slash Commands...")
    run([
        fly, "ssh", "console",
        "--app", APP_NAME,
        "--command", "node src/deploy-commands.js"
    ], check=False)


def deploy(fly: str):
    """Build Docker image và deploy lên Fly.io."""
    print(f"\n🚀 Deploying '{APP_NAME}'...")
    run([fly, "deploy", "--app", APP_NAME, "--remote-only"])


def show_status(fly: str):
    """Hiển thị trạng thái sau khi deploy."""
    print("\n📊 Trạng thái app:")
    run([fly, "status", "--app", APP_NAME], check=False)


def show_logs(fly: str):
    """Xem logs realtime."""
    ans = input("\n👀 Xem logs realtime? (y/n): ")
    if ans.lower() == "y":
        print("   (Nhấn Ctrl+C để thoát)\n")
        run([fly, "logs", "--app", APP_NAME], check=False)


# ─── MAIN ────────────────────────────────────────────────────────────────────
def main():
    print("=" * 55)
    print("  🤖  TykBot — Fly.io Deployment Script")
    print("=" * 55)

    fly = check_flyctl()
    check_login(fly)
    create_app(fly)
    set_secrets(fly)
    deploy(fly)
    show_status(fly)
    deploy_commands_once(fly)
    show_logs(fly)

    print("\n✅ Deploy hoàn tất!")
    print(f"   Xem logs: fly logs --app {APP_NAME}")
    print(f"   SSH vào:  fly ssh console --app {APP_NAME}")
    print(f"   Dừng bot: fly scale count 0 --app {APP_NAME}")
    print(f"   Chạy lại: fly scale count 1 --app {APP_NAME}")


if __name__ == "__main__":
    main()
