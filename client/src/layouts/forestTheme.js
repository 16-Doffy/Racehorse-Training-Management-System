import { ROLES } from '../constants/roles';

/**
 * "Forest & brass" look for the Club Manager and Head Trainer: a deep green sidebar with a brass
 * highlight, a warm oat page and warm-white cards with a soft edge, so the screen is no longer one
 * block of white. The other roles keep the default look until their owners decide.
 *
 * Applied by MainLayout through a nested ConfigProvider, so every Ant Design component inside the
 * layout (tables, cards, forms, modals) picks it up without page-by-page changes.
 */
export const FOREST_ROLES = [ROLES.MANAGER, ROLES.HEAD_TRAINER, ROLES.VETERINARIAN];
export const usesForestTheme = (role) => FOREST_ROLES.includes(role);
// The canvas picker and its presets are the Club Manager / Head Trainer look. The vet stays on the
// forest look it had (the warm oat page, preset parchment_old) until trunghieu decides.
export const CANVAS_ROLES = [ROLES.MANAGER, ROLES.HEAD_TRAINER];
export const usesCanvasPicker = (role) => CANVAS_ROLES.includes(role);

// Small label above the sidebar menu.
export const MENU_SECTION_LABEL = {
  [ROLES.MANAGER]: 'Điều hành CLB',
  [ROLES.HEAD_TRAINER]: 'Huấn luyện',
  [ROLES.VETERINARIAN]: 'Y Tế & Thú Y',
  [ROLES.OWNER]: 'Chủ Sở Hữu',
};

export const FOREST = {
  sider: '#0F3A2C',
  siderHover: '#174A39',
  siderText: '#C3D4CA',
  siderMuted: '#8FB0A1',
  siderLine: 'rgba(255, 255, 255, 0.08)',
  logoText: '#F4F1E8',
  brass: '#F2C14E',
  brassText: '#F6D57A',
  brassBg: '#334F32',
  page: '#F8F7F4', // Default to Royal Sand Bone
  card: '#FFFFFF',
  border: '#EAE7E1',
  borderStrong: '#DCD7CE',
  ink: '#1A2B22',
  primary: '#0F5A43',
};

export const CANVAS_PRESETS = {
  sand_bone: {
    key: 'sand_bone',
    label: 'PA 1: Trắng Ngà Cát Ấm (Sand Bone)',
    badge: 'Khuyên dùng',
    page: '#F4EFE6',
    card: '#FAF7F0',
    border: '#E5DAC6',
    borderStrong: '#D7C7AE',
    ink: '#1A2B22',
  },
  platinum_slate: {
    key: 'platinum_slate',
    label: 'PA 2: Bạch Kim Xám Bạc (Platinum Slate)',
    badge: 'Chuẩn SaaS',
    page: '#EEF2F6',
    card: '#F8FAFC',
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',
    ink: '#0F172A',
  },
  turf_mist: {
    key: 'turf_mist',
    label: 'PA 3: Sương Rêu Đồng Cỏ (Turf Mist)',
    badge: 'Bản sắc Đua ngựa',
    page: '#EDF4F0',
    card: '#F6FAF8',
    border: '#D2E2DA',
    borderStrong: '#BDD4C8',
    ink: '#132A20',
  },
  midnight_cockpit: {
    key: 'midnight_cockpit',
    label: 'PA 4: Khoang Lái Đêm (Midnight Cockpit)',
    badge: 'Dark VIP',
    page: '#090E0C',
    card: '#121C18',
    border: '#1D2E27',
    borderStrong: '#2A4238',
    ink: '#F8FAFC',
  },
  peak_equestrian_dark: {
    key: 'peak_equestrian_dark',
    label: 'PA 5 (PEAK): Đỉnh Cao Kỵ Binh — Đêm Grand Prix (Horsey & Alizée)',
    badge: 'Peak Luxury',
    page: '#06130E',
    card: '#0D211A',
    border: 'rgba(212, 175, 55, 0.28)',
    borderStrong: 'rgba(212, 175, 55, 0.45)',
    ink: '#FAF8F5',
    isDark: true,
  },
  peak_equestrian_light: {
    key: 'peak_equestrian_light',
    label: 'PA 6 (PEAK): Kỵ Binh Lụa Ngà — Ngày Chantilly (Linen & Saddle)',
    badge: 'Peak Day',
    page: '#F2ECE0',
    card: '#FAF6EE',
    border: '#E5DAC4',
    borderStrong: '#D4C29E',
    ink: '#15251D',
  },
  parchment_old: {
    key: 'parchment_old',
    label: 'Gốc: Warm Oat (Bìa giấy cũ)',
    badge: 'Bản cũ',
    page: '#EFECE4',
    card: '#FFFDF8',
    border: '#E4DFD3',
    borderStrong: '#D8D1C2',
    ink: '#1A2B22',
  },
};

