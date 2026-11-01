import SwiftUI

/* The sidebar, like the Mac: the space's name, a new-scrap button, pinned tabs, tabs and folders, and the spaces
   along the bottom. Swipe a tab left to close it, right to pin it; press and hold for everything else. */
struct SidebarView: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var drawer: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(store.space.name).font(.hand(34)).foregroundStyle(th.ink).lineLimit(1)
                        .accessibilityIdentifier("spaceTitle")
                    Capsule().fill(th.tape).frame(width: 34, height: 3).offset(y: -4)
                }
                Spacer()
                Button(store.arranging ? "Done" : "Arrange") { withAnimation(.snappy) { store.arranging.toggle() } }
                    .font(.ui(13, .semibold)).foregroundStyle(store.arranging ? th.tape : th.ink2)
                    .accessibilityIdentifier("arrange")
            }
            .padding(.horizontal, 14).padding(.top, drawer ? 8 : 6)

            HStack(spacing: 8) {
                Button { open(.new) } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "plus").font(.system(size: 11, weight: .heavy)).foregroundStyle(.white).frame(width: 20, height: 20).background(th.tape, in: Circle())
                        Text("new scrap").font(.ui(14, .semibold)).foregroundStyle(th.ink2)
                        Spacer()
                    }
                    .padding(.horizontal, 10).frame(height: 38)
                    .background(th.card.opacity(0.55), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(th.line))
                }
                .buttonStyle(StampStyle()).accessibilityIdentifier("sidebarNew")
                Button { store.prompt = Prompt(title: "Name this folder", value: "", action: "newfolder:") } label: {
                    Image(systemName: "folder.badge.plus").font(.system(size: 15, weight: .medium)).foregroundStyle(th.ink2)
                        .frame(width: 38, height: 38)
                        .background(th.card.opacity(0.55), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(th.line))
                }
                .buttonStyle(StampStyle()).accessibilityIdentifier("newFolder").accessibilityLabel("New folder")
            }
            .padding(.horizontal, 12)

            if !store.s.pins.isEmpty { PinsGrid(drawer: drawer).padding(.horizontal, 12) }

            TabList(drawer: drawer)

            SpaceBar().padding(.horizontal, 12).padding(.bottom, drawer ? 10 : 8)
        }
    }
    private func open(_ m: CmdMode) { store.sidebarOpen = false; store.command = m }
}

private struct PinsGrid: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var drawer: Bool
    var body: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6) {
            ForEach(store.s.pins, id: \.self) { id in
                if let t = store.s.tabs[id] {
                    let on = store.current == id
                    Button { store.select(id); if drawer { store.sidebarOpen = false } } label: {
                        Fav(url: t.url, title: t.title, fav: t.fav, size: 20).frame(maxWidth: .infinity, minHeight: 40)
                            .background(on ? th.card : th.card.opacity(0.45), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(on ? th.tape.opacity(0.6) : th.line, lineWidth: on ? 1.5 : 1))
                            .opacity(store.browser?.isLive(id) == true || on ? 1 : 0.7)
                    }
                    .buttonStyle(StampStyle())
                    .accessibilityLabel(t.title).accessibilityIdentifier("pin:" + t.title)
                    .contextMenu {
                        Button { store.togglePin(id) } label: { Label("Unpin", systemImage: "pin.slash") }
                        Button { store.duplicate(id) } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
                        Button { UIPasteboard.general.string = t.url } label: { Label("Copy Address", systemImage: "link") }
                        Button(role: .destructive) { store.close(id) } label: { Label("Unload", systemImage: "moon.zzz") }
                    }
                }
            }
        }
    }
}

private struct TabList: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var drawer: Bool
    var body: some View {
        let sp = store.space
        List {
            if store.arranging {
                ForEach(sp.items, id: \.self) { k in row(k, arranging: true) }
                    .onMove { store.moveItems(from: $0, to: $1) }
            } else {
                ForEach(sp.items, id: \.self) { k in
                    if k.hasPrefix("f:"), let f = sp.folders.first(where: { "f:" + $0.id == k }) {
                        FolderRow(folder: f)
                        if f.open { ForEach(f.tabs, id: \.self) { TabRow(id: $0, drawer: drawer, indent: true) } }
                    } else { TabRow(id: k, drawer: drawer, indent: false) }
                }
            }
            if sp.items.isEmpty {
                Text("No scraps in this space yet").font(.ui(13)).foregroundStyle(th.ink3)
                    .listRowBackground(Color.clear).listRowSeparator(.hidden).padding(.top, 6)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.defaultMinListRowHeight, 34)
        .environment(\.editMode, .constant(store.arranging ? .active : .inactive))
        .animation(.snappy(duration: 0.25), value: sp.items)
        .animation(.snappy(duration: 0.25), value: sp.folders)
    }
    @ViewBuilder private func row(_ k: String, arranging: Bool) -> some View {
        if k.hasPrefix("f:"), let f = store.space.folders.first(where: { "f:" + $0.id == k }) { FolderRow(folder: f) } else { TabRow(id: k, drawer: drawer, indent: false) }
    }
}

