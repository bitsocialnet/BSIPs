# BSIP assets

Auxiliary files for individual BSIPs live here, one folder per BSIP:

```text
assets/bsip-<n>/<file>
```

Reference them from a BSIP with a relative link, for example
`![diagram](../assets/bsip-1/diagram.svg)`.

Prefer inlining examples and test vectors directly in a BSIP. Use this folder only when content is
too large to inline, such as images, diagrams, or extensive test-vector files.
