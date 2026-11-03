// Presentation-only theme for Manager and Head Trainer. Other roles retain forestTheme.
// Blue, white and black: the values are styles/staff-workspace.css's.
export function staffWorkspaceTheme(base, dark) {
  const surface = dark ? '#0F1626' : '#FFFFFF';
  const page = dark ? '#0A0F1A' : '#F4F6FA';
  const inset = dark ? '#162033' : '#EEF2F8';
  const border = dark ? '#1F2A3D' : '#E2E7F0';
  const ink = dark ? '#F3F6FB' : '#0B1220';
  const muted = dark ? '#A9B4C6' : '#475467';
  const primary = dark ? '#3B82F6' : '#2563EB';
  return {
    ...base,
    token: {
      ...base.token,
      fontFamily: "'IBM Plex Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      borderRadius: 6,
      colorPrimary: primary,
      colorLink: primary,
      colorTextBase: ink,
      colorTextSecondary: muted,
      colorTextTertiary: muted,
      colorTextDescription: muted,
      colorTextPlaceholder: dark ? '#8E9AAE' : '#5F6B7E',
      colorBgLayout: page,
      colorBgContainer: surface,
      colorBgElevated: dark ? '#162033' : '#FFFFFF',
      colorFillAlter: inset,
      colorBorder: dark ? '#2E3B52' : '#C8D1DF',
      colorBorderSecondary: border,
    },
    components: {
      ...base.components,
      Button: { ...base.components.Button, primaryColor: '#FFFFFF' },
      Layout: { ...base.components.Layout, bodyBg: page, headerBg: page },
      Table: { ...base.components.Table, headerBg: 'transparent', headerSplitColor: 'transparent', borderColor: border, rowHoverBg: inset, headerColor: muted },
      Segmented: { ...base.components.Segmented, trackBg: inset, itemSelectedBg: surface, itemSelectedColor: ink, itemColor: muted },
      Select: { ...base.components.Select, controlItemBgActive: inset, controlItemBgHover: inset, optionSelectedColor: ink },
      Dropdown: { ...base.components.Dropdown, controlItemBgActive: inset, controlItemBgHover: inset },
    },
  };
}
