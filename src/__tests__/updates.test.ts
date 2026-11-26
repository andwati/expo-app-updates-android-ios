// @jest-environment node
import { Platform } from 'react-native';
import type { IOSAvailableUpdate } from '../ExpoAppUpdatesAndroidIos.types';
import native from '../ExpoAppUpdatesAndroidIosModule';
import { checkForUpdateAsync, startUpdateAsync } from '../updates';

jest.mock('react-native', () => ({ Platform: { OS: 'android', isTV: false } }));

jest.mock('../ExpoAppUpdatesAndroidIosModule', () => ({
  __esModule: true,
  default: {
    checkAndroidAsync: jest.fn(),
    startAndroidAsync: jest.fn(),
    openIOSAsync: jest.fn(),
  },
}));

if (!native) {
  throw new Error('Native update mock is missing.');
}
const bridge = jest.mocked(native);

const listing: IOSAvailableUpdate = {
  status: 'available',
  platform: 'ios',
  installedVersion: '1.0',
  latestVersion: '1.1',
  country: 'US',
  appStoreId: 123,
  appStoreUrl: 'https://apps.apple.com/us/app/example/id123',
};

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

test('passes typed Play options with asset-pack deletion disabled by default', async () => {
  bridge.startAndroidAsync.mockResolvedValue({ status: 'started' });
  await expect(startUpdateAsync({ platform: 'android', mode: 'immediate' })).resolves.toEqual({
    status: 'started',
  });
  expect(bridge.startAndroidAsync).toHaveBeenCalledWith({
    mode: 'immediate',
    allowAssetPackDeletion: false,
  });
});

test('passes StoreKit options from the existing lookup result', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  bridge.openIOSAsync.mockResolvedValue({ status: 'opened', mode: 'storeKit' });
  await expect(
    startUpdateAsync({
      platform: 'ios',
      update: listing,
      mode: 'storeKit',
      fallbackToAppStore: false,
    })
  ).resolves.toEqual({ status: 'opened', mode: 'storeKit' });
  expect(bridge.openIOSAsync).toHaveBeenCalledWith({
    id: listing.appStoreId,
    url: listing.appStoreUrl,
    mode: 'storeKit',
    fallbackToAppStore: false,
  });
});

test('preserves stable native codes and causes', async () => {
  const failure = Object.assign(new Error('Google Play launch failed.'), {
    code: 'ERR_UPDATE_ACTIVITY',
  });
  bridge.startAndroidAsync.mockRejectedValue(failure);
  await expect(startUpdateAsync({ platform: 'android', mode: 'flexible' })).rejects.toMatchObject({
    code: 'ERR_UPDATE_ACTIVITY',
    cause: failure,
  });
});

test('reports unsupported on web without a store call', async () => {
  jest.replaceProperty(Platform, 'OS', 'web');
  await expect(checkForUpdateAsync()).resolves.toEqual({ status: 'unsupported', platform: 'web' });
  expect(bridge.checkAndroidAsync).not.toHaveBeenCalled();
});
