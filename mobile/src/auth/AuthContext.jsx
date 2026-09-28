import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../api/endpoints';
import { setUnauthorizedHandler, TOKEN_KEY, USER_KEY } from '../api/client';

const AuthContext = createContext(null);

// This app is for the Groom / Stable Hand only; other roles use the web app.
const ALLOWED_ROLE = 'groom';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(true);

  const signOut = useCallback(async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
    setUser(null);
  }, []);

  // Keep the session across app restarts so a groom does not log in again every shift.
  useEffect(() => {
    (async () => {
      try {
        const [[, token], [, stored]] = await AsyncStorage.multiGet([TOKEN_KEY, USER_KEY]);
        if (token && stored) setUser(JSON.parse(stored));
      } catch {
        // A corrupt stored session just means signing in again.
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (email, password) => {
    const res = await authApi.login({ email: email.trim().toLowerCase(), password });
    const { token, user: account } = res.data;
    if (account.role !== ALLOWED_ROLE) {
      throw { message: 'Ứng dụng này dành cho Nhân viên Chăm sóc. Các vai trò khác dùng bản web.' };
    }
    await AsyncStorage.multiSet([
      [TOKEN_KEY, token],
      [USER_KEY, JSON.stringify(account)],
    ]);
    setUser(account);
    return account;
  }, []);

  const value = useMemo(() => ({ user, restoring, signIn, signOut }), [user, restoring, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
