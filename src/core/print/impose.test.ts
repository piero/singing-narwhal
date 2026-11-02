import { describe, expect, it } from 'vitest';
import { bookletOrder } from './impose';

describe('imposition', () => {
  it('orders pages for saddle stitching', () => {
    expect(bookletOrder(8)).toEqual([[7, 0], [1, 6], [5, 2], [3, 4]]);
    expect(bookletOrder(3)).toEqual([[3, 0], [1, 2]]);
  });
});
