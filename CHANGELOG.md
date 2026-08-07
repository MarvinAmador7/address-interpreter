# Changelog

## [0.1.5](https://github.com/MarvinAmador7/address-interpreter/compare/v0.1.4...v0.1.5) (2026-08-07)


### Bug Fixes

* extract suffixless street directionals ([e88901d](https://github.com/MarvinAmador7/address-interpreter/commit/e88901d6ff7e34999cc56d1b416d9cd4f0df5247))

## [0.1.4](https://github.com/MarvinAmador7/address-interpreter/compare/v0.1.3...v0.1.4) (2026-08-07)


### Bug Fixes

* expand USPS street suffix vocabulary ([35fc8f7](https://github.com/MarvinAmador7/address-interpreter/commit/35fc8f7aabf7c006f2c16b03b50c383a3a2b843e))

## [0.1.3](https://github.com/MarvinAmador7/address-interpreter/compare/v0.1.2...v0.1.3) (2026-08-07)


### Bug Fixes

* publish updated package readme ([0e6c71c](https://github.com/MarvinAmador7/address-interpreter/commit/0e6c71c897afe93d8282808e42736715ec4cc005))

## [0.1.2](https://github.com/MarvinAmador7/address-interpreter/compare/v0.1.1...v0.1.2) (2026-08-07)


### Bug Fixes

* document package contract and automate releases ([a361959](https://github.com/MarvinAmador7/address-interpreter/commit/a361959d69df15eaae5c4d191532c5454472fd19))

## 0.1.1

- Split `invalid` and `not-found` into distinct resolution union members so
  older TypeScript consumers can narrow exhaustively to `resolved`.

## 0.1.0

- Add lossless tokenization and normalized address components.
- Preserve both interpretations of bare trailing unit-shaped tokens.
- Add data-backed resolution with explicit ambiguity handling.
