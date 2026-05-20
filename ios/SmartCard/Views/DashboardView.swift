import SwiftUI

@MainActor
final class CardListViewModel: ObservableObject {
    @Published var cards: [Card] = []
    @Published var isLoading = false
    @Published var error: String?

    func load() async {
        isLoading = true
        error = nil
        do {
            cards = try await APIService.shared.fetchCards()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }

    func toggleCardStatus(_ card: Card) async {
        let newStatus = card.status == .active ? "inactive" : "active"
        do {
            let updated = try await APIService.shared.updateCardStatus(id: card.id, status: newStatus)
            if let idx = cards.firstIndex(where: { $0.id == card.id }) {
                cards[idx] = updated
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct DashboardView: View {
    @StateObject private var viewModel = CardListViewModel()
    @State private var showAddCard = false
    @State private var selectedCard: Card?

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading && viewModel.cards.isEmpty {
                    ProgressView("Loading cards…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if viewModel.cards.isEmpty {
                    ContentUnavailableView {
                        Label("No Cards", systemImage: "creditcard")
                    } description: {
                        Text("Add your first card to get started")
                    } actions: {
                        Button("Add Card") { showAddCard = true }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            ForEach(viewModel.cards) { card in
                                CardTileView(card: card)
                                    .onTapGesture { selectedCard = card }
                            }
                        }
                        .padding()
                    }
                }
            }
            .navigationTitle("My Cards")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showAddCard = true } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .refreshable { await viewModel.load() }
            .task { await viewModel.load() }
            .sheet(isPresented: $showAddCard, onDismiss: { Task { await viewModel.load() } }) {
                AddCardView()
            }
            .navigationDestination(item: $selectedCard) { card in
                CardDetailView(card: card)
            }
            .alert("Error", isPresented: .constant(viewModel.error != nil)) {
                Button("OK") { viewModel.error = nil }
            } message: {
                Text(viewModel.error ?? "")
            }
        }
    }
}

struct CardTileView: View {
    let card: Card

    private var gradientColors: [Color] {
        switch card.rewardsTier {
        case .platinum: return [Color(red: 0.4, green: 0.4, blue: 0.5), Color(red: 0.2, green: 0.2, blue: 0.3)]
        case .gold: return [Color(red: 0.83, green: 0.68, blue: 0.21), Color(red: 0.6, green: 0.45, blue: 0.1)]
        case .standard: return [Color.blue, Color(red: 0.1, green: 0.3, blue: 0.8)]
        }
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 20)
                .fill(LinearGradient(colors: gradientColors, startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(height: 200)
                .shadow(color: .black.opacity(0.2), radius: 12, y: 6)

            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(card.nickname ?? "Smart Card")
                        .font(.headline)
                        .foregroundStyle(.white.opacity(0.9))
                    Spacer()
                    StatusBadge(status: card.status)
                }

                Spacer()

                Text(card.maskedNumber)
                    .font(.system(.title3, design: .monospaced))
                    .foregroundStyle(.white)

                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("EXPIRES").font(.caption2).foregroundStyle(.white.opacity(0.7))
                        Text(card.displayExpiry).font(.caption.bold()).foregroundStyle(.white)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(card.rewardsTier.rawValue.uppercased())
                            .font(.caption2.bold())
                            .foregroundStyle(.white.opacity(0.8))
                        Text(card.brand).font(.caption).foregroundStyle(.white)
                    }
                }
                .padding(.top, 8)
            }
            .padding(24)
        }
    }
}

struct StatusBadge: View {
    let status: Card.CardStatus

    var body: some View {
        Text(status.displayName)
            .font(.caption2.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.white.opacity(0.2), in: Capsule())
            .foregroundStyle(.white)
    }
}