// The dark canvases stay out of the picker until their contrast is fixed (handoff 49): a dark canvas
// still saved in a browser falls back to the default light one.
const isDarkPreset = (p) => Boolean(p.isDark || p.key === 'midnight_cockpit');
export const PICKABLE_PRESETS = Object.values(CANVAS_PRESETS).filter((p) => !isDarkPreset(p));
export const pickableCanvas = (key) => (PICKABLE_PRESETS.some((p) => p.key === key) ? key : 'sand_bone');

/** Colour and tint per status, for figures that carry a state (dashboard counters). */
export const STATUS_TONES = {
  neutral: { color: FOREST.ink, bg: '#E3ECE6' },
  good: { color: '#2E7D4F', bg: '#E1F0E5' },
  watch: { color: '#9A6B00', bg: '#F8EDCF' },
  bad: { color: '#B3261E', bg: '#F7E1DD' },
};

export function getForestTheme(presetKey = 'sand_bone') {
  const p = CANVAS_PRESETS[presetKey] || CANVAS_PRESETS.sand_bone;
  const isDark = Boolean(p.isDark || presetKey === 'midnight_cockpit');
  return {
    token: {
      colorPrimary: isDark ? '#D4AF37' : FOREST.primary,
      colorLink: isDark ? '#F6D57A' : FOREST.primary,
      colorTextBase: p.ink,
      colorBgLayout: p.page,
      colorBgContainer: p.card,
      colorBgElevated: p.card,
      colorBorder: p.borderStrong,
      colorBorderSecondary: p.border,
      colorFillAlter: isDark ? '#14261F' : '#F5F1E8',
      colorSuccess: '#2E7D4F',
      colorError: '#B3261E',
      colorSuccessBg: isDark ? 'rgba(46, 125, 79, 0.2)' : '#E7F2EA',
      colorSuccessBorder: isDark ? 'rgba(46, 125, 79, 0.4)' : '#BCD9C6',
      colorWarningBg: isDark ? 'rgba(212, 175, 55, 0.15)' : '#FBF3DC',
      colorWarningBorder: isDark ? 'rgba(212, 175, 55, 0.35)' : '#EED9A0',
      colorErrorBg: isDark ? 'rgba(179, 38, 30, 0.2)' : '#F9E7E3',
      colorErrorBorder: isDark ? 'rgba(179, 38, 30, 0.4)' : '#EDC2BA',
      colorInfoBg: isDark ? 'rgba(30, 58, 138, 0.2)' : '#E8EFF5',
      colorInfoBorder: isDark ? 'rgba(30, 58, 138, 0.4)' : '#BED0E2',
      colorTextLightSolid: isDark ? '#0D211A' : '#FFFFFF',
      borderRadiusLG: 12,
    },
    components: {
      Layout: { bodyBg: p.page, headerBg: p.page, siderBg: FOREST.sider, triggerBg: '#0B3024' },
      Button: {
        primaryColor: isDark ? '#0D211A' : '#FFFFFF',
      },
      Menu: {
        darkItemBg: FOREST.sider,
        darkSubMenuItemBg: FOREST.sider,
        darkPopupBg: FOREST.sider,
        darkItemColor: FOREST.siderText,
        darkItemHoverBg: FOREST.siderHover,
        darkItemHoverColor: '#FFFFFF',
        darkItemSelectedBg: FOREST.brassBg,
        darkItemSelectedColor: FOREST.brassText,
      },
      Table: {
        headerBg: isDark ? '#152A22' : '#F4EFE4',
        headerSplitColor: p.border,
        borderColor: p.border,
        rowHoverBg: isDark ? '#1D362C' : '#F8F4EA',
        rowSelectedBg: isDark ? '#1F3C31' : '#EDF3EC',
        rowSelectedHoverBg: isDark ? '#26483B' : '#E4EDE3',
      },
      Card: { headerBg: 'transparent' },
      Segmented: { trackBg: isDark ? '#16221E' : '#E9E4D8', itemSelectedBg: p.card },
      Select: { controlItemBgActive: '#E5EFE8', controlItemBgHover: '#F3EEE3', optionSelectedColor: FOREST.sider },
      Dropdown: { controlItemBgActive: '#E5EFE8', controlItemBgHover: '#F3EEE3' },
    },
  };
}

export const forestTheme = getForestTheme('sand_bone');
