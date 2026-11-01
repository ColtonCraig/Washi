import SwiftUI

@main
struct WashiApp: App {
    @State private var store: Store
    private let browser: Browser
    @Environment(\.scenePhase) private var phase

    init() {
        Paper.registerFonts()
        let args = ProcessInfo.processInfo.arguments
        let st = Store(fresh: args.contains("-fresh"))
        if args.contains("-wideBar") { st.s.prefs.bookmarkBar = true }
        _store = State(initialValue: st)
        browser = Browser(store: st)
    }
    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .onChange(of: phase) { _, p in if p != .active { store.saveNow() } }
                .onOpenURL { u in if Web.isWeb(u.absoluteString) { store.openTab(u.absoluteString) } }
        }
    }
}

/* Phone (and the Duo folded): the page fills the screen, a bar along the bottom, the sidebar slides in.
   Big screens (the Duo open, iPads, phones on their side): the sidebar sits beside the page, a top bar, bookmarks
   bar and split view, like the Mac. Folding or turning the phone switches between them instantly. */
struct RootView: View {
    @Environment(Store.self) private var store
    @Environment(\.colorScheme) private var scheme
    static let wideAt: CGFloat = 600

    private var dark: Bool { store.s.prefs.mode == "dark" || (store.s.prefs.mode == "auto" && scheme == .dark) }
    var body: some View {
        @Bindable var store = store
        let th = store.theme(dark: dark)
        GeometryReader { g in
            let wide = g.size.width >= RootView.wideAt
            ZStack {
                th.desk.ignoresSafeArea()
                if wide { WideLayout(size: g.size) } else { PhoneLayout(size: g.size) }
                if let mode = store.command {
                    CommandBar(mode: mode, wide: wide, initial: mode == .this ? (store.currentTab?.url ?? "") : "")
                        .transition(.opacity.combined(with: .offset(y: wide ? -12 : -24)))
                        .zIndex(5)
                }
                if let t = store.toast { ToastView(text: t.text, undo: t.undo).zIndex(6) }
            }
            .animation(.spring(response: 0.32, dampingFraction: 0.86), value: store.command)
            .onAppear { store.browser?.wide = wide }
            .onChange(of: wide) { _, w in store.browser?.wide = w; store.sidebarOpen = false }
        }
        .environment(\.theme, th)
        .tint(th.tape)
        .preferredColorScheme(store.s.prefs.mode == "auto" ? nil : (store.s.prefs.mode == "dark" ? .dark : .light))
        .sheet(item: $store.sheet) { sh in
            Group {
                switch sh {
                case .settings: SettingsView()
                case .bookmarks: BookmarksSheet()
                case .history: HistorySheet()
                case .editBookmark(let id, let fresh): NavigationStack { BookmarkEditor(id: id, fresh: fresh) }
                }
            }
            .environment(store).environment(\.theme, th).tint(th.tape)
        }
        .alert(store.prompt?.title ?? "", isPresented: Binding(get: { store.prompt != nil }, set: { if !$0 { store.prompt = nil } })) {
            PromptFields()
        }
    }
}

/* the little "name it" box (new space, rename, new folder) */
private struct PromptFields: View {
    @Environment(Store.self) private var store
    @State private var value = ""
    var body: some View {
        TextField("Name", text: $value).onAppear { value = store.prompt?.value ?? "" }
        Button("Cancel", role: .cancel) { store.prompt = nil }
        Button("Save") {
            let v = value.trimmingCharacters(in: .whitespaces), p = store.prompt
            store.prompt = nil
            guard let p, !v.isEmpty else { return }
            let parts = p.action.split(separator: ":", maxSplits: 1).map(String.init)
            switch parts[0] {
            case "newspace": store.addSpace(v)
            case "renamespace": store.renameSpace(parts.count > 1 ? parts[1] : store.s.cur, v)
            case "newfolder": store.newFolder(v, with: parts.count > 1 && !parts[1].isEmpty ? parts[1] : nil)
            case "renamefolder": if parts.count > 1 { store.renameFolder(parts[1], v) }
            default: break
            }
        }
    }
}

struct ToastView: View {
    @Environment(\.theme) private var th
    @Environment(Store.self) private var store
    var text: String, undo: (() -> Void)?
    var body: some View {
        VStack {
            Spacer()
            HStack(spacing: 14) {
                Text(text).font(.ui(14, .semibold)).foregroundStyle(th.ink)
                if let undo { Button("Undo") { undo(); withAnimation { store.toast = nil } }.font(.ui(14, .bold)).foregroundStyle(th.tape) }
            }
            .padding(.horizontal, 18).padding(.vertical, 12)
            .background(th.card, in: Capsule())
            .shadow(color: .black.opacity(0.16), radius: 10, y: 4)
            .padding(.bottom, 74)
            .accessibilityIdentifier("toast")
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .allowsHitTesting(true)
    }
}
