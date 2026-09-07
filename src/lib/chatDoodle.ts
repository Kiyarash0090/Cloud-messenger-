import type { CSSProperties } from 'react';

// Telegram-inspired high-fidelity scattered doodle pattern themed around "Cloud Messenger"
export const CLOUD_DOODLE_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600" fill="none">
  <!-- 1. Organic Cloud with Paper Plane (Top-Left, tilted) -->
  <g transform="translate(45, 50) rotate(-10)">
    <path d="M22 38 C14 38 6 30 8 20 C10 10 22 8 28 14 C34 4 48 4 56 12 C64 10 74 18 72 28 C80 30 82 40 76 46 C70 52 28 52 22 38 Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M50 24 L78 12 L64 36 L56 26 Z M64 36 L68 22" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- 2. Cloud with Encrypted Keylock (Top-Center-Right) -->
  <g transform="translate(240, 30) rotate(8)">
    <path d="M20 34 C12 34 5 27 7 18 C9 9 20 7 25 12 C30 3 43 3 50 10 C57 8 66 15 64 24 C71 26 73 35 68 40 C62 45 25 45 20 34 Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="32" y="24" width="16" height="13" rx="3" stroke="currentColor" stroke-width="1.5"/>
    <path d="M36 24 V19 C36 15 44 15 44 19 V24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="40" cy="30" r="1.5" fill="currentColor"/>
  </g>

  <!-- 3. Satellite orbiting clouds (Top-Right) -->
  <g transform="translate(470, 45) rotate(22)">
    <rect x="20" y="15" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
    <line x1="29" y1="15" x2="29" y2="29" stroke="currentColor" stroke-width="1.2"/>
    <line x1="6" y1="22" x2="20" y2="22" stroke="currentColor" stroke-width="1.5"/>
    <line x1="38" y1="22" x2="52" y2="22" stroke="currentColor" stroke-width="1.5"/>
    <rect x="2" y="16" width="6" height="12" rx="1" stroke="currentColor" stroke-width="1.3"/>
    <rect x="50" y="16" width="6" height="12" rx="1" stroke="currentColor" stroke-width="1.3"/>
    <path d="M29 29 L35 40" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M33 42 Q39 42 41 38" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
  </g>

  <!-- 4. Sparkle & Starlight scattered cluster 1 -->
  <g transform="translate(180, 110)">
    <path d="M12 0 Q12 12 0 12 Q12 12 12 24 Q12 12 24 12 Q12 12 12 0 Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
    <circle cx="34" cy="8" r="1.5" fill="currentColor" opacity="0.7"/>
    <circle cx="-14" cy="18" r="1.2" fill="currentColor" opacity="0.6"/>
  </g>

  <!-- 5. Cloud Message Bubble with Typing Dots (Mid-Left) -->
  <g transform="translate(70, 160) rotate(-6)">
    <path d="M18 36 C8 36 2 28 4 18 C6 8 18 6 24 12 C30 2 44 2 52 10 C60 8 70 16 68 26 C75 28 78 38 72 44 C67 49 46 49 40 48 L28 56 L30 46 C24 45 19 41 18 36 Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="26" cy="27" r="2" fill="currentColor"/>
    <circle cx="37" cy="27" r="2" fill="currentColor"/>
    <circle cx="48" cy="27" r="2" fill="currentColor"/>
  </g>

  <!-- 6. Sun Peeking Behind Fluffy Cloud (Center) -->
  <g transform="translate(280, 150) rotate(12)">
    <path d="M28 14 A14 14 0 0 1 54 28" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="41" y1="2" x2="41" y2="7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <line x1="56" y1="10" x2="52" y2="14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <line x1="62" y1="26" x2="57" y2="26" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M14 42 C6 42 0 34 2 25 C4 16 15 14 20 19 C25 10 38 10 45 17 C52 15 61 22 59 31 C66 33 68 42 63 47 C57 52 20 52 14 42 Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- 7. Paper Airplane with Loop Trail (Mid-Right) -->
  <g transform="translate(460, 180) rotate(-18)">
    <path d="M10 30 L54 6 L32 46 L24 32 Z M32 46 L36 28 L54 6" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M10 32 Q-6 42 4 52 Q16 62 14 46 Q12 36 -4 40" stroke="currentColor" stroke-width="1.3" stroke-dasharray="3 3" stroke-linecap="round"/>
  </g>

  <!-- 8. Cloud with Upload / Download Sync Arrows (Center-Left) -->
  <g transform="translate(30, 290) rotate(8)">
    <path d="M16 34 C8 34 2 26 4 17 C6 8 17 6 22 11 C27 2 40 2 47 9 C54 7 63 14 61 23 C68 25 70 34 65 39 C59 44 22 44 16 34 Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M34 22 L41 15 L48 22 M41 16 V32" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <!-- 9. Crescent Moon Resting in Starry Cloud (Center) -->
  <g transform="translate(210, 270) rotate(-14)">
    <path d="M36 12 C30 12 24 17 24 25 C24 34 32 40 40 40 C44 40 48 38 50 35 C42 35 36 27 38 15 C38 13 37 12 36 12 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M12 40 C6 40 0 34 2 26 C4 18 14 16 18 20 C23 13 34 13 40 19 C46 17 54 23 53 31 C59 33 60 40 56 44 C51 48 18 48 12 40 Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="56" cy="14" r="1.5" fill="currentColor"/>
    <circle cx="16" cy="12" r="1.2" fill="currentColor"/>
  </g>

  <!-- 10. Hot Air Balloon Floating in Clouds (Mid-Right) -->
  <g transform="translate(420, 290) rotate(6)">
    <path d="M16 28 C10 18 14 4 28 4 C42 4 46 18 40 28 C36 34 33 38 31 40 H25 C23 38 20 34 16 28 Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M22 6 C20 14 20 26 25 40" stroke="currentColor" stroke-width="1.2"/>
    <path d="M34 6 C36 14 36 26 31 40" stroke="currentColor" stroke-width="1.2"/>
    <rect x="24" y="45" width="8" height="6" rx="1.5" stroke="currentColor" stroke-width="1.4"/>
    <line x1="25" y1="40" x2="25" y2="45" stroke="currentColor" stroke-width="1.1"/>
    <line x1="31" y1="40" x2="31" y2="45" stroke="currentColor" stroke-width="1.1"/>
  </g>

  <!-- 11. Cloud with Voice Wave / Audio equalizer (Bottom-Left) -->
  <g transform="translate(80, 420) rotate(-12)">
    <path d="M14 38 C6 38 0 30 2 21 C4 12 15 10 20 15 C25 6 38 6 45 13 C52 11 61 18 59 27 C66 29 68 38 63 43 C57 48 20 48 14 38 Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="22" y1="28" x2="22" y2="34" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="28" y1="24" x2="28" y2="38" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="34" y1="20" x2="34" y2="42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="40" y1="23" x2="40" y2="39" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="46" y1="27" x2="46" y2="35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  </g>

  <!-- 12. Cloud with Lightning Bolt & Raindrops (Bottom-Center) -->
  <g transform="translate(290, 410) rotate(10)">
    <path d="M16 32 C8 32 2 24 4 15 C6 6 17 4 22 9 C27 0 40 0 47 7 C54 5 63 12 61 21 C68 23 70 32 65 37 C59 42 22 42 16 32 Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M34 38 L28 47 H35 L30 56" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <line x1="18" y1="46" x2="15" y2="52" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <line x1="46" y1="44" x2="43" y2="50" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
  </g>

  <!-- 13. Cloud with Heart / Reaction (Bottom-Right) -->
  <g transform="translate(480, 430) rotate(-8)">
    <path d="M18 36 C10 36 4 28 6 19 C8 10 19 8 24 13 C29 4 42 4 49 11 C56 9 65 16 63 25 C70 27 72 36 67 41 C61 46 24 46 18 36 Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M36 21 C33 17 27 18 26 23 C25 28 36 34 36 34 C36 34 47 28 46 23 C45 18 39 17 36 21 Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" fill="none"/>
  </g>

  <!-- 14. Wireless Cloud / WiFi Broadcast (Bottom-Center-Left) -->
  <g transform="translate(190, 480) rotate(15)">
    <path d="M14 34 C6 34 0 26 2 17 C4 8 15 6 20 11 C25 2 38 2 45 9 C52 7 61 14 59 23 C66 25 68 34 63 39 C57 44 20 44 14 34 Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M26 25 Q34 18 42 25" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M30 29 Q34 25 38 29" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="34" cy="33" r="1.2" fill="currentColor"/>
  </g>

  <!-- 15. Constellation & Sparkle Details (Scattered across space) -->
  <g transform="translate(140, 30)">
    <circle cx="0" cy="0" r="1.4" fill="currentColor" opacity="0.6"/>
    <circle cx="15" cy="18" r="1.1" fill="currentColor" opacity="0.5"/>
    <line x1="0" y1="0" x2="15" y2="18" stroke="currentColor" stroke-width="0.8" stroke-dasharray="2 3" opacity="0.35"/>
  </g>

  <g transform="translate(380, 80)">
    <path d="M8 0 Q8 8 0 8 Q8 8 8 16 Q8 8 16 8 Q8 8 8 0 Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
    <circle cx="26" cy="16" r="1.3" fill="currentColor" opacity="0.5"/>
  </g>

  <g transform="translate(200, 200)">
    <circle cx="0" cy="0" r="1.8" fill="currentColor" opacity="0.6"/>
    <circle cx="25" cy="15" r="1.2" fill="currentColor" opacity="0.4"/>
  </g>

  <g transform="translate(540, 320)">
    <path d="M6 0 Q6 6 0 6 Q6 6 6 12 Q6 6 12 6 Q6 6 6 0 Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
  </g>

  <g transform="translate(400, 520)">
    <path d="M7 0 Q7 7 0 7 Q7 7 7 14 Q7 7 14 7 Q7 7 7 0 Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
    <circle cx="-16" cy="10" r="1.4" fill="currentColor" opacity="0.5"/>
  </g>

  <g transform="translate(30, 530)">
    <circle cx="0" cy="0" r="1.5" fill="currentColor" opacity="0.5"/>
    <circle cx="18" cy="-8" r="1.2" fill="currentColor" opacity="0.4"/>
  </g>

  <g transform="translate(530, 110)">
    <circle cx="0" cy="0" r="1.6" fill="currentColor" opacity="0.6"/>
    <circle cx="-12" cy="14" r="1.2" fill="currentColor" opacity="0.4"/>
  </g>
