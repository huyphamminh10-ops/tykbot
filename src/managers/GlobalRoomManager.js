// src/managers/GlobalRoomManager.js
import { GAME_CONFIG, ROOM_STATUS, GAME_MODE } from '../config/constants.js';

/**
 * GlobalRoomManager - Quản lý toàn bộ phòng chơi trên hệ thống
 * Sử dụng singleton pattern để đảm bảo một instance duy nhất
 */
class GlobalRoomManager {
  constructor() {
    /** @type {Map<string, Room>} guildId -> Room */
    this.rooms = new Map();
    /** @type {Array<Room>} Hàng đợi phòng khi hệ thống đầy */
    this.queue = [];
  }

  // ─── Getters ────────────────────────────────────────────────────────────────

  get totalActiveRooms() {
    return this.rooms.size;
  }

  get isSystemFull() {
    return this.rooms.size >= GAME_CONFIG.MAX_GLOBAL_ROOMS;
  }

  getRoom(guildId) {
    return this.rooms.get(guildId) ?? null;
  }

  hasRoom(guildId) {
    return this.rooms.has(guildId);
  }

  getQueuePosition(guildId) {
    return this.queue.findIndex(r => r.id === guildId);
  }

  // ─── Room Creation ───────────────────────────────────────────────────────────

  /**
   * Tạo một phòng mới. Trả về { room, isQueued }
   * @param {string} guildId
   * @param {string} roomName
   * @param {string} hostId
   * @param {string} hostUsername
   * @param {string} gameMode
   * @returns {{ room: Room, isQueued: boolean }}
   */
  createRoom(guildId, roomName, hostId, hostUsername, gameMode) {
    if (this.hasRoom(guildId)) {
      throw new Error('ROOM_EXISTS');
    }

    const room = new Room(guildId, roomName, hostId, hostUsername, gameMode);

    if (this.isSystemFull) {
      room.status = ROOM_STATUS.QUEUE;
      room.queuePosition = this.queue.length + 1;
      this.queue.push(room);
      return { room, isQueued: true };
    }

    room.status = ROOM_STATUS.LOBBY;
    this.rooms.set(guildId, room);
    return { room, isQueued: false };
  }

  // ─── Room Deletion ───────────────────────────────────────────────────────────

  /**
   * Xóa phòng khỏi hệ thống và tự động promote phòng đầu queue (nếu có)
   * @param {string} guildId
   * @returns {Room|null} Phòng được promote từ queue (nếu có)
   */
  deleteRoom(guildId) {
    const existed = this.rooms.has(guildId);
    this.rooms.delete(guildId);

    // Dọn timers của phòng
    const room = this.rooms.get(guildId);
    if (room) room.cleanup();

    // Nếu có phòng trong queue, promote phòng đầu tiên
    if (existed && this.queue.length > 0) {
      return this.promoteNextInQueue();
    }
    return null;
  }

  /**
   * Xóa phòng từ queue (khi hủy phòng đang trong queue)
   * @param {string} guildId
   */
  removeFromQueue(guildId) {
    const idx = this.queue.findIndex(r => r.id === guildId);
    if (idx === -1) return;
    this.queue.splice(idx, 1);
    // Cập nhật lại vị trí xếp hàng
    this.queue.forEach((r, i) => { r.queuePosition = i + 1; });
  }

  /**
   * Promote phòng đầu tiên trong queue thành active
   * @returns {Room} Phòng vừa được promote
   */
  promoteNextInQueue() {
    if (this.queue.length === 0) return null;
    const room = this.queue.shift();
    room.status = ROOM_STATUS.LOBBY;
    room.queuePosition = 0;
    this.rooms.set(room.id, room);
    // Cập nhật lại số thứ tự các phòng còn lại trong queue
    this.queue.forEach((r, i) => { r.queuePosition = i + 1; });
    return room;
  }

  // ─── Debug ───────────────────────────────────────────────────────────────────

  getStats() {
    return {
      activeRooms: this.rooms.size,
      queueLength: this.queue.length,
      maxRooms: GAME_CONFIG.MAX_GLOBAL_ROOMS,
    };
  }
}

// ─── Room Class ───────────────────────────────────────────────────────────────

