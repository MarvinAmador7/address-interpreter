# Changelog

## 0.1.1

- Split `invalid` and `not-found` into distinct resolution union members so
  older TypeScript consumers can narrow exhaustively to `resolved`.

## 0.1.0

- Add lossless tokenization and normalized address components.
- Preserve both interpretations of bare trailing unit-shaped tokens.
- Add data-backed resolution with explicit ambiguity handling.