private struct FolderRow: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var folder: Folder
    var body: some View {
        Button { withAnimation(.snappy(duration: 0.22)) { store.toggleFolder(folder.id) } } label: {
            HStack(spacing: 8) {
                Image(systemName: folder.open ? "folder" : "folder.fill").font(.system(size: 14, weight: .medium)).foregroundStyle(th.tape).frame(width: 20)
                Text(folder.name).font(.ui(14, .semibold)).foregroundStyle(th.ink).lineLimit(1)
                Text("\(folder.tabs.count)").font(.ui(12)).foregroundStyle(th.ink3)
                Spacer()
                Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(th.ink3)
                    .rotationEffect(.degrees(folder.open ? 90 : 0))
            }
            .padding(.horizontal, 10).frame(height: 34).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .listRowBackground(Color.clear).listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 1, leading: 8, bottom: 1, trailing: 8))
        .accessibilityIdentifier("folder:" + folder.name)
        .contextMenu {
            Button { store.sidebarOpen = false; store.command = .new; store.intoFolder = folder.id } label: { Label("New Scrap in Folder", systemImage: "plus") }
            Button { store.prompt = Prompt(title: "Rename this folder", value: folder.name, action: "renamefolder:" + folder.id) } label: { Label("Rename…", systemImage: "pencil") }
            Button { store.removeFolder(folder.id, closeTabs: false) } label: { Label("Ungroup", systemImage: "folder.badge.minus") }
            Button(role: .destructive) { store.removeFolder(folder.id, closeTabs: true) } label: { Label("Delete Folder and Tabs", systemImage: "trash") }
        }
    }
}

private struct TabRow: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var id: String
    var drawer: Bool
    var indent: Bool
    var body: some View {
        if let t = store.s.tabs[id] {
            let on = store.current == id || store.split.map { $0.a == id || $0.b == id } == true
            let live = store.browser?.isLive(id) == true
            HStack(spacing: 9) {
                Fav(url: t.url, title: t.title, fav: t.fav, size: 18).opacity(live || on ? 1 : 0.75)
                Text(t.title.isEmpty ? Web.host(t.url) : t.title).font(.ui(14, on ? .semibold : .medium)).foregroundStyle(on ? th.ink : th.ink.opacity(0.85)).lineLimit(1)
                Spacer(minLength: 0)
                if store.split.map({ $0.a == id || $0.b == id }) == true {
                    Image(systemName: "rectangle.split.2x1").font(.system(size: 11)).foregroundStyle(th.ink3)
                }
                if on && !store.arranging {
                    Button { withAnimation(.snappy) { store.close(id) } } label: { Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(th.ink3).frame(width: 26, height: 26).contentShape(Rectangle()) }
                        .buttonStyle(.plain).accessibilityLabel("Close").accessibilityIdentifier("closeTab")
                }
            }
            .padding(.leading, indent ? 26 : 10).padding(.trailing, 6).frame(height: 36)
            .background(on ? th.card : .clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .shadow(color: on ? .black.opacity(0.07) : .clear, radius: 2, y: 1)
            .contentShape(Rectangle())
            .onTapGesture { store.select(id); if drawer { store.sidebarOpen = false } }
            .listRowBackground(Color.clear).listRowSeparator(.hidden)
            .listRowInsets(EdgeInsets(top: 1, leading: 8, bottom: 1, trailing: 8))
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityIdentifier("tab:" + (t.title.isEmpty ? Web.host(t.url) : t.title))
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                Button(role: .destructive) { withAnimation(.snappy) { store.close(id) } } label: { Label("Close", systemImage: "xmark") }
            }
            .swipeActions(edge: .leading) {
                Button { store.togglePin(id) } label: { Label("Pin", systemImage: "pin") }.tint(th.tape)
            }
            .contextMenu { TabMenu(id: id) }
        }
    }
}

