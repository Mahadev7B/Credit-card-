import SwiftUI

@MainActor
final class RewardsViewModel: ObservableObject {
    @Published var balance: RewardsBalance?
    @Published var history: [Transaction] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() async {
        isLoading = true
        async let balanceFetch = APIService.shared.fetchRewardsBalance()
        async let historyFetch = APIService.shared.fetchRewardsHistory()
        do {
            let (bal, hist) = try await (balanceFetch, historyFetch)
            balance = bal
            history = hist.transactions
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

struct RewardsView: View {
    @StateObject private var viewModel = RewardsViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    // Balance card
                    RewardsBalanceCard(balance: viewModel.balance)

                    // Category rates
                    RewardsCategoryGrid()

                    // Earnings history
                    if !viewModel.history.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Recent Cashback")
                                .font(.headline)
                                .padding(.horizontal)

                            ForEach(viewModel.history) { tx in
                                HStack {
                                    Image(systemName: tx.categoryIcon)
                                        .frame(width: 32)
                                        .foregroundStyle(.blue)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(tx.displayMerchant).font(.subheadline)
                                        Text(tx.rewardCategory?.capitalized ?? "General").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text("+$\(String(format: "%.2f", tx.cashbackAmount))")
                                        .font(.subheadline.bold())
                                        .foregroundStyle(.green)
                                }
                                .padding(.horizontal)
                                Divider().padding(.leading, 60)
                            }
                        }
                    }
                }
                .padding(.vertical)
            }
            .navigationTitle("Rewards")
            .refreshable { await viewModel.load() }
            .task { await viewModel.load() }
            .overlay {
                if viewModel.isLoading && viewModel.balance == nil {
                    ProgressView()
                }
            }
        }
    }
}

struct RewardsBalanceCard: View {
    let balance: RewardsBalance?

    var body: some View {
        VStack(spacing: 8) {
            Text("Available Cashback")
                .font(.subheadline)
                .foregroundStyle(.white.opacity(0.8))
            Text(balance.map { String(format: "$%.2f", $0.balance) } ?? "—")
                .font(.system(size: 48, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
            if let earned = balance?.totalEarned {
                Text("$\(String(format: "%.2f", earned)) earned all time")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
        .background(
            LinearGradient(colors: [.green, Color(red: 0.0, green: 0.5, blue: 0.3)], startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 20)
        )
        .padding(.horizontal)
        .shadow(color: .green.opacity(0.3), radius: 12, y: 6)
    }
}

struct RewardsCategoryGrid: View {
    private let categories: [(icon: String, name: String, rate: String)] = [
        ("airplane", "Travel", "5%"),
        ("fork.knife", "Dining", "4%"),
        ("cart.fill", "Groceries", "3%"),
        ("fuelpump.fill", "Gas", "3%"),
        ("laptopcomputer", "Online", "2%"),
        ("cross.fill", "Healthcare", "2%"),
        ("play.circle.fill", "Streaming", "2%"),
        ("creditcard.fill", "Everything Else", "1%"),
    ]

    let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Cashback Rates")
                .font(.headline)
                .padding(.horizontal)

            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(categories, id: \.name) { cat in
                    VStack(spacing: 6) {
                        Image(systemName: cat.icon)
                            .font(.title3)
                            .foregroundStyle(.blue)
                        Text(cat.rate)
                            .font(.headline.bold())
                            .foregroundStyle(.green)
                        Text(cat.name)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.vertical, 12)
                    .frame(maxWidth: .infinity)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
                }
            }
            .padding(.horizontal)
        }
    }
}
