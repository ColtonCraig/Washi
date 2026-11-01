import SwiftUI
import WebKit

struct SettingsView: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    @Environment(\.dismiss) private var dismiss
    @State private var confirmData = false
    var body: some View {
        @Bindable var store = store
        NavigationStack {
            Form {
                Section("Look") {
                    Picker("Appearance", selection: $store.s.prefs.mode) {
                        Text("Light").tag("light"); Text("Dark").tag("dark"); Text("Match iPhone").tag("auto")
                    }
                    .pickerStyle(.segmented)
                }
                Section {
                    ForEach(store.s.spaces) { sp in
                        NavigationLink { SpaceSettings(id: sp.id) } label: {
                            HStack(spacing: 10) {
                                Circle().fill(Color(hex: Paper.pal(sp.hue).tape)).frame(width: 14, height: 14)
                                Text(sp.name).font(.ui(16, .semibold))
                                Spacer()
                                if sp.isolated { Label("Own logins", systemImage: "lock.fill").labelStyle(.titleAndIcon).font(.ui(12)).foregroundStyle(th.ink2) }
                            }
                        }
                    }
                } header: { Text("Spaces") } footer: { Text("A space with its own logins is like a separate browser profile: handy for keeping work and personal accounts apart.") }
                Section("Search") {
                    Picker("Search engine", selection: $store.s.prefs.search) { ForEach(Web.engines, id: \.id) { Text($0.name).tag($0.id) } }
                }
                Section {
                    Picker("New scraps go", selection: $store.s.prefs.newTabPos) { Text("At the top").tag("top"); Text("At the bottom").tag("bottom") }
                    Toggle("Bookmarks bar on big screens", isOn: $store.s.prefs.bookmarkBar)
                } header: { Text("Tabs") } footer: { Text("Big screens are the iPhone Duo opened up, an iPad, or a phone turned on its side.") }
                Section {
                    Toggle("Block ads and trackers", isOn: $store.s.prefs.blocking).accessibilityIdentifier("blockingToggle")
                        .onChange(of: store.s.prefs.blocking) { _, _ in if let id = store.current { store.browser?.reloadForSettings(id) } }
                    if !store.s.prefs.blockOff.isEmpty {
                        ForEach(store.s.prefs.blockOff, id: \.self) { h in
                            HStack { Text(h); Spacer(); Text("off").foregroundStyle(.secondary) }
                                .swipeActions { Button("Turn On") { store.s.prefs.blockOff.removeAll { $0 == h }; store.save() }.tint(th.tape) }
                        }
                    }
                    Button("Clear cookies and website data…", role: .destructive) { confirmData = true }
                    Button("Clear history", role: .destructive) { store.clearHistory(); store.show("History cleared") }.disabled(store.history.isEmpty)
                } header: { Text("Privacy") } footer: { Text(blockFooter) }
                Section("About") {
                    LabeledContent("Washi", value: (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "")
                    LabeledContent("Bookmarks", value: "\(store.s.bookmarks.flat().count)")
                }
            }
            .onChange(of: store.s.prefs) { _, _ in store.save() }
            .navigationTitle("Settings").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.fontWeight(.bold) } }
            .confirmationDialog("Sign out of every site and clear stored website data?", isPresented: $confirmData, titleVisibility: .visible) {
                Button("Clear Website Data", role: .destructive) { Task { await clearData() } }
            }
        }
    }
    private var blockFooter: String {
        if store.browser?.rules != nil { return "Uses EasyList and EasyPrivacy. Turn it off for one site from the ⋯ menu if something looks broken." }
        if let e = store.browser?.rulesError { return "Blocking couldn't start (\(e))." }
        return "Getting the blocklist ready…"
    }
    private func clearData() async {
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        await WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: .distantPast)
        for sp in store.s.spaces where sp.isolated { await WKWebsiteDataStore(forIdentifier: Browser.uuid(sp.id)).removeData(ofTypes: types, modifiedSince: .distantPast) }
        store.show("Website data cleared")
    }
}

struct SpaceSettings: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    @Environment(\.dismiss) private var dismiss
    var id: String
    @State private var name = ""
    var body: some View {
        if let sp = store.s.spaces.first(where: { $0.id == id }) {
            Form {
                Section("Name") {
                    TextField("Name", text: $name).onAppear { name = sp.name }.onSubmit { if !name.isEmpty { store.renameSpace(id, name) } }
                }
                Section("Color") {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 4), spacing: 12) {
                        ForEach(Paper.order, id: \.self) { h in
                            let p = Paper.pal(h)
                            Button { store.setSpaceColor(id, h) } label: {
                                VStack(spacing: 4) {
                                    RoundedRectangle(cornerRadius: 8).fill(Color(hex: p.desk)).frame(height: 36)
                                        .overlay(alignment: .top) { Capsule().fill(Color(hex: p.tape)).frame(width: 28, height: 6).offset(y: 6) }
                                        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(sp.hue == h ? Color(hex: p.tape) : .clear, lineWidth: 2))
                                    Text(p.name).font(.ui(11)).foregroundStyle(th.ink2)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                }
                Section {
                    Toggle("Keep this space's logins separate", isOn: Binding(get: { sp.isolated }, set: { store.setIsolated(id, $0) }))
                } footer: { Text("Its own cookies and sign-ins, like a separate browser profile. Pages in this space reload when you change it.") }
                Section {
                    Button("Delete Space", role: .destructive) { store.deleteSpace(id); dismiss() }.disabled(store.s.spaces.count < 2)
                }
            }
            .navigationTitle(sp.name)
            .onDisappear { if !name.isEmpty && name != sp.name { store.renameSpace(id, name) } }
        }
    }
}
