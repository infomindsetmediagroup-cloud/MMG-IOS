#!/usr/bin/env python3
"""Static Xcode project structure validator for MMG-IOS.

This script performs repository-local checks without invoking xcodebuild or
GitHub Actions. It is intended to catch obvious project graph problems before
spending CI minutes.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / "MMGIOS.xcodeproj" / "project.pbxproj"
SCHEME = ROOT / "MMGIOS.xcodeproj" / "xcshareddata" / "xcschemes" / "MMGIOS.xcscheme"
APP_ROOT = ROOT / "MMGIOS"

REQUIRED_FILES = [
    PROJECT,
    SCHEME,
    APP_ROOT / "App" / "MMGIOSApp.swift",
    APP_ROOT / "App" / "AppRootView.swift",
    APP_ROOT / "Config" / "AppTheme.swift",
    APP_ROOT / "Domain" / "CommandCenter.swift",
    APP_ROOT / "Shared" / "Components" / "MetricCard.swift",
    APP_ROOT / "Features" / "Dashboard" / "CommandCenterView.swift",
    APP_ROOT / "Features" / "Admin" / "AdminOperationsView.swift",
    APP_ROOT / "Features" / "Production" / "ProductionCommandCenterView.swift",
    APP_ROOT / "Features" / "Growth" / "GrowthMarketingView.swift",
    APP_ROOT / "Features" / "Settings" / "SystemSettingsView.swift",
    APP_ROOT / "Resources" / "Info.plist",
    APP_ROOT / "Resources" / "Assets.xcassets" / "Contents.json",
]

REQUIRED_PROJECT_TOKENS = [
    "PBXNativeTarget",
    "productType = \"com.apple.product-type.application\";",
    "SDKROOT = iphoneos;",
    "SUPPORTED_PLATFORMS = \"iphoneos iphonesimulator\";",
    "INFOPLIST_FILE = MMGIOS/Resources/Info.plist;",
    "TARGETED_DEVICE_FAMILY = \"1,2\";",
    "SUPPORTS_MACCATALYST = NO;",
    "SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO;",
]

REQUIRED_SCHEME_TOKENS = [
    "BlueprintIdentifier = \"A50000000000000000000001\"",
    "BuildableName = \"MMGIOS.app\"",
    "BlueprintName = \"MMGIOS\"",
    "ReferencedContainer = \"container:MMGIOS.xcodeproj\"",
]


def fail(message: str) -> None:
    print(f"[FAIL] {message}")
    raise SystemExit(1)


def check_required_files() -> None:
    missing = [path for path in REQUIRED_FILES if not path.exists()]
    if missing:
        for path in missing:
            print(f"[MISSING] {path.relative_to(ROOT)}")
        fail("Required repository files are missing.")


def check_project_tokens() -> None:
    content = PROJECT.read_text(encoding="utf-8")
    for token in REQUIRED_PROJECT_TOKENS:
        if token not in content:
            fail(f"project.pbxproj is missing required token: {token}")

    source_refs = re.findall(r"path = ([^;]+\.swift);", content)
    missing_refs = []
    for ref in source_refs:
        path = APP_ROOT / ref.strip('"')
        if not path.exists():
            missing_refs.append(path.relative_to(ROOT))

    if missing_refs:
        for path in missing_refs:
            print(f"[STALE-REFERENCE] {path}")
        fail("Xcode project references missing Swift files.")


def check_scheme() -> None:
    content = SCHEME.read_text(encoding="utf-8")
    for token in REQUIRED_SCHEME_TOKENS:
        if token not in content:
            fail(f"MMGIOS.xcscheme is missing required token: {token}")


def check_swift_entry_points() -> None:
    app = (APP_ROOT / "App" / "MMGIOSApp.swift").read_text(encoding="utf-8")
    root = (APP_ROOT / "App" / "AppRootView.swift").read_text(encoding="utf-8")

    if "@main" not in app:
        fail("MMGIOSApp.swift does not define an @main entry point.")
    if "AppRootView()" not in app:
        fail("MMGIOSApp.swift does not launch AppRootView().")
    if "TabView" not in root:
        fail("AppRootView.swift does not define the expected TabView shell.")


def main() -> int:
    check_required_files()
    check_project_tokens()
    check_scheme()
    check_swift_entry_points()
    print("[OK] MMG-IOS project structure validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
