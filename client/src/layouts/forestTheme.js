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
  page: '#EFECE4',
  card: '#FFFDF8',
  border: '#E4DFD3',
  borderStrong: '#D8D1C2',
  ink: '#1A2B22',
  primary: '#0F5A43',
};

/** Colour and tint per status, for figures that carry a state (dashboard counters). */
export const STATUS_TONES = {
  neutral: { color: FOREST.ink, bg: '#E3ECE6' },
  good: { color: '#2E7D4F', bg: '#E1F0E5' },
  watch: { color: '#9A6B00', bg: '#F8EDCF' },
  bad: { color: '#B3261E', bg: '#F7E1DD' },
};

export const forestTheme = {
  token: {
    colorPrimary: FOREST.primary,
    colorLink: FOREST.primary,
    colorTextBase: FOREST.ink,
    colorBgLayout: FOREST.page,
    colorBgContainer: FOREST.card,
    colorBgElevated: FOREST.card,
    colorBorder: FOREST.borderStrong,
    colorBorderSecondary: FOREST.border,
    colorFillAlter: '#F5F1E8',
    colorSuccess: '#2E7D4F',
    colorError: '#B3261E',
    colorSuccessBg: '#E7F2EA',
    colorSuccessBorder: '#BCD9C6',
    colorWarningBg: '#FBF3DC',
    colorWarningBorder: '#EED9A0',
    colorErrorBg: '#F9E7E3',
    colorErrorBorder: '#EDC2BA',
    colorInfoBg: '#E8EFF5',
    colorInfoBorder: '#BED0E2',
    borderRadiusLG: 12,
  },
  components: {
    Layout: { bodyBg: FOREST.page, headerBg: FOREST.page, siderBg: FOREST.sider, triggerBg: '#0B3024' },
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
      headerBg: '#F4EFE4',
      headerSplitColor: '#E4DDCD',
      borderColor: '#ECE6D8',
      rowHoverBg: '#F8F4EA',
      rowSelectedBg: '#EDF3EC',
      rowSelectedHoverBg: '#E4EDE3',
      headerSortActiveBg: '#EDE7DA',
      headerSortHoverBg: '#EFE9DD',
      bodySortBg: '#FAF7F0',
    },
    Card: { headerBg: 'transparent' },
    Segmented: { trackBg: '#E9E4D8', itemSelectedBg: FOREST.card },
    Select: { controlItemBgActive: '#E5EFE8', controlItemBgHover: '#F3EEE3', optionSelectedColor: FOREST.sider },
    Dropdown: { controlItemBgActive: '#E5EFE8', controlItemBgHover: '#F3EEE3' },
  },
};
