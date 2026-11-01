import Foundation

/* Everything Washi keeps between launches. Same ideas as the Mac app: spaces with their own tabs and folders,
   pinned tabs on top, bookmarks (folders can have an emoji and a colour), and settings. */

struct Tab: Codable, Identifiable, Equatable {
    var id: String
    var url: String
    var title: String
    var fav: String? = nil            // a small PNG (base64) of the site's icon
    var seen: Double = Date().timeIntervalSince1970
}

struct Folder: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var open: Bool = true
    var tabs: [String] = []
}

struct Space: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var hue: Int
    var isolated: Bool = false        // its own cookies and sign-ins (work / personal)
    var items: [String] = []          // tab ids, and "f:<folder id>" for folders, in sidebar order
    var folders: [Folder] = []
    var active: String? = nil
}

struct Bookmark: Codable, Identifiable, Equatable {
    var id: String
    var isFolder: Bool = false
    var url: String = ""
    var title: String = ""
    var icon: String? = nil           // folders: an emoji, or nil for the paper folder
    var color: String? = nil          // folders: "#rrggbb"
    var kids: [Bookmark] = []
    var label: String { title.isEmpty ? Web.host(url) : title }
}

struct Visit: Codable, Equatable {
    var url: String
    var title: String
    var t: Double
}

struct SplitPair: Codable, Equatable {
    var a: String
    var b: String
    var ratio: Double = 0.5
}

struct Prefs: Codable, Equatable {
    var mode = "auto"                 // auto | light | dark
    var search = "google"
    var blocking = true
    var bookmarkBar = true            // big screens (Duo open): a row of bookmarks over the page
    var newTabPos = "top"             // top | bottom
    var docked = true                 // big screens: the sidebar sits beside the page
    var blockOff: [String] = []       // sites where blocking is off
    var desktop: [String] = []        // sites shown as their desktop version

    init() {}
    init(from d: Decoder) throws {   // every field is optional, so newer versions can add settings safely
        let c = try d.container(keyedBy: K.self), z = Prefs()
        mode = (try? c.decode(String.self, forKey: .mode)) ?? z.mode
        search = (try? c.decode(String.self, forKey: .search)) ?? z.search
        blocking = (try? c.decode(Bool.self, forKey: .blocking)) ?? z.blocking
        bookmarkBar = (try? c.decode(Bool.self, forKey: .bookmarkBar)) ?? z.bookmarkBar
        newTabPos = (try? c.decode(String.self, forKey: .newTabPos)) ?? z.newTabPos
        docked = (try? c.decode(Bool.self, forKey: .docked)) ?? z.docked
        blockOff = (try? c.decode([String].self, forKey: .blockOff)) ?? []
        desktop = (try? c.decode([String].self, forKey: .desktop)) ?? []
    }
    private enum K: String, CodingKey { case mode, search, blocking, bookmarkBar, newTabPos, docked, blockOff, desktop }
}

struct Saved: Codable {
    var tabs: [String: Tab] = [:]
    var pins: [String] = []
    var spaces: [Space] = []
    var cur = "home"
    var bookmarks: [Bookmark] = []
    var prefs = Prefs()
    var split: SplitPair? = nil

    static func fresh() -> Saved {
        var s = Saved()
        s.spaces = [Space(id: "home", name: "Home", hue: 40), Space(id: "work", name: "Work", hue: 255, isolated: true), Space(id: "play", name: "Play", hue: 340)]
        return s
    }
    init() {}
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        tabs = (try? c.decode([String: Tab].self, forKey: .tabs)) ?? [:]
        pins = (try? c.decode([String].self, forKey: .pins)) ?? []
        spaces = (try? c.decode([Space].self, forKey: .spaces)) ?? []
        cur = (try? c.decode(String.self, forKey: .cur)) ?? "home"
        bookmarks = (try? c.decode([Bookmark].self, forKey: .bookmarks)) ?? []
        prefs = (try? c.decode(Prefs.self, forKey: .prefs)) ?? Prefs()
        split = try? c.decode(SplitPair.self, forKey: .split)
    }
    private enum K: String, CodingKey { case tabs, pins, spaces, cur, bookmarks, prefs, split }

    /* nothing points at a tab that's gone, every tab sits in exactly one place */
    mutating func tidy() {
        if spaces.isEmpty { self = .fresh(); return }
        var used = Set<String>()
        pins = pins.filter { tabs[$0] != nil && used.insert($0).inserted }
        for i in spaces.indices {
            var s = spaces[i]
            let fids = Set(s.folders.map(\.id))
            for j in s.folders.indices { s.folders[j].tabs = s.folders[j].tabs.filter { tabs[$0] != nil && used.insert($0).inserted } }
            var placed = Set<String>()
            s.items = s.items.filter { k in
                if k.hasPrefix("f:") { return fids.contains(String(k.dropFirst(2))) && placed.insert(k).inserted }
                return tabs[k] != nil && used.insert(k).inserted
            }
            for f in s.folders where !placed.contains("f:" + f.id) { s.items.append("f:" + f.id) }
            if let a = s.active, !used.contains(a) || (!s.items.contains(a) && !s.folders.contains { $0.tabs.contains(a) } && !pins.contains(a)) { s.active = nil }
            spaces[i] = s
        }
        for id in tabs.keys where !used.contains(id) { tabs[id] = nil }       // orphans
        if !spaces.contains(where: { $0.id == cur }) { cur = spaces[0].id }
        if let p = split, tabs[p.a] == nil || tabs[p.b] == nil || p.a == p.b { split = nil }
    }
}

