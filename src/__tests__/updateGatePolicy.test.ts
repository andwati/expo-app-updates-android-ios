// @jest-environment node
import type { AndroidAvailableUpdate, IOSAvailableUpdate } from '../ExpoAppUpdatesAndroidIos.types';
import { selectUpdateOffer, shouldCheckOnForeground } from '../updateGatePolicy';

const android: AndroidAvailableUpdate = {
  platform: 'android',
  status: 'available',
  installedVersion: '1.0',
  installedVersionCode: 10,
  availableVersionCode: 11,
  allowedModes: ['flexible', 'immediate'],
  immediateUpdateInProgress: false,
  installState: { status: 'unknown' },
  priority: 4,
};

const ios: IOSAvailableUpdate = {
  platform: 'ios',
  status: 'available',
  installedVersion: '1.0',
  latestVersion: '1.1',
  country: 'KE',
  appStoreId: 123,
  appStoreUrl: 'https://apps.apple.com/ke/app/example/id123',
};

test('offers flexible updates and lets the app require immediate updates', () => {
  expect(selectUpdateOffer(android)).toMatchObject({ required: false, androidMode: 'flexible' });
  expect(
    selectUpdateOffer(android, (info) =>
      info.platform === 'android' && info.priority === 4 ? 'require' : 'skip'
    )
  ).toMatchObject({ required: true, androidMode: 'immediate' });
});

test('honors explicit modes only when Play allows them', () => {
  const flexibleOnly = { ...android, allowedModes: ['flexible'] } satisfies AndroidAvailableUpdate;
  expect(selectUpdateOffer(flexibleOnly, () => 'require')).toBeNull();
  expect(
    selectUpdateOffer(flexibleOnly, () => ({ action: 'require', androidMode: 'flexible' }))
  ).toMatchObject({ required: true, androidMode: 'flexible' });
});

test('never gates on ineligible results', () => {
  const policy = jest.fn(() => 'require' as const);
  expect(selectUpdateOffer({ ...ios, status: 'incompatible' }, policy)).toBeNull();
  expect(selectUpdateOffer({ ...android, status: 'inProgress' }, policy)).toBeNull();
  expect(selectUpdateOffer({ ...android, allowedModes: [] }, policy)).toBeNull();
  expect(policy).not.toHaveBeenCalled();
});

test('defers only the offered version and allows a required policy to take precedence', () => {
  const deferred = new Set(['ios:123:1.1']);
  expect(selectUpdateOffer(ios, undefined, deferred)).toBeNull();
  expect(selectUpdateOffer(ios, () => 'require', deferred)).toMatchObject({ required: true });
  expect(selectUpdateOffer({ ...ios, latestVersion: '1.2' }, undefined, deferred)).not.toBeNull();
});

test('foreground scheduling honors the cooldown and disable switch', () => {
  expect(shouldCheckOnForeground(true, undefined, 1000, 100)).toBe(true);
  expect(shouldCheckOnForeground(true, 1000, 1099, 100)).toBe(false);
  expect(shouldCheckOnForeground(true, 1000, 1100, 100)).toBe(true);
  expect(shouldCheckOnForeground(false, 1000, 5000, 100)).toBe(false);
});
