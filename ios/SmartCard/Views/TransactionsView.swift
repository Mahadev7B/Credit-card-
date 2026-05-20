import SwiftUI

@MainActor
final class TransactionsViewModel: ObservableObject {
    @Published var transactions: [Transaction] = []
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var error: String?
    @Published var selectedCard: Card?
    @Published var cards: [Card] = []

    private var currentPage = 1
    private var totalPages = 1

    func loadCards() async {
        do {
            cards = try await APIService.shared.fetchCards()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func load(refresh: Bool = false) async {
        guard let card = selectedCard ?? cards.first else { return }
        if refresh {
            currentPage = 1
            transactions = []
        }
        isLoading = refresh || transactions.isEmpty
        do {
            let response = try await APIService.shared.fetchTransactions(cardId: card.id, page: currentPage)
            if refresh {
                transactions = response.transactions
            } else {
                transactions.append(contentsOf: response.transactions)
            }
            totalPages = response.pages
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func loadMoreIfNeeded(currentItem: Transaction) async {
        guard currentPage < totalPages,
              !isLoadingMore,
              let lastId = transactions.last?.id,
              lastId == currentItem.id else { return }
        isLoadingMore = true
        currentPage += 1
        await load()
        isLoadingMore = false
    }
}

struct TransactionsView: View {
    @StateObject private var viewModel = TransactionsViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("Loading transactions…").frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if viewModel.transactions.isEmpty {
                    ContentUnavailableView("No Transactions", systemImage: "tray", description: Text("Your transactions will appear here"))
                } else {
                    List(viewModel.transactions) { tx in
                        TransactionRowView(transaction: tx)
                            .task { await viewModel.loadMoreIfNeeded(currentItem: tx) }
                    }
                    .listStyle(.grouped)
                }
            }
            .navigationTitle("Activity")
            .toolbar {
                if viewModel.cards.count > 1 {
                    ToolbarItem(placement: .secondaryAction) {
                        Menu("Filter") {
                            Button("All Cards") { viewModel.selectedCard = nil; Task { await viewModel.load(refresh: true) } }
                            ForEach(viewModel.cards) { card in
                                Button("•••• \(card.last4)") {
                                    viewModel.selectedCard = card
                                    Task { await viewModel.load(refresh: true) }
                                }
                            }
                        }
                    }
                }
            }
            .refreshable { await viewModel.load(refresh: true) }
            .task {
                await viewModel.loadCards()
                await viewModel.load()
            }
        }
    }
}

struct TransactionRowView: View {
    let transaction: Transaction

    var body: some View {
        HStack(spacing: 14) {
            // Category icon
            Circle()
                .fill(.blue.opacity(0.1))
                .frame(width: 44, height: 44)
                .overlay {
                    Image(systemName: transaction.categoryIcon)
                        .foregroundStyle(.blue)
                }

            VStack(alignment: .leading, spacing: 3) {
                Text(transaction.displayMerchant)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(transaction.status.displayName)
                        .font(.caption)
                        .foregroundStyle(transaction.status.color)
                    if let cat = transaction.rewardCategory {
                        Text("•").font(.caption).foregroundStyle(.tertiary)
                        Text(cat.capitalized).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 3) {
                Text(transaction.amountFormatted)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(transaction.status == .declined ? .red : .primary)
                if transaction.cashbackAmount > 0 {
                    Text("+$\(String(format: "%.2f", transaction.cashbackAmount))")
                        .font(.caption.bold())
                        .foregroundStyle(.green)
                }
            }
        }
        .padding(.vertical, 4)
    }
}
