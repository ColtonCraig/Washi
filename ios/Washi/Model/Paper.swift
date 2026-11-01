import SwiftUI
import UIKit
import CoreText

/* The paper look, the same colours as the Mac app: every space has a desk colour, a tape colour and a highlight. */
struct Pal { let name: String; let desk: String; let tape: String; let s2: String }
enum Paper {
    static let pals: [Int: Pal] = [
        40: Pal(name: "Tangerine", desk: "#fdd3ae", tape: "#ff6a3d", s2: "#ffd84d"),
        255: Pal(name: "Blueberry", desk: "#cbd9f6", tape: "#3d63ff", s2: "#ffd84d"),
        340: Pal(name: "Bubblegum", desk: "#fdd1dc", tape: "#ff3d8d", s2: "#7fe0c9"),
        150: Pal(name: "Clover", desk: "#d2eec6", tape: "#1f9d57", s2: "#ffe14d"),
        200: Pal(name: "Lagoon", desk: "#c6ede6", tape: "#0e9f9f", s2: "#ff9370"),
        300: Pal(name: "Grape", desk: "#e3d2f6", tape: "#7b46ff", s2: "#ffd84d"),
        110: Pal(name: "Lime", desk: "#eaf3b4", tape: "#74b000", s2: "#ff7aa8"),
    ]
    static let order = [40, 255, 340, 150, 200, 300, 110]
    static let stick = ["#ff6a3d", "#3d63ff", "#ff3d8d", "#1f9d57", "#0e9f9f", "#7b46ff", "#74b000", "#e89a00"]
    static let folderColors: [(String?, String)] = [(nil, "Paper"), ("#ff6a3d", "Tangerine"), ("#e89a00", "Honey"), ("#1f9d57", "Clover"), ("#0e9f9f", "Lagoon"), ("#3d63ff", "Blueberry"), ("#7b46ff", "Grape"), ("#ff3d8d", "Bubblegum")]
    static let emoji = ["⭐️", "💼", "🏠", "📚", "🛠️", "🎨", "🎵", "🎮", "🍳", "✈️", "💡", "📰", "💸", "❤️", "🌱"]
    static func pal(_ h: Int) -> Pal { pals[h] ?? pals[40]! }
    static func hue(of s: String) -> Int { s.unicodeScalars.reduce(7) { ($0 * 31 + Int($1.value)) % 360 } }
    static func chip(_ url: String) -> Color { Color(hex: stick[hue(of: Web.host(url)) % stick.count]) }

    /* the fonts the Mac app uses: Figtree for words, Caveat for handwritten titles */
    static func registerFonts() {
        for n in ["Figtree-Medium", "Figtree-SemiBold", "Figtree-Bold", "Caveat-Bold"] {
            if let u = Bundle.main.url(forResource: n, withExtension: "ttf") { CTFontManagerRegisterFontsForURL(u as CFURL, .process, nil) }
        }
    }
}

/* the colours for one moment: the current space, light or dark */
struct Theme: Equatable {
    var dark: Bool
    var desk: Color, tape: Color, s2: Color, paper: Color, ink: Color, ink2: Color, ink3: Color, line: Color, card: Color
    init(hue: Int, dark: Bool) {
        let p = Paper.pal(hue)
        self.dark = dark
        desk = dark ? Color(hex: Paper.mix(p.desk, "#120e0b", 0.7)) : Color(hex: p.desk)
        tape = Color(hex: p.tape); s2 = Color(hex: p.s2)
        paper = dark ? Color(hex: "#2b2520") : Color(hex: "#fbf6ea")
        card = dark ? Color(hex: "#363029") : Color(hex: "#fffdf8")
        ink = dark ? Color(hex: "#f3ead8") : Color(hex: "#2b2118")
        ink2 = dark ? Color(hex: "#bfb3a1") : Color(hex: "#6b5d4f")
        ink3 = dark ? Color(hex: "#8e8273") : Color(hex: "#a0917f")
        line = dark ? Color.white.opacity(0.08) : Color(hex: "#2b2118").opacity(0.09)
    }
}
extension Paper {
    static func mix(_ a: String, _ b: String, _ t: Double) -> String {
        let A = rgb(a), B = rgb(b)
        let m = (0..<3).map { Int((Double(A[$0]) + (Double(B[$0]) - Double(A[$0])) * t).rounded()) }
        return String(format: "#%02x%02x%02x", m[0], m[1], m[2])
    }
    static func rgb(_ h: String) -> [Int] {
        let s = h.replacingOccurrences(of: "#", with: ""), n = Int(s, radix: 16) ?? 0
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }
}
extension Color {
    init(hex: String) {
        let c = Paper.rgb(hex)
        self.init(.sRGB, red: Double(c[0]) / 255, green: Double(c[1]) / 255, blue: Double(c[2]) / 255, opacity: 1)
    }
}
extension Font {
    static func ui(_ size: CGFloat, _ w: Font.Weight = .medium) -> Font {
        let name = w == .bold || w == .heavy || w == .black ? "Figtree-Bold" : w == .semibold ? "Figtree-SemiBold" : "Figtree-Medium"
        return UIFont(name: name, size: size) != nil ? .custom(name, size: size, relativeTo: .body) : .system(size: size, weight: w)
    }
    static func hand(_ size: CGFloat) -> Font { UIFont(name: "Caveat-Bold", size: size) != nil ? .custom("Caveat-Bold", size: size) : .system(size: size, weight: .bold, design: .rounded) }
}

/* the theme travels through the views */
private struct ThemeKey: EnvironmentKey { static let defaultValue = Theme(hue: 40, dark: false) }
extension EnvironmentValues { var theme: Theme { get { self[ThemeKey.self] } set { self[ThemeKey.self] = newValue } } }

/* a site's icon, or a coloured letter tile when there isn't one */
struct Fav: View {
    var url: String, title: String, fav: String?
    var size: CGFloat = 18
    var body: some View {
        Group {
            if let fav, let d = Data(base64Encoded: fav), let im = UIImage(data: d) {
                Image(uiImage: im).resizable().interpolation(.high).scaledToFit().padding(size * 0.06)
            } else {
                Text(String((title.isEmpty ? Web.host(url) : title).prefix(1)).uppercased())
                    .font(.ui(size * 0.55, .bold)).foregroundStyle(.white)
                    .frame(width: size, height: size).background(Paper.chip(url), in: RoundedRectangle(cornerRadius: size * 0.28))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/* a strip of washi tape, used sparingly for a little paper character */
struct Tape: View {
    var color: Color
    var body: some View {
        Canvas { ctx, size in
            let stripe: CGFloat = 7
            var x: CGFloat = -size.height
            while x < size.width + size.height {
                var p = Path(); p.move(to: CGPoint(x: x, y: size.height)); p.addLine(to: CGPoint(x: x + size.height, y: 0)); p.addLine(to: CGPoint(x: x + size.height + stripe, y: 0)); p.addLine(to: CGPoint(x: x + stripe, y: size.height)); p.closeSubpath()
                ctx.fill(p, with: .color(.white.opacity(0.35)))
                x += stripe * 2
            }
        }
        .background(color)
        .opacity(0.92)
    }
}
