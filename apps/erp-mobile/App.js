import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors } from './src/theme';
import { isConfigured } from './src/config';
import DashboardScreen from './src/screens/DashboardScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import StockScreen from './src/screens/StockScreen';
import BalancesScreen from './src/screens/BalancesScreen';

const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary },
};

const ICONS = {
  Dashboard: 'grid-outline',
  History: 'receipt-outline',
  Stock: 'cube-outline',
  Balances: 'people-outline',
};

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {!isConfigured() ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Supabase anon key not set — edit src/config.js and rebuild.
          </Text>
        </View>
      ) : null}
      <NavigationContainer theme={navTheme}>
        <Tab.Navigator
          screenOptions={({ route }) => ({
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: colors.headerText,
            headerTitleStyle: { fontWeight: '700' },
            headerTitle: `Hassan Electronics · ${route.name}`,
            tabBarActiveTintColor: colors.primary,
            tabBarInactiveTintColor: colors.tabInactive,
            tabBarStyle: {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
              height: Platform.OS === 'android' ? 60 : undefined,
              paddingBottom: Platform.OS === 'android' ? 6 : undefined,
            },
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={ICONS[route.name] || 'ellipse-outline'} size={size} color={color} />
            ),
          })}
        >
          <Tab.Screen name="Dashboard" component={DashboardScreen} />
          <Tab.Screen name="History" component={HistoryScreen} />
          <Tab.Screen name="Stock" component={StockScreen} />
          <Tab.Screen name="Balances" component={BalancesScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: colors.warn, paddingTop: 40, paddingBottom: 8, paddingHorizontal: 12 },
  bannerText: { color: '#1b1b1b', fontSize: 12, fontWeight: '600', textAlign: 'center' },
});
