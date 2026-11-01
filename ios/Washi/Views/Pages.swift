import SwiftUI
import WebKit

/* Puts a tab's real page on screen. The page view moves between containers (phone ↔ big screen, split ↔ single)
   without reloading. A tap anywhere on it tells us which half of a split you're using. */
struct PageHost: UIViewRepresentable {
    let id: String
    let browser: Browser
    var onTouch: () -> Void
    func makeUIView(context: Context) -> PageContainer { PageContainer() }
    func updateUIView(_ c: PageContainer, context: Context) { c.onTouch = onTouch; c.wantID = id; c.show(browser.view(for: id)) }
    static func dismantleUIView(_ c: PageContainer, coordinator: ()) { c.release() }
}
final class PageContainer: UIView, UIGestureRecognizerDelegate {
    private(set) weak var page: WKWebView?
    var onTouch: (() -> Void)?
    var wantID: String?
    /* every container on screen, so a page taken by a view that's on its way out (an animation) comes straight back */
    static let all = NSHashTable<PageContainer>.weakObjects()
    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear
        let tap = UITapGestureRecognizer(target: self, action: #selector(touched))
        tap.cancelsTouchesInView = false; tap.delegate = self
        addGestureRecognizer(tap)
        PageContainer.all.add(self)
    }
    required init?(coder: NSCoder) { fatalError() }
    @objc private func touched() { onTouch?() }
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith o: UIGestureRecognizer) -> Bool { true }
    func show(_ v: WKWebView?) {
        if let v, v.superview === self { return }
        if let old = page, old.superview === self, old !== v { old.removeFromSuperview() }
        page = v
        guard let v else { return }
        attach(v)
    }
    func release() {
        PageContainer.all.remove(self)
        guard let p = page, p.superview === self else { return }
        p.removeFromSuperview()
        if let heir = PageContainer.all.allObjects.last(where: { $0.wantID == wantID && $0.window != nil }) { heir.show(p) }
    }
    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window == nil { handOff() } else { claim() }
    }
    /* coming on screen: take the page if whoever has it isn't on screen any more */
    private func claim() {
        guard let p = page, p.superview !== self, p.superview?.window == nil else { return }
        attach(p)
    }
    /* leaving the screen: give the page to a holder that's on screen and wants it */
    private func handOff() {
        guard let p = page, p.superview === self,
              let heir = PageContainer.all.allObjects.last(where: { $0 !== self && $0.wantID == wantID && $0.window != nil }) else { return }
        heir.attach(p)
    }
    private func attach(_ v: WKWebView) {
        v.removeFromSuperview()
        v.frame = bounds; v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(v); page = v
    }
    /* after the layout changes (folding, turning the phone), make sure every page on screen is in its place */
    static func settle() {
        for c in all.allObjects where c.window != nil { c.claim() }
    }
}

/* a page on its paper card, with a thin tape-coloured loading line */
struct PageCard: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    let id: String?
    var focused = false
    var ring = false
    var body: some View {
        ZStack(alignment: .top) {
            th.paper
            if let id, let b = store.browser {
                PageHost(id: id, browser: b) { if let p = store.split, p.b == id, !store.focusB { store.focusB = true } else if let p = store.split, p.a == id, store.focusB { store.focusB = false } }
                    .id(id)
                ProgressLine(state: b.state(id))
            } else { EmptyNote() }
        }
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(ring && focused ? th.tape.opacity(0.75) : th.line, lineWidth: ring && focused ? 2 : 1))
        .shadow(color: .black.opacity(th.dark ? 0.35 : 0.08), radius: 5, y: 2)
    }
}
struct ProgressLine: View {
    @Environment(\.theme) private var th
    var state: PageState
    var body: some View {
        GeometryReader { g in
            Rectangle().fill(th.tape)
                .frame(width: g.size.width * max(0.08, state.progress), height: 2.5)
                .opacity(state.loading ? 1 : 0)
                .animation(.easeOut(duration: 0.25), value: state.progress)
                .animation(.easeOut(duration: 0.3), value: state.loading)
        }
        .frame(height: 2.5)
        .allowsHitTesting(false)
    }
}
struct EmptyNote: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var body: some View {
        VStack(spacing: 10) {
            Tape(color: th.tape).frame(width: 74, height: 18).rotationEffect(.degrees(-3))
            Text("Nothing taped up in \(store.space.name)").font(.ui(20, .bold)).foregroundStyle(th.ink).multilineTextAlignment(.center)
            Text("Tap + to search or type an address").font(.ui(15)).foregroundStyle(th.ink2)
            Button { store.command = .new } label: {
                Label("New scrap", systemImage: "plus").font(.ui(15, .semibold)).padding(.horizontal, 16).padding(.vertical, 10)
                    .background(th.tape, in: Capsule()).foregroundStyle(.white)
            }
            .padding(.top, 6)
            .accessibilityIdentifier("emptyNew")
        }
        .padding(28)
    }
}

