SRC = $(shell /usr/bin/find ./src -type f)

.PHONY: default install install-dep test test-gen clean

default: install-dep install

install: .bin/srclib-typescript.js

.bin/srclib-typescript.js: node_modules ${SRC} tsconfig.json package.json
	tsc -p .

install-dep:
	npm install

test: install
	srclib -v test

test-gen: install
	srclib -v test --gen

clean:
	rm -f .bin/*.js
