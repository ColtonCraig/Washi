import SwiftUI

/* ---------- phones and the Duo folded ---------- */
struct PhoneLayout: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var size: CGSize
    @GestureState private var drag: CGFloat = 0
    var body: some View {
        let w = min(340, size.width * 0.86)
        ZStack(alignment: .leading) {
            VStack(spacing: 0) {
                PageCard(id: store.current).padding(.horizontal, 6).padding(.top, 2)
                PhoneBar()
            }
            if store.sidebarOpen {
                Color.black.opacity(th.dark ? 0.45 : 0.22).ignoresSafeArea()
                    .onTapGesture { withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) { store.sidebarOpen = false } }
                    .transition(.opacity)
                    .accessibilityIdentifier("sidebarDim")
                SidebarView(drawer: true)
                    .frame(width: w)
                    .background(th.desk.ignoresSafeArea())
                    .clipShape(UnevenRoundedRectangle(bottomTrailingRadius: 16, topTrailingRadius: 16, style: .continuous))
                    .shadow(color: .black.opacity(0.2), radius: 16, x: 4)
                    .offset(x: min(0, drag))
                    .gesture(DragGesture(minimumDistance: 12).updating($drag) { v, s, _ in if abs(v.translation.width) > abs(v.translation.height) { s = v.translation.width } }
                        .onEnded { v in if v.translation.width < -70 || v.predictedEndTranslation.width < -160 { withAnimation(.spring(response: 0.3, dampingFraction: 0.9)) { store.sidebarOpen = false } } })
                    .transition(.move(edge: .leading))
                    .ignoresSafeArea(edges: .bottom)
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.88), value: store.sidebarOpen)
    }
}
struct PhoneBar: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var body: some View {
        let id = store.current, st = id.flatMap { store.browser?.state($0) }
        HStack(spacing: 2) {
            Stamp(icon: "sidebar.left", label: "Tabs and spaces", id: "sidebarButton") { store.sidebarOpen = true }
            Stamp(icon: "chevron.backward", label: "Back", id: "back", disabled: !(st?.canBack ?? false)) { if let id { store.browser?.back(id) } }
            AddressLabel().padding(.horizontal, 4)
            Stamp(icon: "plus", label: "New scrap", id: "newTab") { store.command = .new }
            PageMenu(wide: false)
        }
        .padding(.horizontal, 6).padding(.top, 6).padding(.bottom, 2)
    }
}

/* ---------- big screens: the Duo open, iPads, phones on their side ---------- */
struct WideLayout: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var size: CGSize
    var body: some View {
        VStack(spacing: 0) {
            TopBar()
            HStack(spacing: 0) {
                if store.s.prefs.docked {
                    SidebarView(drawer: false).frame(width: size.width < 760 ? 220 : 248).transition(.move(edge: .leading).combined(with: .opacity))
                }
                VStack(spacing: 0) {
                    if store.s.prefs.bookmarkBar && !store.s.bookmarks.isEmpty { BookmarksBar().transition(.move(edge: .top).combined(with: .opacity)) }
                    Stage().padding(.leading, store.s.prefs.docked ? 2 : 8).padding(.trailing, 8).padding(.bottom, 8).padding(.top, 2)
                }
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.88), value: store.s.prefs.docked)
        .animation(.spring(response: 0.3, dampingFraction: 0.9), value: store.s.prefs.bookmarkBar)
    }
}
struct TopBar: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var body: some View {
        let id = store.current, st = id.flatMap { store.browser?.state($0) }, t = store.currentTab
        let starred = t.flatMap { store.bookmark(for: $0.url) } != nil
        HStack(spacing: 0) {
            Stamp(icon: "sidebar.left", label: "Show or hide the sidebar", id: "sidebarButton", on: store.s.prefs.docked) { store.setPref { $0.docked.toggle() } }
            Stamp(icon: "chevron.backward", label: "Back", id: "back", disabled: !(st?.canBack ?? false)) { if let id { store.browser?.back(id) } }
            Stamp(icon: "chevron.forward", label: "Forward", id: "forward", disabled: !(st?.canFwd ?? false)) { if let id { store.browser?.forward(id) } }
            Stamp(icon: st?.loading == true ? "xmark" : "arrow.clockwise", label: "Reload", id: "reload", disabled: id == nil) { if let id { store.browser?.reload(id) } }
            AddressLabel().frame(maxWidth: 720).padding(.horizontal, 8)
            Stamp(icon: starred ? "star.fill" : "star", label: starred ? "Edit bookmark" : "Bookmark this page", id: "star", on: starred, disabled: !(t.map { Web.isWeb($0.url) } ?? false)) { store.star() }
            Stamp(icon: "rectangle.split.2x1", label: "Split view", id: "splitButton", on: store.split != nil, disabled: id == nil) { store.toggleSplit() }
            Stamp(icon: "plus", label: "New scrap", id: "newTab") { store.command = .new }
            PageMenu(wide: true)
        }
        .padding(.horizontal, 6).frame(height: 48)
    }
}

/* one page, or two side by side with a gap you can drag */
struct Stage: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    @State private var start: Double? = nil
    static let gap: CGFloat = 10, minPane: CGFloat = 280
    var body: some View {
        GeometryReader { g in
            if let p = store.split, g.size.width >= Stage.minPane * 2 + Stage.gap {
                let room = g.size.width - Stage.gap
                let r = min(max(p.ratio, Stage.minPane / room), 1 - Stage.minPane / room)
                HStack(spacing: 0) {
                    PageCard(id: p.a, focused: !store.focusB, ring: true).frame(width: room * r)
                    Gutter()
                        .gesture(DragGesture(minimumDistance: 1, coordinateSpace: .global)
                            .onChanged { v in
                                if start == nil { start = r }
                                let nr = (start! * room + v.translation.width) / room
                                store.setRatio(min(max(nr, Stage.minPane / room), 1 - Stage.minPane / room))
                            }
                            .onEnded { _ in start = nil; store.save() })
                        .onTapGesture(count: 2) { withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { store.setRatio(0.5) }; store.save() }
                    PageCard(id: p.b, focused: store.focusB, ring: true)
                }
            } else {
                PageCard(id: store.current)
            }
        }
    }
}
struct Gutter: View {
    @Environment(\.theme) private var th
    var body: some View {
        ZStack {
            Color.clear
            Capsule().fill(th.ink.opacity(0.25)).frame(width: 4, height: 44)
        }
        .frame(width: Stage.gap)
        .contentShape(Rectangle())
        .accessibilityElement()
        .accessibilityIdentifier("divider").accessibilityLabel("Drag to resize the split")
    }
}
