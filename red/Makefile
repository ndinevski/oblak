.PHONY: build test run clean
build:
	CGO_ENABLED=0 go build -o red-server ./cmd/red-server
test:
	go test ./...
run: build
	./red-server
clean:
	rm -f red-server
