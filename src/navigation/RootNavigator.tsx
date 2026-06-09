import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Font, FontSize, FontWeight } from '../constants/theme';
import { useAuth } from '../context/AuthContext';

// Auth
import AuthScreen from '../screens/auth/AuthScreen';

// Onboarding
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import MyBagSetupScreen from '../screens/onboarding/MyBagSetupScreen';
import HandicapSetupScreen from '../screens/onboarding/HandicapSetupScreen';

// Main screens
import PlayHomeScreen from '../screens/play/PlayHomeScreen';
import StartRoundScreen from '../screens/play/StartRoundScreen';
import ActiveRoundScreen from '../screens/play/ActiveRoundScreen';
import EndRoundScreen from '../screens/play/EndRoundScreen';

import RoundsScreen from '../screens/rounds/RoundsScreen';
import RoundDetailScreen from '../screens/rounds/RoundDetailScreen';

import StatsScreen from '../screens/stats/StatsScreen';

import SettingsScreen from '../screens/settings/SettingsScreen';
import MyBagScreen from '../screens/settings/MyBagScreen';
import AdminMapScreen from '../screens/admin/AdminMapScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface1,
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          minHeight: 64,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: Colors.green,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: FontSize.xs,
          fontWeight: FontWeight.bold,
          fontFamily: Font.bold,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const icons: Record<string, [string, string]> = {
            Play: ['golf', 'golf-outline'],
            Rounds: ['list', 'list-outline'],
            Stats: ['stats-chart', 'stats-chart-outline'],
            Settings: ['settings', 'settings-outline'],
          };
          const [active, inactive] = icons[route.name] ?? ['circle', 'circle-outline'];
          return (
            <Ionicons
              name={(focused ? active : inactive) as any}
              size={size}
              color={color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Play" component={PlayHomeScreen} />
      <Tab.Screen name="Rounds" component={RoundsScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

function AuthedStack({ onboardingDone }: { onboardingDone: boolean }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!onboardingDone ? (
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="HandicapSetup" component={HandicapSetupScreen} />
        </>
      ) : null}
      <Stack.Screen name="MyBagSetup" component={MyBagSetupScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="Main" component={MainTabs} />
      <Stack.Screen name="StartRound" component={StartRoundScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="ActiveRound" component={ActiveRoundScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="EndRound" component={EndRoundScreen} options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="RoundDetail" component={RoundDetailScreen} />
      <Stack.Screen name="MyBag" component={MyBagScreen} />
      <Stack.Screen name="AdminMap" component={AdminMapScreen} options={{ presentation: 'fullScreenModal' }} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.green} />
      </View>
    );
  }

  if (!session) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Auth" component={AuthScreen} />
      </Stack.Navigator>
    );
  }

  // Signed in — skip onboarding (profile exists already)
  return <AuthedStack onboardingDone={true} />;
}