/* the address: the site, a lock, and the path in lighter ink. Tap to edit or search. */
struct AddressLabel: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var body: some View {
        let t = store.currentTab, p = t.map { Web.pretty($0.url) }
        let st = store.current.flatMap { store.browser?.state($0) }
        Button { store.command = t == nil ? .new : .this } label: {
            HStack(spacing: 6) {
                Image(systemName: t == nil ? "magnifyingglass" : (t!.url.hasPrefix("https://") && (st?.secure ?? true) ? "lock.fill" : "globe"))
                    .font(.system(size: 11, weight: .semibold)).foregroundStyle(th.ink2)
                if let p {
                    (Text(p.host).foregroundColor(th.ink) + Text(p.path).foregroundColor(th.ink3))
                        .font(.ui(14, .semibold)).lineLimit(1).truncationMode(.tail)
                } else {
                    Text("Search or type an address").font(.ui(14)).foregroundStyle(th.ink3).lineLimit(1)
                }
            }
            .padding(.horizontal, 14).frame(maxWidth: .infinity, minHeight: 36)
            .background(th.card.opacity(th.dark ? 0.9 : 0.85), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(th.line))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("address")
        .accessibilityLabel(p.map { $0.host } ?? "Search or type an address")
    }
}

/* a flat stamp button, like the Mac top bar */
struct Stamp: View {
    @Environment(\.theme) private var th
    var icon: String
    var label: String
    var id: String
    var on = false
    var disabled = false
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: icon).font(.system(size: 17, weight: .medium))
                .foregroundStyle(on ? th.tape : th.ink2)
                .frame(width: 40, height: 40)
                .background(on ? th.tape.opacity(0.13) : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(StampStyle())
        .disabled(disabled).opacity(disabled ? 0.35 : 1)
        .accessibilityLabel(label).accessibilityIdentifier(id)
    }
}
struct StampStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed ? 0.9 : 1).animation(.spring(response: 0.2, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

/* everything else you can do with the page */
struct PageMenu: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var wide: Bool
    var body: some View {
        let id = store.current, t = store.currentTab, web = t.map { Web.isWeb($0.url) } ?? false
        Menu {
            if let id {
                if !wide {
                    Button { store.browser?.forward(id) } label: { Label("Forward", systemImage: "chevron.forward") }.disabled(!(store.browser?.state(id).canFwd ?? false))
                    Button { store.browser?.reload(id) } label: { Label("Reload", systemImage: "arrow.clockwise") }
                }
                if web {
                    Button { store.star() } label: { Label(store.bookmark(for: t!.url) == nil ? "Bookmark This Page" : "Edit Bookmark", systemImage: store.bookmark(for: t!.url) == nil ? "star" : "star.fill") }
                }
            }
            Button { store.sheet = .bookmarks } label: { Label("Bookmarks", systemImage: "book") }
            Button { store.sheet = .history } label: { Label("History", systemImage: "clock") }
            if let id, let t {
                Divider()
                Button { store.browser?.find(id) } label: { Label("Find on Page", systemImage: "doc.text.magnifyingglass") }
                if web, let u = URL(string: t.url) {
                    ShareLink(item: u) { Label("Share", systemImage: "square.and.arrow.up") }
                    Button { UIPasteboard.general.string = t.url; store.show("Copied the address") } label: { Label("Copy Address", systemImage: "link") }
                }
                Divider()
                Button { store.togglePin(id) } label: { Label(store.s.pins.contains(id) ? "Unpin" : "Pin", systemImage: store.s.pins.contains(id) ? "pin.slash" : "pin") }
                if web {
                    let h = Web.host(t.url), desk = store.s.prefs.desktop.contains(h)
                    Button {
                        store.setPref { p in if desk { p.desktop.removeAll { $0 == h } } else { p.desktop.append(h) } }
                        store.browser?.reloadForSettings(id)
                    } label: { Label(desk ? "Show Mobile Site" : "Show Desktop Site", systemImage: desk ? "iphone" : "desktopcomputer") }
                    if store.s.prefs.blocking {
                        let on = store.blockingOn(for: t.url)
                        Button { store.toggleSiteBlocking(t.url); store.browser?.reloadForSettings(id); store.show(on ? "Blocking is off for \(h)" : "Blocking is back on for \(h)") } label: {
                            Label(on ? "Turn Off Blocking Here" : "Turn On Blocking Here", systemImage: on ? "shield.slash" : "shield")
                        }
                    }
                }
            }
            Divider()
            Button { store.sheet = .settings } label: { Label("Settings", systemImage: "gearshape") }
        } label: {
            Image(systemName: "ellipsis.circle").font(.system(size: 18, weight: .medium)).foregroundStyle(th.ink2)
                .frame(width: 40, height: 40).contentShape(Rectangle())
        }
        .accessibilityIdentifier("menu").accessibilityLabel("More")
    }
}
