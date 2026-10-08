import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

// A short buzz on the outcome of a tap: the groom's hands are busy and the phone is often in a
// glove or a pocket, so "it went through" has to be felt, not only seen. Never throws, and does
// nothing on the web.
const run = (fn) => {
  if (Platform.OS === 'web') return;
  try {
    fn();
  } catch {
    // No haptic engine (some Android devices, simulators): nothing to do.
  }
};

export const hapticSuccess = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
export const hapticWarning = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
export const hapticTap = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
