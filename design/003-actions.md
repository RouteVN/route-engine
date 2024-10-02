
Allow actions to customize and overwrite on the step.

Use case:

* take directly from resource and don't make any edits. this is default and most used

* take from resource, and apply overwrites

* don't take from resource, all custom properties



Motivations:

* follow principle default satisfy should most common use cases. most of the time you would use an existing resource.

* in order to allow flexiblity, there may be times where you need to do something only once. not most efficient to create a resource and use it only once. therefore we allow to customize and overwrite. overwite is just to try make the customize a bit more easier.
