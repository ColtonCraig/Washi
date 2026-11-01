import Foundation
import Observation
import SwiftUI

enum Sheet: Identifiable, Equatable {
    case settings, bookmarks, history
    case editBookmark(String, fresh: Bool)
    var id: String {
        switch self {
        case .settings: return "settings"
        case .bookmarks: return "bookmarks"
        case .history: return "history"
        case .editBookmark(let b, _): return "bm:" + b
        }
    }
}
enum CmdMode: Equatable { case new, this }
struct Prompt: Identifiable, Equatable { var id = UUID(); var title: String; var value: String; var action: String }

/* Washi's state, and everything you can do to it. Pages themselves live in Browser. */
@MainActor @Observable
final class Store {
    var s: Saved
    var history: [Visit] = []
    // what's on screen
    var focusB = false                        // split view: the right-hand page has the focus
    var sidebarOpen = false                   // phones: the sidebar sheet is out
    var command: CmdMode? = nil
    var sheet: Sheet? = nil
    var prompt: Prompt? = nil
    var toast: (text: String, undo: (() -> Void)?)? = nil
    var arranging = false
    var intoFolder: String? = nil              // the next new scrap goes into this folder

    @ObservationIgnored private var saveTask: Task<Void, Never>?
    @ObservationIgnored private var histTask: Task<Void, Never>?
    @ObservationIgnored private var toastTask: Task<Void, Never>?
    @ObservationIgnored let dir: URL
    @ObservationIgnored weak var browser: Browser?

    init(dir: URL? = nil, fresh: Bool = false) {
        let d = dir ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Washi", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        self.dir = d
        if fresh { try? FileManager.default.removeItem(at: d.appendingPathComponent("state.json")); try? FileManager.default.removeItem(at: d.appendingPathComponent("history.json")) }
        var s = (try? Data(contentsOf: d.appendingPathComponent("state.json"))).flatMap { try? JSONDecoder().decode(Saved.self, from: $0) } ?? Saved.fresh()
        s.tidy()
        self.s = s
        history = (try? Data(contentsOf: d.appendingPathComponent("history.json"))).flatMap { try? JSONDecoder().decode([Visit].self, from: $0) } ?? []
    }

