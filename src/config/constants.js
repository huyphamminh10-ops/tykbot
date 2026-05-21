// src/config/constants.js
export const GAME_CONFIG = {
  MAX_GLOBAL_ROOMS: parseInt(process.env.MAX_GLOBAL_ROOMS) || 150,
  MAX_GUILD_ROOMS: 1,
  MAX_PLAYERS: 15,
  MIN_PLAYERS: 2,

  // Timing (ms)
  CORRECT_DELAY_NORMAL: 5000,
  CORRECT_DELAY_FAST: 2000,
  PENALTY_DELAY: 5000,
  DM_CANCEL_TIMEOUT: 30000,

  // Anti-cheat
  MAX_WPM: 230,
  CHEAT_CONSECUTIVE_VIOLATIONS: 2,

  // Sentence limits
  MIN_WORDS_DEFAULT: 4,
  MAX_WORDS_DEFAULT: 12,
  MIN_WORDS_FLOOR: 4,
  MAX_WORDS_CEILING: 24,

  // Classic mode sentences
  CLASSIC_SENTENCES: 40,
  // Timer mode sentences
  TIMER_SENTENCES: 100,

  // Timer mode timing
  TIMER_ROUND1_DURATION: 120000, // 2m00s
  TIMER_ROUND_INCREMENT: 30000,  // +30s per round

  // Error limits
  MAX_ERRORS_NORMAL: 5,
  MAX_ERRORS_HARDCORE: 0,

  // Canvas image dimensions
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 160,
};

export const ROOM_STATUS = {
  LOBBY: 'LOBBY',
  QUEUE: 'QUEUE',
  LOADING: 'LOADING',
  PLAYING: 'PLAYING',
};

export const GAME_MODE = {
  CLASSIC: 'Classic',
  TIMER: 'Timer',
};

export const COLORS = {
  PRIMARY: 0x5865F2,
  SUCCESS: 0x57F287,
  DANGER: 0xED4245,
  WARNING: 0xFEE75C,
  SECONDARY: 0x4F545C,
  LOADING: 0xFF6B35,
  GOLD: 0xFFD700,
};

export const CUSTOM_IDS = {
  JOIN: 'tyk_join',
  LEAVE: 'tyk_leave',
  START: 'tyk_start',
  CONFIG: 'tyk_config',
  CFG_MAXPLAYERS: 'tyk_cfg_maxplayers',
  CFG_PAGE_PREV: 'tyk_cfg_prev',
  CFG_PAGE_NEXT: 'tyk_cfg_next',
  CFG_GAMEMODE: 'tyk_cfg_gamemode',
  CFG_HARDCORE: 'tyk_cfg_hardcore',
  CFG_FASTMODE: 'tyk_cfg_fastmode',
  CFG_WORDS_INPUT: 'tyk_cfg_words_input',
  CFG_KICK: 'tyk_cfg_kick',
  CFG_KICK_SELECT: 'tyk_cfg_kick_select',
  CFG_PASSWORD: 'tyk_cfg_password',
  CFG_RENAME: 'tyk_cfg_rename',
  CFG_CANCEL: 'tyk_cfg_cancel',
  PASSWORD_MODAL: 'tyk_modal_password',
  WORDS_MODAL: 'tyk_modal_words',
  RENAME_MODAL: 'tyk_modal_rename',
  JOIN_PASSWORD_MODAL: 'tyk_modal_join_password',
};
