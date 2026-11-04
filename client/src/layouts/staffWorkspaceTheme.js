/**
 * Ant Design ConfigProvider tokens for the Club Manager and Head Trainer workspace.
 * Inspired by LoginPage.jsx: obsidian-charcoal authority + championship gold (#EAB308) CTA +
 * crisp pure-white/cool-slate surfaces (#F8FAFC / #FFFFFF) with ultra-sharp typography (>= 7:1 contrast).
 * Zero beige backgrounds, zero low-contrast faded text.
 */
export function staffWorkspaceTheme(base, dark = false) {
  const page = dark ? '#0B0F17' : '#F8FAFC';
  const card = dark ? '#111827' : '#FFFFFF';
  const inset = dark ? '#1E293B' : '#F1F5F9';
  const border = dark ? '#334155' : '#CBD5E1';
  const ink = dark ? '#F8FAFC' : '#0F172A';
  const secondary = dark ? '#E2E8F0' : '#334155';
  const muted = dark ? '#94A3B8' : '#475569';
  const primary = dark ? '#F59E0B' : '#B45309';

  return {
    ...base,
    token: {
      ...base.token,
      colorPrimary: primary,
      colorInfo: primary,
      colorLink: primary,
      colorLinkHover: dark ? '#FBBF24' : '#92400E',
      colorSuccess: dark ? '#34D399' : '#15803D',
      colorWarning: dark ? '#FBBF24' : '#B45309',
      colorError: dark ? '#F87171' : '#B91C1C',
      colorBgLayout: page,
      colorBgContainer: card,
      colorBgElevated: dark ? '#1E293B' : '#FFFFFF',
      colorFillAlter: inset,
      colorFillSecondary: dark ? 'rgba(248, 250, 252, 0.08)' : '#E2E8F0',
      colorFillTertiary: inset,
      colorBorder: border,
      colorBorderSecondary: dark ? '#1E293B' : '#E2E8F0',
      colorSplit: dark ? '#1E293B' : '#E2E8F0',
      colorText: ink,
      colorTextSecondary: secondary,
      colorTextTertiary: muted,
      colorTextQuaternary: muted,
      borderRadius: 10,
      borderRadiusLG: 12,
      fontSize: 14,
    },
    components: {
      ...base.components,
      Card: {
        ...base.components?.Card,
        colorBgContainer: card,
        colorBorderSecondary: border,
        headerBg: dark ? '#0F172A' : '#F8FAFC',
        headerFontSize: 15,
        borderRadiusLG: 12,
      },
      Table: {
        ...base.components?.Table,
        headerBg: dark ? '#1E293B' : '#F1F5F9',
        headerColor: secondary,
        headerSplitColor: 'transparent',
        borderColor: border,
        rowHoverBg: dark ? 'rgba(234, 179, 8, 0.08)' : '#F8FAFC',
        cellPaddingBlock: 11,
        cellPaddingInline: 14,
      },
      Button: {
        ...base.components?.Button,
        primaryColor: '#0F172A',
        defaultBg: card,
        defaultBorderColor: border,
        defaultColor: ink,
        fontWeight: 600,
        borderRadius: 8,
      },
      Input: { ...base.components?.Input, colorBgContainer: card, colorBorder: border, activeBorderColor: primary },
      InputNumber: { ...base.components?.InputNumber, colorBgContainer: card, colorBorder: border, activeBorderColor: primary },
      Select: { ...base.components?.Select, colorBgContainer: card, colorBorder: border, optionSelectedBg: dark ? 'rgba(234, 179, 8, 0.18)' : '#FEF3C7' },
      DatePicker: { ...base.components?.DatePicker, colorBgContainer: card, colorBorder: border },
      Segmented: {
        ...base.components?.Segmented,
        trackBg: inset,
        itemColor: secondary,
        itemHoverColor: ink,
        itemSelectedBg: card,
        itemSelectedColor: ink,
      },
      Tabs: {
        ...base.components?.Tabs,
        inkBarColor: primary,
        itemSelectedColor: primary,
        itemHoverColor: ink,
        itemColor: secondary,
      },
      Modal: { ...base.components?.Modal, contentBg: card, headerBg: card, titleColor: ink },
      Drawer: { ...base.components?.Drawer, colorBgElevated: card },
      // The sidebar menu sits on the charcoal sidebar: none of the base theme's forest green, the page you are on in gold.
      Menu: {
        ...base.components?.Menu,
        darkItemBg: 'transparent',
        darkSubMenuItemBg: 'transparent',
        darkPopupBg: dark ? '#0B0F17' : '#111827',
        darkItemColor: '#CBD5E1',
        darkItemHoverBg: 'rgba(255, 255, 255, 0.08)',
        darkItemHoverColor: '#FFFFFF',
        darkItemSelectedBg: '#EAB308',
        darkItemSelectedColor: '#0F172A',
      },
    },
  };
}
