import { type JSX, type ReactNode, type Ref, useEffect, useImperativeHandle } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import type { UpdateInfo } from './ExpoAppUpdatesAndroidIos.types';
import { type UpdateGateOptions, useAppUpdateGate } from './useAppUpdateGate';

export interface AppUpdateGateRef {
  /** Checks immediately and returns the result, or undefined if the check fails. */
  checkAsync(): Promise<UpdateInfo | undefined>;
}

export interface AppUpdateCopy {
  offerTitle: string;
  offerMessage: string;
  requiredTitle: string;
  requiredMessage: string;
  update: string;
  later: string;
  openAppStore: string;
  releaseNotes: string;
  downloadTitle: string;
  installingTitle: string;
  readyTitle: string;
  readyMessage: string;
  restart: string;
  recheck: string;
  error: string;
}

export interface AppUpdateTheme {
  background: string;
  text: string;
  secondaryText: string;
  accent: string;
  accentText: string;
  backdrop: string;
}

export interface AppUpdateGateProps extends UpdateGateOptions {
  children: ReactNode;
  ref?: Ref<AppUpdateGateRef>;
  copy?: Partial<AppUpdateCopy>;
  theme?: Partial<AppUpdateTheme>;
  showReleaseNotes?: boolean;
}

const defaultCopy: AppUpdateCopy = {
  offerTitle: 'Update available',
  offerMessage: 'A newer version of this app is available.',
  requiredTitle: 'Update required',
  requiredMessage: 'Update this app to continue.',
  update: 'Update',
  later: 'Later',
  openAppStore: 'Open App Store',
  releaseNotes: 'Release notes',
  downloadTitle: 'Downloading update',
  installingTitle: 'Installing update',
  readyTitle: 'Update ready to install',
  readyMessage: 'Restart the app to install the downloaded update.',
  restart: 'Restart and install',
  recheck: 'Check again',
  error: 'The update could not continue. Try again.',
};

const light: AppUpdateTheme = {
  background: '#ffffff',
  text: '#18181b',
  secondaryText: '#52525b',
  accent: '#234cc7',
  accentText: '#ffffff',
  backdrop: 'rgba(0, 0, 0, 0.55)',
};

const dark: AppUpdateTheme = {
  background: '#242427',
  text: '#fafafa',
  secondaryText: '#d4d4d8',
  accent: '#aac1ff',
  accentText: '#151d32',
  backdrop: 'rgba(0, 0, 0, 0.72)',
};

