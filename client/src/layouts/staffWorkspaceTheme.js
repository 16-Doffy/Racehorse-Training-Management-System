// Presentation-only theme for Manager and Head Trainer. Other roles retain forestTheme.
export function staffWorkspaceTheme(base, dark) {
  const surface = dark ? '#0F172A' : '#FFFFFF';
  const page = dark ? '#0B0F19' : '#F4F7FB';
  const inset = dark ? '#162033' : '#F1F5F9';
  const border = dark ? '#243044' : '#E2E8F0';
  const ink = dark ? '#F1F5F9' : '#0F172A';
  const muted = dark ? '#CBD5E1' : '#475569';
  const primary = dark ? '#6EE7B7' : '#047857';
  return {
    ...base,
    token: {
      ...base.token,
      fontFamily: "'Plus Jakarta Sans', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      colorPrimary: primary,
      colorLink: primary,
      colorTextBase: ink,
      colorTextSecondary: muted,
      colorTextTertiary: muted,
      colorTextDescription: muted,
      colorTextPlaceholder: dark ? '#94A3B8' : '#64748B',
      colorBgLayout: page,
      colorBgContainer: surface,
      colorBgElevated: surface,
      colorFillAlter: inset,
      colorBorder: border,
      colorBorderSecondary: border,
    },
    components: {
      ...base.components,
      Button: { ...base.components.Button, primaryColor: dark ? '#052E24' : '#FFFFFF' },
      Layout: { ...base.components.Layout, bodyBg: page, headerBg: page },
      Table: { ...base.components.Table, headerBg: inset, headerSplitColor: border, borderColor: border, rowHoverBg: inset, rowSelectedBg: dark ? '#113B32' : '#ECFDF5', rowSelectedHoverBg: dark ? '#164E3E' : '#D1FAE5' },
      Segmented: { ...base.components.Segmented, trackBg: inset, itemSelectedBg: surface, itemSelectedColor: primary, itemColor: muted, itemHoverColor: ink },
      Select: { ...base.components.Select, controlItemBgActive: inset, controlItemBgHover: inset, optionSelectedColor: primary },
      Dropdown: { ...base.components.Dropdown, controlItemBgActive: inset, controlItemBgHover: inset },
    },
  };
}
