import ExpoModulesCore

#if os(iOS)
import StoreKit
import UIKit
#endif

public class ExpoAppUpdatesAndroidIosModule: Module {
  #if os(iOS)
  private let storePresenter = StorePresenter()
  #endif

  public func definition() -> ModuleDefinition {
    Name("ExpoAppUpdatesAndroidIos")

    #if os(iOS)
    Events("onStoreKitDismissed")

    OnDestroy {
      let presenter = self.storePresenter
      Task { @MainActor in
        presenter.reset()
      }
    }

    AsyncFunction("getIOSAppInfoAsync") { (promise: Promise) -> Void in
      Task { @MainActor in
        guard let bundleId = Bundle.main.bundleIdentifier,
              let installedVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String else {
          promise.reject("ERR_UPDATE_CHECK", "The installed app's bundle ID or version is missing.")
          return
        }
        var info = [
          "bundleId": bundleId,
          "installedVersion": installedVersion,
          "osVersion": UIDevice.current.systemVersion
        ]
        info["deviceCountry"] = Locale.current.region?.identifier
        info["storefrontCountry"] = await Storefront.current?.countryCode
        promise.resolve(info)
      }
    }

    AsyncFunction("openIOSAsync") { (options: IOSOpenOptions, promise: Promise) -> Void in
      Task { @MainActor in
        let id = options.id
        guard id > 0, let listing = URLComponents(string: options.url), listing.scheme == "https",
              listing.host == "apps.apple.com", listing.port == nil, listing.user == nil,
              listing.password == nil, let storeURL = listing.url,
              storeURL.lastPathComponent == "id\(id)" else {
          promise.reject("ERR_UPDATE_OPTIONS", "A valid App Store listing is required.")
          return
        }
        self.storePresenter.open(
          id: id,
          url: storeURL,
          useProductSheet: options.mode == .storeKit,
          fallback: options.fallbackToAppStore,
          presenter: { [weak self] in self?.appContext?.utilities?.currentViewController() },
          onDismiss: { [weak self] in self?.sendEvent("onStoreKitDismissed") }
        ) { result in
          switch result {
          case .success(.busy):
            promise.resolve(["status": "busy"])
          case .success(let destination):
            promise.resolve(["status": "opened", "mode": destination.rawValue])
          case .failure(let error):
            promise.reject(error.code, error.message)
          }
        }
      }
    }
    #endif
  }
}

#if os(iOS)
private enum IOSUpdateMode: String, Enumerable {
  case appStore
  case storeKit
}

private struct IOSOpenOptions: Record {
  @Field var id: Int = 0
  @Field var url: String = ""
  @Field var mode: IOSUpdateMode = .appStore
  @Field var fallbackToAppStore: Bool = true
}
#endif
