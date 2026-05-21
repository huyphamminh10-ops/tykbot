import subprocess
import sys
import os
import time
from datetime import datetime

COUNTER_FILE = ".push_counter"
MAX_RETRIES  = 5
RETRY_DELAY  = 5  # giây giữa mỗi lần thử

# ── Helper ────────────────────────────────────────────────────────────────────

def run(cmd, **kwargs):
    return subprocess.run(cmd, **kwargs)

def section(title):
    bar = "─" * 48
    print(f"\n┌{bar}┐")
    print(f"│  {title:<46}│")
    print(f"└{bar}┘")

# ── Đọc / khởi tạo counter ───────────────────────────────────────────────────

if os.path.exists(COUNTER_FILE):
    with open(COUNTER_FILE, "r") as f:
        count = int(f.read().strip())
else:
    count = 1
    with open(COUNTER_FILE, "w") as f:
        f.write(str(count))
    print(f"📄 Tạo mới {COUNTER_FILE} — bắt đầu từ commit #1")

# ── Deploy slash commands ─────────────────────────────────────────────────────

section("🔧  Deploy Slash Commands")
deploy = run(["node", "src/deploy-commands.js"])
if deploy.returncode != 0:
    print("❌ deploy-commands.js thất bại — hủy push.")
    sys.exit(1)
print("✅ Slash commands deployed.")

# ── Git add + commit ──────────────────────────────────────────────────────────

section("📦  Git Commit")

timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
commit_msg = f"build({count}): update — {timestamp}"

run(["git", "add", "."], check=True)

result = run(["git", "commit", "-m", commit_msg])
if result.returncode != 0:
    print("⚠️  Không có thay đổi nào để commit — bỏ qua push.")
    sys.exit(0)

print(f"📝 Committed: \"{commit_msg}\"")

# ── Git push với retry ────────────────────────────────────────────────────────

section("🚀  Git Push")

for attempt in range(1, MAX_RETRIES + 1):
    print(f"  [{attempt}/{MAX_RETRIES}] Pushing commit #{count}...")
    result = run(["git", "push", "origin", "main"])

    if result.returncode == 0:
        with open(COUNTER_FILE, "w") as f:
            f.write(str(count + 1))
        break

    if attempt < MAX_RETRIES:
        print(f"  ❌ Thất bại — thử lại sau {RETRY_DELAY}s...")
        time.sleep(RETRY_DELAY)

else:
    print(f"\n💀 Push thất bại sau {MAX_RETRIES} lần. Kiểm tra kết nối rồi chạy lại.")
    sys.exit(1)

# ── Summary ───────────────────────────────────────────────────────────────────

section("✅  Done")
print(f"  Commit  : #{count}")
print(f"  Message : {commit_msg}")
print(f"  Time    : {timestamp}")
print(f"  Next    : #{count + 1}\n")
