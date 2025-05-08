

# rvn


## Scripts

```shell
yq eval ./sample/vndata.yaml -o=json -P > ./sample/vndata.json
```




rvn is a Visual Novel specification

## Motivation

The Visual Novel development tooling is fragmented. There are at least serveral dozen active engines out there, but each of them is not interoperable. Choosing one engine means being locked in with this engine and unable to use another engine.

There are at least several dozen new Visual Novel engines being created every year. However, only few make it to be keep maintained after one year, and we still have the problem that can't interoperate between engines or tools. For the engines that get abandoned, it is unfornatuate that the community will not be able to benefit as much from them leading to resource inefficiency.

To be clear, the Visual Novel community is relatively small, and we desperately do need better tools and engines to build Visual Novels. Those who have attempted to build an engine from scratch are the brave ones and deserve all the rewards.

What if we could build an open Visual Novel specification, a protocol for that different Visual Novel engines and tools can all use and understand? What if a Visual Novel creator can use one tool and engine in the beginning, and then be able to seamlessly migrate everything to a different engine and tool?

I think if we are able to do that, as a community we will be able to better use our resources to build higher quality and more competitive tools and engines and give creators more freedom and choice for the tools they use.


## Guiding principles

* Simplicity: The specification should be easy to understand and not be unnecessarly complex. Visual Novels per se are simple in terms of games for the most part. Simplicity makes it much easier for adoption and implementation from different engines and tools.
* Stability: As a specification we want to provide a stable robust specification so developers can have a peace of mind and trust the specification. As part of the design process, we can't promise that there won't be breaking changse, but we must do our best to keep the specification stable and robust.
* Openess: The goal and value of the specification is materialized once multiple parties have impleentated and supported the specification. We believe that everyone has different ideas and requirements, and this will make the specification better. At the same time, we realize that we can't satisfy and make happy everyone's needs as technical and other tradeoffs are involved. We do want to support the vast majority of Visual Novel use cases and provide some plugin or other system for developers to build more customized functionalities.


## Analogy

| Website           | Visual Novel          |
| ----------------- | ----------------------|
| html, css         | rvn                   |
| Browser           | Visual Novel Engine   |
| Website builders  | Visual Novel Editors  |


## Proccess

### Specification committee

@han4wluc Member representing RouteVN 

### Proposals

Changes to the specification should be done via Github Issues
It can or cannot provide a solution for how to implement the proposal.

The proposal will be reviewied by the specification commitee.

The proposal will then be approved or rejected.

If is approved, it will be updated into the specification doc.

If rejected, it will give feedback and if applicable the proposal can be resubmitted after changes are made.

### Technicals

format rvn is JSON/YAML
All examples will be in YAML as it being more human readable.

Examples will be show in webp images

The specification itself is a single markdown file.
There is a JSON validation file.
There are numerous tests that produce a webp image of specification

### Meetings

Committee meets on a monthly basic, and is open to public. Public can talk and ask questions during the meeting after committee agenda is done.
Meetings notes of each meeting will be made available in this repository.








