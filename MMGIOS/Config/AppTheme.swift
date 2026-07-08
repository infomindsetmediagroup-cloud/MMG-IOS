import SwiftUI

extension Color {
    static let mmgBlue = Color(red: 0.0, green: 0.48, blue: 1.0)
    static let mmgDeepBlue = Color(red: 0.0, green: 0.12, blue: 0.38)
    static let mmgInk = Color(red: 0.05, green: 0.07, blue: 0.12)
    static let mmgBackground = Color(red: 0.94, green: 0.97, blue: 1.0)
    static let mmgSurface = Color(red: 0.96, green: 0.98, blue: 1.0)
}

extension ShapeStyle where Self == Color {
    static var mmgBlue: Color { Color.mmgBlue }
    static var mmgDeepBlue: Color { Color.mmgDeepBlue }
    static var mmgInk: Color { Color.mmgInk }
    static var mmgBackground: Color { Color.mmgBackground }
    static var mmgSurface: Color { Color.mmgSurface }
}

struct AppTheme {
    static let appName = "Kairos"
    static let companyName = "Mindset Media Group™"
    static let minimumIOSVersion = "17.0"
}
