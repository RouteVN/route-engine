

Proposer: han4wluc
Approver: han4wluc
Status: Approved

## Decision

`rvn` format will be in json/yaml

## Why use JSON/YAML

It is a structured format, and universally usable by all programming languages

JSON schema

## Other considered alternatives

### Custom scripting language

The advantage is that it is easier to write. Since Visual Novels are primarly a text language.

Strudctured and scripted is not exclusive. In future is always possible to extend a scripting format.


### Protobuf

Protobuf has better performance. But it adds some overhead of working with it. Requires a bit more learning curve to work with protobuf than json.

For simplicity, we choose JSON/YAML.


### Jsonnet

Jsonnet is more powerful and feature rich.
However, less simple.
For repeated information we can use id references to minimize repetition.

