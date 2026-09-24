---
name: breaking-change-checklist
description: Apply when a pull request changes an HTTP API, a request/response schema or a shared contract, to verify each change against the breaking-change checklist.
---

# Breaking-change checklist

Work through every touched endpoint or schema and answer each item. A "no" to any
item marked (B) is a breaking change: report it as CRITICAL unless the diff also
ships a version bump or a compatibility shim.

## Routes
- (B) Is every previously existing route still served at the same path and method?
- (B) Are path and query parameters unchanged in name, type and optionality?
- Is any new header or auth requirement limited to NEW endpoints?

## Requests
- (B) Is every newly added request field optional, with a default that preserves
  old behaviour?
- (B) Are all previously accepted values still accepted (no narrower enum, shorter
  max length or stricter pattern)?

## Responses
- (B) Is every previously returned field still present with the same name, type and
  casing?
- (B) Can a field that clients treat as non-null still never be null?
- Do enums only gain values that clients can safely ignore?
- Did ordering, pagination shape and envelope stay the same?

## Status codes and errors
- (B) Do success and error status codes match what clients branch on today?
- Is the error body shape unchanged?

## Rollout
- Was a deprecation window, alias or new version used for anything above that had to
  change?
- Are the server and client copies of the shared contracts updated together?

See `references/semver-for-apis.md` for how to classify a change.
