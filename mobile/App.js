import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  BeVietnamPro_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/be-vietnam-pro';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useRef } from 'react';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { OutboxProvider } from './src/offline/OutboxContext';
import { CACHE_MAX_AGE_MS, persister, queryClient } from './src/offline/queryCache';
import RootNavigator from './src/navigation/RootNavigator';
import { colors } from './src/theme';

// Groom / Stable Hand app for the Racehorse Training & Management System.
// The other four roles keep using the web client; this app talks to the same API.

// The phone may be shared on a shift change: what one groom's session cached must not be shown to
// the next, so signing out clears the saved copy as well as the one in memory.
function ClearCacheOnSignOut() {
  const { user } = useAuth();
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (user) {
      wasSignedIn.current = true;
    } else if (wasSignedIn.current) {
      wasSignedIn.current = false;
      queryClient.clear();
      persister.removeClient();
    }
  }, [user]);
  return null;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
  });

  // Hold the first paint until the font is in, so text doesn't flash in the system font and then
  // jump. If the font fails to load the app still opens, in the system font.
  if (!fontsLoaded && !fontError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.cream }}>
        <ActivityIndicator color={colors.forest} />
      </View>
    );
  }

  return (
    // Without initialMetrics the provider renders nothing until it has measured the window,
    // which shows up as a black screen on launch in Expo Go.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: CACHE_MAX_AGE_MS }}>
        <AuthProvider>
          <OutboxProvider>
            <ClearCacheOnSignOut />
            <StatusBar style="light" />
            <RootNavigator />
          </OutboxProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
