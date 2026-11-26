# expo-app-updates-android-ios

Typed store updates for Expo SDK 58. On Android, Google Play supplies immediate and flexible update flows. On iOS, the module compares the installed version with the public App Store listing and can open the App Store or show a StoreKit product sheet.

## Install

```sh
pnpm exec expo install expo-app-updates-android-ios
pnpm exec expo run:android
pnpm exec expo run:ios
```

Use a development or release build with the native module linked. Managed Expo apps can use Prebuild or EAS Build with the same JavaScript configuration. In an existing bare app with Expo Modules configured, run `pnpm dlx pod-install` for iOS. Expo Go and web report `unsupported`.

## Bundled UI

Mount `AppUpdateGate` near the root of the app. It checks on mount and when the app returns to the foreground, with a default 15-minute cooldown between availability checks. Android recovery and return from an iOS store handoff can check immediately. By default, people can defer each offered version for the current session. Flexible updates download in the background and ask before restarting.

```tsx
import { AppUpdateGate } from 'expo-app-updates-android-ios';

export default function App() {
  return (
    <AppUpdateGate
      iosMode="storeKit"
      checkOptions={{ ios: { country: 'KE' } }}
      policy={(update) => {
        if (
          update.platform === 'android' &&
          update.allowedModes.includes('immediate') &&
          (update.priority ?? 0) >= 4
        ) {
          return 'require';
        }
        return 'offer';
      }}
      copy={{ update: 'Get the update', later: 'Remind me later' }}
    >
      <YourApp />
    </AppUpdateGate>
  );
}
```

| Prop                                           | Behavior                                                                                                                                                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `policy`                                       | Return `skip`, `offer`, `require`, or an object with `action` and a specific `androidMode`. Optional Android offers prefer flexible mode. Required Android offers default to immediate and gate access only when Play allows the selected mode. |
| `checkOptions`                                 | Set an iOS listing ID, country, or lookup timeout, and opt into Android asset-pack deletion when Play needs it.                                                                                                                                 |
| `checkOnMount`, `checkOnForeground`            | Turn automatic availability offers on or off. Android still checks for interrupted immediate flows and downloaded updates.                                                                                                                      |
| `foregroundCooldownMs`, `ref`                  | Set the interval for foreground offers. Call `ref.current?.checkAsync()` to check immediately and get the result.                                                                                                                               |
| `iosMode`, `iosFallbackToAppStore`             | Choose `appStore` (default) or `storeKit`. The sheet falls back to the App Store by default.                                                                                                                                                    |
| `copy`, `theme`, `showReleaseNotes`, `onError` | Customize copy and colors, hide iOS release notes, and handle typed failures.                                                                                                                                                                   |

Required offers stay visible after cancellation or transient failure and provide a fresh check. The gate releases access when a successful check finds the update is ineligible or the policy no longer requires it.

## Build your own UI

```ts
import { checkForUpdateAsync, startUpdateAsync } from 'expo-app-updates-android-ios';

const update = await checkForUpdateAsync();

if (update.status === 'available') {
  if (update.platform === 'ios') {
    await startUpdateAsync({ platform: 'ios', update, mode: 'appStore' });
  } else if (update.allowedModes.includes('flexible')) {
    // Subscribe before starting so you can show progress and prompt to restart.
    await startUpdateAsync({ platform: 'android', mode: 'flexible' });
  }
}
```

- `addInstallStateListener` receives Android download bytes, status, and the Play error code when available. Call `completeFlexibleUpdateAsync()` when Play reports `downloaded` and the user confirms the restart.
- `addUpdateFlowResultListener` receives Android acceptance, cancellation, failure, and activity interruption. On foreground, check again to recover flexible installs and call `resumeImmediateUpdateAsync()` if Play reports `immediateUpdateInProgress`. Immediate updates can restart the app before a result callback arrives.
- `addStoreKitDismissListener` lets the app recheck when the iOS product sheet closes. An `opened` result means the destination opened. StoreKit controls the listing and its available actions.
- Each listener returns a subscription with `remove()`. Failed operations reject with `AppUpdateError`, which includes a stable `code` and the underlying `cause` when available. Availability, cancellation, and unsupported environments have explicit results.

Apple lookup defaults to the installed bundle ID. Use `ios.appStoreId` to select a listing explicitly. The country defaults to the App Store account’s storefront, then the device region, then the US. A listing missing from the selected storefront returns `listingUnavailable`. A newer listing that requires a newer iOS release returns `incompatible`. Apple rate-limits requests and public listing metadata can lag a release, so throttle checks when building a custom UI. [Apple iTunes Search API](https://performance-partners.apple.com/search-api)

## Run and verify the example

```sh
pnpm install
pnpm verify
pnpm --dir example android
pnpm --dir example ios
```

`pnpm verify` builds declarations and checks the library, Node scripts, tests, and example. It also runs Biome with warnings treated as errors and runs the Jest tests. Packaging runs the same checks. Android lint uses warnings as errors for the module. The shared TypeScript settings retain Expo’s `skipLibCheck` because React Native’s bundled declarations conflict with the platform libraries in this SDK.

- **Google Play.** Set the example package to your test app. Use the same application ID and signing identity across two versions, and make the second version’s `versionCode` higher. Use Play Internal App Sharing to install the first version and make the second available. Check flexible acceptance, progress, deferral, restart, and recovery after reopening. Check immediate cancellation, relaunch, and recovery. Update priority requires a Play test track because Internal App Sharing does not support priority. [Google Play in-app update tests](https://developer.android.com/guide/playcore/in-app-updates/test)
- **Apple App Store.** Set the example bundle identifier to a published app you can test on a physical iPhone. Use an older marketing version and check both the App Store and StoreKit modes. Try a different storefront and a version with a minimum OS above the test device’s version. Verify the StoreKit fallback and direct App Store action. [Apple lookup documentation](https://performance-partners.apple.com/search-api) · [StoreKit product view](https://developer.apple.com/documentation/storekit/skstoreproductviewcontroller)

The [expo-in-app-updates project](https://github.com/SohelIslamImran/expo-in-app-updates) was a reference for store handoff and recovery behavior.
