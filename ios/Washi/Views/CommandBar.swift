import SwiftUI
import UIKit

/* The command bar: type an address or a search (with !bangs), jump to an open tab, a bookmark, something from
   history, or run an action. Return picks the first row. */
struct CommandBar: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var mode: CmdMode
    var wide: Bool
    @State private var q: String
    init(mode: CmdMode, wide: Bool, initial: String) { self.mode = mode; self.wide = wide; _q = State(initialValue: initial) }

    struct Row: Identifiable { let id: String; let label: String; let hint: String; let icon: String?; let fav: Tab?; let run: () -> Void }

    var body: some View {
        let rows = results()
        ZStack(alignment: .top) {
            Color.black.opacity(th.dark ? 0.4 : 0.18).ignoresSafeArea().onTapGesture { close() }.accessibilityIdentifier("commandDim")
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass").font(.system(size: 17, weight: .semibold)).foregroundStyle(th.ink2)
                    CmdField(text: $q, onSubmit: { if let r = rows.first { r.run() } else { close() } }, onEscape: close)
                        .frame(height: 30)
                    if !wide { Button("Cancel") { close() }.font(.ui(15, .semibold)).foregroundStyle(th.tape).accessibilityIdentifier("commandCancel") }
                    else { Text(mode == .new ? "new scrap" : "this tab").font(.ui(11.5, .semibold)).foregroundStyle(th.ink2).padding(.horizontal, 8).padding(.vertical, 3).background(th.ink.opacity(0.07), in: Capsule()) }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                Rectangle().fill(th.line).frame(height: 1)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                            if let h = header(rows, i) { Text(h).font(.ui(11, .bold)).textCase(.uppercase).kerning(0.6).foregroundStyle(th.ink3).padding(.horizontal, 18).padding(.top, 12).padding(.bottom, 4) }
                            Button(action: r.run) {
                                HStack(spacing: 12) {
                                    if let t = r.fav { Fav(url: t.url, title: t.title, fav: t.fav, size: 22) }
                                    else { Image(systemName: r.icon ?? "globe").font(.system(size: 14, weight: .medium)).foregroundStyle(th.ink2).frame(width: 22, height: 22) }
                                    Text(r.label).font(.ui(15, i == 0 && !q.isEmpty ? .semibold : .medium)).foregroundStyle(th.ink).lineLimit(1)
                                    Spacer(minLength: 8)
                                    Text(r.hint).font(.ui(12)).foregroundStyle(th.ink3).lineLimit(1)
                                }
                                .padding(.horizontal, 16).frame(minHeight: 46)
                                .background(i == 0 && !q.isEmpty ? th.tape.opacity(0.1) : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .padding(.horizontal, 6)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("result:" + r.label)
                        }
                        if rows.isEmpty { Text("Nothing here yet. Type an address or a search.").font(.ui(14)).foregroundStyle(th.ink3).padding(20) }
                    }
                    .padding(.vertical, 6)
                }
                .scrollDismissesKeyboard(.interactively)
                .frame(maxHeight: wide ? 440 : .infinity)
            }
            .background(th.paper, in: RoundedRectangle(cornerRadius: wide ? 16 : 0, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: wide ? 16 : 0, style: .continuous))
            .shadow(color: .black.opacity(0.18), radius: 24, y: 10)
            .frame(maxWidth: wide ? 620 : .infinity)
            .padding(.top, wide ? 70 : 0)
            .padding(.horizontal, wide ? 20 : 0)
        }
    }

    private func header(_ rows: [Row], _ i: Int) -> String? {
        let g = rows[i].id.split(separator: ":").first.map(String.init) ?? ""
        let prev = i > 0 ? rows[i - 1].id.split(separator: ":").first.map(String.init) : nil
        guard g != prev else { return nil }
        return ["tab": "open tabs", "bm": "bookmarks", "h": "history", "act": "actions"][g]
    }
    private func close() { store.command = nil; store.intoFolder = nil; store.pendingSplit = false }

    private func results() -> [Row] {
        let v = q.trimmingCharacters(in: .whitespaces), lv = v.lowercased()
        let words = lv.split(separator: " ").map(String.init)
        let has: (String) -> Bool = { s in words.isEmpty || words.allSatisfy { s.lowercased().contains($0) } }
        var out: [Row] = []
        if !v.isEmpty && !(mode == .this && v == store.currentTab?.url) {
            let b = Web.bang(v), url = Web.looksLikeURL(v)
            var label = url ? "Go to \(v)" : "Search for “\(v)”"
            if let b { label = "Search \(b.name) for “\(b.q)”" }
            let target = Web.toURL(v, engine: store.s.prefs.search)
            out.append(Row(id: "go:0", label: label, hint: "go", icon: url ? "globe" : "magnifyingglass", fav: nil) { go(target) })
        }
        let all = Array(Set(store.s.pins + store.s.spaces.flatMap { store.spaceTabs($0) }))
        let tabs = all.compactMap { store.s.tabs[$0] }.filter { has($0.title + " " + $0.url) }.sorted { $0.seen > $1.seen }.prefix(v.isEmpty ? 6 : 6)
        for t in tabs where !(mode == .this && t.id == store.current && v.isEmpty) {
            let where_ = store.s.pins.contains(t.id) ? "Pinned" : (store.spaceOf(t.id)?.name ?? "")
            out.append(Row(id: "tab:" + t.id, label: t.title.isEmpty ? Web.host(t.url) : t.title, hint: where_, icon: nil, fav: t) { close(); store.select(t.id) })
        }
        let open = Set(all.compactMap { store.s.tabs[$0]?.url })
        if !v.isEmpty {
            var seen = Set<String>()
            for x in store.s.bookmarks.flat() where has(x.bm.label + " " + x.bm.url + " " + x.path) && seen.insert(x.bm.url).inserted {
                let b = x.bm, path = x.path
                out.append(Row(id: "bm:" + b.id, label: b.label, hint: path.isEmpty ? "bookmark" : path, icon: "star", fav: nil) {
                    if mode == .new, store.intoFolder == nil, !store.pendingSplit { close(); store.open(bookmark: b) } else { go(b.url) }      // already open: switch to it
                })
                if seen.count >= 4 { break }
            }
            var n = 0
            for h in store.history where !open.contains(h.url) && !seen.contains(h.url) && has(h.title + " " + h.url) {
                out.append(Row(id: "h:" + h.url, label: h.title.isEmpty ? Web.host(h.url) : h.title, hint: Web.host(h.url), icon: "clock", fav: nil) { go(h.url) })
                n += 1; if n >= 5 { break }
            }
        }
        for a in actions() where has(a.0) { out.append(Row(id: "act:" + a.0, label: a.0, hint: "", icon: a.1, fav: nil, run: a.2)) }
        return out
    }
    private func actions() -> [(String, String, () -> Void)] {
        var a: [(String, String, () -> Void)] = [
            ("Bookmarks", "book", { close(); store.sheet = .bookmarks }),
            ("History", "clock", { close(); store.sheet = .history }),
            ("New space", "square.stack", { close(); store.prompt = Prompt(title: "Name this space", value: "", action: "newspace") }),
            ("New folder", "folder.badge.plus", { close(); store.prompt = Prompt(title: "Name this folder", value: "", action: "newfolder:") }),
        ]
        if let id = store.current {
            a.append(("Find on page", "doc.text.magnifyingglass", { close(); store.browser?.find(id) }))
            if Web.isWeb(store.currentTab?.url ?? "") { a.append(("Bookmark this page", "star", { close(); store.star() })) }
            a.append(("Close other tabs", "xmark.square", { close(); store.closeAll(except: id) }))
        }
        if wide && store.current != nil { a.append((store.split == nil ? "Split view" : "Leave split view", "rectangle.split.2x1", { close(); store.toggleSplit() })) }
        a.append(("Settings", "gearshape", { close(); store.sheet = .settings }))
        return a
    }
    private func go(_ url: String) {
        let into = store.intoFolder, split = store.pendingSplit, prev = store.current
        close()
        if mode == .this, let id = store.current { store.browser?.go(id, url); return }
        let id = store.openTab(url, into: into)
        if split, let prev, prev != id { store.select(prev); store.splitWith(id) }
    }
}

