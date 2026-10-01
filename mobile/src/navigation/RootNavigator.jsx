import { Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from '../components/Icon';
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
import { colors } from '../theme';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = {
  'Tổng quan': 'dashboard',
  Chuồng: 'stable',
  'Cho ăn': 'rations',
  Thuốc: 'medication',
  Việc: 'tasks',
  'Vật tư': 'supplies',
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

const CHORE_TYPES = ['cleaning', 'bathing', 'icing'];
const FEED_TYPES = ['feeding'];
const CARE_TYPES = ['medication', 'monitoring'];

function Tabs() {
  const { pending, overdue } = useToday();
  // Each tab counts only the work it owns: chores here, meals on "Cho ăn", doses on "Thuốc".
  const open = [...pending, ...overdue];
  const badges = {
    Việc: open.filter((t) => CHORE_TYPES.includes(t.taskType)).length,
    'Cho ăn': open.filter((t) => FEED_TYPES.includes(t.taskType)).length,
    Thuốc: open.filter((t) => CARE_TYPES.includes(t.taskType)).length,
  };

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
        // Six tabs on a phone: the labels have to stay on one line each.
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
        tabBarItemStyle: { paddingHorizontal: 2 },
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} badge={badges[route.name] || 0} />,
      })}
    >
      <Tab.Screen name="Tổng quan" component={DashboardScreen} />
      <Tab.Screen name="Chuồng" component={StableMapScreen} />
      <Tab.Screen name="Cho ăn" component={FeedingScreen} />
      <Tab.Screen name="Thuốc" component={TreatmentsScreen} />
      <Tab.Screen name="Việc" component={TasksScreen} />
      <Tab.Screen name="Vật tư" component={SuppliesScreen} />
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
