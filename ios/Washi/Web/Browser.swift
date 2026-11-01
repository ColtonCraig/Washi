import Foundation
import Observation
import UIKit
import WebKit
import CryptoKit

/* What a page is doing right now, for the address bar and buttons. */
@MainActor @Observable
final class PageState {
    var loading = false
    var progress = 0.0
    var canBack = false
    var canFwd = false
    var secure = true
}

/* Owns the real pages (WKWebViews). A page is made the first time its tab is shown and kept while it's one of the
   most recent; older ones are let go to save memory and reload from their address when you come back (like Safari).
   Each space can have its own cookie jar ("Keep this space's logins separate"). */
@MainActor
final class Browser: NSObject, WKNavigationDelegate, WKUIDelegate {
    let store: Store
    private(set) var views: [String: WKWebView] = [:]
    private var states: [String: PageState] = [:]
    private var watches: [String: [NSKeyValueObservation]] = [:]
    private var recent: [String] = []
    private var favCache: [String: String] = [:]
    static let keepAlive = 8
    private(set) var rules: WKContentRuleList?
    private(set) var rulesError: String?
    var wide = false                                   // the big-screen layout is showing (enables "Open in Split View")
    var onRulesReady: (() -> Void)?

    init(store: Store) {
        self.store = store
        super.init()
        store.browser = self
        loadRules()
    }

    func state(_ id: String) -> PageState { if let s = states[id] { return s }; let s = PageState(); states[id] = s; return s }
    func isLive(_ id: String) -> Bool { views[id] != nil }

