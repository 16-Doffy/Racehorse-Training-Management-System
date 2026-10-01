import { Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from '../components/Icon';
import { useAuth } from '../auth/AuthContext';
import { useToday } from '../hooks/useGroomData';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import StableMapScreen from '../screens/StableMapScreen';
import CareScreen from '../screens/CareScreen';
import SuppliesScreen from '../screens/SuppliesScreen';
import IncidentsScreen from '../screens/IncidentsScreen';
import HorseDetailScreen from '../screens/HorseDetailScreen';
import ProfileScreen from '../screens/ProfileScreen';
import { Loading } from '../components/ui';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = {
  'Tổng quan': 'dashboard',
  'Chăm sóc': 'care',
  Chuồng: 'stable',
  Kho: 'supplies',
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

function Tabs() {
  const { pending, overdue } = useToday();
  // One tab carries all of the day's work, so its badge is everything still open.
  const badges = { 'Chăm sóc': [...pending, ...overdue].length };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.borderSoft,
          height: 66,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarItemStyle: { paddingHorizontal: 2 },
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} badge={badges[route.name] || 0} />,
      })}
    >
      <Tab.Screen name="Tổng quan" component={DashboardScreen} />
      <Tab.Screen name="Chăm sóc" component={CareScreen} />
      <Tab.Screen name="Chuồng" component={StableMapScreen} />
      <Tab.Screen name="Kho" component={SuppliesScreen} />
    </Tab.Navigator>
  );
}

const detailHeader = {
  headerShown: true,
  headerStyle: { backgroundColor: colors.forest },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: '700' },
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
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ ...detailHeader, title: 'Hồ sơ của tôi' }} />
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
