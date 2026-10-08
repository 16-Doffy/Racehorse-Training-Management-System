import AsyncStorage from '@react-native-async-storage/async-storage';
import { createOutbox } from './outbox';
import { handlers } from './handlers';

/** The one outbox of the app; the provider drives it, screens reach it through useOutbox(). */
export const outbox = createOutbox({ storage: AsyncStorage, handlers });
