import Foundation

/* Turning what you type into an address, search engines and !bangs (the same list as on the Mac). */
enum Web {
    static let engines: [(id: String, name: String, url: String)] = [
        ("google", "Google", "https://www.google.com/search?q=%s"), ("duckduckgo", "DuckDuckGo", "https://duckduckgo.com/?q=%s"),
        ("brave", "Brave Search", "https://search.brave.com/search?q=%s"), ("bing", "Bing", "https://www.bing.com/search?q=%s"),
        ("ecosia", "Ecosia", "https://www.ecosia.org/search?q=%s"), ("startpage", "Startpage", "https://www.startpage.com/do/search?q=%s"),
    ]
    static let bangs: [String: (String, String)] = [
        "g": ("Google", "https://www.google.com/search?q=%s"), "ddg": ("DuckDuckGo", "https://duckduckgo.com/?q=%s"), "b": ("Bing", "https://www.bing.com/search?q=%s"),
        "br": ("Brave Search", "https://search.brave.com/search?q=%s"), "yt": ("YouTube", "https://www.youtube.com/results?search_query=%s"),
        "w": ("Wikipedia", "https://en.wikipedia.org/w/index.php?search=%s"), "gh": ("GitHub", "https://github.com/search?q=%s"), "r": ("Reddit", "https://www.reddit.com/search/?q=%s"),
        "a": ("Amazon", "https://www.amazon.com/s?k=%s"), "m": ("Google Maps", "https://www.google.com/maps/search/%s"), "maps": ("Apple Maps", "https://maps.apple.com/?q=%s"),
        "i": ("Google Images", "https://www.google.com/search?tbm=isch&q=%s"), "n": ("Google News", "https://news.google.com/search?q=%s"),
        "so": ("Stack Overflow", "https://stackoverflow.com/search?q=%s"), "mdn": ("MDN", "https://developer.mozilla.org/search?q=%s"), "npm": ("npm", "https://www.npmjs.com/search?q=%s"),
        "imdb": ("IMDb", "https://www.imdb.com/find/?q=%s"), "gr": ("Goodreads", "https://www.goodreads.com/search?q=%s"), "spot": ("Spotify", "https://open.spotify.com/search/%s"),
        "x": ("X", "https://x.com/search?q=%s"), "ebay": ("eBay", "https://www.ebay.com/sch/i.html?_nkw=%s"), "zillow": ("Zillow", "https://www.zillow.com/homes/%s_rb/"),
        "t": ("Translate", "https://translate.google.com/?sl=auto&tl=en&text=%s"), "ud": ("Urban Dictionary", "https://www.urbandictionary.com/define.php?term=%s"),
        "pplx": ("Perplexity", "https://www.perplexity.ai/search?q=%s"), "claude": ("Claude", "https://claude.ai/new?q=%s"), "chatgpt": ("ChatGPT", "https://chatgpt.com/?q=%s"),
    ]
    static func enc(_ q: String) -> String {
        var ok = CharacterSet.urlQueryAllowed; ok.remove(charactersIn: "&+=?#/")
        return q.addingPercentEncoding(withAllowedCharacters: ok) ?? q
    }
    /* "!yt cats" or "cats !yt" */
    static func bang(_ v: String) -> (name: String, url: String, q: String)? {
        let parts = v.trimmingCharacters(in: .whitespaces).split(separator: " ", omittingEmptySubsequences: true).map(String.init)
        guard parts.count >= 2 else { return nil }
        var key = "", q = ""
        if parts[0].hasPrefix("!") { key = String(parts[0].dropFirst()); q = parts.dropFirst().joined(separator: " ") }
        else if parts.last!.hasPrefix("!") { key = String(parts.last!.dropFirst()); q = parts.dropLast().joined(separator: " ") }
        guard let b = bangs[key.lowercased()], !q.isEmpty else { return nil }
        return (b.0, b.1.replacingOccurrences(of: "%s", with: enc(q)), q)
    }
    static func looksLikeURL(_ v: String) -> Bool {
        let v = v.trimmingCharacters(in: .whitespaces)
        if v.contains(" ") { return false }
        if v.range(of: #"^[a-z][a-z0-9+.-]*://"#, options: [.regularExpression, .caseInsensitive]) != nil { return true }
        if v.range(of: #"^localhost(:\d+)?([/?#]|$)"#, options: [.regularExpression, .caseInsensitive]) != nil { return true }
        if v.range(of: #"^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#]|$)"#, options: .regularExpression) != nil { return true }
        return v.range(of: #"^[^\s/]+\.[a-z]{2,}(:\d+)?([/?#]\S*)?$"#, options: [.regularExpression, .caseInsensitive]) != nil
    }
    static func searchURL(_ q: String, engine: String) -> String {
        let tpl = engines.first { $0.id == engine }?.url ?? engines[0].url
        return tpl.replacingOccurrences(of: "%s", with: enc(q))
    }
    /* what you typed → the address to open */
    static func toURL(_ v: String, engine: String) -> String {
        let v = v.trimmingCharacters(in: .whitespacesAndNewlines)
        if v.range(of: #"^[a-z][a-z0-9+.-]*://"#, options: [.regularExpression, .caseInsensitive]) != nil || v.lowercased().hasPrefix("about:") { return v }
        if let b = bang(v) { return b.url }
        if v.range(of: #"^localhost(:\d+)?([/?#]|$)"#, options: [.regularExpression, .caseInsensitive]) != nil
            || v.range(of: #"^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#]|$)"#, options: .regularExpression) != nil { return "http://" + v }
        if looksLikeURL(v) { return "https://" + v }
        return searchURL(v, engine: engine)
    }
    static func host(_ u: String) -> String {
        guard let c = URLComponents(string: u), let h = c.host else { return u }
        let h2 = h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
        if let p = c.port { return "\(h2):\(p)" }
        return h2
    }
    /* the address bar's short form: host, then a light path */
    static func pretty(_ u: String) -> (host: String, path: String) {
        guard let c = URLComponents(string: u), c.host != nil else { return (u, "") }
        var p = c.path == "/" ? "" : c.path
        if let q = c.query, !q.isEmpty { p += "?" + q }
        if p.count > 60 { p = String(p.prefix(60)) + "…" }
        return (host(u), p)
    }
    static func isWeb(_ u: String) -> Bool { u.hasPrefix("http://") || u.hasPrefix("https://") }
}