struct TabMenu: View {
    @Environment(Store.self) private var store
    var id: String
    var body: some View {
        if let t = store.s.tabs[id] {
            Button { store.togglePin(id) } label: { Label("Pin", systemImage: "pin") }
            Button { store.duplicate(id) } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
            Button { UIPasteboard.general.string = t.url } label: { Label("Copy Address", systemImage: "link") }
            if store.browser?.wide == true, store.current != id {
                Button { store.splitWith(id) } label: { Label("Open in Split View", systemImage: "rectangle.split.2x1") }
            }
            if let p = store.split, p.a == id || p.b == id {
                Button { store.toggleSplit() } label: { Label("Separate Split", systemImage: "rectangle") }
            }
            Menu {
                ForEach(store.space.folders) { f in Button(f.name) { store.moveToFolder(id, f.id) } }
                Button { store.prompt = Prompt(title: "Name this folder", value: "", action: "newfolder:" + id) } label: { Label("New Folder…", systemImage: "folder.badge.plus") }
                if store.folderOf(id) != nil { Button { store.moveToFolder(id, nil) } label: { Label("Out of the Folder", systemImage: "arrow.up.left") } }
            } label: { Label("Move to Folder", systemImage: "folder") }
            if store.s.spaces.count > 1 {
                Menu { ForEach(store.s.spaces.filter { $0.id != store.s.cur }) { sp in Button(sp.name) { store.moveTab(id, toSpace: sp.id) } } } label: { Label("Move to Space", systemImage: "square.stack") }
            }
            Divider()
            Button(role: .destructive) { store.close(id) } label: { Label("Close", systemImage: "xmark") }
        }
    }
}

/* the spaces, as little paper tabs along the bottom */
struct SpaceBar: View {
    @Environment(Store.self) private var store
    @Environment(\.theme) private var th
    var body: some View {
        HStack(spacing: 6) {
            ForEach(store.s.spaces) { sp in
                let on = sp.id == store.s.cur, p = Paper.pal(sp.hue)
                Button { withAnimation(.snappy(duration: 0.22)) { store.switchSpace(sp.id) } } label: {
                    HStack(spacing: 4) {
                        if sp.isolated { Image(systemName: "lock.fill").font(.system(size: 8, weight: .bold)) }
                        if on { Text(sp.name).font(.ui(12, .bold)).lineLimit(1) }
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, on ? 12 : 0).frame(minWidth: on ? 0 : 26, minHeight: 26)
                    .background(Color(hex: p.tape), in: UnevenRoundedRectangle(topLeadingRadius: 7, bottomLeadingRadius: 3, bottomTrailingRadius: 3, topTrailingRadius: 7, style: .continuous))
                    .opacity(on ? 1 : 0.8)
                }
                .buttonStyle(StampStyle())
                .accessibilityLabel(sp.name).accessibilityIdentifier("space:" + sp.name)
                .contextMenu {
                    Button { store.prompt = Prompt(title: "Rename this space", value: sp.name, action: "renamespace:" + sp.id) } label: { Label("Rename…", systemImage: "pencil") }
                    Menu { ForEach(Paper.order, id: \.self) { h in Button { store.setSpaceColor(sp.id, h) } label: { Label(Paper.pal(h).name, systemImage: sp.hue == h ? "checkmark" : "circle.fill") } } } label: { Label("Color", systemImage: "paintpalette") }
                    Button { store.setIsolated(sp.id, !sp.isolated) } label: { Label(sp.isolated ? "Share Logins with Other Spaces" : "Keep Logins Separate", systemImage: sp.isolated ? "lock.open" : "lock") }
                    Divider()
                    Button(role: .destructive) { store.deleteSpace(sp.id) } label: { Label("Delete Space", systemImage: "trash") }.disabled(store.s.spaces.count < 2)
                }
            }
            if store.s.spaces.count < 6 {
                Button { store.prompt = Prompt(title: "Name this space", value: "", action: "newspace") } label: {
                    Image(systemName: "plus").font(.system(size: 11, weight: .bold)).foregroundStyle(th.ink2).frame(width: 26, height: 26)
                        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(th.ink3.opacity(0.6), style: StrokeStyle(lineWidth: 1, dash: [3, 2])))
                }
                .buttonStyle(StampStyle()).accessibilityLabel("New space").accessibilityIdentifier("addSpace")
            }
            Spacer(minLength: 0)
        }
        .padding(.top, 4)
        .overlay(alignment: .bottom) { Rectangle().fill(th.ink.opacity(0.2)).frame(height: 1.5).offset(y: 1) }
    }
}
