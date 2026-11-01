import XCTest
import WebKit
@testable import Washi

@MainActor
final class ModelTests: XCTestCase {
    private func tmp() -> URL {
        let u = FileManager.default.temporaryDirectory.appendingPathComponent("washi-test-" + UUID().uuidString)
        try? FileManager.default.createDirectory(at: u, withIntermediateDirectories: true)
        return u
    }

    func testTypingAnAddressOrASearch() {
        XCTAssertEqual(Web.toURL("example.com", engine: "google"), "https://example.com")
        XCTAssertEqual(Web.toURL("example.com/a?b=1", engine: "google"), "https://example.com/a?b=1")
        XCTAssertEqual(Web.toURL("localhost:8765/p1.html", engine: "google"), "http://localhost:8765/p1.html")
        XCTAssertEqual(Web.toURL("192.168.1.1", engine: "google"), "http://192.168.1.1")
        XCTAssertEqual(Web.toURL("http://x.org", engine: "google"), "http://x.org")
        XCTAssertEqual(Web.toURL("cats and dogs", engine: "duckduckgo"), "https://duckduckgo.com/?q=cats%20and%20dogs")
        XCTAssertEqual(Web.toURL("a&b", engine: "google"), "https://www.google.com/search?q=a%26b")
        XCTAssertEqual(Web.toURL("!yt lofi beats", engine: "google"), "https://www.youtube.com/results?search_query=lofi%20beats")
        XCTAssertEqual(Web.toURL("swift !w", engine: "google"), "https://en.wikipedia.org/w/index.php?search=swift")
        XCTAssertEqual(Web.toURL("!nope cats", engine: "bing"), "https://www.bing.com/search?q=!nope%20cats")
        XCTAssertEqual(Web.host("https://www.example.com/a"), "example.com")
        XCTAssertEqual(Web.host("http://localhost:8765/x"), "localhost:8765")
        XCTAssertEqual(Web.pretty("https://news.ycombinator.com/item?id=1").path, "/item?id=1")
        XCTAssertFalse(Web.looksLikeURL("hello world"))
        XCTAssertTrue(Web.looksLikeURL("github.com/ColtonCraig"))
    }

    func testTabsFoldersAndSpaces() {
        let st = Store(dir: tmp())
        XCTAssertEqual(st.s.spaces.map(\.name), ["Home", "Work", "Play"])
        XCTAssertTrue(st.s.spaces[1].isolated, "Work keeps its own logins from the start")
        let a = st.openTab("https://a.example"), b = st.openTab("https://b.example")
        XCTAssertEqual(st.space.items, [b, a], "new scraps go on top")
        XCTAssertEqual(st.current, b)
        st.setPref { $0.newTabPos = "bottom" }
        let c = st.openTab("https://c.example", bg: true)
        XCTAssertEqual(st.space.items.last, c, "or at the bottom")
        XCTAssertEqual(st.current, b, "a background tab doesn't take over")
        // folders
        let f = st.newFolder("Reading", with: a)
        XCTAssertEqual(st.space.folders.first?.tabs, [a])
        XCTAssertEqual(st.space.items.first, "f:" + f)
        XCTAssertEqual(st.spaceTabs(st.space).sorted(), [a, b, c].sorted())
        st.moveToFolder(c, f)
        XCTAssertEqual(st.space.folders.first?.tabs, [c, a])
        st.removeFolder(f, closeTabs: false)
        XCTAssertTrue(st.space.folders.isEmpty)
        XCTAssertEqual(Set(st.spaceTabs(st.space)), [a, b, c], "ungrouping keeps the tabs")
        // pins, closing
        st.togglePin(c)
        XCTAssertEqual(st.s.pins, [c]); XCTAssertFalse(st.space.items.contains(c))
        st.close(b)
        XCTAssertNil(st.s.tabs[b]); XCTAssertEqual(st.current, a, "closing the open tab shows the next one")
        st.close(c)
        XCTAssertNotNil(st.s.tabs[c], "pinned tabs unload instead of closing")
        // spaces
        st.switchSpace("work")
        XCTAssertNil(st.current); XCTAssertTrue(st.spaceTabs(st.space).isEmpty)
        let w = st.openTab("https://work.example")
        st.switchSpace("home")
        XCTAssertEqual(st.current, a); XCTAssertFalse(st.spaceTabs(st.space).contains(w))
        st.moveTab(a, toSpace: "work")
        XCTAssertEqual(Set(st.spaceTabs(st.s.spaces[1])), [a, w])
        st.addSpace("Side")
        XCTAssertEqual(st.space.name, "Side"); XCTAssertEqual(st.s.spaces.count, 4)
        XCTAssertFalse(Set(st.s.spaces.map(\.hue)).count < 4, "each space gets its own colour")
        st.deleteSpace(st.space.id)
        XCTAssertEqual(st.s.spaces.count, 3)
    }

