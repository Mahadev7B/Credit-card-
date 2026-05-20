import SwiftUI

struct StatementsView: View {
    @State private var startDate = Calendar.current.date(byAdding: .month, value: -1, to: Date()) ?? Date()
    @State private var endDate = Date()
    @State private var selectedFormat = "pdf"
    @State private var selectedCardId: String?
    @State private var cards: [Card] = []
    @State private var isDownloading = false
    @State private var error: String?
    @State private var shareItem: ShareableFile?
    @State private var showShare = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Date Range") {
                    DatePicker("From", selection: $startDate, displayedComponents: .date)
                    DatePicker("To", selection: $endDate, in: startDate..., displayedComponents: .date)
                }

                Section("Card") {
                    Picker("Card", selection: $selectedCardId) {
                        Text("All Cards").tag(String?.none)
                        ForEach(cards) { card in
                            Text("•••• \(card.last4)\(card.nickname.map { " – \($0)" } ?? "")").tag(Optional(card.id))
                        }
                    }
                }

                Section("Format") {
                    Picker("Format", selection: $selectedFormat) {
                        Text("PDF").tag("pdf")
                        Text("CSV").tag("csv")
                    }
                    .pickerStyle(.segmented)
                    .listRowSeparator(.hidden)
                }

                if let error {
                    Section {
                        Text(error).foregroundStyle(.red).font(.caption)
                    }
                }

                Section {
                    Button {
                        downloadStatement()
                    } label: {
                        HStack {
                            Spacer()
                            if isDownloading {
                                ProgressView()
                            } else {
                                Label("Download Statement", systemImage: "arrow.down.doc")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(isDownloading)
                }
            }
            .navigationTitle("Statements")
            .task {
                do {
                    cards = try await APIService.shared.fetchCards()
                } catch {}
            }
            .sheet(isPresented: $showShare) {
                if let item = shareItem {
                    ShareSheet(items: [item.url])
                }
            }
        }
    }

    private func downloadStatement() {
        isDownloading = true
        error = nil
        Task {
            do {
                let data = try await APIService.shared.downloadStatement(
                    startDate: startDate,
                    endDate: endDate,
                    cardId: selectedCardId,
                    format: selectedFormat
                )
                let ext = selectedFormat == "pdf" ? "pdf" : "csv"
                let filename = "statement-\(isoDate(startDate)).\(ext)"
                let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
                try data.write(to: url)
                shareItem = ShareableFile(url: url)
                showShare = true
            } catch {
                self.error = error.localizedDescription
            }
            isDownloading = false
        }
    }

    private func isoDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}

struct ShareableFile: Identifiable {
    let id = UUID()
    let url: URL
}

struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
