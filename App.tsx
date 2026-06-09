import 'react-native-gesture-handler';
import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_900Black } from '@expo-google-fonts/inter';
import { AuthProvider } from './src/context/AuthContext';
import { RoundProvider } from './src/context/RoundContext';
import RootNavigator from './src/navigation/RootNavigator';
import { Colors } from './src/constants/theme';

(Text as any).defaultProps = {
  ...(Text as any).defaultProps,
  style: [{ fontFamily: 'Inter_400Regular' }, (Text as any).defaultProps?.style],
};

(TextInput as any).defaultProps = {
  ...(TextInput as any).defaultProps,
  style: [{ fontFamily: 'Inter_400Regular' }, (TextInput as any).defaultProps?.style],
};

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_900Black,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: Colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RoundProvider>
          <NavigationContainer>
            <StatusBar style="light" />
            <RootNavigator />
          </NavigationContainer>
        </RoundProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
