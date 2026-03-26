VERSION := $(shell node -p "require('./package.json').version")

.PHONY: build compile xpi clean tag install uninstall

build: compile xpi

compile:
	@echo "Compiling Firefox MCP v$(VERSION)..."
	@npm run build

xpi:
	@rm -rf dist/stage
	@mkdir -p dist/stage
	@cp -r extension/manifest.json extension/dist dist/stage/
	@node -e "const m=JSON.parse(require('fs').readFileSync('dist/stage/manifest.json','utf8')); m.version='$(VERSION)'; require('fs').writeFileSync('dist/stage/manifest.json', JSON.stringify(m,null,2)+'\n');"
	@cd dist/stage && zip -r ../firefox-mcp.xpi . -x "*.DS_Store" -x "*.git*" -x "dist/.tsbuildinfo"
	@rm -rf dist/stage
	@echo "Built: dist/firefox-mcp.xpi"

tag:
	@git tag -a "v$(VERSION)" -m "v$(VERSION)"
	@echo "Tagged v$(VERSION)"

install:
	@node scripts/install.cjs

uninstall:
	@node scripts/install.cjs uninstall

clean:
	rm -rf dist/
	rm -rf server/dist/
	rm -rf extension/dist/

