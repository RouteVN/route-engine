const isSameLinePointer = (left, right) =>
  left.sectionId === right.sectionId && left.lineId === right.lineId;

// How many of the last entered lines repeat as a block: the smallest count
// for which the last block of that many lines equals the block before it.
const findRepeatLength = (enteredLinePointers) => {
  const count = enteredLinePointers.length;
  for (let length = 1; length * 2 <= count; length += 1) {
    let repeats = true;
    for (let index = count - length; index < count; index += 1) {
      if (
        !isSameLinePointer(
          enteredLinePointers[index],
          enteredLinePointers[index - length],
        )
      ) {
        repeats = false;
        break;
      }
    }
    if (repeats) return length;
  }
  return undefined;
};

// How many lines back the story last entered the line it stopped on.
const findLastReturnLength = (enteredLinePointers) => {
  const lastIndex = enteredLinePointers.length - 1;
  for (let index = lastIndex - 1; index >= 0; index -= 1) {
    if (
      isSameLinePointer(enteredLinePointers[index], enteredLinePointers.at(-1))
    ) {
      return lastIndex - index;
    }
  }
  return undefined;
};

/**
 * The lines of an immediate routing cycle, given every line the story entered
 * before the engine stopped it, in order. A line the story entered again is
 * listed again in `enteredLinePointers`.
 *
 * The result starts with the line the story stopped on and lists each other
 * line of the cycle once, in the order the story first reached it after that
 * line. Lines that only led into the cycle are left out.
 *
 * The cycle is the block of lines the story kept repeating. When its route
 * varied, so that no block repeats, the cycle is its last trip from the line
 * it stopped on back to that line. When it never entered a line twice, the
 * story ran out of budget on a long chain of lines rather than in a cycle,
 * and the result is empty.
 */
export const selectRoutingCycle = (enteredLinePointers) => {
  const cycleLength =
    findRepeatLength(enteredLinePointers) ??
    findLastReturnLength(enteredLinePointers);
  if (cycleLength === undefined) return [];

  const lastIndex = enteredLinePointers.length - 1;
  const cycle = [];
  // The line entered `cycleLength` lines ago is the one the story stopped on.
  for (let index = lastIndex - cycleLength; index < lastIndex; index += 1) {
    const pointer = enteredLinePointers[index];
    if (!cycle.some((listed) => isSameLinePointer(listed, pointer))) {
      cycle.push({ sectionId: pointer.sectionId, lineId: pointer.lineId });
    }
  }
  return cycle;
};
