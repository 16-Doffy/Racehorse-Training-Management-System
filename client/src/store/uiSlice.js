import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    siderCollapsed: false,
  },
  reducers: {
    siderCollapsedSet(state, action) {
      state.siderCollapsed = action.payload;
    },
  },
});

export const { siderCollapsedSet } = uiSlice.actions;
export default uiSlice.reducer;
