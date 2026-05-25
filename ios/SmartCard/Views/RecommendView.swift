import SwiftUI

// MARK: - Models

struct CardRecommendation: Identifiable {
    var id: String { cardId }
    let cardId: String
    let cardName: String
    let issuer: String
    let cashbackRate: Double
    let cashbackPercent: String
    let isOwnCard: Bool
    let annualFee: Int
    let notes: String?
}

struct RecommendResponse: Codable {
    let category: String
    let recommendation: RecommendOption?
    let allOptions: [RecommendOption]

    struct RecommendOption: Codable {
        let cardId: String
        let cardName: String
        let issuer: String
        let cashbackRate: Double
        let cashbackPercent: String
        let isOwnCard: Bool
        let annualFee: Int
        let notes: String?
    }
}

struct CardDBEntry: Codable, Identifiable {
    var id: String { cardId }
    let cardId: String
    let name: String
    let issuer: String
    let annualFee: Int
    let isOwnCard: Bool
}

struct CardDBResponse: Codable {
    let cards: [CardDBEntry]
}

// MARK: - ViewModel

@MainActor
final class RecommendViewModel: ObservableObject {
    @Published var selectedCategory: SpendCategory = .dining
    @Published var allCards: [CardDBEntry] = []
    @Published var selectedCardIds: Set<String> = []
    @Published var recommendation: RecommendResponse?
    @Published var isLoading = false
    @Published var error: String?

    enum SpendCategory: String, CaseIterable, Identifiable {
        var id: String { rawValue }
        case dining, groceries, travel, gas, online, subscriptions, healthcare, general

        var displayName: String {
            switch self {
            case .dining: return "Dining"
            case .groceries: return "Groceries"
            case .travel: return "Travel"
            case .gas: return "Gas"
            case .online: return "Online Shopping"
            case .subscriptions: return "Streaming"
            case .healthcare: return "Healthcare"
            case .general: return "Everything Else"
            }
        }

        var icon: String {
            switch self {
            case .dining: return "fork.knife"
            case .groceries: return "cart.fill"
            case .travel: return "airplane"
            case .gas: return "fuelpump.fill"
            case .online: return "laptopcomputer"
            case .subscriptions: return "play.circle.fill"
            case .healthcare: return "cross.fill"
            case .general: return "creditcard.fill"
            }
        }
    }

    func loadCards() async {
        guard allCards.isEmpty else { return }
        do {
            let response: CardDBResponse = try await APIService.shared.get("/recommend/cards")
            allCards = response.cards
            // Pre-select our own card
            if let own = response.cards.first(where: { $0.isOwnCard }) {
                selectedCardIds.insert(own.cardId)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func fetchRecommendation() async {
        isLoading = true
        error = nil
        do {
            let body: [String: Any] = [
                "category": selectedCategory.rawValue,
                "userCardIds": Array(selectedCardIds),
            ]
            recommendation = try await APIService.shared.post("/recommend", body: body)
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}

// MARK: - View

struct RecommendView: View {
    @StateObject private var vm = RecommendViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    categoryPicker
                    myCardsSection
                    if let rec = vm.recommendation {
                        resultsSection(rec)
                    }
                }
                .padding(.vertical)
            }
            .navigationTitle("Which Card?")
            .task { await vm.loadCards() }
            .onChange(of: vm.selectedCategory) { _, _ in Task { await vm.fetchRecommendation() } }
            .onChange(of: vm.selectedCardIds) { _, _ in Task { await vm.fetchRecommendation() } }
            .overlay {
                if vm.isLoading { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity) }
            }
        }
    }

    // MARK: Category Picker
    private var categoryPicker: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("I'm spending on…")
                .font(.headline)
                .padding(.horizontal)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(RecommendViewModel.SpendCategory.allCases) { cat in
                        Button {
                            vm.selectedCategory = cat
                        } label: {
                            VStack(spacing: 6) {
                                Image(systemName: cat.icon)
                                    .font(.title3)
                                Text(cat.displayName)
                                    .font(.caption)
                                    .multilineTextAlignment(.center)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .background(vm.selectedCategory == cat ? Color.blue : Color(.systemGray6),
                                        in: RoundedRectangle(cornerRadius: 12))
                            .foregroundStyle(vm.selectedCategory == cat ? .white : .primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
            }
        }
    }

    // MARK: My Cards Section
    private var myCardsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("My Cards")
                    .font(.headline)
                Spacer()
                Text("Select cards you own")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal)

