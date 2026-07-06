.PHONY: bootstrap generate open clean

bootstrap:
	brew install xcodegen || true

generate:
	xcodegen generate

open:
	open MMGIOS.xcodeproj

clean:
	rm -rf DerivedData build