/* ---------- bookmarks tree helpers ---------- */
extension Array where Element == Bookmark {
    func find(_ id: String) -> Bookmark? {
        for b in self { if b.id == id { return b }; if b.isFolder, let x = b.kids.find(id) { return x } }
        return nil
    }
    func first(url: String) -> Bookmark? {
        for b in self { if !b.isFolder && b.url == url { return b }; if b.isFolder, let x = b.kids.first(url: url) { return x } }
        return nil
    }
    /* the folder that holds id (nil = top level), or .none when id isn't anywhere */
    func parent(of id: String) -> String?? {
        if contains(where: { $0.id == id }) { return .some(nil) }
        for b in self where b.isFolder { if let p = b.kids.parent(of: id) { return p == nil ? .some(b.id) : p } }
        return .none
    }
    @discardableResult mutating func remove(_ id: String) -> Bookmark? {
        if let i = firstIndex(where: { $0.id == id }) { return self.remove(at: i) }
        for i in indices where self[i].isFolder { if let x = self[i].kids.remove(id) { return x } }
        return nil
    }
    mutating func update(_ id: String, _ f: (inout Bookmark) -> Void) {
        for i in indices { if self[i].id == id { f(&self[i]); return }; if self[i].isFolder { self[i].kids.update(id, f) } }
    }
    /* add into a folder (nil = top level) */
    mutating func insert(_ b: Bookmark, into folder: String?, at index: Int? = nil) {
        guard let folder else { if let index { insert(b, at: Swift.min(index, count)) } else { append(b) }; return }
        for i in indices {
            if self[i].id == folder { if let index { self[i].kids.insert(b, at: Swift.min(index, self[i].kids.count)) } else { self[i].kids.append(b) }; return }
            if self[i].isFolder { self[i].kids.insert(b, into: folder, at: index) }
        }
    }
    func folders(depth: Int = 0) -> [FolderRef] {
        var out: [FolderRef] = []
        for b in self where b.isFolder { out.append(FolderRef(id: b.id, name: b.title, depth: depth)); out += b.kids.folders(depth: depth + 1) }
        return out
    }
    func flat(path: String = "") -> [FlatBM] {
        var out: [FlatBM] = []
        for b in self { if b.isFolder { out += b.kids.flat(path: path.isEmpty ? b.title : path + " › " + b.title) } else { out.append(FlatBM(bm: b, path: path)) } }
        return out
    }
}
extension Bookmark {
    var inside: Int { kids.reduce(0) { $0 + ($1.isFolder ? $1.inside : 1) } }
    func contains(_ id: String) -> Bool { kids.contains { $0.id == id || $0.contains(id) } }
}

struct FolderRef: Identifiable, Equatable { let id: String; let name: String; let depth: Int }
struct FlatBM: Identifiable { let bm: Bookmark; let path: String; var id: String { bm.id } }

/* Older or partly written files still open: anything missing gets its usual value. */
extension KeyedDecodingContainer {
    func v<T: Decodable>(_ k: Key, _ d: T) -> T { (try? decodeIfPresent(T.self, forKey: k)) ?? d }
}
extension Tab {
    private enum K: String, CodingKey { case id, url, title, fav, seen }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = try c.decode(String.self, forKey: .id); url = c.v(.url, ""); title = c.v(.title, ""); fav = c.v(.fav, nil); seen = c.v(.seen, 0)
    }
}
extension Folder {
    private enum K: String, CodingKey { case id, name, open, tabs }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = try c.decode(String.self, forKey: .id); name = c.v(.name, "Folder"); open = c.v(.open, true); tabs = c.v(.tabs, [])
    }
}
extension Space {
    private enum K: String, CodingKey { case id, name, hue, isolated, items, folders, active }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = try c.decode(String.self, forKey: .id); name = c.v(.name, "Space"); hue = c.v(.hue, 40); isolated = c.v(.isolated, false)
        items = c.v(.items, []); folders = c.v(.folders, []); active = c.v(.active, nil)
    }
}
extension Bookmark {
    private enum K: String, CodingKey { case id, isFolder, url, title, icon, color, kids }
    init(from d: Decoder) throws {
        let c = try d.container(keyedBy: K.self)
        id = try c.decode(String.self, forKey: .id); isFolder = c.v(.isFolder, false); url = c.v(.url, ""); title = c.v(.title, "")
        icon = c.v(.icon, nil); color = c.v(.color, nil); kids = c.v(.kids, [])
    }
}
