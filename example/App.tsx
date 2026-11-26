import {
  type AppUpdateError,
  AppUpdateGate,
  type AppUpdateGateRef,
  type IOSUpdateMode,
  type UpdateInfo,
} from 'expo-app-updates-android-ios';
import { useRef, useState } from 'react';
import { Button, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

const description = {
  available: 'An update is available.',
  upToDate: 'This app is up to date.',
  unknown: 'Google Play could not determine availability.',
  inProgress: 'An update is already in progress.',
  incompatible: 'The latest version requires a newer iOS release.',
  listingUnavailable: 'This app has no listing in the selected storefront.',
  unsupported: 'Store updates are unavailable in this build.',
};

export default function App() {
  const gate = useRef<AppUpdateGateRef>(null);
  const [result, setResult] = useState<UpdateInfo>();
  const [error, setError] = useState<AppUpdateError>();
  const [checking, setChecking] = useState(false);
  const [requireUpdate, setRequireUpdate] = useState(false);
  const [iosMode, setIOSMode] = useState<IOSUpdateMode>('appStore');

  async function check() {
    setChecking(true);
    setError(undefined);
    try {
      setResult(await gate.current?.checkAsync());
    } finally {
      setChecking(false);
    }
  }

  return (
    <AppUpdateGate
      ref={gate}
      checkOnMount={false}
      checkOnForeground={false}
      iosMode={iosMode}
      onError={setError}
      policy={() => (requireUpdate ? 'require' : 'offer')}
    >
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Store updates
        </Text>
        <View style={styles.setting}>
          <Text style={styles.text}>Require eligible updates</Text>
          <Switch
            accessibilityLabel="Require eligible updates"
            value={requireUpdate}
            onValueChange={setRequireUpdate}
          />
        </View>
        {Platform.OS === 'ios' && (
          <View style={styles.setting}>
            <Text style={styles.text}>Use StoreKit product sheet</Text>
            <Switch
              accessibilityLabel="Use StoreKit product sheet"
              value={iosMode === 'storeKit'}
              onValueChange={(value) => setIOSMode(value ? 'storeKit' : 'appStore')}
            />
          </View>
        )}
        <Button
          onPress={check}
          disabled={checking}
          title={checking ? 'Checking…' : 'Check for update'}
        />
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {error
            ? error.message
            : result
              ? description[result.status]
              : 'Check the store for a newer version of this app.'}
        </Text>
      </ScrollView>
    </AppUpdateGate>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingTop: 64, paddingBottom: 24, gap: 16 },
  title: { fontSize: 30, fontWeight: '700' },
  setting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  text: { fontSize: 16 },
});
