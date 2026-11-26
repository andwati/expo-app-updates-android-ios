// @jest-environment node
import { compareVersions, lookupIOSUpdate } from '../iosLookup';

const baseApp = { bundleId: 'com.example.app', installedVersion: '1.9', osVersion: '17.2' };
const app = {
  ...baseApp,
  storefrontCountry: 'KEN',
  deviceCountry: 'US',
};

const listing = {
  trackId: 123,
  bundleId: app.bundleId,
  trackViewUrl: 'https://apps.apple.com/ke/app/example/id123?uo=4',
  version: '1.10',
  minimumOsVersion: '17.1',
  releaseNotes: 'Faster startup',
  currentVersionReleaseDate: '2026-11-20T00:00:00Z',
};

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

function respondWith(body: unknown, status = 200) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response(JSON.stringify(body), { status }));
}

describe('numeric versions', () => {
  test.each([
    ['1.10', '1.9', 1],
    ['1.0', '1.0.0', 0],
    ['1.0.01', '1.0.1', 0],
    ['1.9.9', '2', -1],
  ])('%s compared with %s', (left, right, expected) => {
    expect(compareVersions(left, right)).toBe(expected);
  });

  test('rejects malformed versions', () => {
    expect(() => compareVersions('1.0-beta', '1.0')).toThrow();
  });
});

describe('App Store lookup', () => {
  test('uses the account storefront and matches the installed bundle ID', async () => {
    const fetch = respondWith({ results: [{ ...listing, bundleId: 'other.app' }, listing] });
    await expect(lookupIOSUpdate(app)).resolves.toMatchObject({
      status: 'available',
      country: 'KE',
      appStoreId: 123,
      appStoreUrl: listing.trackViewUrl,
      latestVersion: '1.10',
      releaseNotes: 'Faster startup',
      releaseDate: listing.currentVersionReleaseDate,
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://itunes.apple.com/lookup?bundleId=com.example.app&country=KE',
      { signal: expect.any(AbortSignal) }
    );
  });

  test('accepts listing ID and country overrides', async () => {
    const fetch = respondWith({ results: [listing] });
    await expect(lookupIOSUpdate(app, { appStoreId: 123, country: 'gb' })).resolves.toMatchObject({
      country: 'GB',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://itunes.apple.com/lookup?id=123&country=GB',
      expect.anything()
    );
  });

  test('uses device region then US when storefront is missing', async () => {
    respondWith({ results: [] });
    await expect(lookupIOSUpdate({ ...baseApp, deviceCountry: 'CN' })).resolves.toMatchObject({
      country: 'CN',
      status: 'listingUnavailable',
    });
    await expect(lookupIOSUpdate(baseApp)).resolves.toMatchObject({
      country: 'US',
      status: 'listingUnavailable',
    });
  });

  test('distinguishes incompatible and up-to-date releases', async () => {
    respondWith({ results: [listing] });
    await expect(lookupIOSUpdate({ ...app, osVersion: '17.0' })).resolves.toMatchObject({
      status: 'incompatible',
    });
    await expect(lookupIOSUpdate({ ...app, installedVersion: '1.10.0' })).resolves.toMatchObject({
      status: 'upToDate',
    });
  });

  test('rejects mismatched store URLs', async () => {
    respondWith({ results: [{ ...listing, trackViewUrl: 'https://apps.apple.com/app/id456' }] });
    await expect(lookupIOSUpdate(app)).rejects.toMatchObject({ code: 'ERR_UPDATE_LOOKUP' });
  });

  test('surfaces Apple rate limiting as a lookup error', async () => {
    respondWith({}, 429);
    await expect(lookupIOSUpdate(app)).rejects.toMatchObject({ code: 'ERR_UPDATE_LOOKUP' });
  });

  test('aborts a slow lookup', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
        })
    );
    const assertion = expect(lookupIOSUpdate(app, { timeoutMs: 50 })).rejects.toMatchObject({
      code: 'ERR_UPDATE_TIMEOUT',
    });
    await jest.advanceTimersByTimeAsync(50);
    await assertion;
  });
});
