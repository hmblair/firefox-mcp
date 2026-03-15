.PHONY: build xpi clean

build:
	npm run build

xpi: build
	cd firefox-extension && zip -r ../browser-control.xpi manifest.json dist/

clean:
	rm -f browser-control.xpi
	rm -rf mcp-server/dist firefox-extension/dist
