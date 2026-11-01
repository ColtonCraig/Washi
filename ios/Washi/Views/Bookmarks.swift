import SwiftUI

/* ---------- the bookmarks bar (big screens): a slim row over the page; folders open as menus ---------- */
struct BookmarksBar: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 3) {
                ForEach(store.s.bookmarks) { b in
                    if b.isFolder {
                        Menu { BookmarkMenu(items: b.kids) } label: { FolderChip(b: b) }
                            .accessibilityIdentifier("bmchip:" + b.title)
                            .contextMenu { chipMenu(b) }
                    } else {
                        Button { store.open(bookmark: b) } label: {
                            HStack(spacing: 6) {
                                Fav(url: b.url, title: b.label, fav: favFor(b.url), size: 16)
                                Text(b.label).font(.ui(13, .medium)).foregroundStyle(th.ink).lineLimit(1)
                            }
                            .padding(.horizontal, 9).frame(height: 28).frame(maxWidth: 190)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(StampStyle())
                        .accessibilityIdentifier("bmchip:" + b.label)
                        .contextMenu { chipMenu(b) }
                    }
                }
            }
            .padding(.horizontal, 10)
        }
        .frame(height: 32)
    }
    private func favFor(_ url: String) -> String? {
        let h = Web.host(url)
        return store.s.tabs.values.first { $0.url == url && $0.fav != nil }?.fav ?? store.s.tabs.values.first { Web.host($0.url) == h && $0.fav != nil }?.fav
    }
    @ViewBuilder private func chipMenu(_ b: Bookmark) -> some View {
        if !b.isFolder { Button { store.open(bookmark: b, bg: true); store.show("Opened in the background") } label: { Label("Open in Background", systemImage: "square.on.square") } }
        Button { store.sheet = .editBookmark(b.id, fresh: false) } label: { Label("Edit…", systemImage: "pencil") }
        Button(role: .destructive) { store.deleteBookmark(b.id) } label: { Label(b.isFolder ? "Delete Folder" : "Delete", systemImage: "trash") }
        Divider()
        Button { store.setPref { $0.bookmarkBar = false } } label: { Label("Hide Bookmarks Bar", systemImage: "eye.slash") }
    }
}
struct FolderChip: View {
    @Environment(\.theme) private var th
    var b: Bookmark
    var body: some View {
        let c = b.color.map { Color(hex: $0) } ?? Color(hex: "#f2d58f")
        HStack(spacing: 5) {
            if let e = b.icon { Text(e).font(.system(size: 13)) } else { Image(systemName: "folder.fill").font(.system(size: 12)).foregroundStyle(c.mix(with: .black, by: 0.25)) }
            Text(b.title).font(.ui(13, .semibold)).foregroundStyle(th.ink).lineLimit(1)
        }
        .padding(.horizontal, 9).frame(height: 26)
        .background(c.opacity(th.dark ? 0.35 : 0.3), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
}
/* a folder's contents as a menu; folders inside become submenus */
struct BookmarkMenu: View {
    @Environment(Store.self) private var store
    var items: [Bookmark]
    var body: some View {
        if items.isEmpty { Text("Empty") }
        ForEach(items) { k in
            if k.isFolder {
                Menu { AnyView(BookmarkMenu(items: k.kids)) } label: { if let e = k.icon { Text(e + "  " + k.title) } else { Label(k.title, systemImage: "folder") } }
            } else {
                Button(k.label) { store.open(bookmark: k) }
            }
        }
        let n = items.filter { !$0.isFolder }
        if n.count > 1 {
            Divider()
            Button { for (i, k) in n.enumerated() { store.open(bookmark: k, bg: i > 0) } } label: { Label("Open All \(n.count)", systemImage: "square.stack") }
        }
    }
}
extension Color {
    func mix(with o: Color, by t: Double) -> Color {
        let a = UIColor(self), b = UIColor(o)
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0, r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        a.getRed(&r1, green: &g1, blue: &b1, alpha: &a1); b.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        return Color(red: r1 + (r2 - r1) * t, green: g1 + (g2 - g1) * t, blue: b1 + (b2 - b1) * t)
    }
}

/* ---------- the bookmarks sheet: folders you can step into, swipe to delete, Edit to reorder ---------- */
struct BookmarksSheet: View {
    @Environment(Store.self) private var store
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack { BookmarkList(parent: nil, dismissAll: { dismiss() }) }
    }
}
struct BookmarkList: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var parent: String?
    var dismissAll: () -> Void
    @State private var editing: String? = nil
    @State private var fresh = false
    @State private var q = ""
    var body: some View {
        let items = parent.flatMap { store.s.bookmarks.find($0)?.kids } ?? store.s.bookmarks
        List {
            if !q.isEmpty {
                ForEach(store.s.bookmarks.flat().filter { ($0.bm.label + " " + $0.bm.url).localizedCaseInsensitiveContains(q) }) { x in
                    Button { store.open(bookmark: x.bm); dismissAll() } label: { BMRow(b: x.bm, sub: x.path.isEmpty ? Web.host(x.bm.url) : x.path) }
                }
            } else {
                ForEach(items) { b in
                    Group {
                        if b.isFolder {
                            NavigationLink { BookmarkList(parent: b.id, dismissAll: dismissAll) } label: { BMRow(b: b, sub: "\(b.inside) inside") }
                        } else {
                            Button { store.open(bookmark: b); dismissAll() } label: { BMRow(b: b, sub: Web.host(b.url)) }
                        }
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) { store.deleteBookmark(b.id) } label: { Label("Delete", systemImage: "trash") }
                        Button { fresh = false; editing = b.id } label: { Label("Edit", systemImage: "pencil") }.tint(th.ink2)
                    }
                    .contextMenu {
                        Button { fresh = false; editing = b.id } label: { Label("Edit…", systemImage: "pencil") }
                        if !b.isFolder { Button { store.open(bookmark: b, bg: true); store.show("Opened in the background") } label: { Label("Open in Background", systemImage: "square.on.square") } }
                        Button(role: .destructive) { store.deleteBookmark(b.id) } label: { Label("Delete", systemImage: "trash") }
                    }
                }
                .onMove { store.moveBookmarks(in: parent, from: $0, to: $1) }
                if items.isEmpty {
                    Text(parent == nil ? "No bookmarks yet. Tap ☆ (or ⋯ › Bookmark This Page) on any page." : "Empty folder").font(.ui(14)).foregroundStyle(.secondary)
                }
            }
        }
        .searchable(text: $q, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Search bookmarks")
        .navigationTitle(parent.flatMap { store.s.bookmarks.find($0)?.title } ?? "Bookmarks")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) { if parent == nil { Button("Done") { dismissAll() } } }
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { fresh = true; editing = store.newBookmarkFolder(in: parent) } label: { Image(systemName: "folder.badge.plus") }.accessibilityLabel("New folder").accessibilityIdentifier("bmNewFolder")
                EditButton()
            }
        }
        .sheet(item: Binding(get: { editing.map { IdBox(id: $0) } }, set: { editing = $0?.id })) { e in
            NavigationStack { BookmarkEditor(id: e.id, fresh: fresh) }.environment(store).environment(\.theme, th).tint(th.tape)
        }
    }
}
struct IdBox: Identifiable { let id: String }
struct BMRow: View {
    @Environment(\.theme) private var th
    var b: Bookmark
    var sub: String
    var body: some View {
        HStack(spacing: 12) {
            if b.isFolder {
                let c = b.color.map { Color(hex: $0) } ?? Color(hex: "#f2d58f")
                Group { if let e = b.icon { Text(e).font(.system(size: 17)) } else { Image(systemName: "folder.fill").foregroundStyle(c.mix(with: .black, by: 0.25)) } }
                    .frame(width: 32, height: 32).background(c.opacity(0.3), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            } else { Fav(url: b.url, title: b.label, fav: nil, size: 26).frame(width: 32) }
            VStack(alignment: .leading, spacing: 1) {
                Text(b.isFolder ? b.title : b.label).font(.ui(15, .semibold)).foregroundStyle(th.ink).lineLimit(1)
                Text(sub).font(.ui(12)).foregroundStyle(th.ink2).lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("bm:" + (b.isFolder ? b.title : b.label))
    }
}

/* ---------- edit a bookmark or a folder ---------- */
struct BookmarkEditor: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    @Environment(\.dismiss) private var dismiss
    var id: String
    var fresh: Bool
    @State private var name = ""
    @State private var url = ""
    @State private var icon: String? = nil
    @State private var custom = ""
    @State private var color: String? = nil
    @State private var parent: String? = nil
    @State private var loaded = false
    @State private var bad = false
    var body: some View {
        let b = store.s.bookmarks.find(id)
        Form {
            if let b {
                Section {
                    TextField(b.isFolder ? "Folder name" : "Name", text: $name).font(.ui(16)).accessibilityIdentifier("bmName")
                    if !b.isFolder {
                        TextField("Address", text: $url).font(.ui(15)).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                            .foregroundStyle(bad ? .red : th.ink).accessibilityIdentifier("bmURL")
                    }
                }
                Section("In") {
                    Picker("Folder", selection: $parent) {
                        Text("Bookmarks").tag(String?.none)
                        ForEach(store.s.bookmarks.folders().filter { f in f.id != id && !b.contains(f.id) }) { f in
                            Text(String(repeating: "   ", count: f.depth) + f.name).tag(Optional(f.id))
                        }
                    }
                    .accessibilityIdentifier("bmParent")
                }
                if b.isFolder {
                    Section("Icon") {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 8), spacing: 8) {
                            emojiButton(nil)
                            ForEach(Paper.emoji, id: \.self) { emojiButton($0) }
                        }
                        .padding(.vertical, 4)
                        TextField("Or type any emoji", text: $custom).accessibilityIdentifier("bmEmoji")
                            .onChange(of: custom) { _, v in if let first = v.trimmingCharacters(in: .whitespaces).first { let s = String(first); if custom != s { custom = s }; icon = s } }
                    }
                    Section("Color") {
                        HStack(spacing: 8) {
                            ForEach(Paper.folderColors.indices, id: \.self) { i in
                                let c = Paper.folderColors[i]
                                Button { color = c.0 } label: {
                                    Circle().fill(c.0.map { Color(hex: $0) } ?? Color(hex: "#efe6d2")).frame(width: 26, height: 26)
                                        .overlay(Circle().strokeBorder(.black.opacity(0.12)))
                                        .padding(3).overlay(Circle().strokeBorder(color == c.0 ? th.tape : .clear, lineWidth: 2))
                                }
                                .buttonStyle(.plain).accessibilityLabel(c.1).accessibilityIdentifier("color:" + c.1)
                            }
                        }
                    }
                }
                Section {
                    Button(role: .destructive) { store.deleteBookmark(id, undoable: !fresh); dismiss() } label: { Text(b.isFolder ? "Delete Folder" : (fresh ? "Remove Bookmark" : "Delete Bookmark")) }
                        .accessibilityIdentifier("bmDelete")
                }
            }
        }
        .navigationTitle(b?.isFolder == true ? (fresh ? "New Folder" : "Edit Folder") : (fresh ? "Bookmarked" : "Edit Bookmark"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { if fresh && b?.isFolder == true && (b?.kids.isEmpty ?? true) { store.deleteBookmark(id, undoable: false) }; dismiss() }.accessibilityIdentifier("bmCancel") }
            ToolbarItem(placement: .confirmationAction) { Button("Done") { save() }.fontWeight(.bold).accessibilityIdentifier("bmDone") }
        }
        .onAppear {
            guard !loaded, let b else { return }
            loaded = true; name = b.title; url = b.url; icon = b.icon; color = b.color
            parent = store.s.bookmarks.parent(of: id) ?? nil
            if let i = b.icon, !Paper.emoji.contains(i) { custom = i }
        }
    }
    private func emojiButton(_ e: String?) -> some View {
        Button { icon = e; custom = "" } label: {
            Group { if let e { Text(e).font(.system(size: 20)) } else { Image(systemName: "folder").font(.system(size: 16)).foregroundStyle(th.ink2) } }
                .frame(width: 34, height: 34)
                .background(icon == e ? th.tape.opacity(0.16) : .clear, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(icon == e ? th.tape : .clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain).accessibilityLabel(e ?? "Paper folder").accessibilityIdentifier("emoji:" + (e ?? "none"))
    }
    private func save() {
        guard let b = store.s.bookmarks.find(id) else { dismiss(); return }
        var u = url.trimmingCharacters(in: .whitespaces)
        if !b.isFolder {
            if !Web.isWeb(u) && Web.looksLikeURL(u) { u = "https://" + u }
            guard Web.isWeb(u) else { bad = true; return }
        }
        store.saveBookmark(id, title: name.trimmingCharacters(in: .whitespaces), url: b.isFolder ? nil : u, icon: icon, color: color, parent: parent)
        dismiss()
    }
}

/* ---------- history ---------- */
struct HistorySheet: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    @Environment(\.dismiss) private var dismiss
    @State private var q = ""
    @State private var confirm = false
    var body: some View {
        let list = store.history.filter { q.isEmpty || ($0.title + " " + $0.url).localizedCaseInsensitiveContains(q) }.prefix(500)
        let groups = Dictionary(grouping: list, by: { Calendar.current.startOfDay(for: Date(timeIntervalSince1970: $0.t)) }).map { DayGroup(day: $0.key, items: $0.value) }.sorted { $0.day > $1.day }
        NavigationStack {
            List {
                ForEach(groups) { g in
                    Section(g.day.formatted(.dateTime.weekday(.wide).month().day())) {
                        ForEach(g.items, id: \.url) { h in
                            Button { store.openTab(h.url); dismiss() } label: {
                                HStack(spacing: 12) {
                                    Fav(url: h.url, title: h.title, fav: nil, size: 24)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(h.title.isEmpty ? Web.host(h.url) : h.title).font(.ui(15, .semibold)).foregroundStyle(th.ink).lineLimit(1)
                                        Text(Web.host(h.url)).font(.ui(12)).foregroundStyle(th.ink2)
                                    }
                                }
                            }
                            .swipeActions { Button(role: .destructive) { store.forget(h.url) } label: { Label("Forget", systemImage: "trash") } }
                        }
                    }
                }
                if list.isEmpty { Text(q.isEmpty ? "No history yet." : "Nothing matches.").foregroundStyle(.secondary) }
            }
            .searchable(text: $q, prompt: "Search history")
            .navigationTitle("History").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) { Button("Clear", role: .destructive) { confirm = true }.disabled(store.history.isEmpty) }
            }
            .confirmationDialog("Clear all history?", isPresented: $confirm, titleVisibility: .visible) { Button("Clear History", role: .destructive) { store.clearHistory() } }
        }
    }
}

struct DayGroup: Identifiable { let day: Date; let items: [Visit]; var id: Date { day } }