</svg>
`.trim();

// Encode SVG for CSS background-image
export const getDoodlePatternDataUri = (color = 'rgba(255, 255, 255, 0.07)') => {
  const cleanSvg = CLOUD_DOODLE_SVG.replace(/currentColor/g, color);
  return `data:image/svg+xml;utf8,${encodeURIComponent(cleanSvg)}`;
};

export interface ChatThemePreset {
  id: string;
  name: string;
  faName: string;
  bgColor: string;
  gradient?: string;
  doodleColor: string;
  doodleOpacity: number;
  preview: string;
  // App-wide cohesive design palette
  appBg: string;
  sidebarBg: string;
  panelBg: string;
  inputBg: string;
  border: string;
  accent: string;
  accentHover: string;
  accentGlow: string;
  accentText: string;
  bubbleMe: string;
  bubbleMeHover: string;
  playerBg: string;
  headerBg: string;
  isLight?: boolean;
}

export const CHAT_THEME_PRESETS: ChatThemePreset[] = [
  {
    id: 'cloud-telegram',
    name: 'Telegram Cloud',
    faName: 'کلاسیک ابری (تلگرام)',
    bgColor: '#0e1621',
    gradient: 'linear-gradient(180deg, #0e1621 0%, #0b111a 100%)',
    doodleColor: 'rgba(255, 255, 255, 0.075)',
    doodleOpacity: 1,
    preview: '#0e1621',
    appBg: '#0e1621',
    sidebarBg: '#17212b',
    panelBg: '#1e2a38',
    inputBg: '#242f3d',
    border: 'rgba(255, 255, 255, 0.08)',
    accent: '#2b86d9',
    accentHover: '#2275c2',
    accentGlow: 'rgba(43, 134, 217, 0.3)',
    accentText: '#64b5f6',
    bubbleMe: '#2b5278',
    bubbleMeHover: '#33618d',
    playerBg: 'rgba(23, 33, 43, 0.96)',
    headerBg: 'rgba(14, 22, 33, 0.88)',
    isLight: false,
  },
  {
    id: 'telegram-day-light',
    name: 'Daylight Blue (Light)',
    faName: 'روز ابری (روشن)',
    bgColor: '#eef2f6',
    gradient: 'linear-gradient(180deg, #f4f6f8 0%, #e2e8f0 100%)',
    doodleColor: 'rgba(30, 41, 59, 0.08)',
    doodleOpacity: 1,
    preview: '#ffffff',
    appBg: '#f1f5f9',
    sidebarBg: '#ffffff',
    panelBg: '#ffffff',
    inputBg: '#f1f5f9',
    border: 'rgba(0, 0, 0, 0.09)',
    accent: '#2563eb',
    accentHover: '#1d4ed8',
    accentGlow: 'rgba(37, 99, 235, 0.25)',
    accentText: '#2563eb',
    bubbleMe: '#3b82f6',
    bubbleMeHover: '#2563eb',
    playerBg: 'rgba(255, 255, 255, 0.96)',
    headerBg: 'rgba(255, 255, 255, 0.92)',
    isLight: true,
  },
  {
    id: 'telegram-emerald-light',
    name: 'Mint Breeze (Light)',
    faName: 'نعنایی و زمردی (روشن)',
    bgColor: '#eefbf4',
    gradient: 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)',
    doodleColor: 'rgba(6, 78, 59, 0.08)',
    doodleOpacity: 1,
    preview: '#f0fdf4',
    appBg: '#f0fdf4',
    sidebarBg: '#ffffff',
    panelBg: '#ffffff',
    inputBg: '#e6f7ed',
    border: 'rgba(16, 185, 129, 0.16)',
    accent: '#059669',
    accentHover: '#047857',
    accentGlow: 'rgba(5, 150, 105, 0.25)',
    accentText: '#059669',
    bubbleMe: '#10b981',
    bubbleMeHover: '#059669',
    playerBg: 'rgba(255, 255, 255, 0.96)',
    headerBg: 'rgba(240, 253, 244, 0.92)',
    isLight: true,
  },
  {
    id: 'telegram-sand-light',
    name: 'Warm Amber (Light)',
    faName: 'شنی و کهربایی (روشن)',
    bgColor: '#faf5ea',
    gradient: 'linear-gradient(180deg, #faf6ee 0%, #faedd8 100%)',
    doodleColor: 'rgba(120, 53, 15, 0.08)',
    doodleOpacity: 1,
    preview: '#fffbeb',
    appBg: '#faf6ee',
    sidebarBg: '#ffffff',
    panelBg: '#ffffff',
    inputBg: '#f4ede0',
    border: 'rgba(217, 119, 6, 0.16)',
    accent: '#d97706',
    accentHover: '#b45309',
    accentGlow: 'rgba(217, 119, 6, 0.25)',
    accentText: '#d97706',
    bubbleMe: '#f59e0b',
    bubbleMeHover: '#d97706',
    playerBg: 'rgba(255, 255, 255, 0.96)',
    headerBg: 'rgba(250, 246, 238, 0.92)',
    isLight: true,
  },
  {
    id: 'telegram-classic-blue',
    name: 'Deep Cloud Blue',
    faName: 'آبی ابری عمیق',
    bgColor: '#09101f',
    gradient: 'linear-gradient(135deg, #080f24 0%, #0f1c3f 50%, #0a1228 100%)',
    doodleColor: 'rgba(147, 197, 253, 0.085)',
    doodleOpacity: 1,
    preview: '#080f24',
    appBg: '#09101f',
    sidebarBg: '#0d1830',
    panelBg: '#122040',
    inputBg: '#172952',
    border: 'rgba(59, 130, 246, 0.16)',
    accent: '#3b82f6',
    accentHover: '#2563eb',
    accentGlow: 'rgba(59, 130, 246, 0.35)',
    accentText: '#93c5fd',
    bubbleMe: '#1d4ed8',
    bubbleMeHover: '#2563eb',
    playerBg: 'rgba(13, 24, 48, 0.96)',
    headerBg: 'rgba(9, 16, 31, 0.88)',
    isLight: false,
  },
  {
    id: 'telegram-emerald',
    name: 'Emerald Forest',
    faName: 'زمرد تاریک',
    bgColor: '#06120c',
    gradient: 'linear-gradient(135deg, #06120c 0%, #0e291d 50%, #07160f 100%)',
    doodleColor: 'rgba(167, 243, 208, 0.08)',
    doodleOpacity: 1,
    preview: '#06120c',
    appBg: '#06120c',
    sidebarBg: '#0b1e15',
    panelBg: '#10291d',
    inputBg: '#153627',
    border: 'rgba(16, 185, 129, 0.16)',
    accent: '#10b981',
    accentHover: '#059669',
    accentGlow: 'rgba(16, 185, 129, 0.35)',
    accentText: '#6ee7b7',
    bubbleMe: '#065f46',
    bubbleMeHover: '#047857',
    playerBg: 'rgba(11, 30, 21, 0.96)',
    headerBg: 'rgba(6, 18, 12, 0.88)',
    isLight: false,
  },
  {
    id: 'telegram-cosmic',
    name: 'Cosmic Violet',
    faName: 'بنفش کیهانی',
    bgColor: '#0e0917',
    gradient: 'linear-gradient(135deg, #0f0918 0%, #1f1233 50%, #110a1b 100%)',
    doodleColor: 'rgba(216, 180, 254, 0.085)',
    doodleOpacity: 1,
    preview: '#0f0918',
    appBg: '#0e0917',
    sidebarBg: '#170f26',
    panelBg: '#201535',
    inputBg: '#2b1c47',
    border: 'rgba(168, 85, 247, 0.16)',
    accent: '#a855f7',
    accentHover: '#9333ea',
    accentGlow: 'rgba(168, 85, 247, 0.35)',
    accentText: '#d8b4fe',
    bubbleMe: '#6b21a8',
    bubbleMeHover: '#7e22ce',
    playerBg: 'rgba(23, 15, 38, 0.96)',
    headerBg: 'rgba(14, 9, 23, 0.88)',
    isLight: false,
  },
  {
    id: 'telegram-amoled',
    name: 'Onyx AMOLED',
    faName: 'مشکی مطلق (AMOLED)',
    bgColor: '#000000',
    gradient: 'linear-gradient(180deg, #040404 0%, #000000 100%)',
    doodleColor: 'rgba(255, 255, 255, 0.065)',
    doodleOpacity: 1,
    preview: '#000000',
    appBg: '#000000',
    sidebarBg: '#0a0a0a',
    panelBg: '#141414',
    inputBg: '#1c1c1c',
    border: 'rgba(255, 255, 255, 0.10)',
    accent: '#38bdf8',
    accentHover: '#0ea5e9',
    accentGlow: 'rgba(56, 189, 248, 0.3)',
    accentText: '#7dd3fc',
    bubbleMe: '#0369a1',
    bubbleMeHover: '#0284c7',
    playerBg: 'rgba(10, 10, 10, 0.96)',
    headerBg: 'rgba(0, 0, 0, 0.88)',
    isLight: false,
  },
  {
    id: 'telegram-warm-ruby',
    name: 'Sunset Ruby',
    faName: 'غروب یاقوتی',
    bgColor: '#14070a',
    gradient: 'linear-gradient(135deg, #15090d 0%, #291016 50%, #14080c 100%)',
    doodleColor: 'rgba(254, 205, 211, 0.08)',
    doodleOpacity: 1,
    preview: '#15090d',
    appBg: '#14070a',
    sidebarBg: '#1e0c12',
    panelBg: '#291119',
    inputBg: '#361622',
    border: 'rgba(244, 63, 94, 0.16)',
    accent: '#f43f5e',
    accentHover: '#e11d48',
    accentGlow: 'rgba(244, 63, 94, 0.35)',
    accentText: '#fda4af',
    bubbleMe: '#9f1239',
    bubbleMeHover: '#be123c',
    playerBg: 'rgba(30, 12, 18, 0.96)',
    headerBg: 'rgba(20, 7, 10, 0.88)',
    isLight: false,
  }
];

export const getDoodleWallpaperStyle = (themeId: string | undefined, isPreview = false): CSSProperties => {
  const selectedTheme = CHAT_THEME_PRESETS.find(t => t.id === themeId) || CHAT_THEME_PRESETS[0];
  const patternUri = getDoodlePatternDataUri(selectedTheme.doodleColor);

  return {
    backgroundColor: selectedTheme.bgColor,
    backgroundImage: `url("${patternUri}"), ${selectedTheme.gradient || selectedTheme.bgColor}`,
    backgroundSize: isPreview ? '240px 240px, cover' : '460px 460px, cover',
    backgroundPosition: 'center center, center center',
    backgroundRepeat: 'repeat, no-repeat',
    backgroundAttachment: isPreview ? 'scroll, scroll' : 'fixed, fixed'
  };
};

/**
 * Dynamically synchronizes the CSS variables of the entire application
 * to match the selected theme preset (Sidebar, App Background, Input, Panels, Accent, Borders).
 */
export const applyGlobalTheme = (themeId: string | undefined): ChatThemePreset => {
  const theme = CHAT_THEME_PRESETS.find(t => t.id === themeId) || CHAT_THEME_PRESETS[0];
  
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.style.setProperty('--brand-bg', theme.appBg);
    root.style.setProperty('--brand-sidebar', theme.sidebarBg);
    root.style.setProperty('--brand-panel', theme.panelBg);
    root.style.setProperty('--brand-input', theme.inputBg);
    root.style.setProperty('--brand-border', theme.border);
    root.style.setProperty('--brand-accent', theme.accent);
    root.style.setProperty('--brand-accent-hover', theme.accentHover);
    root.style.setProperty('--brand-accent-glow', theme.accentGlow);
    root.style.setProperty('--brand-accent-text', theme.accentText);
    root.style.setProperty('--brand-bubble-me', theme.bubbleMe);
    root.style.setProperty('--brand-bubble-me-hover', theme.bubbleMeHover);
    root.style.setProperty('--brand-player-bg', theme.playerBg);
    root.style.setProperty('--brand-header-bg', theme.headerBg);
    root.style.setProperty('--brand-text', theme.isLight ? '#0f172a' : '#F8FAFC');

    if (theme.isLight) {
      root.classList.remove('dark');
      root.classList.add('light');
      localStorage.setItem('app_theme_mode', 'light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      localStorage.setItem('app_theme_mode', 'dark');
    }

    try {
      localStorage.setItem('app_theme_id', theme.id);
    } catch {}
  }

  return theme;
};
