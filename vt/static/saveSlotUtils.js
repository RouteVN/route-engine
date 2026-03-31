export const resolveSaveSlotId = (slotId, eventPayload = {}) => {
  if (typeof slotId !== "string" || !slotId.startsWith("_event.")) {
    return slotId;
  }

  const eventData = eventPayload?._event ?? eventPayload?.event;
  if (!eventData) {
    return slotId;
  }

  const resolvedSlotId = slotId
    .slice("_event.".length)
    .split(".")
    .reduce((currentValue, segment) => currentValue?.[segment], eventData);

  return resolvedSlotId ?? slotId;
};

export const createSaveThumbnailAssetId = (
  slotId,
  savedAt,
  eventPayload = {},
) => {
  return `saveThumbnailImage:${resolveSaveSlotId(slotId, eventPayload)}:${savedAt}`;
};
