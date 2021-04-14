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

  it('list.shrinkHead should remove nodes from the head', () => {
    const list = new LinkedList();

    list.push('abc');
    const node2 = list.push('def');
    const node3 = list.push('ghi');

    expect(list.size).toBe(3);
    expect(list.shrinkHead()).toStrictEqual(['abc']);
    expect(list.head).toBe(node2);
    expect(list.tail).toBe(node3);
    expect(list.size).toBe(2);

    expect(list.shrinkHead(2)).toStrictEqual(['def', 'ghi']);
    expect(list.head).toBeUndefined();
    expect(list.tail).toBeUndefined();
    expect(list.size).toBe(0);

    expect(list.shrinkHead()).toStrictEqual([]);
    expect(list.head).toBeUndefined();
    expect(list.tail).toBeUndefined();
    expect(list.size).toBe(0);
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