    // MARK: saving
    func save() {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard let self, !Task.isCancelled else { return }
            self.saveNow()
        }
    }
    func saveNow() {
        saveTask?.cancel()
        if let d = try? JSONEncoder().encode(s) { try? d.write(to: dir.appendingPathComponent("state.json"), options: .atomic) }
    }
    private func saveHistory() {
        histTask?.cancel()
        histTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            guard let self, !Task.isCancelled else { return }
            if let d = try? JSONEncoder().encode(self.history) { try? d.write(to: self.dir.appendingPathComponent("history.json"), options: .atomic) }
        }
    }

    // MARK: where things are
    var space: Space { s.spaces.first { $0.id == s.cur } ?? s.spaces[0] }
    var spaceIndex: Int { s.spaces.firstIndex { $0.id == s.cur } ?? 0 }
    func spaceTabs(_ sp: Space) -> [String] { sp.items.flatMap { k -> [String] in k.hasPrefix("f:") ? (sp.folders.first { "f:" + $0.id == k }?.tabs ?? []) : [k] } }
    func spaceOf(_ id: String) -> Space? { s.spaces.first { spaceTabs($0).contains(id) } }
    func folderOf(_ id: String) -> Folder? { space.folders.first { $0.tabs.contains(id) } }
    var split: SplitPair? { s.split.flatMap { p in spaceTabs(space).contains(p.a) && spaceTabs(space).contains(p.b) ? p : nil } }
    /* the tab whose page has the focus (the one the address bar is about) */
    var current: String? {
        if let p = split { return focusB ? p.b : p.a }
        if let a = space.active, s.tabs[a] != nil { return a }
        return nil
    }
    var currentTab: Tab? { current.flatMap { s.tabs[$0] } }
    func theme(dark: Bool) -> Theme { Theme(hue: space.hue, dark: dark) }

    private func mutateSpace(_ id: String? = nil, _ f: (inout Space) -> Void) {
        let i = s.spaces.firstIndex { $0.id == (id ?? s.cur) } ?? 0
        f(&s.spaces[i])
    }

    // MARK: tabs
    @discardableResult
    func openTab(_ url: String, bg: Bool = false, into folder: String? = nil) -> String {
        let id = "t" + UUID().uuidString.prefix(8).lowercased()
        s.tabs[id] = Tab(id: id, url: url, title: Web.host(url))
        let end = s.prefs.newTabPos == "bottom"
        mutateSpace { sp in
            if let folder, let fi = sp.folders.firstIndex(where: { $0.id == folder }) {
                if end { sp.folders[fi].tabs.append(id) } else { sp.folders[fi].tabs.insert(id, at: 0) }
                sp.folders[fi].open = true
            } else if end { sp.items.append(id) } else { sp.items.insert(id, at: 0) }
        }
        if !bg { select(id) } else { save() }
        return id
    }
    func select(_ id: String) {
        guard s.tabs[id] != nil else { return }
        if !s.pins.contains(id), let sp = spaceOf(id), sp.id != s.cur { s.cur = sp.id }
        if let p = s.split, p.a == id || p.b == id, spaceTabs(space).contains(p.a) { focusB = p.b == id }
        else { s.split = nil; focusB = false }
        mutateSpace { $0.active = id }
        s.tabs[id]?.seen = Date().timeIntervalSince1970
        save()
    }
    func close(_ id: String) {
        guard s.tabs[id] != nil else { return }
        if s.pins.contains(id) { browser?.drop(id); if current == id { mutateSpace { $0.active = nil }; s.split = nil }; return }   // pinned tabs unload instead
        let wasCurrent = current == id, list = spaceTabs(space), i = list.firstIndex(of: id) ?? 0
        let partner: String? = s.split.flatMap { $0.a == id ? $0.b : $0.b == id ? $0.a : nil }
        if partner != nil { s.split = nil; focusB = false }
        for k in s.spaces.indices {
            s.spaces[k].items.removeAll { $0 == id }
            for f in s.spaces[k].folders.indices { s.spaces[k].folders[f].tabs.removeAll { $0 == id } }
            if s.spaces[k].active == id { s.spaces[k].active = nil }
        }
        s.tabs[id] = nil
        browser?.drop(id)
        if wasCurrent {
            let rest = spaceTabs(space)
            if let next = partner ?? (rest.isEmpty ? nil : rest[min(i, rest.count - 1)]) { mutateSpace { $0.active = next } }
        }
        save()
    }
    func closeAll(except keep: String? = nil) { for id in spaceTabs(space) where id != keep { close(id) } }
    func togglePin(_ id: String) {
        if let i = s.pins.firstIndex(of: id) {
            s.pins.remove(at: i); mutateSpace { $0.items.insert(id, at: 0) }
        } else {
            for k in s.spaces.indices { s.spaces[k].items.removeAll { $0 == id }; for f in s.spaces[k].folders.indices { s.spaces[k].folders[f].tabs.removeAll { $0 == id } } }
            if let p = s.split, p.a == id || p.b == id { s.split = nil }
            s.pins.append(id)
        }
        save()
    }
    func moveTab(_ id: String, toSpace sid: String) {
        guard sid != s.cur, s.tabs[id] != nil else { return }
        if let p = s.split, p.a == id || p.b == id { s.split = nil }
        for k in s.spaces.indices { s.spaces[k].items.removeAll { $0 == id }; for f in s.spaces[k].folders.indices { s.spaces[k].folders[f].tabs.removeAll { $0 == id } }; if s.spaces[k].active == id { s.spaces[k].active = nil } }
        mutateSpace(sid) { $0.items.insert(id, at: 0) }
        browser?.drop(id)                                     // it reopens with that space's logins
        if space.active == nil, let f = spaceTabs(space).first { mutateSpace { $0.active = f } }
        save()
    }
    func duplicate(_ id: String) { if let t = s.tabs[id] { openTab(t.url) } }

    // MARK: folders (one level, like a tidy drawer)
    @discardableResult
    func newFolder(_ name: String, with tab: String? = nil) -> String {
        let id = "f" + UUID().uuidString.prefix(8).lowercased()
        mutateSpace { sp in
            var f = Folder(id: id, name: String(name.prefix(24)))
            if let tab { sp.items.removeAll { $0 == tab }; for j in sp.folders.indices { sp.folders[j].tabs.removeAll { $0 == tab } }; f.tabs = [tab] }
            sp.folders.append(f); sp.items.insert("f:" + id, at: 0)
        }
        save(); return id
    }
    func moveToFolder(_ id: String, _ folder: String?) {
        mutateSpace { sp in
            sp.items.removeAll { $0 == id }; for j in sp.folders.indices { sp.folders[j].tabs.removeAll { $0 == id } }
            if let folder, let j = sp.folders.firstIndex(where: { $0.id == folder }) { sp.folders[j].tabs.insert(id, at: 0); sp.folders[j].open = true }
            else { sp.items.insert(id, at: 0) }
        }
        save()
    }
    func toggleFolder(_ fid: String) { mutateSpace { sp in if let j = sp.folders.firstIndex(where: { $0.id == fid }) { sp.folders[j].open.toggle() } }; save() }
    func renameFolder(_ fid: String, _ name: String) { mutateSpace { sp in if let j = sp.folders.firstIndex(where: { $0.id == fid }) { sp.folders[j].name = String(name.prefix(24)) } }; save() }
    /* ungroup keeps the tabs; delete closes them */
    func removeFolder(_ fid: String, closeTabs: Bool) {
        guard let f = space.folders.first(where: { $0.id == fid }) else { return }
        if closeTabs { for t in f.tabs { close(t) } }
        let keep = closeTabs ? [] : f.tabs.filter { s.tabs[$0] != nil }
        mutateSpace { sp in
            let at = sp.items.firstIndex(of: "f:" + fid) ?? 0
            sp.items.removeAll { $0 == "f:" + fid }
            sp.items.insert(contentsOf: keep, at: min(at, sp.items.count))
            sp.folders.removeAll { $0.id == fid }
        }
        save()
    }
    func moveItems(from: IndexSet, to: Int) { mutateSpace { $0.items.move(fromOffsets: from, toOffset: to) }; save() }
    func movePins(from: IndexSet, to: Int) { s.pins.move(fromOffsets: from, toOffset: to); save() }

    // MARK: split view (big screens)
    func splitWith(_ other: String) {
        guard let cur = current ?? spaceTabs(space).first, cur != other, !s.pins.contains(cur), !s.pins.contains(other) else { return }
        if spaceOf(other)?.id != s.cur { moveTab(other, toSpace: s.cur) }
        s.split = SplitPair(a: cur, b: other); focusB = true
        mutateSpace { $0.active = other }
        save()
    }
    func toggleSplit() {
        if split != nil { let keep = current; s.split = nil; focusB = false; if let keep { mutateSpace { $0.active = keep } }; save(); return }
        let cur = current, list = spaceTabs(space).filter { $0 != cur }
        guard cur != nil, let other = list.max(by: { (s.tabs[$0]?.seen ?? 0) < (s.tabs[$1]?.seen ?? 0) }) else { command = .new; pendingSplit = true; return }
        splitWith(other)
    }
    var pendingSplit = false                  // the next page you open goes into the other half
    func setRatio(_ r: Double) { if s.split != nil { s.split!.ratio = min(max(r, 0.2), 0.8) } }
    func swapSplit() { if let p = s.split { s.split = SplitPair(a: p.b, b: p.a, ratio: 1 - p.ratio); focusB.toggle(); save() } }

    // MARK: spaces
    func switchSpace(_ id: String) {
        guard id != s.cur, s.spaces.contains(where: { $0.id == id }) else { return }
        s.cur = id; s.split = nil; focusB = false
        if space.active == nil, let f = spaceTabs(space).first { mutateSpace { $0.active = f } }
        saveNow()
    }
    func addSpace(_ name: String) {
        guard s.spaces.count < 6 else { return }
        let used = Set(s.spaces.map(\.hue)), h = Paper.order.first { !used.contains($0) } ?? Paper.order[s.spaces.count % Paper.order.count]
        let sp = Space(id: "s" + UUID().uuidString.prefix(6).lowercased(), name: String(name.prefix(12)), hue: h)
        s.spaces.append(sp); switchSpace(sp.id)
    }
    func renameSpace(_ id: String, _ name: String) { mutateSpace(id) { $0.name = String(name.prefix(12)) }; save() }
    func setSpaceColor(_ id: String, _ h: Int) { mutateSpace(id) { $0.hue = h }; save() }
    func setIsolated(_ id: String, _ on: Bool) {
        guard let sp = s.spaces.first(where: { $0.id == id }), sp.isolated != on else { return }
        for t in spaceTabs(sp) { browser?.drop(t) }          // pages reopen with the new set of logins
        mutateSpace(id) { $0.isolated = on }; save()
    }
    func deleteSpace(_ id: String) {
        guard s.spaces.count > 1, let sp = s.spaces.first(where: { $0.id == id }) else { return }
        for t in spaceTabs(sp) { browser?.drop(t); s.tabs[t] = nil }
        s.spaces.removeAll { $0.id == id }
        if s.cur == id { s.cur = s.spaces[0].id; s.split = nil }
        save()
    }

    // MARK: pages telling us what happened
    func pageChanged(_ id: String, url: String? = nil, title: String? = nil, fav: String? = nil) {
        guard let t = s.tabs[id] else { return }
        var changed = false
        if let url, !url.isEmpty, url != t.url { s.tabs[id]!.url = url; changed = true }
        if let title, !title.isEmpty, title != t.title { s.tabs[id]!.title = title; changed = true }
        if let fav, fav != t.fav { s.tabs[id]!.fav = fav; changed = true }
        if changed { save() }
    }
    func visited(_ url: String, title: String) {
        guard Web.isWeb(url) else { return }
        if let i = history.firstIndex(where: { $0.url == url }) {
            if i == 0 { if !title.isEmpty { history[0].title = title }; saveHistory(); return }
            history.remove(at: i)
        }
        history.insert(Visit(url: url, title: title, t: Date().timeIntervalSince1970), at: 0)
        if history.count > 3000 { history.removeLast(history.count - 3000) }
        saveHistory()
    }
    func forget(_ url: String) { history.removeAll { $0.url == url }; saveHistory() }
    func clearHistory() { history = []; saveHistory() }

    // MARK: bookmarks
    func bookmark(for url: String) -> Bookmark? { s.bookmarks.first(url: url) }
    /* ☆: bookmark the page (or edit it if it's already there) */
    func star() {
        guard let t = currentTab, Web.isWeb(t.url) else { return }
        if let b = bookmark(for: t.url) { sheet = .editBookmark(b.id, fresh: false); return }
        let b = Bookmark(id: "b" + UUID().uuidString.prefix(8).lowercased(), url: t.url, title: String(t.title.prefix(200)))
        s.bookmarks.append(b); save()
        sheet = .editBookmark(b.id, fresh: true)
    }
    @discardableResult
    func newBookmarkFolder(in parent: String? = nil, name: String = "New folder") -> String {
        let f = Bookmark(id: "b" + UUID().uuidString.prefix(8).lowercased(), isFolder: true, title: name)
        s.bookmarks.insert(f, into: parent); save(); return f.id
    }
    func saveBookmark(_ id: String, title: String, url: String?, icon: String?, color: String?, parent: String?) {
        guard let b = s.bookmarks.find(id) else { return }
        s.bookmarks.update(id) { x in
            x.title = String(title.prefix(x.isFolder ? 40 : 200))
            if x.isFolder { x.icon = icon; x.color = color; if x.title.isEmpty { x.title = "Folder" } }
            else if let url, Web.isWeb(url) { x.url = url }
        }
        let now = s.bookmarks.parent(of: id) ?? nil
        if now != parent {
            let bad = parent.map { p in p == id || b.contains(p) } ?? false     // a folder can't go inside itself
            if !bad, let moved = s.bookmarks.remove(id) { s.bookmarks.insert(moved, into: parent) }
        }
        save()
    }
    func deleteBookmark(_ id: String, undoable: Bool = true) {
        let parent = s.bookmarks.parent(of: id) ?? nil
        let list = parent.flatMap { s.bookmarks.find($0)?.kids } ?? s.bookmarks
        let i = list.firstIndex { $0.id == id } ?? 0
        guard let b = s.bookmarks.remove(id) else { return }
        save()
        if undoable { show(b.isFolder ? "Deleted “\(b.title)”" : "Removed the bookmark") { [weak self] in self?.s.bookmarks.insert(b, into: parent, at: i); self?.save() } }
    }
    func moveBookmarks(in parent: String?, from: IndexSet, to: Int) {
        if let parent { s.bookmarks.update(parent) { $0.kids.move(fromOffsets: from, toOffset: to) } } else { s.bookmarks.move(fromOffsets: from, toOffset: to) }
        save()
    }
    func open(bookmark b: Bookmark, bg: Bool = false) {
        if !bg, let here = (s.pins + spaceTabs(space)).first(where: { s.tabs[$0]?.url == b.url }) { select(here); return }
        openTab(b.url, bg: bg)
    }

    // MARK: settings
    func setPref(_ f: (inout Prefs) -> Void) { f(&s.prefs); save() }
    func blockingOn(for url: String) -> Bool { s.prefs.blocking && !s.prefs.blockOff.contains(Web.host(url)) }
    func toggleSiteBlocking(_ url: String) {
        let h = Web.host(url)
        if let i = s.prefs.blockOff.firstIndex(of: h) { s.prefs.blockOff.remove(at: i) } else { s.prefs.blockOff.append(h) }
        save()
    }

    // MARK: little messages at the bottom
    func show(_ text: String, undo: (() -> Void)? = nil) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { toast = (text, undo) }
        toastTask?.cancel()
        toastTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: undo == nil ? 1_800_000_000 : 5_000_000_000)
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.2)) { self?.toast = nil }
        }
    }
}
