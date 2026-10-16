import { ROLES } from '../constants/roles';

/**
 * "Forest & brass" look for the Club Manager and Head Trainer: a deep green sidebar with a brass
 * highlight, a warm oat page and warm-white cards with a soft edge, so the screen is no longer one
 * block of white. The other roles keep the default look until their owners decide.
 *
 * Applied by MainLayout through a nested ConfigProvider, so every Ant Design component inside the
 * layout (tables, cards, forms, modals) picks it up without page-by-page changes.
 */
export const FOREST_ROLES = [ROLES.MANAGER, ROLES.HEAD_TRAINER, ROLES.VETERINARIAN, ROLES.OWNER, ROLES.GROOM];
export const usesForestTheme = (role) => FOREST_ROLES.includes(role);
// Every role on the web has the Sáng/Tối switch and the Team 8 look.
export const CANVAS_ROLES = [ROLES.MANAGER, ROLES.HEAD_TRAINER, ROLES.OWNER, ROLES.VETERINARIAN, ROLES.GROOM];
export const usesCanvasPicker = (role) => CANVAS_ROLES.includes(role);
// On the dark canvas these roles' pages go fully dark; the Owner's pages keep their own light panels.
export const FULL_DARK_ROLES = [ROLES.MANAGER, ROLES.HEAD_TRAINER, ROLES.VETERINARIAN, ROLES.GROOM];
// The vet's pages are built with Bootstrap: on the dark canvas they use Bootstrap's dark mode
// (MainLayout puts data-bs-theme on <body>), recoloured to the forest palette.
export const BOOTSTRAP_ROLES = [ROLES.VETERINARIAN];

// Small label above the sidebar menu.
export const MENU_SECTION_LABEL = {
  [ROLES.MANAGER]: 'Điều hành CLB',
  [ROLES.HEAD_TRAINER]: 'Huấn luyện',
  [ROLES.VETERINARIAN]: 'Y Tế & Thú Y',
  [ROLES.OWNER]: 'Chủ Sở Hữu',
  [ROLES.GROOM]: 'Chăm sóc',
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
    label: 'Sáng',
    page: '#F4EFE6',
    card: '#FAF7F0',
    border: '#E5DAC6',
    borderStrong: '#D7C7AE',
    ink: '#1A2B22',
  },
  peak_equestrian_dark: {
    key: 'peak_equestrian_dark',
    label: 'Tối',
    page: '#06130E',
    card: '#0D211A',
    border: 'rgba(212, 175, 55, 0.28)',
    borderStrong: 'rgba(212, 175, 55, 0.45)',
    ink: '#FAF8F5',
    isDark: true,
  },
  // The warm oat page the vet had before the switch (kept for a key saved in a browser).
  parchment_old: {
    key: 'parchment_old',
    label: 'Bản cũ',
    page: '#EFECE4',
    card: '#FFFDF8',
    border: '#E4DFD3',
    borderStrong: '#D8D1C2',
    ink: '#1A2B22',
  },
};

// The two canvases of the Sáng/Tối switch in the header (MainLayout).
export const LIGHT_CANVAS = 'sand_bone';
export const DARK_CANVAS = 'peak_equestrian_dark';
/** The canvas a key saved in the browser stands for: a dark preset of the old picker means dark, anything else light. */
export const canvasOf = (key) => (key === DARK_CANVAS || key === 'midnight_cockpit' ? DARK_CANVAS : LIGHT_CANVAS);

/** Colour and tint per status, for figures that carry a state (dashboard counters). */
export const STATUS_TONES = {
  neutral: { color: FOREST.ink, bg: '#E3ECE6' },
  good: { color: '#2E7D4F', bg: '#E1F0E5' },
  watch: { color: '#9A6B00', bg: '#F8EDCF' },
  bad: { color: '#B3261E', bg: '#F7E1DD' },
};

export function getForestTheme(presetKey = 'sand_bone') {
  const p = CANVAS_PRESETS[presetKey] || CANVAS_PRESETS.sand_bone;
  const isDark = Boolean(p.isDark);
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
      colorTextLightSolid: '#FFFFFF',
      // Tooltip bubble: AntD derives it from colorTextBase, which is light on a dark canvas.
      ...(isDark ? { colorBgSpotlight: 'rgba(5, 20, 14, 0.96)' } : {}),
      colorTextPlaceholder: isDark ? '#94A3B8' : '#8A8578',
      // Secondary text on the dark canvas (hints, descriptions, statistic titles): cream, readable at ~7:1.
      ...(isDark ? { colorTextSecondary: 'rgba(244, 241, 232, 0.8)', colorTextTertiary: 'rgba(244, 241, 232, 0.68)', colorTextDescription: 'rgba(244, 241, 232, 0.68)' } : {}),
      // Same on the light canvas: antd's default grey hints were ~2.7:1 on the warm cards; ~5:1 now. The vet's page keeps its own.
      ...(presetKey === LIGHT_CANVAS ? { colorTextSecondary: 'rgba(26, 43, 34, 0.78)', colorTextTertiary: 'rgba(26, 43, 34, 0.68)', colorTextDescription: 'rgba(26, 43, 34, 0.68)' } : {}),
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
      // Unselected options read at ~7:1 on the track (the default grey was 4.3:1 on the warm one).
      Segmented: { trackBg: isDark ? '#16221E' : '#E9E4D8', itemSelectedBg: isDark ? 'rgba(212, 175, 55, 0.24)' : p.card, itemSelectedColor: isDark ? '#F6D57A' : '#1A2B22', itemColor: isDark ? 'rgba(244, 241, 232, 0.82)' : '#3D4A41', itemHoverColor: isDark ? '#F4F1E8' : '#1A2B22' },
      // The hovered and the selected option: light tints on the light canvas, dark ones on the dark canvas
      // (a light row under cream text could not be read).
      Select: isDark
        ? { controlItemBgActive: 'rgba(212, 175, 55, 0.22)', controlItemBgHover: 'rgba(255, 255, 255, 0.08)', optionSelectedColor: '#F6D57A' }
        : { controlItemBgActive: '#E5EFE8', controlItemBgHover: '#F3EEE3', optionSelectedColor: FOREST.sider },
      Dropdown: isDark
        ? { controlItemBgActive: 'rgba(212, 175, 55, 0.22)', controlItemBgHover: 'rgba(255, 255, 255, 0.08)' }
        : { controlItemBgActive: '#E5EFE8', controlItemBgHover: '#F3EEE3' },
    },
  };
}

export const forestTheme = getForestTheme('sand_bone');
