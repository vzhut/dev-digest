# Classifying API changes

| Change | Class |
|---|---|
| New endpoint | additive (minor) |
| New optional request field | additive (minor) |
| New response field | additive (minor) |
| Field or route removed or renamed | breaking (major) |
| Field retyped, or optional made required | breaking (major) |
| Validation tightened | breaking (major) |
| Success status code changed | breaking (major) |
| Enum value added | usually additive; breaking if clients switch exhaustively |
| Bug fix that changes an incorrect response | judge case by case; document it |

Prefer an additive path: add the new field or route, keep the old one, deprecate,
and remove only in a later major version.
