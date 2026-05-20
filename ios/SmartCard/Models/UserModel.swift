import Foundation

struct User: Codable, Identifiable {
    let id: String
    let email: String
    let firstName: String
    let lastName: String
    let rewardsBalance: Double
    let kycStatus: String

    var fullName: String { "\(firstName) \(lastName)" }
    var isKYCApproved: Bool { kycStatus == "approved" }

    enum CodingKeys: String, CodingKey {
        case id, email, firstName, lastName, rewardsBalance, kycStatus
    }
}

struct AuthResponse: Codable {
    let token: String
    let user: User
}

struct LoginRequest: Codable {
    let email: String
    let password: String
}

struct RegisterRequest: Codable {
    let email: String
    let password: String
    let firstName: String
    let lastName: String
    let phone: String?
}
