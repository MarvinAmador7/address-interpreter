# Changelog

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