export class Room {
  /**
   * @param {string} id - Guild ID
   * @param {string} roomName
   * @param {string} hostId
   * @param {string} hostUsername
   * @param {string} gameMode - 'Classic' | 'Timer'
   */
  constructor(id, roomName, hostId, hostUsername, gameMode) {
    this.id = id;
    this.roomName = roomName;
    this.hostId = hostId;
    this.hostUsername = hostUsername;
    this.gameMode = gameMode;
    this.status = ROOM_STATUS.LOBBY;
    this.queuePosition = 0;
    this.currentRound = 1;

    this.settings = {
      maxPlayers: GAME_CONFIG.MAX_PLAYERS,
      isFastMode: false,
      isHardcore: false,
      minWords: GAME_CONFIG.MIN_WORDS_DEFAULT,
      maxWords: GAME_CONFIG.MAX_WORDS_DEFAULT,
      password: null,
    };

    /** @type {Map<string, PlayerData>} userId -> PlayerData */
    this.players = new Map();

    /** @type {string[]} Danh sách câu đề bài */
    this.sentences = [];

    // Discord message references để cập nhật embed
    this.lobbyMessageId = null;
    this.lobbyChannelId = null;

    // Timers internal
    this._timers = new Set();

    // Thread references: Map<userId, ThreadChannel>
    this.playerThreads = new Map();

    // Anti-cheat: Map<userId, consecutive violations count>
    this.cheatFlags = new Map();

    // Timer mode: current round duration tracking
    this.timerRoundDuration = GAME_CONFIG.TIMER_ROUND1_DURATION;
    this._roundTimer = null;
  }

  // ─── Player Management ───────────────────────────────────────────────────────

  addPlayer(userId, username) {
    if (this.players.has(userId)) return false;
    if (this.players.size >= this.settings.maxPlayers) return false;

    this.players.set(userId, {
      userId,
      username,
      wins: 0,
      currentScore: 0,
      currentRoundScore: 0,
      errors: 0,
      isEliminated: false,
      currentSentenceIndex: 0,
      lastTextTime: 0,
      consecutiveCheatCount: 0,
    });
    return true;
  }

  removePlayer(userId) {
    return this.players.delete(userId);
  }

  getPlayer(userId) {
    return this.players.get(userId) ?? null;
  }

  getActivePlayers() {
    return [...this.players.values()].filter(p => !p.isEliminated);
  }

  // ─── Round Management ────────────────────────────────────────────────────────

  resetRoundScores() {
    for (const player of this.players.values()) {
      if (!player.isEliminated) {
        player.currentScore = 0;
        player.currentRoundScore = 0;
        player.errors = 0;
        player.currentSentenceIndex = 0;
        player.lastTextTime = Date.now();
      }
    }
  }

  /**
   * Tìm người chơi bị loại cuối round (lowest scorer)
   * Tie-break: errors cao hơn -> loại. Vẫn tie: lastTextTime lâu hơn -> loại.
   * @returns {PlayerData}
   */
  findLowestScorer() {
    const active = this.getActivePlayers();
    if (active.length === 0) return null;

    return active.reduce((worst, player) => {
      if (!worst) return player;
      if (player.currentScore < worst.currentScore) return player;
      if (player.currentScore === worst.currentScore) {
        if (player.errors > worst.errors) return player;
        if (player.errors === worst.errors && player.lastTextTime > worst.lastTextTime) return player;
      }
      return worst;
    }, null);
  }

  // ─── Timer Management ────────────────────────────────────────────────────────

  setTimer(fn, delay) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, delay);
    this._timers.add(id);
    return id;
  }

  clearTimer(id) {
    clearTimeout(id);
    this._timers.delete(id);
  }

  cleanup() {
    for (const id of this._timers) {
      clearTimeout(id);
    }
    this._timers.clear();
    if (this._roundTimer) {
      clearTimeout(this._roundTimer);
      this._roundTimer = null;
    }
  }

  // ─── Serialization ───────────────────────────────────────────────────────────

  toJSON() {
    return {
      id: this.id,
      roomName: this.roomName,
      hostId: this.hostId,
      status: this.status,
      gameMode: this.gameMode,
      settings: this.settings,
      playerCount: this.players.size,
      queuePosition: this.queuePosition,
      currentRound: this.currentRound,
    };
  }
}

// ─── PlayerData typedef (JSDoc) ───────────────────────────────────────────────
/**
 * @typedef {Object} PlayerData
 * @property {string} userId
 * @property {string} username
 * @property {number} wins
 * @property {number} currentScore
 * @property {number} currentRoundScore
 * @property {number} errors
 * @property {boolean} isEliminated
 * @property {number} currentSentenceIndex
 * @property {number} lastTextTime
 * @property {number} consecutiveCheatCount
 */

// Singleton export
export const roomManager = new GlobalRoomManager();