export function AppUpdateGate(props: AppUpdateGateProps): JSX.Element {
  const { children, ref, showReleaseNotes = true } = props;
  const {
    offer,
    install,
    error,
    busy,
    check,
    update,
    complete,
    defer,
    restartDeferred,
    setRestartDeferred,
  } = useAppUpdateGate(props);
  const copy = { ...defaultCopy, ...props.copy };
  const theme = { ...(useColorScheme() === 'dark' ? dark : light), ...props.theme };
  const ready = install.status === 'downloaded';
  const waiting =
    install.status === 'pending' ||
    install.status === 'downloading' ||
    install.status === 'installing';
  const required = offer?.required ?? false;
  const showDialog = ready
    ? required || !restartDeferred
    : offer !== null && (required || !waiting);
  const notes =
    showReleaseNotes && offer?.info.platform === 'ios' ? offer.info.releaseNotes : undefined;
  const progress = downloadPercent(install.bytesDownloaded, install.totalBytesToDownload);
  const progressTitle = install.status === 'installing' ? copy.installingTitle : copy.downloadTitle;

  useImperativeHandle(ref, () => ({ checkAsync: () => check() }), [check]);

  useEffect(() => {
    if (!showDialog || Platform.OS !== 'android') {
      return;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [showDialog]);

  return (
    <View style={styles.root}>
      <View
        accessibilityElementsHidden={showDialog}
        importantForAccessibility={showDialog ? 'no-hide-descendants' : 'auto'}
        pointerEvents={showDialog ? 'none' : 'auto'}
        style={styles.root}
      >
        {children}
      </View>
      {waiting && !showDialog && (
        <View pointerEvents="none" style={styles.bannerContainer}>
          <View style={[styles.banner, { backgroundColor: theme.background }]}>
            <Progress theme={theme} title={progressTitle} percent={progress} />
          </View>
        </View>
      )}
      {ready && !showDialog && (
        <View pointerEvents="box-none" style={styles.bannerContainer}>
          <View style={[styles.banner, { backgroundColor: theme.background }]}>
            <Action
              label={copy.readyTitle}
              onPress={() => setRestartDeferred(false)}
              theme={theme}
              disabled={busy}
            />
          </View>
        </View>
      )}
      {showDialog && (
        <View
          accessibilityViewIsModal
          style={[styles.backdrop, { backgroundColor: theme.backdrop }]}
        >
          <View style={[styles.dialog, { backgroundColor: theme.background }]}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.dialogContent}
            >
              <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
                {ready ? copy.readyTitle : required ? copy.requiredTitle : copy.offerTitle}
              </Text>
              <Text style={{ color: theme.secondaryText }}>
                {ready ? copy.readyMessage : required ? copy.requiredMessage : copy.offerMessage}
              </Text>
              {notes && !ready && (
                <View style={styles.notes}>
                  <Text
                    accessibilityRole="header"
                    style={[styles.notesTitle, { color: theme.text }]}
                  >
                    {copy.releaseNotes}
                  </Text>
                  <Text style={{ color: theme.secondaryText }}>{notes}</Text>
                </View>
              )}
              {error && (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={{ color: theme.text }}
                >
                  {copy.error}
                </Text>
              )}
              {waiting && <Progress theme={theme} title={progressTitle} percent={progress} />}
              {busy && !waiting && <ActivityIndicator color={theme.accent} />}
              {ready ? (
                <Action
                  label={copy.restart}
                  onPress={complete}
                  theme={theme}
                  disabled={busy}
                  primary
                />
              ) : (
                !waiting && (
                  <Action
                    label={copy.update}
                    onPress={() => update()}
                    theme={theme}
                    disabled={busy}
                    primary
                  />
                )
              )}
              {!ready &&
                !waiting &&
                offer?.info.platform === 'ios' &&
                props.iosMode === 'storeKit' && (
                  <Action
                    label={copy.openAppStore}
                    onPress={() => update('appStore')}
                    theme={theme}
                    disabled={busy}
                  />
                )}
              {!required && (
                <Action
                  label={copy.later}
                  onPress={ready ? () => setRestartDeferred(true) : defer}
                  theme={theme}
                  disabled={busy}
                />
              )}
              {(required || error) && (
                <Action
                  label={copy.recheck}
                  onPress={() => {
                    void check();
                  }}
                  theme={theme}
                  disabled={busy}
                />
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

function downloadPercent(downloaded?: number, total?: number) {
  if (downloaded === undefined || total === undefined || total <= 0) {
    return undefined;
  }
  return Math.max(0, Math.min(100, Math.round((downloaded / total) * 100)));
}

function Progress({
  theme,
  title,
  percent,
}: {
  theme: AppUpdateTheme;
  title: string;
  percent: number | undefined;
}) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={title}
      accessibilityValue={percent === undefined ? undefined : { min: 0, max: 100, now: percent }}
      style={styles.progress}
    >
      {percent === undefined && <ActivityIndicator color={theme.accent} />}
      <Text style={{ color: theme.text }}>
        {percent === undefined ? title : `${title} (${percent}%)`}
      </Text>
      {percent !== undefined && (
        <View style={[styles.track, { backgroundColor: theme.secondaryText }]}>
          <View style={[styles.fill, { width: `${percent}%`, backgroundColor: theme.accent }]} />
        </View>
      )}
    </View>
  );
}

interface ActionProps {
  label: string;
  onPress: () => void;
  theme: AppUpdateTheme;
  disabled: boolean;
  primary?: boolean;
}

function Action({ label, onPress, theme, disabled, primary = false }: ActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary && { backgroundColor: theme.accent },
        (pressed || disabled) && styles.dim,
      ]}
    >
      <Text style={[styles.actionLabel, { color: primary ? theme.accentText : theme.accent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bannerContainer: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end', padding: 20 },
  banner: { alignSelf: 'center', width: '100%', maxWidth: 440, padding: 18, borderRadius: 16 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  dialog: { width: '100%', maxWidth: 440, maxHeight: '85%', borderRadius: 20, overflow: 'hidden' },
  dialogContent: { padding: 22, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  notes: { gap: 4 },
  notesTitle: { fontWeight: '600' },
  progress: { gap: 8, alignItems: 'center' },
  track: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%' },
  action: {
    minHeight: 48,
    padding: 10,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: { fontWeight: '600', textAlign: 'center' },
  dim: { opacity: 0.6 },
});