    /* the page for a tab, made (and loaded) when first needed */
    func view(for id: String) -> WKWebView? {
        if let v = views[id] { touch(id); return v }
        guard let t = store.s.tabs[id] else { return nil }
        let cfg = WKWebViewConfiguration()
        configure(cfg, for: id)
        let v = WKWebView(frame: .zero, configuration: cfg)
        adopt(v, id: id)
        if let u = URL(string: t.url) { v.load(URLRequest(url: u)) }
        return v
    }
    private func configure(_ cfg: WKWebViewConfiguration, for id: String) {
        let sp = store.s.pins.contains(id) ? nil : store.spaceOf(id)
        cfg.websiteDataStore = sp?.isolated == true ? WKWebsiteDataStore(forIdentifier: Browser.uuid(sp!.id)) : .default()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = .audio
        cfg.allowsPictureInPictureMediaPlayback = true
    }
    static func uuid(_ s: String) -> UUID {
        let d = Array(SHA256.hash(data: Data(("washi-space-" + s).utf8)))
        return UUID(uuid: (d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], d[10], d[11], d[12], d[13], d[14], d[15]))
    }
    private func adopt(_ v: WKWebView, id: String) {
        v.navigationDelegate = self
        v.uiDelegate = self
        v.allowsBackForwardNavigationGestures = true
        v.isFindInteractionEnabled = true
        v.allowsLinkPreview = true
        if #available(iOS 16.4, *) { v.isInspectable = true }
        v.accessibilityIdentifier = "page-" + id
        v.backgroundColor = .clear
        v.scrollView.refreshControl = UIRefreshControl(frame: .zero, primaryAction: UIAction { [weak v] _ in v?.reload() })
        if let r = rules, store.blockingOn(for: store.s.tabs[id]?.url ?? "") { v.configuration.userContentController.add(r) }
        let st = state(id)
        let sync: (WKWebView) -> Void = { [weak self] w in
            MainActor.assumeIsolated {
                st.loading = w.isLoading; st.progress = w.estimatedProgress
                st.canBack = w.canGoBack; st.canFwd = w.canGoForward; st.secure = w.hasOnlySecureContent || !(w.url?.scheme == "http")
                if let u = w.url?.absoluteString, Web.isWeb(u) { self?.store.pageChanged(id, url: u) }
                if let t = w.title, !t.isEmpty { self?.store.pageChanged(id, title: t) }
            }
        }
        watches[id] = [
            v.observe(\.isLoading) { w, _ in sync(w) }, v.observe(\.estimatedProgress) { w, _ in sync(w) },
            v.observe(\.canGoBack) { w, _ in sync(w) }, v.observe(\.canGoForward) { w, _ in sync(w) },
            v.observe(\.url) { w, _ in sync(w) }, v.observe(\.title) { w, _ in sync(w) },
        ]
        views[id] = v
        touch(id)
    }
    private func touch(_ id: String) {
        recent.removeAll { $0 == id }; recent.insert(id, at: 0)
        let shown = Set([store.current, store.split?.a, store.split?.b].compactMap { $0 })
        while recent.count > Browser.keepAlive, let old = recent.last(where: { !shown.contains($0) }) { drop(old) }
    }
    /* let a page go (closed tab, or not used in a while) */
    func drop(_ id: String) {
        watches[id]?.forEach { $0.invalidate() }; watches[id] = nil
        if let v = views[id] { v.stopLoading(); v.navigationDelegate = nil; v.uiDelegate = nil; v.removeFromSuperview() }
        views[id] = nil; recent.removeAll { $0 == id }
        states[id]?.loading = false
    }
    func id(of w: WKWebView) -> String? { views.first { $0.value === w }?.key }

    // MARK: actions from the buttons
    func go(_ id: String, _ url: String) {
        store.pageChanged(id, url: url)
        if let v = views[id], let u = URL(string: url) { v.load(URLRequest(url: u)) } else { _ = view(for: id) }
    }
    func back(_ id: String) { views[id]?.goBack() }
    func forward(_ id: String) { views[id]?.goForward() }
    func reload(_ id: String) { guard let v = views[id] else { return }; if v.isLoading { v.stopLoading() } else { v.reload() } }
    func find(_ id: String) { views[id]?.findInteraction?.presentFindNavigator(showingReplace: false) }
    func reloadForSettings(_ id: String) {                       // blocking or desktop mode changed for this site
        guard let v = views[id], let u = v.url ?? URL(string: store.s.tabs[id]?.url ?? "") else { return }
        applyRules(v, url: u.absoluteString)
        v.load(URLRequest(url: u))
    }

    // MARK: blocking (WebKit content rules built from EasyList / EasyPrivacy)
    static let rulesID = "washi-blocklist-1"
    private func loadRules() {
        guard let rs = WKContentRuleListStore.default() else { return }
        rs.lookUpContentRuleList(forIdentifier: Browser.rulesID) { [weak self] list, _ in
            MainActor.assumeIsolated {
                if let list { self?.rulesLoaded(list); return }
                guard let url = Bundle.main.url(forResource: "blocklist", withExtension: "json"), let json = try? String(contentsOf: url, encoding: .utf8) else { self?.rulesError = "missing"; return }
                rs.compileContentRuleList(forIdentifier: Browser.rulesID, encodedContentRuleList: json) { list, err in
                    MainActor.assumeIsolated {
                        if let list { self?.rulesLoaded(list) } else { self?.rulesError = err?.localizedDescription ?? "failed" }
                    }
                }
            }
        }
    }
    private func rulesLoaded(_ list: WKContentRuleList) {
        rules = list
        for (id, v) in views { applyRules(v, url: v.url?.absoluteString ?? store.s.tabs[id]?.url ?? "") }
        onRulesReady?()
    }
    func applyRules(_ v: WKWebView, url: String) {
        let uc = v.configuration.userContentController
        uc.removeAllContentRuleLists()
        if let r = rules, store.blockingOn(for: url) { uc.add(r) }
    }

    // MARK: WKNavigationDelegate
    func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, preferences: WKWebpagePreferences) async -> (WKNavigationActionPolicy, WKWebpagePreferences) {
        guard let u = a.request.url else { return (.cancel, preferences) }
        let scheme = u.scheme?.lowercased() ?? ""
        if !["http", "https", "about", "data", "blob", "file"].contains(scheme) {                // mail, phone, maps, App Store…
            _ = await UIApplication.shared.open(u)
            return (.cancel, preferences)
        }
        if a.targetFrame?.isMainFrame ?? false, Web.isWeb(u.absoluteString) {
            applyRules(w, url: u.absoluteString)
            preferences.preferredContentMode = store.s.prefs.desktop.contains(Web.host(u.absoluteString)) ? .desktop : .mobile
        }
        return (.allow, preferences)
    }
    func webView(_ w: WKWebView, didFinish navigation: WKNavigation!) {
        w.scrollView.refreshControl?.endRefreshing()
        guard let id = id(of: w), let u = w.url?.absoluteString, Web.isWeb(u), w.title != "Didn't load" else { return }
        store.visited(u, title: w.title ?? "")
        fetchIcon(w, id: id)
    }
    func webView(_ w: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(w, error) }
    func webView(_ w: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(w, error) }
    private func failed(_ w: WKWebView, _ error: Error) {
        w.scrollView.refreshControl?.endRefreshing()
        let e = error as NSError
        if e.code == NSURLErrorCancelled || (e.domain == "WebKitErrorDomain" && (e.code == 102 || e.code == 204)) { return }   // stopped, or handed to another app / a download
        let failing = (e.userInfo[NSURLErrorFailingURLStringErrorKey] as? String) ?? w.url?.absoluteString ?? ""
        w.loadHTMLString(Browser.errorPage(failing, e.localizedDescription), baseURL: URL(string: failing))
    }
    func webViewWebContentProcessDidTerminate(_ w: WKWebView) { w.reload() }

    // MARK: WKUIDelegate
    /* links that open a new window become a new tab, keeping the connection to the page that opened them (sign-in pop-ups need it) */
    func webView(_ w: WKWebView, createWebViewWith cfg: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let url = a.request.url?.absoluteString ?? ""
        let id = store.openTab(url.isEmpty ? "about:blank" : url, bg: true)
        let v = WKWebView(frame: .zero, configuration: cfg)
        adopt(v, id: id)
        store.select(id)
        return v
    }
    func webViewDidClose(_ w: WKWebView) { if let id = id(of: w) { store.close(id) } }

    func webView(_ w: WKWebView, contextMenuConfigurationForElement info: WKContextMenuElementInfo) async -> UIContextMenuConfiguration? {
        guard let u = info.linkURL, Web.isWeb(u.absoluteString) else { return nil }
        let s = u.absoluteString, from = id(of: w)
        return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { [weak self] _ in
            var items: [UIMenuElement] = [
                UIAction(title: "Open in New Scrap", image: UIImage(systemName: "plus.square.on.square")) { _ in self?.store.openTab(s) },
                UIAction(title: "Open in Background", image: UIImage(systemName: "square.on.square")) { _ in self?.store.openTab(s, bg: true); self?.store.show("Opened in the background") },
            ]
            if self?.wide == true, let from {
                items.append(UIAction(title: "Open in Split View", image: UIImage(systemName: "rectangle.split.2x1")) { _ in
                    guard let st = self?.store else { return }
                    let n = st.openTab(s, bg: true); st.select(from); st.splitWith(n)
                })
            }
            items += [
                UIAction(title: "Copy Link", image: UIImage(systemName: "link")) { _ in UIPasteboard.general.url = u },
                UIAction(title: "Share…", image: UIImage(systemName: "square.and.arrow.up")) { _ in Browser.share(u) },
            ]
            return UIMenu(children: items)
        }
    }

    // MARK: site icons
    private func fetchIcon(_ w: WKWebView, id: String) {
        let host = Web.host(w.url?.absoluteString ?? "")
        if let f = favCache[host] { if store.s.tabs[id]?.fav != f { store.pageChanged(id, fav: f) }; return }
        let js = "(() => { const l = [...document.querySelectorAll('link[rel~=\"icon\"],link[rel=\"apple-touch-icon\"],link[rel=\"apple-touch-icon-precomposed\"]')].map(x => x.href).filter(Boolean); return l.length ? l[l.length - 1] : location.origin + '/favicon.ico'; })()"
        w.evaluateJavaScript(js) { [weak self] r, _ in
            MainActor.assumeIsolated {
                guard let s = r as? String, let u = URL(string: s) else { return }
                Task { [weak self] in
                    guard let got = try? await URLSession.shared.data(from: u), let im = UIImage(data: got.0), im.size.width >= 8 else { return }
                    let small = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 40)).pngData { _ in im.draw(in: CGRect(x: 0, y: 0, width: 40, height: 40)) }
                    let b64 = small.base64EncodedString()
                    guard b64.count < 12_000 else { return }
                    self?.favCache[host] = b64
                    self?.store.pageChanged(id, fav: b64)
                }
            }
        }
    }

    static func share(_ u: URL) {
        guard let scene = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).first, let root = scene.keyWindow?.rootViewController else { return }
        var top = root; while let p = top.presentedViewController { top = p }
        let vc = UIActivityViewController(activityItems: [u], applicationActivities: nil)
        vc.popoverPresentationController?.sourceView = top.view
        vc.popoverPresentationController?.sourceRect = CGRect(x: top.view.bounds.midX, y: 60, width: 1, height: 1)
        top.present(vc, animated: true)
    }

    static func errorPage(_ url: String, _ why: String) -> String {
        let esc: (String) -> String = { $0.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;").replacingOccurrences(of: "\"", with: "&quot;") }
        return """
        <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Didn't load</title>
        <style>:root{--p:#fbf6ea;--i:#2b2118;--i2:#6b5d4f;--w:#fffdf8;--t:#ff6a3d}@media (prefers-color-scheme:dark){:root{--p:#2b2520;--i:#f3ead8;--i2:#bfb3a1;--w:#363029}}
        body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--p);color:var(--i);font:16px/1.45 -apple-system,system-ui;padding:24px;box-sizing:border-box}
        .c{position:relative;max-width:420px;padding:30px 26px 24px;border-radius:14px;background:var(--w);box-shadow:4px 5px 0 rgba(0,0,0,.12)}
        .c:before{content:"";position:absolute;left:50%;top:-11px;width:90px;height:22px;margin-left:-45px;transform:rotate(-3deg);background:repeating-linear-gradient(-45deg,var(--t) 0 7px,#ffb59c 7px 14px)}
        h1{font:700 26px/1.2 ui-rounded,-apple-system;margin:0 0 8px}p{margin:0 0 8px;color:var(--i2)}.u{font:600 13px ui-monospace,Menlo;word-break:break-all;color:var(--i)}
        a{display:inline-block;margin-top:14px;padding:10px 18px;border-radius:10px;background:var(--t);color:#fff;font-weight:700;text-decoration:none}</style>
        <div class="c"><h1>This page didn't load</h1><p>\(esc(why))</p><p class="u">\(esc(url))</p><a href="\(esc(url))">Try again</a></div>
        """
    }
}
