import { LinkedList } from '../../src/util/LinkedList';

describe('LinkedList', () => {
  it('should be defined', () => {
    expect(LinkedList).toBeDefined();
  });

  it('should be creatable by `new`', () => {
    const list = new LinkedList();

    expect(list).toBeInstanceOf(LinkedList);
    expect(list.head).toBe(null);
    expect(list.tail).toBe(null);
    expect(list.size).toBe(0);
  });

  it('list.push should add node to list tail', () => {
    const list = new LinkedList();

    const node1 = list.push('abc');

    expect(node1).toStrictEqual({ list, value: 'abc', next: null, prev: null });
    expect(list.head).toBe(node1);
    expect(list.tail).toBe(node1);
    expect(list.size).toBe(1);

    const node2 = list.push('def');

    expect(node2).toStrictEqual({ list, value: 'def', next: null, prev: node1 });
    expect(node1.next).toBe(node2);
    expect(list.head).toBe(node1);
    expect(list.tail).toBe(node2);
    expect(list.size).toBe(2);
  });

  it('list.shrinkHead should remove nodes from the head', () => {
    const list = new LinkedList();

    const node1 = list.push('abc');
    const node2 = list.push('def');
    const node3 = list.push('ghi');

    expect(list.size).toBe(3);
    expect(list.shrinkHead()).toStrictEqual(['abc']);
    expect(list.head).toBe(node2);
    expect(list.tail).toBe(node3);
    expect(list.size).toBe(2);

    expect(list.shrinkHead(2)).toStrictEqual(['def', 'ghi']);
    expect(list.head).toBe(null);
    expect(list.tail).toBe(null);
    expect(list.size).toBe(0);

    expect(list.shrinkHead()).toStrictEqual([]);
    expect(list.head).toBe(null);
    expect(list.tail).toBe(null);
    expect(list.size).toBe(0);
  });
});
