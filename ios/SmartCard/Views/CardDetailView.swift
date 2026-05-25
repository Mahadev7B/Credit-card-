import SwiftUI
import UIKit
import PassKit

@MainActor
final class CardDetailViewModel: ObservableObject {
    @Published var card: Card
    @Published var sensitiveData: CardSensitiveData?
    @Published var isLoading = false
    @Published var showSensitiveData = false
    @Published var error: String?
    @Published var isWalletLoading = false

    init(card: Card) {
        self.card = card
    }

    func loadDetail() async {
        isLoading = true
        do {
            let response = try await APIService.shared.fetchCard(id: card.id)
            card = response.card
            sensitiveData = response.sensitiveData
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func toggleStatus() async {
        let newStatus = card.status == .active ? "inactive" : "active"
        do {
            card = try await APIService.shared.updateCardStatus(id: card.id, status: newStatus)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func addToWallet(from vc: UIViewController, user: User) async {
        isWalletLoading = true
        do {
            try await WalletService.shared.addToWallet(card: card, user: user, from: vc)
            card.walletProvisioned = true
        } catch {
            self.error = error.localizedDescription
        }
        isWalletLoading = false
    }
}

struct CardDetailView: View {
    let card: Card
    @StateObject private var viewModel: CardDetailViewModel
    @EnvironmentObject private var authStore: AuthStore
    @Environment(\.dismiss) private var dismiss
    @State private var showCancelAlert = false

    init(card: Card) {
        self.card = card
        _viewModel = StateObject(wrappedValue: CardDetailViewModel(card: card))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                CardTileView(card: viewModel.card)
                    .padding(.horizontal)

                // Card number reveal
                if let sensitive = viewModel.sensitiveData {
                    CardSensitiveSection(sensitive: sensitive, show: viewModel.showSensitiveData) {
                        viewModel.showSensitiveData.toggle()
                    }
                }

                // Actions
                VStack(spacing: 12) {
                    if !viewModel.card.walletProvisioned && WalletService.shared.isWalletAvailable {
                        WalletButton(isLoading: viewModel.isWalletLoading) {
                            guard let user = authStore.currentUser,
                                  let vc = UIApplication.shared.connectedScenes
                                    .compactMap({ ($0 as? UIWindowScene)?.keyWindow?.rootViewController })
                                    .first else { return }
                            await viewModel.addToWallet(from: vc, user: user)
                        }
                    }

                    Button {
                        Task { await viewModel.toggleStatus() }
                    } label: {
                        Label(
                            viewModel.card.status == .active ? "Pause Card" : "Activate Card",
                            systemImage: viewModel.card.status == .active ? "pause.circle" : "checkmark.circle"
                        )
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(viewModel.card.status == .canceled || viewModel.card.status == .frozen)

                    Button(role: .destructive) {
                        showCancelAlert = true
                    } label: {
                        Label("Cancel Card", systemImage: "xmark.circle")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(.red.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(viewModel.card.status == .canceled)
                }
                .padding(.horizontal)

                // Card info
                GroupBox("Card Info") {
                    InfoRow(label: "Card Type", value: viewModel.card.type.rawValue.capitalized)
                    InfoRow(label: "Rewards Tier", value: viewModel.card.rewardsTier.rawValue.capitalized)
                    if let limit = viewModel.card.spendingLimit {
                        InfoRow(label: "Spending Limit", value: String(format: "$%.0f", limit))
                    }
                    InfoRow(label: "Status", value: viewModel.card.status.displayName)
                }
                .padding(.horizontal)
            }
            .padding(.vertical)
        }
        .navigationTitle(viewModel.card.nickname ?? "Card Details")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.loadDetail() }
        .alert("Cancel Card", isPresented: $showCancelAlert) {
            Button("Cancel Card", role: .destructive) {
                Task {
                    try? await APIService.shared.cancelCard(id: viewModel.card.id)
                    dismiss()
                }
            }
            Button("Keep Card", role: .cancel) {}
        } message: {
            Text("Canceling this card is permanent and cannot be undone.")
        }
        .alert("Error", isPresented: .constant(viewModel.error != nil)) {
            Button("OK") { viewModel.error = nil }
        } message: {
            Text(viewModel.error ?? "")
        }
    }
}

struct CardSensitiveSection: View {
    let sensitive: CardSensitiveData
    let show: Bool
    let toggle: () -> Void

    var body: some View {
        GroupBox {
            VStack(spacing: 12) {
                HStack {
                    Text("Card Number")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button(show ? "Hide" : "Show") { toggle() }
                        .font(.caption.bold())
                }
                Text(show ? formatCardNumber(sensitive.number) : "•••• •••• •••• ••••")
                    .font(.system(.body, design: .monospaced))
                    .animation(.easeInOut, value: show)
                HStack {
                    VStack(alignment: .leading) {
                        Text("CVV").font(.caption).foregroundStyle(.secondary)
                        Text(show ? sensitive.cvc : "•••")
                            .font(.system(.body, design: .monospaced))
                    }
                    Spacer()
                    VStack(alignment: .trailing) {
                        Text("EXPIRES").font(.caption).foregroundStyle(.secondary)
                        Text(String(format: "%02d/%02d", sensitive.expMonth, sensitive.expYear % 100))
                            .font(.system(.body, design: .monospaced))
                    }
                }
            }
        }
        .padding(.horizontal)
    }

    private func formatCardNumber(_ number: String) -> String {
        let digits = number.filter { $0.isNumber }
        return stride(from: 0, to: digits.count, by: 4)
            .map { String(digits[digits.index(digits.startIndex, offsetBy: $0)..<digits.index(digits.startIndex, offsetBy: min($0 + 4, digits.count))]) }
            .joined(separator: " ")
    }
}

struct WalletButton: View {
    let isLoading: Bool
    let action: () async -> Void

    var body: some View {
        Button {
            Task { await action() }
        } label: {
            if isLoading {
                ProgressView().tint(.white)
            } else {
                Label("Add to Apple Wallet", systemImage: "wallet.pass")
                    .fontWeight(.semibold)
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.black, in: RoundedRectangle(cornerRadius: 12))
        .foregroundStyle(.white)
        .disabled(isLoading)
    }
}

struct InfoRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label).foregroundStyle(.secondary)
            Spacer()
            Text(value).fontWeight(.medium)
        }
        .font(.subheadline)
        .padding(.vertical, 2)
    }
}
