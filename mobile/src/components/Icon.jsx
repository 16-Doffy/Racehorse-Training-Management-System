import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { colors } from '../theme';

const SETS = { ion: Ionicons, mci: MaterialCommunityIcons };

/**
 * One name per thing the app talks about, so a screen asks for `icon="feeding"` and never for a
 * particular glyph. Line icons throughout (Ionicons outline / MaterialCommunityIcons) — the horse
 * and stall glyphs only exist in MaterialCommunityIcons, which is why both sets are here.
 */
const ICONS = {
  // Navigation
  dashboard: ['ion', 'home-outline'],
  dashboardActive: ['ion', 'home'],
  tasks: ['ion', 'checkbox-outline'],
  tasksActive: ['ion', 'checkbox'],
  stable: ['mci', 'horse-variant'],
  stableActive: ['mci', 'horse'],
  rations: ['mci', 'food-apple-outline'],
  rationsActive: ['mci', 'food-apple'],
  care: ['mci', 'clipboard-check-outline'],
  careActive: ['mci', 'clipboard-check'],
  supplies: ['mci', 'package-variant-closed'],
  suppliesActive: ['mci', 'package-variant'],

  // Task types
  feeding: ['mci', 'food-drumstick-outline'],
  cleaning: ['mci', 'broom'],
  bathing: ['mci', 'shower'],
  icing: ['mci', 'snowflake'],
  medication: ['mci', 'pill'],
  monitoring: ['ion', 'eye-outline'],

  // Meals
  morning: ['mci', 'weather-sunset-up'],
  noon: ['mci', 'weather-sunny'],
  evening: ['mci', 'weather-night'],

  // Feed kinds
  grain: ['mci', 'barley'],
  hay: ['mci', 'grass'],
  vitamin: ['mci', 'pill'],
  carrot: ['mci', 'carrot'],
  water: ['mci', 'water'],
  feedOther: ['mci', 'bowl-mix-outline'],

  // Inventory categories
  feed: ['mci', 'barley'],
  medicineBox: ['mci', 'medical-bag'],
  equipment: ['mci', 'toolbox-outline'],

  // Status & actions
  bell: ['ion', 'notifications-outline'],
  bellActive: ['ion', 'notifications'],
  search: ['ion', 'search'],
  close: ['ion', 'close'],
  check: ['ion', 'checkmark'],
  checkCircle: ['ion', 'checkmark-circle'],
  circle: ['ion', 'ellipse-outline'],
  block: ['mci', 'cancel'],
  warning: ['ion', 'warning-outline'],
  alert: ['ion', 'alert-circle-outline'],
  clock: ['ion', 'time-outline'],
  history: ['mci', 'history'],
  calendar: ['ion', 'calendar-outline'],
  camera: ['ion', 'camera-outline'],
  gallery: ['ion', 'images-outline'],
  trash: ['ion', 'trash-outline'],
  plus: ['ion', 'add'],
  chevronLeft: ['ion', 'chevron-back'],
  chevronRight: ['ion', 'chevron-forward'],
  chevronDown: ['ion', 'chevron-down'],
  chevronUp: ['ion', 'chevron-up'],
  arrowRight: ['ion', 'arrow-forward'],
  logout: ['ion', 'log-out-outline'],
  person: ['ion', 'person-outline'],
  phone: ['ion', 'call-outline'],
  lock: ['ion', 'lock-closed-outline'],
  vet: ['mci', 'stethoscope'],
  trainer: ['mci', 'clipboard-text-outline'],
  system: ['mci', 'robot-outline'],
  note: ['mci', 'note-text-outline'],
  thumb: ['ion', 'thumbs-up-outline'],
  filter: ['ion', 'options-outline'],
  refresh: ['ion', 'refresh'],
  stall: ['mci', 'home-variant-outline'],
  weight: ['mci', 'weight-kilogram'],
  syringe: ['mci', 'needle'],
  farrier: ['mci', 'horseshoe'],
  deworm: ['mci', 'bacteria-outline'],
  race: ['mci', 'trophy-outline'],
  session: ['mci', 'run-fast'],
  exam: ['mci', 'clipboard-pulse-outline'],
  treatment: ['mci', 'medical-bag'],
  empty: ['mci', 'inbox-outline'],
  info: ['ion', 'information-circle-outline'],
  flag: ['ion', 'flag-outline'],
};

export default function Icon({ name, size = 18, color = colors.text, style }) {
  const entry = ICONS[name];
  if (!entry) return null;
  const [set, glyph] = entry;
  const Component = SETS[set];
  return <Component name={glyph} size={size} color={color} style={style} />;
}

export const hasIcon = (name) => !!ICONS[name];
