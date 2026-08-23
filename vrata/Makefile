.PHONY: build test run clean

build:
	CGO_ENABLED=0 go build -o vrata-server ./cmd/vrata-server

test:
	go test ./...

run: build
	./vrata-server

clean:
	rm -f vrata-server