/* a real text field, so the keyboard is the web keyboard and the old address is selected, ready to replace */
struct CmdField: UIViewRepresentable {
    @Binding var text: String
    var onSubmit: () -> Void
    var onEscape: () -> Void
    func makeCoordinator() -> Coord { Coord(self) }
    func makeUIView(context: Context) -> UITextField {
        let f = UITextField()
        f.placeholder = "Search or type an address"
        f.keyboardType = .webSearch; f.returnKeyType = .go
        f.autocapitalizationType = .none; f.autocorrectionType = .no; f.spellCheckingType = .no; f.smartQuotesType = .no
        f.clearButtonMode = .whileEditing; f.textContentType = .URL; f.enablesReturnKeyAutomatically = false
        f.font = UIFont(name: "Figtree-SemiBold", size: 17) ?? .systemFont(ofSize: 17, weight: .semibold)
        f.delegate = context.coordinator
        f.addTarget(context.coordinator, action: #selector(Coord.changed(_:)), for: .editingChanged)
        f.accessibilityIdentifier = "commandField"
        f.text = text
        let initial = text
        DispatchQueue.main.async { f.becomeFirstResponder(); if !initial.isEmpty { f.selectAll(nil) } }
        return f
    }
    func updateUIView(_ f: UITextField, context: Context) { context.coordinator.p = self; if !f.isFirstResponder, f.text != text { f.text = text } }
    final class Coord: NSObject, UITextFieldDelegate {
        var p: CmdField
        init(_ p: CmdField) { self.p = p }
        @objc func changed(_ f: UITextField) { p.text = f.text ?? "" }
        func textFieldShouldReturn(_ f: UITextField) -> Bool { p.text = f.text ?? ""; DispatchQueue.main.async { self.p.onSubmit() }; return false }
    }
}
