# Changelog

All notable changes to `@particle-academy/fancy-3d-babylon` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

> **Pre-1.0:** breaking changes land in MINOR releases. Until 1.0 the minor
> number is not a compatibility promise — read the entry, not the version.

> This file starts here. Earlier releases predate it and were never written up;
> `git log` is the record for those. It is not backfilled rather than
> guessed-at, because a changelog that invents its own history is worse than one
> that admits where it begins.

## [Unreleased]

## 0.1.2 — 2026-06-15

### Changed

- granular @babylonjs/core imports for tree-shaking

## 0.1.1 — 2026-06-02

- Maintenance only (2 internal commits).

## 0.1.0 — 2026-05-27

- Maintenance only (2 internal commits).

### Changed

- Widened the `@particle-academy/fancy-3d` requirement from `^0.4.0` to `>=0.4 <2.0`, so a
  sibling minor release is an upgrade and not a resolver conflict. **No action
  needed** — widening a range only adds candidates; the version you have today
  still resolves.

  A caret on a `0.x` range locks the MINOR, so this pinned a sibling at
  whatever it happened to be on the day it was written, and each sibling
  release then read as a conflict to the resolver rather than an upgrade.
  Nothing here was using an API the newer minors removed — the range was the
  whole problem.
