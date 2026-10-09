import { describe, expect, it } from "vitest";
import createRouteEngine from "../src/RouteEngine.js";

const slotLayout = (paginationSize) => ({
  ...(paginationSize === undefined ? {} : { paginationSize }),
  elements: [
    {
      "$for slot in saveSlots": [
        {
          id: "slot-row-${slot.slotId}",
          type: "container",
          children: [
            {
              id: "save-slot-${slot.slotId}",
              type: "text",
              content: "${slot.slotId}",
              click: {
                payload: {
                  actions: { saveSlot: { slotId: "${slot.slotId}" } },
                },
              },
            },
            {
              id: "load-slot-${slot.slotId}",
              type: "text",
              content: "Load ${slot.slotId}",
              click: {
                payload: {
                  actions: { loadSlot: { slotId: "${slot.slotId}" } },
                },
              },
            },
          ],
        },
      ],
    },
  ],
});

const createEngine = ({ baseSize, overlays = [] } = {}) => {
  let engine;
  engine = createRouteEngine({
    handlePendingEffects(effects) {
      for (const effect of effects) {
        if (effect.name === "handleLineActions")
          engine.handleLineActions(effect.payload);
      }
    },
  });
  engine.init({
    initialState: {
      global: {},
      projectData: {
        screen: { width: 800, height: 600 },
        resources: {
          layouts: {
            base: slotLayout(baseSize),
            ...Object.fromEntries(
              overlays.map((size, index) => [
                `overlay${index}`,
                slotLayout(size),
              ]),
            ),
          },
        },
        story: {
          initialSceneId: "scene",
          scenes: {
            scene: {
              initialSectionId: "section",
              sections: {
                section: {
                  lines: [
                    {
                      id: "saved",
                      actions: { layout: { resourceId: "base" } },
                    },
                    { id: "later", actions: {} },
                  ],
                },
              },
            },
          },
        },
      },
    },
  });
  engine.handleAction("setSaveLoadPagination", { value: 2 });
  overlays.forEach((_, index) =>
    engine.handleAction("pushOverlay", {
      resourceId: `overlay${index}`,
      resourceType: "layout",
    }),
  );
  return engine;
};

const findElements = (engine, prefix) => {
  const result = [];
  const visit = (element) => {
    if (element.id?.includes(prefix)) result.push(element);
    element.children?.forEach(visit);
  };
  engine.selectRenderState().elements.forEach(visit);
  return result;
};
const renderedSlotIds = (engine) =>
  findElements(engine, "save-slot-").map(({ content }) => content);

describe("RouteEngine save/load pagination", () => {
  it("uses the current presentation layout's size without an overlay", () => {
    expect(renderedSlotIds(createEngine({ baseSize: 4 }))).toEqual([
      5, 6, 7, 8,
    ]);
  });

  it("defaults to six slots when no active layout sets a size", () => {
    expect(renderedSlotIds(createEngine())).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it("uses the topmost explicit overlay size for all active layouts", () => {
    const engine = createEngine({ baseSize: 3, overlays: [2, 4] });
    expect(renderedSlotIds(engine)).toEqual(Array(3).fill([5, 6, 7, 8]).flat());
    engine.handleAction("popOverlay", {});
    expect(renderedSlotIds(engine)).toEqual([3, 4, 3, 4]);
    engine.handleAction("popOverlay", {});
    expect(renderedSlotIds(engine)).toEqual([4, 5, 6]);
  });

  it("skips overlays without a size and falls back to the base layout", () => {
    const engine = createEngine({ baseSize: 4, overlays: [undefined] });
    expect(renderedSlotIds(engine)).toEqual([5, 6, 7, 8, 5, 6, 7, 8]);
  });

  it.each([0, -1, 1.5, "4", null])(
    "ignores invalid legacy page size %j",
    (size) => {
      // Runtime can receive older persisted layouts without schema validation.
      const engine = createEngine({ baseSize: 3, overlays: [size] });
      expect(renderedSlotIds(engine)).toEqual([4, 5, 6, 4, 5, 6]);
    },
  );

  it("keeps direct selector defaults and explicit caller page sizes", () => {
    const engine = createEngine({ baseSize: 4 });
    expect(
      engine.selectSaveSlotPage().saveSlots.map(({ slotId }) => slotId),
    ).toEqual([7, 8, 9, 10, 11, 12]);
    expect(
      engine
        .selectSaveSlotPage({ slotsPerPage: 2 })
        .saveSlots.map(({ slotId }) => slotId),
    ).toEqual([3, 4]);
  });

  it("saves and loads the slot selected by the page-two rendered click payload", () => {
    const engine = createEngine({ overlays: [4] });
    const saveButton = findElements(engine, "save-slot-").at(-4);
    expect(saveButton.content).toBe(5);
    engine.handleAction("markLineCompleted", {});
    engine.handleActions(saveButton.click.payload.actions);
    expect(Object.keys(engine.selectSaveSlotMap())).toEqual(["5"]);
    engine.handleAction("popOverlay", {});
    engine.handleAction("nextLine", {});
    expect(engine.selectSystemState().contexts[0].pointers.read.lineId).toBe(
      "later",
    );
    engine.handleAction("pushOverlay", {
      resourceId: "overlay0",
      resourceType: "layout",
    });
    const loadButton = findElements(engine, "load-slot-").at(-4);
    engine.handleActions(loadButton.click.payload.actions);
    expect(engine.selectSystemState().contexts[0].pointers.read.lineId).toBe(
      "saved",
    );
  });
});
