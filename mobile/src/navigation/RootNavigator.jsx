import { Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
import NotificationsScreen from '../screens/NotificationsScreen';
import { Loading } from '../components/ui';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = { 'Tổng quan': '🏠', Việc: '✅', Chuồng: '🐴', 'Khẩu phần': '🥕', 'Vật tư': '📦' };

/** Emoji tab icons keep the app dependency-free while staying readable at a glance. */
function TabIcon({ name, focused, badge }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{TAB_ICONS[name]}</Text>
      {badge > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: -10,
            backgroundColor: colors.red,
            borderRadius: 9,
            minWidth: 18,
            height: 18,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
          }}
        >
          <Text style={{ color: colors.white, fontSize: 10, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Tabs() {
  const { pending, overdue } = useToday();
  const todo = pending.length + overdue.length;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.borderSoft, height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} badge={route.name === 'Việc' ? todo : 0} />
        ),
      })}
    >
      <Tab.Screen name="Tổng quan" component={DashboardScreen} />
      <Tab.Screen name="Việc" component={TasksScreen} />
      <Tab.Screen name="Chuồng" component={StableMapScreen} />
      <Tab.Screen name="Khẩu phần" component={FeedingScreen} />
      <Tab.Screen name="Vật tư" component={SuppliesScreen} />
    </Tab.Navigator>
  );
}

const detailHeader = {
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
            <Stack.Screen name="Incidents" component={IncidentsScreen} options={{ headerShown: true, title: 'Báo cáo sự cố', ...detailHeader }} />
            <Stack.Screen
              name="HorseDetail"
              component={HorseDetailScreen}
              options={({ route }) => ({ headerShown: true, title: route.params?.name || 'Chi tiết ngựa', ...detailHeader })}
            />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: true, title: 'Thông báo', ...detailHeader }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
