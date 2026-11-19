import { Tabs } from 'expo-router/tabs';

import { RouteTabBar } from '@/components/route-tab-bar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <RouteTabBar {...props} />}
      screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="create" />
      <Tabs.Screen name="camera" />
      <Tabs.Screen name="storyboard" />
      {/* Opened from Avatar. RouteTabBar draws no button for it but stays visible.
          (href: null would make the router redirect away from it.) */}
      <Tabs.Screen name="animate" />
    </Tabs>
  );
}
