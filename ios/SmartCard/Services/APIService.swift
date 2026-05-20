import Foundation
import Combine

enum APIError: LocalizedError {
    case invalidURL
    case unauthorized
    case serverError(String)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .invalidURL: return "Invalid URL"
        case .unauthorized: return "Session expired. Please log in again."
        case .serverError(let msg): return msg
        case .decodingError(let err): return "Data error: \(err.localizedDescription)"
        case .networkError(let err): return err.localizedDescription
        }
    }
}

struct APIErrorResponse: Codable {
    let error: String
}

final class APIService {
    static let shared = APIService()

    private let baseURL: String
    private var authToken: String?
    private let decoder: JSONDecoder
    private let session: URLSession

    private init() {
        self.baseURL = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String
            ?? "http://localhost:3000/api"
        self.decoder = JSONDecoder()
        self.decoder.keyDecodingStrategy = .convertFromSnakeCase
        self.session = URLSession(configuration: .default)
    }

    func setToken(_ token: String?) {
        self.authToken = token
    }

    private func request<T: Decodable>(
        path: String,
        method: String = "GET",
        body: Encodable? = nil,
        queryItems: [URLQueryItem]? = nil
    ) async throws -> T {
        var urlString = "\(baseURL)\(path)"
        if let items = queryItems, !items.isEmpty {
            var comps = URLComponents(string: urlString)!
            comps.queryItems = items
            urlString = comps.url!.absoluteString
        }

        guard let url = URL(string: urlString) else { throw APIError.invalidURL }

        var req = URLRequest(url: url, timeoutInterval: 30)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = authToken {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let body {
            let encoder = JSONEncoder()
            encoder.keyEncodingStrategy = .convertToSnakeCase
            req.httpBody = try encoder.encode(body)
        }

        let (data, response) = try await session.data(for: req)

        guard let http = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        if http.statusCode == 401 { throw APIError.unauthorized }

        if !(200...299).contains(http.statusCode) {
            let msg = (try? decoder.decode(APIErrorResponse.self, from: data))?.error ?? "Server error \(http.statusCode)"
            throw APIError.serverError(msg)
        }

        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }

    // MARK: - Auth
    func login(email: String, password: String) async throws -> AuthResponse {
        try await request(path: "/auth/login", method: "POST", body: LoginRequest(email: email, password: password))
    }

    func register(firstName: String, lastName: String, email: String, password: String, phone: String?) async throws -> AuthResponse {
        try await request(
            path: "/auth/register",
            method: "POST",
            body: RegisterRequest(email: email, password: password, firstName: firstName, lastName: lastName, phone: phone)
        )
    }

    func fetchMe() async throws -> User {
        struct Wrapper: Codable { let user: User }
        let wrapper: Wrapper = try await request(path: "/auth/me")
        return wrapper.user
    }

    func registerPushToken(_ token: String) async throws {
        struct Body: Codable { let token: String; let platform: String }
        struct Empty: Codable {}
        let _: Empty = try await request(path: "/auth/push-token", method: "POST", body: Body(token: token, platform: "ios"))
    }

    // MARK: - Cards
    func fetchCards() async throws -> [Card] {
        let response: CardListResponse = try await request(path: "/cards")
        return response.cards
    }

    func fetchCard(id: String) async throws -> CardDetailResponse {
        try await request(path: "/cards/\(id)")
    }

    func createCard(type: String, nickname: String?, spendingLimit: Double?, interval: String?) async throws -> Card {
        struct Wrapper: Codable { let card: Card }
        let body = CreateCardRequest(type: type, nickname: nickname, spendingLimit: spendingLimit, spendingLimitInterval: interval)
        let wrapper: Wrapper = try await request(path: "/cards", method: "POST", body: body)
        return wrapper.card
    }

    func updateCardStatus(id: String, status: String) async throws -> Card {
        struct Body: Codable { let status: String }
        struct Wrapper: Codable { let card: Card }
        let wrapper: Wrapper = try await request(path: "/cards/\(id)/status", method: "PATCH", body: Body(status: status))
        return wrapper.card
    }

    func cancelCard(id: String) async throws {
        struct Empty: Codable {}
        let _: Empty = try await request(path: "/cards/\(id)", method: "DELETE")
    }

    // MARK: - Transactions
    func fetchTransactions(cardId: String, page: Int = 1) async throws -> TransactionListResponse {
        try await request(
            path: "/cards/\(cardId)/transactions",
            queryItems: [URLQueryItem(name: "page", value: "\(page)"), URLQueryItem(name: "limit", value: "20")]
        )
    }

    // MARK: - Rewards
    func fetchRewardsBalance() async throws -> RewardsBalance {
        try await request(path: "/rewards/balance")
    }

    func fetchRewardsHistory(page: Int = 1) async throws -> TransactionListResponse {
        try await request(
            path: "/rewards/history",
            queryItems: [URLQueryItem(name: "page", value: "\(page)")]
        )
    }

    // MARK: - Statements
    func downloadStatement(startDate: Date, endDate: Date, cardId: String?, format: String) async throws -> Data {
        let df = ISO8601DateFormatter()
        var items = [
            URLQueryItem(name: "startDate", value: df.string(from: startDate)),
            URLQueryItem(name: "endDate", value: df.string(from: endDate)),
            URLQueryItem(name: "format", value: format),
        ]
        if let cid = cardId { items.append(URLQueryItem(name: "cardId", value: cid)) }

        var urlString = "\(baseURL)/statements/download"
        var comps = URLComponents(string: urlString)!
        comps.queryItems = items
        urlString = comps.url!.absoluteString

        guard let url = URL(string: urlString) else { throw APIError.invalidURL }
        var req = URLRequest(url: url, timeoutInterval: 60)
        if let token = authToken { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }

        let (data, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw APIError.serverError("Failed to download statement")
        }
        return data
    }

    // MARK: - Apple Wallet
    func provisionAppleWallet(cardId: String, certificates: [String], nonce: String, nonceSignature: String) async throws -> [String: Any] {
        struct Body: Codable { let certificates: [String]; let nonce: String; let nonceSignature: String }
        struct Wrapper: Codable { let passData: [String: String] }
        let _: Wrapper = try await request(path: "/cards/\(cardId)/wallet/provision", method: "POST", body: Body(certificates: certificates, nonce: nonce, nonceSignature: nonceSignature))
        return [:]
    }
}