    func testSplitView() {
        let st = Store(dir: tmp())
        let a = st.openTab("https://a.example"), b = st.openTab("https://b.example")
        st.toggleSplit()
        XCTAssertEqual(st.split?.a, b); XCTAssertEqual(st.split?.b, a, "splits with the tab you used last")
        XCTAssertEqual(st.current, a)
        st.select(b); XCTAssertEqual(st.current, b); XCTAssertNotNil(st.split, "picking a half keeps the split")
        st.setRatio(0.95); XCTAssertEqual(st.s.split?.ratio, 0.8, "a half can't be squeezed away")
        let c = st.openTab("https://c.example")
        XCTAssertNil(st.split, "opening another page leaves split view"); XCTAssertEqual(st.current, c)
        st.select(a); st.splitWith(b); st.close(b)
        XCTAssertNil(st.split); XCTAssertEqual(st.current, a, "closing one half: the other takes the whole screen")
    }

    func testBookmarks() {
        let st = Store(dir: tmp())
        st.openTab("https://news.example/today")
        st.pageChanged(st.current!, title: "Today's news")
        st.star()
        XCTAssertEqual(st.s.bookmarks.count, 1)
        guard case .editBookmark(let id, let fresh)? = st.sheet else { return XCTFail("☆ opens the editor") }
        XCTAssertTrue(fresh); XCTAssertEqual(st.s.bookmarks[0].title, "Today's news")
        st.star()
        XCTAssertEqual(st.s.bookmarks.count, 1, "☆ again edits instead of adding twice")
        let f = st.newBookmarkFolder(name: "News")
        st.saveBookmark(f, title: "News", url: nil, icon: "📰", color: "#3d63ff", parent: nil)
        st.saveBookmark(id, title: "Today", url: "https://news.example/today", icon: nil, color: nil, parent: f)
        XCTAssertEqual(st.s.bookmarks.map(\.title), ["News"])
        XCTAssertEqual(st.s.bookmarks[0].kids.map(\.title), ["Today"])
        XCTAssertEqual(st.s.bookmarks[0].icon, "📰"); XCTAssertEqual(st.s.bookmarks[0].color, "#3d63ff")
        let inner = st.newBookmarkFolder(in: f, name: "Inner")
        st.saveBookmark(f, title: "News", url: nil, icon: "📰", color: nil, parent: inner)
        XCTAssertEqual(st.s.bookmarks.parent(of: f) ?? "x", nil, "a folder can't go inside itself")
        XCTAssertNotNil(st.bookmark(for: "https://news.example/today"))
        XCTAssertEqual(st.s.bookmarks.flat().map(\.path), ["News"])
        st.deleteBookmark(f)
        XCTAssertTrue(st.s.bookmarks.isEmpty)
        st.toast?.undo?()
        XCTAssertEqual(st.s.bookmarks.first?.inside, 1, "Undo puts the folder back with what was in it")
        st.saveBookmark(id, title: "x", url: "not a link", icon: nil, color: nil, parent: f)
        XCTAssertEqual(st.s.bookmarks.find(id)?.url, "https://news.example/today", "a bad address is ignored")
    }

    func testSavedBetweenLaunches() {
        let dir = tmp()
        var keep = ""
        do {
            let st = Store(dir: dir)
            keep = st.openTab("https://keep.example")
            st.newFolder("Box", with: keep)
            st.togglePin(st.openTab("https://pin.example"))
            st.s.bookmarks.append(Bookmark(id: "b1", url: "https://bm.example", title: "BM"))
            st.setIsolated("home", true)
            st.saveNow()
        }
        let again = Store(dir: dir)
        XCTAssertEqual(again.space.folders.first?.tabs, [keep])
        XCTAssertEqual(again.s.pins.count, 1)
        XCTAssertEqual(again.s.bookmarks.first?.title, "BM")
        XCTAssertTrue(again.space.isolated)
        // an older or damaged file still opens
        try? Data(#"{"spaces":[{"id":"x","name":"X","hue":40,"items":["gone"],"folders":[]}],"prefs":{"mode":"dark"}}"#.utf8).write(to: dir.appendingPathComponent("state.json"))
        let old = Store(dir: dir)
        XCTAssertEqual(old.space.name, "X"); XCTAssertTrue(old.space.items.isEmpty, "tabs that are gone are dropped"); XCTAssertEqual(old.s.prefs.mode, "dark"); XCTAssertTrue(old.s.prefs.blocking)
        try? Data("not json".utf8).write(to: dir.appendingPathComponent("state.json"))
        XCTAssertEqual(Store(dir: dir).s.spaces.count, 3, "a broken file starts fresh instead of crashing")
    }

    func testSeparateLoginsGetTheirOwnStore() {
        XCTAssertEqual(Browser.uuid("work"), Browser.uuid("work"))
        XCTAssertNotEqual(Browser.uuid("work"), Browser.uuid("home"))
    }

    func testBlocklistCompiles() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "blocklist", withExtension: "json"), "the blocklist ships with the app")
        let json = try String(contentsOf: url, encoding: .utf8)
        let rules = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [[String: Any]]
        XCTAssertGreaterThan(rules?.count ?? 0, 20000)
        let done = expectation(description: "compiled")
        var ok = false, why = ""
        WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "washi-test-" + UUID().uuidString, encodedContentRuleList: json) { list, err in
            ok = list != nil; why = err.map { "\($0)" } ?? ""; done.fulfill()
        }
        wait(for: [done], timeout: 120)
        XCTAssertTrue(ok, "WebKit accepts the blocklist: " + why)
    }
}
