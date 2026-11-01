// Presentation-only theme for Manager and Head Trainer. Other roles retain forestTheme.
// Light is a white sheet in a tinted frame, dark a monitoring screen; the values are styles/staff-workspace.css's.
export function staffWorkspaceTheme(base, dark) {
  const surface = dark ? '#0F1211' : '#FFFFFF';
  const page = dark ? '#141716' : '#F6F8F5';
  const inset = dark ? '#1C1F1E' : '#F3F5F2';
  const border = dark ? '#262A28' : '#E7EAE6';
  const ink = dark ? '#F4F6F5' : '#131416';
  const muted = dark ? '#B4B8B5' : '#55595A';
  const primary = dark ? '#4CC38A' : '#0E7A5A';
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
      colorTextPlaceholder: dark ? '#9A9F9C' : '#6A6E6C',
      colorBgLayout: page,
      colorBgContainer: surface,
      colorBgElevated: dark ? '#1C1F1E' : '#FFFFFF',
      colorFillAlter: inset,
      colorBorder: dark ? '#3A3F3C' : '#CDD1CC',
      colorBorderSecondary: border,
    },
    components: {
      ...base.components,
      Button: { ...base.components.Button, primaryColor: dark ? '#0F1211' : '#FFFFFF' },
      Layout: { ...base.components.Layout, bodyBg: page, headerBg: page },
      Table: { ...base.components.Table, headerBg: 'transparent', headerSplitColor: 'transparent', borderColor: border, rowHoverBg: inset, headerColor: muted },
      Segmented: { ...base.components.Segmented, trackBg: inset, itemSelectedBg: surface, itemSelectedColor: ink, itemColor: muted },
      Select: { ...base.components.Select, controlItemBgActive: inset, controlItemBgHover: inset, optionSelectedColor: ink },
      Dropdown: { ...base.components.Dropdown, controlItemBgActive: inset, controlItemBgHover: inset },
    },
  };
}
