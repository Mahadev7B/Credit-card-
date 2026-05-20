import Foundation
import PassKit

final class WalletService: NSObject, PKAddPaymentPassViewControllerDelegate {
    static let shared = WalletService()

    private var completionHandler: ((Bool, Error?) -> Void)?

    var isWalletAvailable: Bool {
        PKAddPaymentPassViewController.canAddPaymentPass()
    }

    func canAddCard(_ card: Card) -> Bool {
        guard isWalletAvailable else { return false }
        return !card.walletProvisioned && card.status == .active
    }

    @MainActor
    func addToWallet(card: Card, user: User, from viewController: UIViewController) async throws {
        guard isWalletAvailable else {
            throw WalletError.walletUnavailable
        }
        guard !card.walletProvisioned else {
            throw WalletError.alreadyProvisioned
        }

        let config = PKAddPaymentPassRequestConfiguration(encryptionScheme: .ECC_V2)!
        config.cardholderName = user.fullName
        config.primaryAccountSuffix = card.last4
        config.primaryAccountIdentifier = card.id

        return try await withCheckedThrowingContinuation { continuation in
            self.completionHandler = { success, error in
                if success {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: error ?? WalletError.provisioningFailed)
                }
            }

            guard let vc = PKAddPaymentPassViewController(requestConfiguration: config, delegate: self) else {
                continuation.resume(throwing: WalletError.viewControllerCreationFailed)
                return
            }
            viewController.present(vc, animated: true)
        }
    }

    // MARK: - PKAddPaymentPassViewControllerDelegate

    func addPaymentPassViewController(
        _ controller: PKAddPaymentPassViewController,
        generateRequestWithCertificateChain certificates: [Data],
        nonce: Data,
        nonceSignature: Data,
        completionHandler handler: @escaping (PKAddPaymentPassRequest) -> Void
    ) {
        let certStrings = certificates.map { $0.base64EncodedString() }
        let nonceStr = nonce.base64EncodedString()
        let nonceSigStr = nonceSignature.base64EncodedString()

        Task {
            do {
                // Call backend to encrypt card data with Apple's public key
                _ = try await APIService.shared.provisionAppleWallet(
                    cardId: controller.description, // use actual card ID from context
                    certificates: certStrings,
                    nonce: nonceStr,
                    nonceSignature: nonceSigStr
                )
                let request = PKAddPaymentPassRequest()
                handler(request)
            } catch {
                let request = PKAddPaymentPassRequest()
                handler(request)
            }
        }
    }

    func addPaymentPassViewController(
        _ controller: PKAddPaymentPassViewController,
        didFinishAdding pass: PKPaymentPass?,
        error: Error?
    ) {
        controller.dismiss(animated: true)
        completionHandler?(pass != nil, error)
        completionHandler = nil
    }

    enum WalletError: LocalizedError {
        case walletUnavailable
        case alreadyProvisioned
        case provisioningFailed
        case viewControllerCreationFailed

        var errorDescription: String? {
            switch self {
            case .walletUnavailable: return "Apple Wallet is not available on this device"
            case .alreadyProvisioned: return "Card is already added to Apple Wallet"
            case .provisioningFailed: return "Failed to add card to Apple Wallet"
            case .viewControllerCreationFailed: return "Could not open Apple Wallet"
            }
        }
    }
}
