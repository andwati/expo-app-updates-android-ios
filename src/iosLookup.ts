import {
  AppUpdateError,
  type IOSCheckOptions,
  type IOSUpdateInfo,
} from './ExpoAppUpdatesAndroidIos.types';
import type { IOSAppInfo } from './ExpoAppUpdatesAndroidIosModule';
import { isoCountryCodes } from './isoCountryCodes';

const numericVersion = /^\d+(\.\d+)*$/;
const countryCode = /^[A-Z]{2}$/;

export function compareVersions(left: string, right: string): number {
  if (!numericVersion.test(left) || !numericVersion.test(right)) {
    throw new AppUpdateError(
      'ERR_UPDATE_LOOKUP',
      'Expected dotted numeric versions from the app and App Store.'
    );
  }
  const a = left.split('.');
  const b = right.split('.');
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = (a[i] ?? '0').replace(/^0+(?=\d)/, '');
    const y = (b[i] ?? '0').replace(/^0+(?=\d)/, '');
    if (x.length !== y.length) {
      return Math.sign(x.length - y.length);
    }
    if (x !== y) {
      return x > y ? 1 : -1;
    }
  }
  return 0;
}

function resolveCountry(explicit: string | undefined, app: IOSAppInfo): string {
  if (explicit !== undefined) {
    const normalized = explicit.trim().toUpperCase();
    if (!countryCode.test(normalized)) {
      throw new AppUpdateError(
        'ERR_UPDATE_OPTIONS',
        'Country must be a two-letter App Store storefront code.'
      );
    }
    return normalized;
  }
  const storefront = isoCountryCodes[app.storefrontCountry?.toUpperCase() ?? ''];
  const region = app.deviceCountry?.toUpperCase();
  return storefront ?? (region && countryCode.test(region) ? region : 'US');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isAppStoreUrl(value: unknown, id: number): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://apps.apple.com' &&
      !url.username &&
      !url.password &&
      url.pathname.split('/').at(-1) === `id${id}`
    );
  } catch {
    return false;
  }
}

export async function lookupIOSUpdate(
  app: IOSAppInfo,
  options: IOSCheckOptions = {}
): Promise<IOSUpdateInfo> {
  const { appStoreId, timeoutMs = 10_000 } = options;
  if (appStoreId !== undefined && (!Number.isSafeInteger(appStoreId) || appStoreId <= 0)) {
    throw new AppUpdateError('ERR_UPDATE_OPTIONS', 'App Store ID must be a positive integer.');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new AppUpdateError(
      'ERR_UPDATE_OPTIONS',
      'Lookup timeout must be a positive duration within the supported timer range.'
    );
  }
  const country = resolveCountry(options.country, app);
  const base = { platform: 'ios' as const, installedVersion: app.installedVersion, country };
  const query =
    appStoreId === undefined ? `bundleId=${encodeURIComponent(app.bundleId)}` : `id=${appStoreId}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let body: unknown;
  try {
    const response = await fetch(`https://itunes.apple.com/lookup?${query}&country=${country}`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    body = await response.json();
  } catch (cause) {
    if (controller.signal.aborted) {
      throw new AppUpdateError('ERR_UPDATE_TIMEOUT', 'The App Store lookup timed out.', cause);
    }
    throw new AppUpdateError('ERR_UPDATE_LOOKUP', 'The App Store lookup failed.', cause);
  } finally {
    clearTimeout(timer);
  }

  const { results } = isRecord(body) ? body : {};
  if (!Array.isArray(results)) {
    throw new AppUpdateError(
      'ERR_UPDATE_LOOKUP',
      'The App Store returned an invalid lookup response.'
    );
  }

  const items: unknown[] = results;
  const listing = items.find((item): item is Record<string, unknown> => {
    if (!isRecord(item)) {
      return false;
    }
    const { bundleId, trackId } = item;
    return appStoreId === undefined ? bundleId === app.bundleId : trackId === appStoreId;
  });
  if (!listing) {
    return { ...base, status: 'listingUnavailable' };
  }

  const {
    trackId,
    trackViewUrl,
    version,
    releaseNotes,
    currentVersionReleaseDate,
    minimumOsVersion,
  } = listing;
  if (
    typeof trackId !== 'number' ||
    !Number.isSafeInteger(trackId) ||
    trackId <= 0 ||
    !isAppStoreUrl(trackViewUrl, trackId) ||
    typeof version !== 'string' ||
    (minimumOsVersion !== undefined && typeof minimumOsVersion !== 'string')
  ) {
    throw new AppUpdateError(
      'ERR_UPDATE_LOOKUP',
      'The App Store listing contains invalid update metadata.'
    );
  }

  const newer = compareVersions(version, app.installedVersion) > 0;
  const compatible = !minimumOsVersion || compareVersions(app.osVersion, minimumOsVersion) >= 0;
  return {
    ...base,
    status: !newer ? 'upToDate' : compatible ? 'available' : 'incompatible',
    appStoreId: trackId,
    appStoreUrl: trackViewUrl,
    latestVersion: version,
    ...(typeof releaseNotes === 'string' && { releaseNotes }),
    ...(typeof currentVersionReleaseDate === 'string' && {
      releaseDate: currentVersionReleaseDate,
    }),
    ...(minimumOsVersion !== undefined && { minimumOsVersion }),
  };
}
