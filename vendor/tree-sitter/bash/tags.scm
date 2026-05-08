; tags.scm for tree-sitter-bash (tree-sitter/tree-sitter-bash v0.25.1)
;
; Hand-authored by the Dendrite Wiki MCP project — the upstream grammar ships only
; queries/highlights.scm. Bash only has one meaningful "API surface" symbol kind: the
; function definition. Everything else (variables, aliases, sourced files) doesn't map
; cleanly to the API-reference contract.
;
; Captures:
;   @definition.function — function definitions
;   @name                — the function's identifier (a `word` node in tree-sitter-bash)

(function_definition
  name: (word) @name) @definition.function
