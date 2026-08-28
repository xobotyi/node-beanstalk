import { LinkedList } from '../../src/util/LinkedList';

describe('LinkedList', () => {
  it('should be defined', () => {
    expect(LinkedList).toBeDefined();
  });

  it('should be creatable by `new`', () => {
    const list = new LinkedList();

    expect(list).toBeInstanceOf(LinkedList);
    expect(list.head).toBeUndefined();
    expect(list.tail).toBeUndefined();
    expect(list.size).toBe(0);
  });

  it('list.push should add node to list tail', () => {
    const list = new LinkedList();

    const node1 = list.push('abc');

    expect(node1).toStrictEqual({ list, value: 'abc', next: undefined, prev: undefined });
    expect(list.head).toBe(node1);
    expect(list.tail).toBe(node1);
    expect(list.size).toBe(1);

    const node2 = list.push('def');

    expect(node2).toStrictEqual({ list, value: 'def', next: undefined, prev: node1 });
    expect(node1.next).toBe(node2);
    expect(list.head).toBe(node1);
    expect(list.tail).toBe(node2);
    expect(list.size).toBe(2);
  });

  it('list.unshift should remove node from the head and return its value', () => {
    const list = new LinkedList();

    list.push('abc');
    const node2 = list.push('def');
    const node3 = list.push('ghi');

    expect(list.size).toBe(3);
    expect(list.unshift()).toBe('abc');
    expect(list.head).toBe(node2);
    expect(list.tail).toBe(node3);
    expect(list.size).toBe(2);

    expect(list.unshift()).toBe('def');
    expect(list.unshift()).toBe('ghi');
    expect(list.head).toBeUndefined();
    expect(list.tail).toBeUndefined();
    expect(list.size).toBe(0);

    expect(list.unshift()).toBeUndefined();
    expect(list.head).toBeUndefined();
    expect(list.tail).toBeUndefined();
    expect(list.size).toBe(0);
  });

  describe('list.remove', () => {
    const values = (list: LinkedList<number>): number[] => {
      const out: number[] = [];
      let node = list.head;
      while (node) {
        out.push(node.value);
        node = node.next;
      }
      return out;
    };

    const listOf = (...items: number[]): LinkedList<number> => {
      const list = new LinkedList<number>();
      items.forEach((i) => list.push(i));
      return list;
    };

    it('should remove the head', () => {
      const list = listOf(1, 2, 3);
      expect(list.remove(1)).toBe(true);
      expect(values(list)).toStrictEqual([2, 3]);
      expect(list.head?.value).toBe(2);
      expect(list.head?.prev).toBeUndefined();
      expect(list.size).toBe(2);
    });

    it('should remove the tail', () => {
      const list = listOf(1, 2, 3);
      expect(list.remove(3)).toBe(true);
      expect(values(list)).toStrictEqual([1, 2]);
      expect(list.tail?.value).toBe(2);
      expect(list.tail?.next).toBeUndefined();
      expect(list.size).toBe(2);
    });

    it('should remove a middle node and relink its neighbours', () => {
      const list = listOf(1, 2, 3);
      expect(list.remove(2)).toBe(true);
      expect(values(list)).toStrictEqual([1, 3]);
      expect(list.head?.next).toBe(list.tail);
      expect(list.tail?.prev).toBe(list.head);
      expect(list.size).toBe(2);
    });

    it('should remove only the first node holding the value', () => {
      const list = listOf(1, 2, 1);
      expect(list.remove(1)).toBe(true);
      expect(values(list)).toStrictEqual([2, 1]);
    });

    it('should return false and keep the list for an absent value', () => {
      const list = listOf(1, 2);
      expect(list.remove(3)).toBe(false);
      expect(values(list)).toStrictEqual([1, 2]);
      expect(list.size).toBe(2);
    });

    it('should empty a single-element list', () => {
      const list = listOf(1);
      expect(list.remove(1)).toBe(true);
      expect(list.head).toBeUndefined();
      expect(list.tail).toBeUndefined();
      expect(list.size).toBe(0);
      expect(list.remove(1)).toBe(false);
    });
  });

  it('list.truncate should empty list and dereference its nodes', () => {
    const list = new LinkedList();

    const node1 = list.push('abc');
    const node2 = list.push('def');
    const node3 = list.push('ghi');

    expect(list.size).toBe(3);

    const res = list.truncate();

    expect(list.size).toBe(0);
    expect(list.head).toBeUndefined();
    expect(list.tail).toBeUndefined();

    expect(node1.list).toBeUndefined();
    expect(node2.list).toBeUndefined();
    expect(node3.list).toBeUndefined();

    expect(node1.prev).toBeUndefined();
    expect(node2.prev).toBeUndefined();
    expect(node3.prev).toBeUndefined();

    expect(node1.next).toBeUndefined();
    expect(node2.next).toBeUndefined();
    expect(node3.next).toBeUndefined();

    expect(res).toStrictEqual(['abc', 'def', 'ghi']);
  });
});
