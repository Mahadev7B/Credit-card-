import SwiftUI

struct AddCardView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var cardType = "virtual"
    @State private var nickname = ""
    @State private var enableSpendingLimit = false
    @State private var spendingLimit = ""
    @State private var spendingInterval = "monthly"
    @State private var isLoading = false
    @State private var error: String?

    private let intervals = ["daily", "weekly", "monthly", "yearly"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Card Type") {
                    Picker("Type", selection: $cardType) {
                        Text("Virtual").tag("virtual")
                        Text("Physical").tag("physical")
                    }
                    .pickerStyle(.segmented)
                    .listRowSeparator(.hidden)

                    if cardType == "physical" {
                        Text("Physical cards are shipped to your address on file (5–7 business days).")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Nickname (optional)") {
                    TextField("e.g. Travel Card", text: $nickname)
                }

                Section {
                    Toggle("Set Spending Limit", isOn: $enableSpendingLimit)
                    if enableSpendingLimit {
                        HStack {
                            Text("$")
                            TextField("Amount", text: $spendingLimit)
                                .keyboardType(.decimalPad)
                        }
                        Picker("Interval", selection: $spendingInterval) {
                            ForEach(intervals, id: \.self) { Text($0.capitalized) }
                        }
                    }
                } header: {
                    Text("Spending Controls")
                }

                if let error {
                    Section {
                        Text(error).foregroundStyle(.red).font(.caption)
                    }
                }

                Section {
                    Button {
                        createCard()
                    } label: {
                        if isLoading {
                            ProgressView()
                        } else {
                            Text("Create Card").frame(maxWidth: .infinity).fontWeight(.semibold)
                        }
                    }
                    .disabled(isLoading)
                }
            }
            .navigationTitle("New Card")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func createCard() {
        isLoading = true
        error = nil
        Task {
            do {
                let limit = enableSpendingLimit ? Double(spendingLimit) : nil
                _ = try await APIService.shared.createCard(
                    type: cardType,
                    nickname: nickname.isEmpty ? nil : nickname,
                    spendingLimit: limit,
                    interval: enableSpendingLimit ? spendingInterval : nil
                )
                dismiss()
            } catch let err {
                self.error = err.localizedDescription
            }
            isLoading = false
        }
    }
}
