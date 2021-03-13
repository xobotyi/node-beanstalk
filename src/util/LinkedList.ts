/* eslint-disable no-param-reassign */
export interface ILinkedListNode<V = any> {
  readonly value: V;

  list: LinkedList | null;
  next: ILinkedListNode | null;
  prev: ILinkedListNode | null;
}

function createLinkedListNode<V = any>(
  value: V,
  list: LinkedList | null = null,
  next: ILinkedListNode | null = null,
  prev: ILinkedListNode | null = null
): ILinkedListNode<V> {
  return {
    list,
    value,
    next,
    prev,
  };
}

export class LinkedList<V = any> {
  head: ILinkedListNode<V> | null;

  tail: ILinkedListNode<V> | null;

  size = 0;

  constructor() {
    this.head = null;
    this.tail = null;
  }

  /**
   * Remove node from chain and nullish it.
   */
  removeNode<T extends V>(node: ILinkedListNode<T>): ILinkedListNode<T> | null {
    if (node.list !== this) {
      throw new Error('Unable to remove the node of foreign list');
    }

    const { next, prev } = node;

    if (prev) prev.next = next;
    if (next) next.prev = prev;

    if (node === this.head) this.head = next;
    if (node === this.tail) this.tail = prev;

    node.next = null;
    node.prev = null;
    node.list = null;

    this.size--;

    return next;
  }

  /**
   * Push existing list node to list's endings
   */
  pushNode<T extends V>(node: ILinkedListNode<T>): ILinkedListNode<T> {
    if (node.list !== this) {
      throw new Error('Unable to push the node of foreign list');
    }

    if (node === this.tail) return node;

    node.list = this;
    node.prev = this.tail;

    if (this.tail) {
      this.tail.next = node;
    }

    this.tail = node;
    if (!this.head) {
      this.head = node;
    }

    this.size++;

    return node;
  }

  /**
   * Add {value} to the tail of the list.
   */
  push<T extends V>(value: T): ILinkedListNode<T> {
    return this.pushNode(createLinkedListNode(value, this));
  }

  /**
   * Remove {count} elements from the head of the list.
   *
   * @return Array containing removed values.
   */
  shrinkHead(count: number): V[] {
    if (!this.head) return [];

    const removed: V[] = [];
    while (count && this.head) {
      removed.push(this.head.value);
      this.removeNode(this.head);

      count--;
    }

    return removed;
  }

  /**
   * Remove {count} elements from the tail of the list.
   *
   * @return Array containing removed values.
   */
  shrinkTail(count: number): V[] {
    if (!this.tail) return [];

    const removed: V[] = [];
    while (count && this.tail) {
      removed.push(this.tail.value);
      this.removeNode(this.tail);

      count--;
    }

    return removed;
  }
}