            ForEach(vm.allCards) { card in
                Button {
                    if vm.selectedCardIds.contains(card.cardId) {
                        if !card.isOwnCard { vm.selectedCardIds.remove(card.cardId) }
                    } else {
                        vm.selectedCardIds.insert(card.cardId)
                    }
                    Task { await vm.fetchRecommendation() }
                } label: {
                    HStack {
                        Image(systemName: vm.selectedCardIds.contains(card.cardId)
                              ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(vm.selectedCardIds.contains(card.cardId) ? .blue : .secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(card.name)
                                    .font(.subheadline.weight(.medium))
                                    .foregroundStyle(.primary)
                                if card.isOwnCard {
                                    Text("YOUR CARD")
                                        .font(.caption2.bold())
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(.blue.opacity(0.12), in: Capsule())
                                        .foregroundStyle(.blue)
                                }
                            }
                            Text(card.annualFee == 0 ? "No annual fee" : "$\(card.annualFee)/yr fee")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        if card.isOwnCard {
                            Image(systemName: "lock.fill")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .padding(.horizontal)
                    .padding(.vertical, 10)
                    .background(vm.selectedCardIds.contains(card.cardId)
                                ? Color.blue.opacity(0.06) : Color.clear)
                }
                .buttonStyle(.plain)
                .disabled(card.isOwnCard)

                Divider().padding(.leading)
            }
        }
    }

    // MARK: Results
    @ViewBuilder
    private func resultsSection(_ rec: RecommendResponse) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Best card for \(rec.category.capitalized)")
                .font(.headline)
                .padding(.horizontal)

            ForEach(Array(rec.allOptions.enumerated()), id: \.element.cardId) { index, option in
                RecommendCardRow(option: option, rank: index + 1)
            }

            // Disclaimer
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "info.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Rates marked **est.** are based on each bank's advertised rewards and may vary. Only your Universal SmartCard rewards are confirmed — check your bank's app for actual points earned on third-party cards.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding()
            .background(Color(.systemGray6), in: RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal)
        }
    }
}

// MARK: - Recommendation Row

struct RecommendCardRow: View {
    let option: RecommendResponse.RecommendOption
    let rank: Int

    private var isConfirmed: Bool { option.isOwnCard }

    var body: some View {
        HStack(spacing: 14) {
            // Rank badge
            ZStack {
                Circle()
                    .fill(rank == 1 ? Color.blue : Color(.systemGray5))
                    .frame(width: 32, height: 32)
                Text("\(rank)")
                    .font(.caption.bold())
                    .foregroundStyle(rank == 1 ? .white : .secondary)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(option.cardName)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if option.isOwnCard {
                        Text("YOUR CARD")
                            .font(.caption2.bold())
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(.blue.opacity(0.12), in: Capsule())
                            .foregroundStyle(.blue)
                    }
                }
                if let notes = option.notes {
                    Text(notes)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer()

            // Rate badge — confirmed vs estimated
            VStack(alignment: .trailing, spacing: 2) {
                Text(option.cashbackPercent)
                    .font(.title3.bold())
                    .foregroundStyle(rank == 1 ? .green : .primary)
                Text(isConfirmed ? "confirmed" : "est.")
                    .font(.caption2.bold())
                    .foregroundStyle(isConfirmed ? .green : .orange)
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(rank == 1 ? Color.blue.opacity(0.06) : Color(.systemGray6))
                .overlay(
                    rank == 1 ? RoundedRectangle(cornerRadius: 14).stroke(Color.blue.opacity(0.2)) : nil
                )
        )
        .padding(.horizontal)
    }
}

#Preview {
    RecommendView()
}
