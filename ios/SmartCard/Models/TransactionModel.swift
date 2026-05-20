import Foundation
import SwiftUI

struct Transaction: Codable, Identifiable {
    let id: String
    let amount: Int
    let currency: String
    let merchantName: String?
    let merchantCategory: String?
    let mccCode: String?
    let status: TransactionStatus
    let cashbackAmount: Double
    let cashbackRate: Double
    let rewardCategory: String?
    let createdAt: String

    enum TransactionStatus: String, Codable {
        case pending, authorized, captured, reversed, declined

        var displayName: String {
            switch self {
            case .pending: return "Pending"
            case .authorized: return "Authorized"
            case .captured: return "Completed"
            case .reversed: return "Refunded"
            case .declined: return "Declined"
            }
        }

        var color: Color {
            switch self {
            case .pending, .authorized: return .orange
            case .captured: return .primary
            case .reversed: return .blue
            case .declined: return .red
            }
        }

        var isComplete: Bool { self == .captured }
    }

    var amountFormatted: String {
        let dollars = Double(amount) / 100.0
        return String(format: "$%.2f", dollars)
    }

    var displayMerchant: String { merchantName ?? "Unknown merchant" }

    var categoryIcon: String {
        switch rewardCategory {
        case "dining": return "fork.knife"
        case "groceries": return "cart.fill"
        case "gas": return "fuelpump.fill"
        case "travel": return "airplane"
        case "online": return "laptopcomputer"
        case "subscriptions": return "play.circle.fill"
        case "healthcare": return "cross.fill"
        default: return "creditcard.fill"
        }
    }

    var formattedDate: String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: createdAt) else { return createdAt }
        let display = DateFormatter()
        display.dateStyle = .medium
        display.timeStyle = .short
        return display.string(from: date)
    }

    enum CodingKeys: String, CodingKey {
        case id = "_id", amount, currency, merchantName, merchantCategory,
             mccCode, status, cashbackAmount, cashbackRate, rewardCategory, createdAt
    }
}

struct TransactionListResponse: Codable {
    let transactions: [Transaction]
    let total: Int
    let page: Int
    let pages: Int
}

struct RewardsBalance: Codable {
    let balance: Double
    let totalEarned: Double
}
