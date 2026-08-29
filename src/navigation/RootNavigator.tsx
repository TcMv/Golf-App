import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Font, FontSize, FontWeight } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

import AuthScreen from '../screens/auth/AuthScreen';
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import MyBagSetupScreen from '../screens/onboarding/MyBagSetupScreen';
import HandicapSetupScreen from '../screens/onboarding/HandicapSetupScreen';
import PlayHomeScreen from '../screens/play/PlayHomeScreen';
import StartRoundScreen from '../screens/play/StartRoundScreen';
import ActiveRoundScreen from '../screens/play/ActiveRoundScreen';
import EndRoundScreen from '../screens/play/EndRoundScreen';
import RoundsScreen from '../screens/rounds/RoundsScreen';
import RoundDetailScreen from '../screens/rounds/RoundDetailScreen';
import StatsScreen from '../screens/stats/StatsScreen';
import CaddieHomeScreen from '../screens/caddie/CaddieHomeScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import MyBagScreen from '../screens/settings/MyBagScreen';
import AdminMapScreen from '../screens/admin/AdminMapScreen';
import AdminCourseSetupScreen from '../screens/admin/AdminCourseSetupScreen';
import AdminTeeSetsScreen from '../screens/admin/AdminTeeSetsScreen';
import AdminHoleZonesScreen from '../screens/admin/AdminHoleZonesScreen';
import AdminCourseValidationScreen from '../screens/admin/AdminCourseValidationScreen';
import AdminCourseImportScreen from '../screens/admin/AdminCourseImportScreen';
import AdminCourseExportScreen from '../screens/admin/AdminCourseExportScreen';
import AdminMappingSuggestionsScreen from '../screens/admin/AdminMappingSuggestionsScreen';
import AdminMappingSuggestionImportScreen from '../screens/admin/AdminMappingSuggestionImportScreen';
import AdminOsmMappingScreen from '../screens/admin/AdminOsmMappingScreen';
import AdminCourseOperationsScreen from '../screens/admin/AdminCourseOperationsScreen';
import AdminCourseHistoryScreen from '../screens/admin/AdminCourseHistoryScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: { backgroundColor: Colors.surface1, borderTopColor: Colors.border, borderTopWidth: 1, minHeight: 64, paddingTop: 8, paddingBottom: 8 },
        tabBarActiveTintColor: Colors.green,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, fontFamily: Font.bold },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, [string, string]> = {
            Home: ['home', 'home-outline'], Round: ['golf', 'golf-outline'], Stats: ['stats-chart', 'stats-chart-outline'], Caddie: ['compass', 'compass-outline'], Profile: ['person', 'person-outline'],
          };
          const [active, inactive] = icons[route.name] ?? ['circle', 'circle-outline'];
          return <Ionicons name={(focused ? active : inactive) as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={PlayHomeScreen} />
      <Tab.Screen name="Round" component={RoundsScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Caddie" component={CaddieHomeScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function AuthedStack({ onboardingDone }: { onboardingDone: boolean }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName={onboardingDone ? 'Main' : 'Welcome'}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="HandicapSetup" component={HandicapSetupScreen} />
      <Stack.Screen name="MyBagSetup" component={MyBagSetupScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="StartRound" component={StartRoundScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="ActiveRound" component={ActiveRoundScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="EndRound" component={EndRoundScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="RoundDetail" component={RoundDetailScreen} />
      <Stack.Screen name="MyBag" component={MyBagScreen} />
      <Stack.Screen name="SettingsDetail" component={SettingsScreen} />
      <Stack.Screen name="AdminCourseOperations" component={AdminCourseOperationsScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="AdminCourseHistory" component={AdminCourseHistoryScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="AdminCourseSetup" component={AdminCourseSetupScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="AdminTeeSets" component={AdminTeeSetsScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="AdminHoleZones" component={AdminHoleZonesScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="AdminCourseValidation" component={AdminCourseValidationScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="AdminCourseImport" component={AdminCourseImportScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="AdminCourseExport" component={AdminCourseExportScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="AdminMappingSuggestions" component={AdminMappingSuggestionsScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="AdminMappingSuggestionImport" component={AdminMappingSuggestionImportScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="AdminOsmMapping" component={AdminOsmMappingScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="AdminMap" component={AdminMapScreen} options={{ presentation: 'fullScreenModal' }} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { session, loading } = useAuth();
  if (loading) return <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={Colors.green} /></View>;
  if (!session) return <Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="Auth" component={AuthScreen} /></Stack.Navigator>;
  return <AuthedStack onboardingDone={true} />;
}
