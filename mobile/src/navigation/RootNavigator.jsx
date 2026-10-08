import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '../components/Text';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import MoreSheet from '../components/MoreSheet';
import SyncBanner from '../components/SyncBanner';
import { useAuth } from '../auth/AuthContext';
import { useToday } from '../hooks/useGroomData';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import TasksScreen from '../screens/TasksScreen';
import StableMapScreen from '../screens/StableMapScreen';
import FeedingScreen from '../screens/FeedingScreen';
import SuppliesScreen from '../screens/SuppliesScreen';
import IncidentsScreen from '../screens/IncidentsScreen';
import HorseDetailScreen from '../screens/HorseDetailScreen';
import TreatmentsScreen from '../screens/TreatmentsScreen';
import { Loading } from '../components/ui';
import { colors, fontFamily, spacing } from '../theme';
import { CHORE_TYPES } from '../utils/groom';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = {
  'Tổng quan': 'dashboard',
  Chuồng: 'stable',
  'Cho ăn': 'rations',
  Thuốc: 'medication',
  Việc: 'tasks',
  'Vật tư': 'supplies',
  Thêm: 'more',
};

function TabIcon({ name, focused, badge }) {
  const icon = focused ? `${TAB_ICONS[name]}Active` : TAB_ICONS[name];
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={22} color={focused ? colors.forest : colors.textFaint} />
      {badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -6,
            right: -12,
            backgroundColor: colors.red,
            borderRadius: 9,
            minWidth: 18,
            height: 18,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ color: colors.white, fontSize: 10, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

const FEED_TYPES = ['feeding'];
const CARE_TYPES = ['medication', 'monitoring'];

// Four buttons fit a phone's bar with room for their labels; the rest live behind "Thêm".
const MORE_SCREENS = [
  { route: 'Thuốc', label: 'Thuốc & y lệnh', hint: 'Liều thuốc, theo dõi theo toa bác sĩ', icon: 'medication', color: colors.red, bg: colors.redSoft },
  { route: 'Chuồng', label: 'Sơ đồ chuồng', hint: 'Ô chuồng, ngựa và người phụ trách', icon: 'stable', color: colors.forestLight, bg: colors.forestSoft },
  { route: 'Vật tư', label: 'Vật tư', hint: 'Tồn kho khu vực, đề xuất bổ sung', icon: 'supplies', color: colors.blue, bg: colors.blueSoft },
  { route: 'Incidents', label: 'Báo cáo sự cố', hint: 'Báo ngựa bỏ ăn, đau, bị thương', icon: 'warning', color: colors.orange, bg: colors.orangeSoft, stack: true },
];
const MORE_ROUTES = MORE_SCREENS.filter((m) => !m.stack).map((m) => m.route);

// Off the bar, still a tab: other screens keep navigating to it by name.
const NoScreen = () => null;
const hiddenTab = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' } };

function Tabs({ navigation }) {
  const { pending, overdue } = useToday();
  // The home indicator on newer phones sits over a fixed-height bar and cuts the labels off.
  const insets = useSafeAreaInsets();
  const [moreOpen, setMoreOpen] = useState(false);
  const [active, setActive] = useState('Tổng quan');

  // Each tab counts only the work it owns: chores here, meals on "Cho ăn", doses on "Thuốc".
  const open = [...pending, ...overdue];
  const badges = {
    Việc: open.filter((t) => CHORE_TYPES.includes(t.taskType)).length,
    'Cho ăn': open.filter((t) => FEED_TYPES.includes(t.taskType)).length,
    Thuốc: open.filter((t) => CARE_TYPES.includes(t.taskType)).length,
  };
  // "Thêm" carries the count of what is waiting behind it, and lights up while one of its screens is open.
  badges['Thêm'] = MORE_ROUTES.reduce((sum, route) => sum + (badges[route] || 0), 0);
  const moreItems = MORE_SCREENS.map((m) => ({ ...m, badge: badges[m.route] || 0 }));

  const select = (item) => {
    setMoreOpen(false);
    if (item.stack) navigation.navigate(item.route);
    else navigation.navigate('Tabs', { screen: item.route });
  };

  return (
    <>
      <Tab.Navigator
        screenListeners={({ route }) => ({ focus: () => setActive(route.name) })}
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.forest,
          tabBarInactiveTintColor: colors.textFaint,
          tabBarStyle: {
            backgroundColor: colors.white,
            borderTopColor: colors.borderSoft,
            height: 68 + insets.bottom,
            paddingBottom: Math.max(insets.bottom, 8),
            paddingTop: 6,
          },
          tabBarLabelStyle: { fontSize: 12, fontFamily: fontFamily.semibold, lineHeight: 16, marginTop: 2, flexShrink: 0 },
          tabBarIcon: ({ focused }) => (
            <TabIcon
              name={route.name}
              focused={route.name === 'Thêm' ? MORE_ROUTES.includes(active) : focused}
              badge={badges[route.name] || 0}
            />
          ),
        })}
      >
        <Tab.Screen name="Tổng quan" component={DashboardScreen} />
        <Tab.Screen name="Cho ăn" component={FeedingScreen} />
        <Tab.Screen name="Việc" component={TasksScreen} />
        <Tab.Screen
          name="Thêm"
          component={NoScreen}
          options={{
            tabBarLabel: ({ color }) => (
              <Text style={{ fontSize: 12, fontWeight: '600', lineHeight: 16, marginTop: 2, color: MORE_ROUTES.includes(active) ? colors.forest : color }}>
                Thêm
              </Text>
            ),
          }}
          // Never opened as a screen: the button only raises the sheet.
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              setMoreOpen(true);
            },
          }}
        />
        <Tab.Screen name="Thuốc" component={TreatmentsScreen} options={hiddenTab} />
        <Tab.Screen name="Chuồng" component={StableMapScreen} options={hiddenTab} />
        <Tab.Screen name="Vật tư" component={SuppliesScreen} options={hiddenTab} />
      </Tab.Navigator>

      <SyncBanner bottom={68 + insets.bottom + spacing.sm} />
      <MoreSheet visible={moreOpen} onClose={() => setMoreOpen(false)} items={moreItems} active={active} onSelect={select} />
    </>
  );
}

const detailHeader = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.forest },
  headerTintColor: colors.white,
  headerTitleStyle: { fontFamily: fontFamily.semibold, fontSize: 17 },
};

export default function RootNavigator() {
  const { user, restoring } = useAuth();

  if (restoring) return <Loading text="Đang mở phiên làm việc..." />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen name="Tabs" component={Tabs} />
            <Stack.Screen name="Incidents" component={IncidentsScreen} options={{ ...detailHeader, title: 'Báo cáo sự cố' }} />
            <Stack.Screen
              name="HorseDetail"
              component={HorseDetailScreen}
              options={({ route }) => ({ ...detailHeader, title: route.params?.name || 'Chi tiết ngựa' })}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
