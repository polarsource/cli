export const slugify = (...args: string[]): string => {
  const value = args.join(" ");

  return value
    .normalize("NFD") // split an accented letter in the base letter and the acent
    .replace(/[\u0300-\u036f]/g, "") // remove all previously split accents
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, "") // remove all chars not letters, numbers and spaces (to be replaced)
    .replace(/\s+/g, "-"); // separator
};

/**
 * Same as Promise.all(items.map(item => task(item))), but it waits for
 * the first {batchSize} promises to finish before starting the next batch.
 *
 * @template A
 * @template B
 * @param {function(A): B} task The task to run for each item.
 * @param {A[]} items Arguments to pass to the task for each call.
 * @param {int} batchSize
 * @returns {Promise<B[]>}
 */
export async function promiseAllInBatches<A, B>(
  task: (item: A) => Promise<B>,
  items: A[],
  batchSize: number
) {
  let position = 0;
  let results: B[] = [];
  while (position < items.length) {
    const itemsForBatch = items.slice(position, position + batchSize);
    results = [
      ...results,
      ...(await Promise.all(itemsForBatch.map((item) => task(item)))),
    ];
    position += batchSize;
  }
  return results;
}

export const fetchAllPages = async <T>(
  task: (pageNumber: number) => Promise<{
    data?: T[];
    lastPage: number;
  }>
): Promise<T[]> => {
  const { data, lastPage } = await task(1);
  const allItems: T[] = [...(data ?? [])];

  if (!data) {
    return allItems;
  }

  const results = await Promise.all(
    Array.from({ length: lastPage - 1 }, (_, i) => task(i + 2))
  );

  return [...allItems, ...results.flatMap((result) => result.data ?? [])];
};
