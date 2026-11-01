import XCTest

/* Taps through Washi like a person: on a normal iPhone (the Duo folded) and on a big screen (the Duo open, stood in
   for by an iPad mini, and a phone turned on its side). Pages come from a little server on the test Mac. */
final class WashiUITests: XCTestCase {
    var app: XCUIApplication!
    let base = "localhost:8765/"

    override func setUp() {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app = XCUIApplication()
        app.launchArguments = ["-fresh"]
        app.launch()
    }
    override func tearDown() { XCUIDevice.shared.orientation = .portrait }

    // MARK: helpers
    private var wide: Bool { app.buttons["splitButton"].exists }            // only the big-screen top bar has it
    private func retype(_ f: XCUIElement, _ text: String) {
        f.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
        f.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 60) + text)
    }
    private func el(_ id: String) -> XCUIElement { app.descendants(matching: .any)[id] }
    private func shot(_ name: String) {
        let s = app.screenshot()
        let a = XCTAttachment(screenshot: s); a.name = name; a.lifetime = .keepAlways; add(a)
        if let dir = ProcessInfo.processInfo.environment["SHOTS"] {
            let dev = UIDevice.current.name.replacingOccurrences(of: " ", with: "-")
            try? s.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(dev)-\(name).png"))
        }
    }
    private func waitFor(_ e: XCUIElement, _ what: String, _ t: TimeInterval = 10) { XCTAssertTrue(e.waitForExistence(timeout: t), what) }
    private func gone(_ e: XCUIElement, _ t: TimeInterval = 5) -> Bool {
        let p = NSPredicate(format: "exists == false")
        return XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: p, object: e)], timeout: t) == .completed
    }
    private func open(_ page: String, title: String) {
        app.buttons["newTab"].tap()
        let f = app.textFields["commandField"]
        waitFor(f, "the command bar opens with the keyboard")
        f.typeText(base + page + "\n")
        waitFor(app.webViews.staticTexts[title], "\(title) loads", 20)
    }
    private func sidebar() { if !wide && !el("spaceTitle").exists { app.buttons["sidebarButton"].tap(); waitFor(el("spaceTitle"), "the sidebar slides in") } }
    private func closeSidebar() { if !wide && el("sidebarDim").exists { el("sidebarDim").tap(); _ = gone(el("spaceTitle")) } }
    private func menu(_ item: String) {
        app.buttons["menu"].tap()
        let b = app.buttons[item]; waitFor(b, "the ⋯ menu has \(item)"); b.tap()
    }
    private func address() -> String { app.buttons["address"].label }

    // MARK: the everyday things, on whatever screen this is
    func testEverydayBrowsing() {
        waitFor(app.buttons["emptyNew"], "a fresh start shows the empty note")
        shot("01-empty")
        open("p1.html", title: "Test page 1")
        XCTAssertEqual(address(), "localhost:8765", "the address bar shows the site")
        open("p2.html", title: "Test page 2")
        // links inside a page, and back
        app.webViews.links["Go to page 3"].tap()
        waitFor(app.webViews.staticTexts["Test page 3"], "a link inside the page works")
        app.buttons["back"].tap()
        waitFor(app.webViews.staticTexts["Test page 2"], "Back goes back")
        shot("02-page")

        // the sidebar lists both tabs; tapping one switches to it
        sidebar()
        waitFor(el("tab:Test page 1"), "the first tab is in the sidebar")
        XCTAssertTrue(el("tab:Test page 2").exists)
        shot("03-sidebar")
        el("tab:Test page 1").tap()
        waitFor(app.webViews.staticTexts["Test page 1"], "tapping a tab shows it")
        closeSidebar()

        // ☆ bookmark this page, rename it in the editor
        if wide { app.buttons["star"].tap() } else { menu("Bookmark This Page") }
        let name = app.textFields["bmName"]; waitFor(name, "the bookmark editor opens")
        shot("04-bookmark-editor")
        retype(name, "Page one")
        app.buttons["bmDone"].tap()
        XCTAssertTrue(gone(name), "Done closes the editor")

        // the bookmarks sheet: a new folder with an emoji and a colour
        menu("Bookmarks")
        waitFor(el("bm:Page one"), "the bookmark is in the bookmarks sheet")
        app.buttons["bmNewFolder"].tap()
        let fname = app.textFields["bmName"]; waitFor(fname, "a new folder opens its editor")
        retype(fname, "Work stuff")
        el("emoji:💼").tap(); el("color:Blueberry").tap()
        shot("05-folder-editor")
        app.buttons["bmDone"].tap()
        waitFor(el("bm:Work stuff"), "the folder is in the list")
        shot("06-bookmarks")
        app.buttons["Done"].firstMatch.tap()
        XCTAssertTrue(gone(el("bm:Work stuff")), "the sheet closes")

        // the command bar finds the bookmark
        app.buttons["newTab"].tap()
        let f = app.textFields["commandField"]; waitFor(f, "command bar")
        f.typeText("page one")
        waitFor(el("result:Page one"), "typing finds the bookmark")
        shot("07-command-bar")
        if el("commandCancel").exists { el("commandCancel").tap() } else { el("commandDim").coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.3)).tap() }
        XCTAssertTrue(gone(f), "the command bar closes")

        // a link that opens a new window becomes a new tab
        open("links.html", title: "Links")
        app.webViews.links["Open page 3 in a new window"].tap()
        waitFor(app.webViews.staticTexts["Test page 3"], "target=_blank opens in a new tab", 15)

        // swipe to close a tab
        sidebar()
        let row = el("tab:Test page 2"); waitFor(row, "tab row")
        row.swipeLeft()
        if app.buttons["Close"].firstMatch.waitForExistence(timeout: 2), row.exists { app.buttons["Close"].firstMatch.tap() }
        XCTAssertTrue(gone(row), "swiping left closes the tab")

        // spaces: Work is empty and has its own tabs
        el("space:Work").tap()
        XCTAssertTrue(el("spaceTitle").waitForExistence(timeout: 3) && el("spaceTitle").label == "Work", "switching to Work")
        XCTAssertFalse(el("tab:Test page 1").exists, "Work has its own tabs")
        shot("08-work-space")
        el("space:Home").tap()
        waitFor(el("tab:Test page 1"), "back in Home, the tabs are there")
        // a new space by name
        el("addSpace").tap()
        let alert = app.alerts.firstMatch; waitFor(alert, "asks for a name")
        alert.textFields.firstMatch.typeText("Side")
        alert.buttons["Save"].tap()
        XCTAssertTrue(el("spaceTitle").waitForExistence(timeout: 3) && el("spaceTitle").label == "Side", "the new space opens")
        el("space:Home").tap()
        closeSidebar()
        sleep(1)

        // everything is still there after quitting
        app.terminate()
        app.launchArguments = []
        app.launch()
        waitFor(app.webViews.staticTexts.firstMatch, "the last page comes back", 20)
        sidebar()
        waitFor(el("tab:Test page 1"), "tabs come back after quitting")
        XCTAssertTrue(el("space:Side").exists, "and spaces")
        closeSidebar()
        menu("Bookmarks")
        waitFor(el("bm:Page one"), "and bookmarks")
        shot("09-after-restart")
    }

    // MARK: the big screen: the Duo open (a phone on its side switches the same way)
    func testBigScreen() {
        if !wide { XCUIDevice.shared.orientation = .landscapeLeft; _ = app.buttons["splitButton"].waitForExistence(timeout: 5) }
        XCTAssertTrue(wide, "turned on its side, the phone uses the big-screen layout")
        open("p1.html", title: "Test page 1")
        open("p2.html", title: "Test page 2")
        waitFor(el("tab:Test page 1"), "the sidebar sits beside the page")
        waitFor(app.buttons["splitButton"], "the top bar has split view")
        shot("10-wide")

        // split view, and dragging the gap
        app.buttons["splitButton"].tap()
        waitFor(app.webViews.staticTexts["Test page 1"], "split view shows both pages")
        waitFor(app.webViews.staticTexts["Test page 2"], "and the other one")
        let t1 = app.webViews.staticTexts["Test page 1"], t2 = app.webViews.staticTexts["Test page 2"]
        XCTAssertGreaterThan(abs(t1.frame.minX - t2.frame.minX), 200, "two pages side by side")
        shot("11-split")
        let right = t1.frame.minX > t2.frame.minX ? t1 : t2, x0 = right.frame.minX
        let gap = el("divider"); waitFor(gap, "the gap between the pages")
        let from = gap.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        from.press(forDuration: 0.1, thenDragTo: from.withOffset(CGVector(dx: 90, dy: 0)))
        sleep(1)
        let x1 = right.frame.minX
        XCTAssertGreaterThan(x1, x0 + 40, "dragging the gap right makes the left page wider (right page moved \(x0) → \(x1))")
        shot("12-split-resized")
        gap.doubleTap(); sleep(1)
        XCTAssertLessThan(abs(right.frame.minX - x0), 6, "double-tap evens it out")
        app.buttons["splitButton"].tap()
        sleep(1)
        XCTAssertTrue(t1.exists != t2.exists, "the split button goes back to one page")
        let kept = t1.exists ? "Test page 1" : "Test page 2"

        // ☆ in the top bar, and the bookmarks bar
        app.buttons["star"].tap()
        waitFor(app.buttons["bmDone"], "editor"); app.buttons["bmDone"].tap()
        waitFor(el("bmchip:" + kept), "the bookmarks bar shows it over the page")
        shot("13-bookmarks-bar")
        el("bmchip:" + kept).press(forDuration: 1.0)
        waitFor(app.buttons["Hide Bookmarks Bar"], "press and hold a bookmark for its menu")
        app.buttons["Hide Bookmarks Bar"].tap()
        XCTAssertTrue(gone(el("bmchip:" + kept)), "the bar can be hidden")

        // hide the sidebar for more room, bring it back
        app.buttons["sidebarButton"].tap()
        XCTAssertTrue(gone(el("tab:Test page 1")), "the sidebar button hides the sidebar")
        shot("14-no-sidebar")
        app.buttons["sidebarButton"].tap()
        waitFor(el("tab:Test page 1"), "and shows it again")

        // folding/turning back: the phone layout comes straight back with the same page
        if UIDevice.current.userInterfaceIdiom == .phone {
            XCUIDevice.shared.orientation = .portrait
            XCTAssertTrue(gone(app.buttons["splitButton"]), "turning back to portrait switches to the phone layout")
            waitFor(app.webViews.staticTexts[kept], "the same page is still there after switching layouts")
            XCTAssertTrue(app.buttons["sidebarButton"].exists, "with its bottom bar")
            shot("15-back-to-phone")
        }
    }
}
