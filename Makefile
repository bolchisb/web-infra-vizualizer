.PHONY: help build-all build-auth build-notification build-settings build-wireguard start stop build pull

# Default registry
REGISTRY ?= registry.gitlab.com/codeops-library/site-projects

# Local targets
start:
	docker-compose up -d
stop:
	docker-compose down --remove-orphans
build:
	docker-compose build
pull:
	docker-compose pull






