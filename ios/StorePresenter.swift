#if os(iOS)
import StoreKit
import UIKit

enum StorePresentationOutcome: String {
  case busy
  case appStore
  case storeKit
}

struct StorePresentationError: Error {
  let code: String
  let message: String
}

typealias StorePresentationCompletion =
  @MainActor (Result<StorePresentationOutcome, StorePresentationError>) -> Void

final class StorePresenter: NSObject {
  @MainActor private var product: SKStoreProductViewController?
  @MainActor private var opening = false
  @MainActor private var onDismiss: (@MainActor () -> Void)?

  @MainActor
  func open(
    id: Int,
    url: URL,
    useProductSheet: Bool,
    fallback: Bool,
    presenter: @escaping @MainActor () -> UIViewController?,
    onDismiss: @escaping @MainActor () -> Void,
    completion: @escaping StorePresentationCompletion
  ) {
    guard !opening, product == nil else {
      completion(.success(.busy))
      return
    }
    guard useProductSheet else {
      openAppStore(url, completion: completion)
      return
    }

    let controller = SKStoreProductViewController()
    controller.delegate = self
    product = controller

    let timeout = Task { @MainActor [weak self, weak controller] in
      do {
        try await Task.sleep(for: .seconds(12))
      } catch {
        return
      }
      guard let self, let controller, self.product === controller else { return }
      self.product = nil
      if fallback {
        self.openAppStore(url, completion: completion)
      } else {
        completion(.failure(StorePresentationError(
          code: "ERR_UPDATE_TIMEOUT",
          message: "The StoreKit product sheet timed out."
        )))
      }
    }

    controller.loadProduct(withParameters: [SKStoreProductParameterITunesItemIdentifier: NSNumber(value: id)]) {
      [weak self, weak controller] loaded, error in
      DispatchQueue.main.async {
        guard let self, let controller, self.product === controller else { return }
        timeout.cancel()
        if loaded, let presenting = presenter(), presenting.viewIfLoaded?.window != nil,
           !presenting.isBeingDismissed, UIApplication.shared.applicationState == .active {
          controller.presentationController?.delegate = self
          presenting.present(controller, animated: true)
          if controller.presentingViewController != nil {
            self.onDismiss = onDismiss
            completion(.success(.storeKit))
            return
          }
        }
        self.product = nil
        if fallback {
          self.openAppStore(url, completion: completion)
        } else {
          completion(.failure(StorePresentationError(
            code: "ERR_UPDATE_LAUNCH",
            message: error?.localizedDescription ?? "StoreKit could not present the listing."
          )))
        }
      }
    }
  }

  @MainActor
  private func openAppStore(_ url: URL, completion: @escaping StorePresentationCompletion) {
    opening = true
    Task { @MainActor in
      let opened = await UIApplication.shared.open(url)
      opening = false
      if opened {
        completion(.success(.appStore))
      } else {
        completion(.failure(StorePresentationError(
          code: "ERR_UPDATE_LAUNCH",
          message: "iOS could not open the App Store listing."
        )))
      }
    }
  }

  @MainActor
  func reset() {
    let controller = product
    onDismiss = nil
    product = nil
    if controller?.presentingViewController != nil {
      controller?.dismiss(animated: false)
    }
  }

  @MainActor
  private func didDismiss(_ viewController: UIViewController) {
    guard product === viewController else { return }
    product = nil
    let callback = onDismiss
    onDismiss = nil
    callback?()
  }
}

extension StorePresenter: SKStoreProductViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
  @MainActor
  func productViewControllerDidFinish(_ viewController: SKStoreProductViewController) {
    viewController.dismiss(animated: true) { [weak self] in
      self?.didDismiss(viewController)
    }
  }

  @MainActor
  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    didDismiss(presentationController.presentedViewController)
  }
}
#endif
