; tags.scm for tree-sitter-kotlin (fwcd/tree-sitter-kotlin v0.3.8)
;
; Hand-authored by the Dendrite Wiki MCP project — the upstream grammar ships only
; queries/highlights.scm. Node-type names verified against the grammar's source and
; its highlights.scm. Tied to grammar version 0.3.8; changes to the upstream parser
; tree may require this query to be revised.
;
; Captures used by the generic tree-sitter extractor:
;   @definition.class    — classes, interfaces, objects, enum classes, type aliases
;   @definition.function — top-level + member functions
;   @name                — the symbol's identifier (paired with the definition capture)

(class_declaration
  (type_identifier) @name) @definition.class

(object_declaration
  (type_identifier) @name) @definition.class

(type_alias
  (type_identifier) @name) @definition.class

(function_declaration
  (simple_identifier) @name) @definition.function
