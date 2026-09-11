import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    siderCollapsed: false,
  },
  reducers: {
    siderToggled(state) {
      state.siderCollapsed = !state.siderCollapsed;
    },
  },
});

export const { siderToggled } = uiSlice.actions;
export default uiSlice.reducer;
