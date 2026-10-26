// Parses the flags of a gith command. Value flags consume the next token; switches stand alone.
export type Flags = Map<string, string>;

// The flag convention, enforced here:
//   -name <value>   a single dash always waits for a value (-b and -branch are aliases)
//   --name          a double dash never takes a value
// Kinds:
//   value   -name <value> only; --name is an error
//   switch  --name only, stored as "true"; -name is an error
//   auto    -name <value> for an explicit value, or --name alone for an automatic choice,
//           stored as "" (for example --branch opens the picker)
export type Kind = "value" | "switch" | "auto";
