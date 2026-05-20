import Foundation
import Combine

@MainActor
final class AuthStore: ObservableObject {
    static let shared = AuthStore()

    @Published var isAuthenticated = false
    @Published var currentUser: User?

    private let tokenKey = "auth_token"

    init() {
        if let token = storedToken {
            APIService.shared.setToken(token)
            isAuthenticated = true
            Task { await refreshUser() }
        }
    }

    private var storedToken: String? {
        get { UserDefaults.standard.string(forKey: tokenKey) }
        set {
            if let value = newValue {
                UserDefaults.standard.set(value, forKey: tokenKey)
            } else {
                UserDefaults.standard.removeObject(forKey: tokenKey)
            }
        }
    }

    func login(email: String, password: String) async throws {
        let response = try await APIService.shared.login(email: email, password: password)
        apply(response: response)
        await requestPushPermission()
    }

    func register(firstName: String, lastName: String, email: String, password: String, phone: String?) async throws {
        let response = try await APIService.shared.register(
            firstName: firstName, lastName: lastName, email: email, password: password, phone: phone
        )
        apply(response: response)
        await requestPushPermission()
    }

    func logout() {
        storedToken = nil
        APIService.shared.setToken(nil)
        currentUser = nil
        isAuthenticated = false
    }

    private func apply(response: AuthResponse) {
        storedToken = response.token
        APIService.shared.setToken(response.token)
        currentUser = response.user
        isAuthenticated = true
    }

    private func refreshUser() async {
        do {
            currentUser = try await APIService.shared.fetchMe()
        } catch let err as APIError {
            if case .unauthorized = err {
                logout()
            }
        } catch {}
    }

    private func requestPushPermission() async {
        _ = await NotificationService.shared.requestAuthorization()
    }
}
