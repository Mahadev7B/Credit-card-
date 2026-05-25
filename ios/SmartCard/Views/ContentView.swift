import SwiftUI

struct MainTabView: View {
    @EnvironmentObject private var authStore: AuthStore
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView()
                .tabItem { Label("Cards", systemImage: "creditcard.fill") }
                .tag(0)

            TransactionsView()
                .tabItem { Label("Activity", systemImage: "list.bullet.rectangle") }
                .tag(1)

            RewardsView()
                .tabItem { Label("Rewards", systemImage: "star.fill") }
                .tag(2)

            StatementsView()
                .tabItem { Label("Statements", systemImage: "doc.text.fill") }
                .tag(3)

            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.circle.fill") }
                .tag(4)
        }
        .tint(.blue)
    }
}

struct ProfileView: View {
    @EnvironmentObject private var authStore: AuthStore

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 16) {
                        Circle()
                            .fill(.blue.gradient)
                            .frame(width: 60, height: 60)
                            .overlay {
                                Text(authStore.currentUser?.firstName.prefix(1).uppercased() ?? "U")
                                    .font(.title2.bold())
                                    .foregroundStyle(.white)
                            }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(authStore.currentUser?.fullName ?? "")
                                .font(.headline)
                            Text(authStore.currentUser?.email ?? "")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 8)
                }

                Section("Account") {
                    LabeledContent("KYC Status") {
                        Text(authStore.currentUser?.kycStatus.capitalized ?? "—")
                            .foregroundStyle(authStore.currentUser?.isKYCApproved == true ? .green : .orange)
                    }
                    LabeledContent("Total Cashback Earned") {
                        Text(String(format: "$%.2f", authStore.currentUser?.rewardsBalance ?? 0))
                            .foregroundStyle(.green)
                    }
                }

                Section {
                    Button(role: .destructive) {
                        authStore.logout()
                    } label: {
                        Label("Sign Out", systemImage: "arrow.right.square")
                    }
                }
            }
            .navigationTitle("Profile")
        }
    }
}
