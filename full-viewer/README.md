# Full Viewer

Placeholder for the production-oriented SEAAI alert viewer.

The full viewer should reuse the shared viewing experience from `../components/`
instead of copying or reimplementing the UI. Changes to shared templates, styles,
frontend behavior, and viewer assets should affect both `lite-viewer/` and
`full-viewer/`.

Production-specific concerns such as persistence, authentication, deployment,
auditing, and long-term storage should be layered around the shared viewer
experience.
