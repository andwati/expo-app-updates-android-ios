import type {
  AndroidUpdateMode,
  PolicyUpdateInfo,
  UpdateInfo,
} from './ExpoAppUpdatesAndroidIos.types';

export type UpdateDecision =
  | 'skip'
  | 'offer'
  | 'require'
  | { action: 'offer' | 'require'; androidMode?: AndroidUpdateMode };

export type UpdatePolicy = (info: PolicyUpdateInfo) => UpdateDecision;

export interface UpdateOffer {
  info: PolicyUpdateInfo;
  key: string;
  required: boolean;
  androidMode?: AndroidUpdateMode;
}

export function selectUpdateOffer(
  info: UpdateInfo,
  policy?: UpdatePolicy,
  deferred: ReadonlySet<string> = new Set()
): UpdateOffer | null {
  if (info.status !== 'available' || (info.platform === 'android' && !info.allowedModes.length)) {
    return null;
  }

  const decision = policy?.(info) ?? 'offer';
  if (decision === 'skip') {
    return null;
  }
  const required = (typeof decision === 'string' ? decision : decision.action) === 'require';
  if (info.platform === 'ios') {
    const key = `ios:${info.appStoreId}:${info.latestVersion}`;
    return required || !deferred.has(key) ? { info, key, required } : null;
  }

  const explicit = typeof decision === 'object' ? decision.androidMode : undefined;
  const androidMode =
    explicit ?? (required || !info.allowedModes.includes('flexible') ? 'immediate' : 'flexible');
  if (!info.allowedModes.includes(androidMode)) {
    return null;
  }
  const key = `android:${info.availableVersionCode}`;
  return required || !deferred.has(key) ? { info, key, required, androidMode } : null;
}

export function shouldCheckOnForeground(
  enabled: boolean,
  lastCheck: number | undefined,
  now: number,
  cooldownMs: number
): boolean {
  return enabled && (lastCheck === undefined || now - lastCheck >= Math.max(0, cooldownMs));
}
