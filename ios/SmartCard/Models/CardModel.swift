import Foundation
import SwiftUI

struct Card: Codable, Identifiable {
    let id: String
    let last4: String
    let expMonth: Int
    let expYear: Int
    let brand: String
    let type: CardType
    var status: CardStatus
    let nickname: String?
    let spendingLimit: Double?
    let rewardsTier: RewardsTier
    var walletProvisioned: Bool
    let createdAt: String

    enum CardType: String, Codable {
        case virtual, physical
    }

    enum CardStatus: String, Codable {
        case active, inactive, canceled, frozen

        var displayName: String {
            switch self {
            case .active: return "Active"
            case .inactive: return "Paused"
            case .canceled: return "Canceled"
            case .frozen: return "Frozen"
            }
        }

        var color: Color {
            switch self {
            case .active: return .green
            case .inactive: return .orange
            case .canceled: return .red
            case .frozen: return .blue
            }
        }
    }

    enum RewardsTier: String, Codable {
        case standard, gold, platinum

        var multiplier: Double {
            switch self {
            case .standard: return 1.0
            case .gold: return 1.25
            case .platinum: return 1.5
            }
        }

        var color: Color {
            switch self {
            case .standard: return .gray
            case .gold: return Color(red: 0.83, green: 0.68, blue: 0.21)
            case .platinum: return Color(red: 0.73, green: 0.73, blue: 0.73)
            }
        }
    }

    var displayExpiry: String {
        String(format: "%02d/%02d", expMonth, expYear % 100)
    }

    var maskedNumber: String { "•••• •••• •••• \(last4)" }

    enum CodingKeys: String, CodingKey {
        case id = "_id", last4, expMonth, expYear, brand, type, status,
             nickname, spendingLimit, rewardsTier, walletProvisioned, createdAt
    }
}

struct CardSensitiveData: Codable {
    let number: String
    let cvc: String
    let expMonth: Int
    let expYear: Int
}

struct CardListResponse: Codable {
    let cards: [Card]
}

struct CardDetailResponse: Codable {
    let card: Card
    let sensitiveData: CardSensitiveData?
}

struct CreateCardRequest: Codable {
    let type: String
    let nickname: String?
    let spendingLimit: Double?
    let spendingLimitInterval: String?
}
