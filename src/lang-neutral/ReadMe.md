# Key Concepts

`type` is always one of these OpenApi schema types:

* integer, number, string, boolean

`record` and `array` are subclasses of `type`

* `array` matches the OpenApi schema type 'array'
* `record` matches the OpenApi schema type 'object'

`interface` and `record` have different meanings

* `interface` is only meant to have methods.
* `record` is only meant to have properties.
