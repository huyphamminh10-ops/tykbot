# ⌨ Type your Keyboard!!! — Discord Battle Royale Bot

Bot Discord game **Battle Royale gõ phím** với hệ thống chống gian lận bằng Canvas AI và sinh đề bằng Gemini.

---

## 🏗 Kiến Trúc

```
src/
├── index.js                    # Entry point
├── deploy-commands.js          # Đăng ký Slash Commands
├── config/
│   └── constants.js            # Hằng số toàn cục
├── managers/
│   └── GlobalRoomManager.js    # Quản lý phòng + queue (Singleton)
├── services/
│   ├── GameEngine.js           # Vòng lặp gameplay chính
│   ├── GeminiService.js        # Sinh đề bằng Google Gemini AI
│   ├── CanvasService.js        # Render ảnh chống OCR/copy-paste
│   └── AntiCheatService.js     # Phát hiện gian lận WPM
├── commands/
│   └── tykcreate.js            # /tykcreate slash command
├── components/
│   ├── lobbyButtons.js         # Button & Select Menu handlers
│   └── modals.js               # Modal submit handlers
├── handlers/
│   └── InteractionHandler.js   # Router tất cả interactions
├── events/
│   └── index.js                # Discord event listeners
└── utils/
    └── EmbedBuilders.js        # Tất cả Discord Embeds & UI
```

---

## ⚙️ Cài Đặt

### 1. Yêu cầu
- Node.js >= 18.0.0
- npm hoặc yarn

### 2. Clone & Install
```bash
git clone <repo>
cd tyk-bot
npm install
```

### 3. Cấu hình môi trường
```bash
cp .env.example .env
```

Chỉnh sửa `.env`:
```env
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_application_client_id
GEMINI_API_KEY=your_gemini_api_key
```

### 4. Discord Bot Setup
Tại [Discord Developer Portal](https://discord.com/developers/applications):
- **Privileged Gateway Intents:** Bật `Message Content Intent`, `Server Members Intent`
- **OAuth2 Scopes:** `bot`, `applications.commands`
- **Bot Permissions:** `Send Messages`, `Create Private Threads`, `Manage Threads`, `Embed Links`, `Attach Files`, `Read Message History`

### 5. Deploy Slash Commands
```bash
node src/deploy-commands.js
```

### 6. Chạy Bot
```bash
npm start
# hoặc development với auto-reload:
npm run dev
```

---

## 🎮 Hướng Dẫn Chơi

### Tạo Phòng
```
/tykcreate <tên phòng> <Classic|Timer>
```

### Lobby Actions
| Nút | Chức năng |
|-----|-----------|
| ✅ Tham Gia | Vào phòng (cần mật khẩu nếu có) |
| 🚪 Thoát | Rời khỏi phòng |
| ▶️ BẮT ĐẦU | Host bắt đầu trận (cần ≥2 người) |
| ⚙️ Cấu Hình | Mở menu cài đặt phòng (Host only) |

### Menu Cấu Hình (4 trang)
1. **Số người chơi tối đa** (3-15)
2. **Chế độ đặc biệt**: Hardcore + Fast Mode toggle
3. **Độ dài câu**: Nhập min/max từ qua Modal
4. **Quản trị**: Kick, Mật khẩu, Đổi tên, Hủy phòng

---

## 🔧 Thông Số Kỹ Thuật

### Giới Hạn Hệ Thống
| Thông số | Giá trị |
|----------|---------|
| Phòng tối đa toàn hệ thống | 150 |
| Phòng tối đa mỗi server | 1 |
| Người chơi tối đa/phòng | 15 |

### Anti-Cheat Engine
| Cơ chế | Chi tiết |
|--------|----------|
| Chống Copy/Paste | Đề bài render thành ảnh PNG với noise |
| Anti-OCR | Pixel noise + interference lines bezier curves |
| WPM Detection | Kick nếu >230 WPM liên tiếp 2 câu |

### Chế Độ Classic
- 50 câu/round (sinh bởi Gemini)
- Round kết thúc khi ai đó hoàn thành 50 câu
- Người ít điểm nhất bị loại
- Tiếp tục đến còn 1 người

### Chế Độ Timer
- 100 câu/round
- Round 1: 2m30s → mỗi round +30s
- Ai ít câu nhất khi hết giờ bị loại

### Hardcore Mode
- Sai 1 câu = Loại ngay lập tức

### Normal Mode
- Tối đa 5 lỗi trước khi bị loại
- Câu sai bị bỏ qua sau 5s phạt

---

## 📦 Dependencies

| Package | Phiên bản | Mục đích |
|---------|-----------|---------|
| discord.js | ^14.16.3 | Discord API client |
| @google/genai | ^1.0.1 | Gemini AI sinh đề |
| canvas | ^2.11.2 | Render ảnh chống gian lận |
| dotenv | ^16.4.5 | Quản lý biến môi trường |

---

## 🚀 Production Deployment

### PM2 (Recommended)
```bash
npm install -g pm2
pm2 start src/index.js --name tyk-bot
pm2 startup
pm2 save
```

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
# Install canvas dependencies
RUN apk add --no-cache cairo-dev jpeg-dev pango-dev giflib-dev
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
CMD ["node", "src/index.js"]
```
# tykbot
# tykbot
# tykbot
