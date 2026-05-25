import Foundation
import UserNotifications
import UIKit

@MainActor
final class NotificationService {
    static let shared = NotificationService()

    private init() {}

    func requestAuthorization() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .sound, .badge]
            )
            if granted {
                await UIApplication.shared.registerForRemoteNotifications()
            }
            return granted
        } catch {
            return false
        }
    }

    func registerDeviceToken(_ token: String) {
        guard AuthStore.shared.isAuthenticated else { return }
        Task {
            try? await APIService.shared.registerPushToken(token)
        }
    }

    func clearBadge() {
        UNUserNotificationCenter.current().setBadgeCount(0) { _ in }
    }
}

@MainActor
final class NotificationStore: ObservableObject {
    @Published var pendingTransactionId: String?
    @Published var showTransactionDetail = false

    func handle(payload: [AnyHashable: Any]) {
        guard let type = payload["type"] as? String else { return }
        switch type {
        case "transaction":
            if let txId = payload["transactionId"] as? String {
                pendingTransactionId = txId
                showTransactionDetail = true
            }
        case "card_status":
            break
        case "health_alert":
            break
        default:
            break
        }
    }
}
